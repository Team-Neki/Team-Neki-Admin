import "server-only";
import type { InstagramMetricsSnapshot, InstagramPostMetric } from "../../admin/types";
import { getInstagramRuntime, graphFetchedAt, graphGet, InstagramApiError, record, type GraphObject, type InstagramRuntime } from "./instagram-client";
import { readInstagramSnapshot, writeInstagramSnapshot } from "./instagram-file-cache";

const dayMs = 86_400_000;
const kstDate = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
const timestamp = (date: string) => Date.parse(`${date}T00:00:00+09:00`);
const isDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(timestamp(date)) && kstDate(new Date(timestamp(date))) === date;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const list = (value: unknown) => Array.isArray(value) ? value.map(record) : [];

export function parseInstagramRange(params: URLSearchParams) {
  const today = kstDate(new Date());
  const endDate = params.get("endDate") || today;
  if (!isDate(endDate)) throw new InstagramApiError("instagram_invalid_range", "올바른 조회 기간을 선택해 주세요.", 400);
  const startDate = params.get("startDate") || kstDate(new Date(timestamp(endDate) - 29 * dayMs));
  const cursor = params.get("cursor") || "";
  if (!isDate(startDate) || !isDate(endDate) || startDate > endDate || endDate > today ||
    timestamp(startDate) < timestamp(today) - 89 * dayMs || (cursor && !/^[A-Za-z0-9_=.-]{1,2048}$/.test(cursor))) {
    throw new InstagramApiError("instagram_invalid_range", "최근 90일 안에서 올바른 조회 기간을 선택해 주세요.", 400);
  }
  return { startDate, endDate, cursor, refresh: params.get("refresh") === "1" };
}

export function metricValue(data: GraphObject, name: string, totalOnly = false): number | null {
  const metric = list(data.data).find((row) => row.name === name);
  if (!metric) return null;
  const total = number(record(metric.total_value).value);
  return totalOnly ? total : total ?? number(list(metric.values)[0]?.value);
}

export function safeInstagramUrl(value: unknown, image = false): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.searchParams.has("access_token")) return null;
    const host = url.hostname;
    const valid = image ? host.endsWith(".cdninstagram.com") || host.endsWith(".fbcdn.net") || host === "scontent.cdninstagram.com"
      : host === "www.instagram.com" || host === "instagram.com";
    return valid ? url.href : null;
  } catch { return null; }
}

const fatal = (error: unknown) => error instanceof InstagramApiError && ["instagram_token_invalid", "instagram_permission_denied", "instagram_rate_limited"].includes(error.code);

async function mediaMetric(runtime: InstagramRuntime, media: GraphObject, warnings: Set<string>, refresh: boolean): Promise<InstagramPostMetric> {
  const id = String(media.id);
  const isReel = media.media_product_type === "REELS";
  let metrics: GraphObject = {};
  try {
    metrics = await graphGet(runtime, `${id}/insights`, { metric: `views,comments,shares,saved,reach${isReel ? "" : ",profile_visits"}` }, 300_000, refresh);
  } catch (error) {
    if (fatal(error)) throw error;
    warnings.add("일부 게시물의 지표를 가져오지 못했습니다.");
  }
  return {
    id, title: typeof media.caption === "string" && media.caption.trim() ? media.caption.trim().slice(0, 180) : "제목 없는 게시물",
    mediaType: isReel ? "릴스" : media.media_type === "CAROUSEL_ALBUM" ? "캐러셀" : "게시물",
    thumbnailUrl: safeInstagramUrl(media.thumbnail_url || (media.media_type === "VIDEO" ? null : media.media_url), true),
    permalink: safeInstagramUrl(media.permalink), publishedAt: String(media.timestamp),
    views: metricValue(metrics, "views"), comments: metricValue(metrics, "comments"), shares: metricValue(metrics, "shares"),
    saves: metricValue(metrics, "saved"), reach: metricValue(metrics, "reach"), profileVisits: isReel ? null : metricValue(metrics, "profile_visits"),
  };
}

