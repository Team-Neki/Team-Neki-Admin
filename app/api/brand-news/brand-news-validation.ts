import type { BrandNewsPostFailure, BrandNewsRecord, BrandNewsSnapshot, BrandNewsSource } from "../../admin/types";

const sourceUrls: Record<string, [string, string, string]> = {
  "lifefourcuts-instagram": ["brand-01", "인생네컷", "https://www.instagram.com/life4cuts_official/"],
  "photoism-instagram": ["brand-02", "포토이즘", "https://www.instagram.com/photoism.kr/"],
  "photogray-instagram": ["brand-03", "포토그레이", "https://www.instagram.com/photogray_official/"],
  "dontlookup-instagram": ["brand-14", "돈룩업", "https://www.instagram.com/dontlookup.official/"],
  "photosignature-frames": ["brand-05", "포토시그니처", "https://photosignature.co.kr/bbs/board.php?bo_table=frame"],
  "harufilm-news": ["brand-04", "하루필름", "https://harufilm.com/301"],
};

function matchesPost(postUrl: string, source: BrandNewsSource) {
  const post = new URL(postUrl);
  const base = new URL(source.url);
  if (post.origin !== base.origin || post.hash) return false;
  if (base.hostname === "www.instagram.com") return postUrl.startsWith(source.url) && !post.search && /^\/[^/]+\/(?:p|reel)\/[A-Za-z0-9_-]+\/$/.test(post.pathname);
  if (source.key === "photosignature-frames") return post.pathname === base.pathname && post.searchParams.get("bo_table") === "frame" && /^\d+$/.test(post.searchParams.get("wr_id") ?? "");
  return post.pathname.replace(/\/$/, "") === "/301" && post.searchParams.get("bmode") === "view" && /^\d+$/.test(post.searchParams.get("idx") ?? "");
}

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid brand news object");
  return value as Record<string, unknown>;
};
const text = (value: unknown, max = 2000): string => {
  if (typeof value !== "string" || !value || value.length > max) throw new Error("Invalid brand news text");
  return value;
};
const time = (value: unknown): string | null => {
  if (value == null) return null;
  const result = text(value, 40);
  if (!Number.isFinite(Date.parse(result))) throw new Error("Invalid brand news date");
  return result;
};
const day = (value: unknown): string | null => {
  const result = time(value);
  if (result && (!/^\d{4}-\d{2}-\d{2}$/.test(result) || new Date(result).toISOString().slice(0, 10) !== result)) throw new Error("Invalid calendar day");
  return result;
};
const url = (value: unknown): string => {
  const result = new URL(text(value, 3000));
  if (result.protocol !== "https:" || result.username || result.password) throw new Error("Unsafe brand news URL");
  return result.href;
};
const count = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error("Invalid brand news count");
  return Number(value);
};
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.includes(value as T)) throw new Error("Invalid brand news enum");
  return value as T;
}
function failure(value: unknown, source: BrandNewsSource): BrandNewsPostFailure {
  const item = object(value);
  const postUrl = url(item.url);
  if (!matchesPost(postUrl, source)) throw new Error("Invalid failure post URL");
  return { url: postUrl, stage: text(item.stage, 40), code: text(item.code, 80), attempts: count(item.attempts),
    lastAttemptAt: time(item.lastAttemptAt) ?? (() => { throw new Error("Missing post attempt date"); })(),
    nextAttemptAt: time(item.nextAttemptAt), status: choice(item.status, ["retry-pending", "needs-review"]) };
}

export function validateBrandNews(value: unknown): BrandNewsSnapshot {
  const data = object(value);
  if (data.schemaVersion !== 1 || !Array.isArray(data.sources) || data.sources.length !== 6 || !Array.isArray(data.records) || data.records.length > 50_000) throw new Error("Invalid brand news snapshot");
  const sources = data.sources.map((value): BrandNewsSource => {
    const item = object(value);
    const source: BrandNewsSource = { key: text(item.key, 100), brandId: text(item.brandId, 100), brandName: text(item.brandName, 100), url: url(item.url),
      status: choice(item.status ?? "pending", ["ok", "cached", "partial", "error", "deferred", "pending"]), recordCount: count(item.recordCount),
      lastAttemptAt: time(item.lastAttemptAt), lastSuccessAt: time(item.lastSuccessAt), nextAttemptAt: time(item.nextAttemptAt),
      failureCode: item.failureCode ? text(item.failureCode, 80) : null, failedPosts: [] };
    const registered = sourceUrls[source.key];
    if (!registered || source.brandId !== registered[0] || source.brandName !== registered[1] || source.url !== registered[2]) throw new Error("Unknown brand news source");
    if (!Array.isArray(item.failedPosts) || item.failedPosts.length > 10_000) throw new Error("Invalid failed post queue");
    source.failedPosts = item.failedPosts.map((value) => failure(value, source));
    return source;
  });
  if (new Set(sources.map((item) => item.key)).size !== sources.length || new Set(sources.map((item) => item.brandId)).size !== sources.length) throw new Error("Duplicate brand news source");
  const records = data.records.map((value): BrandNewsRecord => {
    const item = object(value);
    const source = sources.find((source) => source.brandId === item.brandId && source.brandName === item.brandName);
    if (!source) throw new Error("Unknown news brand");
    const postUrl = url(item.url);
    if (!matchesPost(postUrl, source)) throw new Error("Mismatched news source");
    if (!Array.isArray(item.warnings) || item.warnings.length > 100) throw new Error("Invalid news warnings");
    return { id: text(item.id, 200), brandId: source.brandId, brandName: source.brandName, title: text(item.title),
      category: choice(item.category, ["collaboration", "frame", "event", "partnership", "news"]),
      publishedOn: day(item.publishedOn), startsOn: day(item.startsOn), endsOn: day(item.endsOn), url: postUrl, observedAt: time(item.observedAt),
      reviewStatus: choice(item.reviewStatus, ["pending", "approved", "rejected"]), warnings: item.warnings.map((value) => text(value, 100)) };
  });
  if (new Set(records.map((item) => item.id)).size !== records.length || sources.some((source) => source.recordCount !== records.filter((record) => record.brandId === source.brandId).length)) throw new Error("News totals do not reconcile");
  const generatedAt = time(data.generatedAt);
  if (!generatedAt) throw new Error("Missing snapshot date");
  return { schemaVersion: 1, generatedAt, sources, records };
}
