import "server-only";
import type { InstagramMediaAsset, InstagramMediaDetail, InstagramStoriesSnapshot, InstagramStoryMetric } from "../../admin/types";
import { getInstagramRuntime, graphFetchedAt, graphGet, InstagramApiError, record, type GraphObject, type InstagramRuntime } from "./instagram-client";
import { metricValue, safeInstagramUrl } from "./instagram-metrics-server";

const rows = (value: unknown) => Array.isArray(value) ? value.map(record) : [];
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const validTime = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const fatal = (error: unknown) => error instanceof InstagramApiError && ["instagram_token_invalid", "instagram_permission_denied", "instagram_rate_limited"].includes(error.code);
const fields = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp";

export function parseInstagramContentQuery(params: URLSearchParams) {
  const cursor = params.get("cursor") || "";
  if (cursor && !/^[A-Za-z0-9_=.-]{1,2048}$/.test(cursor)) throw new InstagramApiError("instagram_invalid_cursor", "올바른 게시물 목록을 선택해 주세요.", 400);
  return { cursor, refresh: params.get("refresh") === "1" };
}

async function verifyAccount(runtime: InstagramRuntime) {
  const account = await graphGet(runtime, runtime.accountId, { fields: "id,user_id,username,followers_count" });
  if (account.username !== runtime.username || ![account.id, account.user_id].some((id) => String(id) === runtime.accountId)) {
    throw new InstagramApiError("instagram_account_mismatch", "연결된 Instagram 계정이 일치하지 않습니다.");
  }
}

function asset(media: GraphObject): InstagramMediaAsset {
  const type = media.media_type === "VIDEO" ? "video" : "image";
  return { id: String(media.id), type, url: safeInstagramUrl(media.media_url, true),
    thumbnailUrl: safeInstagramUrl(media.thumbnail_url || (type === "image" ? media.media_url : null), true) };
}

export async function getInstagramMediaDetail(id: string): Promise<InstagramMediaDetail> {
  if (!/^\d{1,30}$/.test(id)) throw new InstagramApiError("instagram_invalid_media", "올바른 게시물을 선택해 주세요.", 400);
  const runtime = getInstagramRuntime();
  await verifyAccount(runtime);
  const media = await graphGet(runtime, id, { fields: `${fields},username,like_count,comments_count` });
  if (String(media.id) !== id || media.username !== runtime.username || !validTime(media.timestamp)) {
    throw new InstagramApiError("instagram_media_not_found", "게시물을 찾을 수 없습니다.", 404);
  }
  if (media.media_product_type === "STORY" && Date.parse(media.timestamp) + 86_400_000 <= Date.now()) {
    throw new InstagramApiError("instagram_story_expired", "게시 기간이 끝난 스토리입니다.", 404);
  }
  const warnings: string[] = [];
  let assets = [asset(media)];
  if (media.media_type === "CAROUSEL_ALBUM") {
    try {
      const children = await graphGet(runtime, `${id}/children`, { fields: "id,media_type,media_url,thumbnail_url", limit: "20" });
      assets = rows(children.data).filter((row) => /^\d+$/.test(String(row.id))).slice(0, 20).map(asset);
      if (!assets.length) warnings.push("캐러셀 사진을 가져오지 못했습니다.");
      if (record(children.paging).next) warnings.push("일부 사진만 표시됩니다. 원본에서 전체 콘텐츠를 확인해 주세요.");
    } catch (error) {
      if (fatal(error)) throw error;
      warnings.push("캐러셀 사진을 가져오지 못했습니다.");
    }
  }
  return { id, username: runtime.username, caption: typeof media.caption === "string" ? media.caption.slice(0, 10000) : "",
    publishedAt: media.timestamp, permalink: safeInstagramUrl(media.permalink), likes: count(media.like_count), comments: count(media.comments_count), assets, warnings };
}

export async function getInstagramStories(query: ReturnType<typeof parseInstagramContentQuery>): Promise<InstagramStoriesSnapshot> {
  const runtime = getInstagramRuntime();
  await verifyAccount(runtime);
  const media = await graphGet(runtime, `${runtime.accountId}/stories`, { fields, limit: "12", ...(query.cursor ? { after: query.cursor } : {}) }, 60_000, query.refresh);
  const warnings = new Set<string>();
  const stories = await Promise.all(rows(media.data).filter((row) => /^\d+$/.test(String(row.id)) && validTime(row.timestamp) &&
    Date.parse(row.timestamp) <= Date.now() && Date.parse(row.timestamp) + 86_400_000 > Date.now()).slice(0, 12).map(async (row): Promise<InstagramStoryMetric> => {
    let metrics: GraphObject = {};
    try { metrics = await graphGet(runtime, `${row.id}/insights`, { metric: "views,reach,replies,shares" }, 60_000, query.refresh); }
    catch (error) {
      if (fatal(error)) throw error;
      warnings.add(error instanceof InstagramApiError && error.code === "instagram_insights_unavailable" ? "일부 스토리는 조회 인원이 부족해 지표가 제공되지 않습니다." : "일부 스토리 지표를 가져오지 못했습니다.");
    }
    return { id: String(row.id), title: typeof row.caption === "string" && row.caption.trim() ? row.caption.trim().slice(0, 180) : "스토리",
      thumbnailUrl: asset(row).thumbnailUrl, publishedAt: String(row.timestamp), expiresAt: new Date(Date.parse(String(row.timestamp)) + 86_400_000).toISOString(),
      views: metricValue(metrics, "views"), reach: metricValue(metrics, "reach"), replies: metricValue(metrics, "replies"), shares: metricValue(metrics, "shares") };
  }));
  const paging = record(media.paging);
  const after = record(paging.cursors).after;
  const nextCursor = paging.next && typeof after === "string" && /^[A-Za-z0-9_=.-]{1,2048}$/.test(after) && after !== query.cursor ? after : null;
  return { username: runtime.username, fetchedAt: graphFetchedAt(media) ?? new Date().toISOString(), stories, nextCursor, warnings: [...warnings] };
}
