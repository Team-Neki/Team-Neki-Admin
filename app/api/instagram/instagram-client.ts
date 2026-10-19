import "server-only";
import { createHash } from "node:crypto";

export class InstagramApiError extends Error {
  constructor(public code: string, message: string, public status = 502, public retryAfter = 0) {
    super(message);
  }
}

export function getInstagramRuntime() {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID?.trim();
  const username = (process.env.INSTAGRAM_USERNAME || "neki_official_").trim();
  const version = (process.env.INSTAGRAM_GRAPH_API_VERSION || "v26.0").trim();
  let base: URL;
  try { base = new URL(process.env.INSTAGRAM_API_BASE_URL || "https://graph.instagram.com"); }
  catch { throw new InstagramApiError("instagram_not_configured", "Instagram 연결 설정이 필요합니다.", 503); }
  const allowedBase = base.origin === "https://graph.instagram.com" ||
    (base.protocol === "http:" && base.hostname === "127.0.0.1");
  if (!token || !accountId || !/^\d+$/.test(accountId) || !/^[A-Za-z0-9_.]+$/.test(username) ||
    !/^v\d+\.0$/.test(version) || !allowedBase || base.username || base.password || base.pathname !== "/" || base.search || base.hash) {
    throw new InstagramApiError("instagram_not_configured", "Instagram 연결 설정이 필요합니다.", 503);
  }
  return { token, accountId, username, version, base: base.origin,
    key: createHash("sha256").update([token, accountId, username, version, base.origin].join(":")).digest("hex") };
}

export type InstagramRuntime = ReturnType<typeof getInstagramRuntime>;
export type GraphObject = Record<string, unknown>;
type Entry = { value?: GraphObject; expiresAt: number; pending?: Promise<GraphObject>; failure?: InstagramApiError };
const cache = new Map<string, Entry>();
const fetchedAt = new WeakMap<GraphObject, string>();
export const graphFetchedAt = (value: GraphObject) => fetchedAt.get(value);
const blocked = new Map<string, number>();
const limits = new Map<string, { active: number; queue: Array<() => void> }>();

async function withLimit<T>(key: string, run: () => Promise<T>): Promise<T> {
  const limit = limits.get(key) ?? { active: 0, queue: [] };
  limits.set(key, limit);
  if (limit.active >= 2) await new Promise<void>((resolve) => limit.queue.push(resolve));
  else limit.active += 1;
  try { return await run(); }
  finally {
    const next = limit.queue.shift();
    if (next) next();
    else { limit.active -= 1; if (!limit.active) limits.delete(key); }
  }
}

export function record(value: unknown): GraphObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as GraphObject : {};
}

export function graphGet(runtime: InstagramRuntime, path: string, params: Record<string, string>, ttl = 300_000, refresh = false): Promise<GraphObject> {
  const url = new URL(`${runtime.base}/${runtime.version}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const key = `${runtime.key}:${url.pathname}:${url.searchParams}`;
  const existing = cache.get(key);
  if (existing?.pending) return existing.pending;
  if (existing && existing.expiresAt > Date.now()) {
    if (existing.failure) return Promise.reject(existing.failure);
    if (existing.value && (!refresh || Date.now() < existing.expiresAt - ttl + 60_000)) return Promise.resolve(existing.value);
  }
  const entry: Entry = { expiresAt: 0 };
  entry.pending = withLimit(runtime.key, async () => {
    const retryAfter = Math.ceil(((blocked.get(runtime.key) ?? 0) - Date.now()) / 1000);
    if (retryAfter > 0) throw new InstagramApiError("instagram_rate_limited", "Instagram 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.", 429, retryAfter);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${runtime.token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000), cache: "no-store", redirect: "error",
      });
      const text = await response.text();
      if (text.length > 2_000_000) throw new Error("response too large");
      const data = record(JSON.parse(text));
      const error = record(data.error);
      const code = Number(error.code);
      if (response.status === 429 || [4, 17, 32, 613, 80002].includes(code)) {
        const header = response.headers.get("retry-after");
        const seconds = header && /^\d+$/.test(header) ? Number(header) : header ? Math.ceil((Date.parse(header) - Date.now()) / 1000) : 0;
        const cooldown = Math.max(Number.isFinite(seconds) ? seconds : 0, 900);
        blocked.set(runtime.key, Date.now() + cooldown * 1000);
        throw new InstagramApiError("instagram_rate_limited", "Instagram 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.", 429, cooldown);
      }
      if (code === 190 || response.status === 401) throw new InstagramApiError("instagram_token_invalid", "Instagram 연결 토큰을 갱신해 주세요.");
      // Meta uses permission code 10 for privacy-thresholded story insights too.
      if (code === 10 && typeof error.message === "string" && /not enough viewers/i.test(error.message)) {
        throw new InstagramApiError("instagram_insights_unavailable", "조회 인원이 부족해 지표가 제공되지 않습니다.");
      }
      if ([10, 200].includes(code) || response.status === 403) throw new InstagramApiError("instagram_permission_denied", "Instagram 인사이트 조회 권한을 확인해 주세요.");
      if (!response.ok || Object.keys(error).length) throw new InstagramApiError("instagram_provider_error", "Instagram 지표를 가져오지 못했습니다.");
      entry.value = data;
      fetchedAt.set(data, new Date().toISOString());
      entry.expiresAt = Date.now() + ttl;
      return data;
    } catch (error) {
      throw error instanceof InstagramApiError ? error : new InstagramApiError("instagram_unavailable", "Instagram 응답이 지연되거나 연결할 수 없습니다.");
    }
  }).catch((error: unknown) => {
    entry.failure = error instanceof InstagramApiError ? error : new InstagramApiError("instagram_unavailable", "Instagram에 연결할 수 없습니다.");
    entry.expiresAt = Date.now() + Math.max(entry.failure.retryAfter * 1000, 30_000);
    throw entry.failure;
  }).finally(() => { entry.pending = undefined; });
  cache.set(key, entry);
  if (cache.size > 256) {
    for (const [oldKey, oldEntry] of cache) {
      if (!oldEntry.pending && oldKey !== key) { cache.delete(oldKey); break; }
    }
  }
  return entry.pending;
}