async function collectInstagramMetrics(runtime: InstagramRuntime, range: ReturnType<typeof parseInstagramRange>): Promise<InstagramMetricsSnapshot> {
  const query = (path: string, params: Record<string, string>) => graphGet(runtime, path, params, 300_000, range.refresh);
  const account = await query(runtime.accountId, { fields: "id,user_id,username,followers_count" });
  // Instagram Login returns an app-scoped id as well as the console's Instagram user_id.
  const matchesAccount = [account.id, account.user_id].some((id) => String(id) === runtime.accountId);
  if (account.username !== runtime.username || !matchesAccount) {
    throw new InstagramApiError("instagram_account_mismatch", "연결된 Instagram 계정이 일치하지 않습니다.");
  }
  const params = { since: String(timestamp(range.startDate) / 1000), until: String((timestamp(range.endDate) + dayMs - 1000) / 1000), period: "day" };
  const warnings = new Set<string>();
  const optional = async (task: Promise<GraphObject>, warning: string) => {
    try { return await task; }
    catch (error) { if (fatal(error)) throw error; warnings.add(warning); return {}; }
  };
  const [summary, daily, media] = await Promise.all([
    optional(query(`${runtime.accountId}/insights`, { ...params, metric: "reach,views,likes", metric_type: "total_value" }), "기간 합계를 가져오지 못했습니다."),
    optional(query(`${runtime.accountId}/insights`, { ...params, metric: "reach", metric_type: "time_series" }), "일별 도달수를 가져오지 못했습니다."),
    optional(query(`${runtime.accountId}/media`, { fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp", limit: "12", ...(range.cursor ? { after: range.cursor } : {}) }), "게시물을 가져오지 못했습니다."),
  ]);
  const matchingMedia = list(media.data).filter((row) => {
    if (!/^\d+$/.test(String(row.id)) || typeof row.timestamp !== "string") return false;
    const date = new Date(row.timestamp);
    if (!Number.isFinite(date.getTime())) return false;
    return true;
  }).slice(0, 12);
  const posts = await Promise.all(matchingMedia.map((row) => mediaMetric(runtime, row, warnings, range.refresh)));
  const reachSeries = list(daily.data).find((row) => row.name === "reach");
  const trend = list(reachSeries?.values).flatMap((point) => {
    if (typeof point.end_time !== "string") return [];
    const end = new Date(point.end_time);
    if (!Number.isFinite(end.getTime())) return [];
    const date = kstDate(new Date(end.getTime() - 1));
    return date >= range.startDate && date <= range.endDate ? [{ date, reach: number(point.value), periodEndsAt: end.toISOString() }] : [];
  }).sort((a, b) => a.periodEndsAt.localeCompare(b.periodEndsAt));
  const paging = record(media.paging);
  const after = record(paging.cursors).after;
  const nextCursor = typeof paging.next === "string" && typeof after === "string" && /^[A-Za-z0-9_=.-]{1,2048}$/.test(after) && after !== range.cursor ? after : null;
  return {
    source: "instagram", username: runtime.username, startDate: range.startDate, endDate: range.endDate,
    fetchedAt: [account, summary, daily, media].map(graphFetchedAt).filter((value): value is string => !!value).sort()[0] ?? new Date().toISOString(), followers: number(account.followers_count),
    reach: metricValue(summary, "reach", true), likes: metricValue(summary, "likes", true), views: metricValue(summary, "views", true),
    trend, posts, nextCursor, warnings: [...warnings],
  };
}

const pendingSnapshots = new Map<string, Promise<InstagramMetricsSnapshot>>();

export function getInstagramMetrics(range: ReturnType<typeof parseInstagramRange>): Promise<InstagramMetricsSnapshot> {
  const runtime = getInstagramRuntime();
  const key = `all-media-v1:${runtime.key}:${range.startDate}:${range.endDate}:${range.cursor}`;
  const pending = pendingSnapshots.get(key);
  if (pending) return pending;
  const task = (async (): Promise<InstagramMetricsSnapshot> => {
    const stored = await readInstagramSnapshot(key);
    if (stored && (!range.refresh || Date.now() - Date.parse(stored.value.fetchedAt) < 60_000) &&
      stored.value.username === runtime.username && stored.value.startDate === range.startDate && stored.value.endDate === range.endDate) {
      return { ...stored.value, storage: { readFrom: "file", savedAt: stored.storedAt } };
    }
    const value = await collectInstagramMetrics(runtime, range);
    if (value.warnings.length) return { ...value, storage: { readFrom: "meta", savedAt: null } };
    const savedAt = await writeInstagramSnapshot(key, value, runtime.token);
    return { ...value, warnings: savedAt ? [] : ["지표를 저장하지 못했습니다."], storage: { readFrom: "meta", savedAt } };
  })().finally(() => pendingSnapshots.delete(key));
  pendingSnapshots.set(key, task);
  return task;
}
