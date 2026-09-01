type RuntimeEnv = Record<string, unknown>;

export const NEKI_PROD_API_KEY_ENV = "NEKI_PROD_AMPLITUDE_API_KEY";
export const NEKI_PROD_SECRET_KEY_ENV = "NEKI_PROD_AMPLITUDE_SECRET_KEY";
export const AMPLITUDE_REGION_ENV = "AMPLITUDE_REGION";
export const AMPLITUDE_PROJECT_START_DATE_ENV = "AMPLITUDE_PROJECT_START_DATE";
export const AMPLITUDE_TIME_ZONE_ENV = "AMPLITUDE_TIME_ZONE";

const RESPONSE_CACHE_TTL_MS = 60_000;
const RESPONSE_CACHE_MAX_ENTRIES = 64;
const REQUEST_TIMEOUT_MS = 20_000;
const REQUEST_CONCURRENCY = 1;

type CacheEntry = { value: unknown; expiresAt: number };

const responseCache = new Map<string, CacheEntry>();
const responseInFlight = new Map<string, Promise<unknown>>();
const requestQueue: Array<() => Promise<void>> = [];
let activeRequests = 0;
let runtimePromise: Promise<Record<string, string>> | undefined;

const readRuntimeEnv = async () => {
  let runtime: RuntimeEnv = {};
  try {
    const workerModule = await import(String("cloudflare:workers"));
    runtime = workerModule.env as unknown as RuntimeEnv;
  } catch {
    // Node 기반 테스트/로컬 렌더링에는 Cloudflare runtime이 없습니다.
  }
  return runtime;
};

const loadRuntimeValues = async () => {
  const runtime = await readRuntimeEnv();
  const read = (name: string) => {
    const value = runtime[name] ?? process.env[name];
    return typeof value === "string" ? value.trim() : "";
  };
  return {
    apiKey: read(NEKI_PROD_API_KEY_ENV),
    secretKey: read(NEKI_PROD_SECRET_KEY_ENV),
    region: read(AMPLITUDE_REGION_ENV),
    projectStartDate: read(AMPLITUDE_PROJECT_START_DATE_ENV),
    timeZone: read(AMPLITUDE_TIME_ZONE_ENV) || "Asia/Seoul",
  };
};

export const getAmplitudeRuntime = () => {
  runtimePromise ??= loadRuntimeValues();
  return runtimePromise;
};

export const getAmplitudeBaseUrl = (region: string) =>
  region.toLowerCase() === "eu" ? "https://analytics.eu.amplitude.com" : "https://amplitude.com";

export const getAmplitudeAuth = (apiKey: string, secretKey: string) => btoa(`${apiKey}:${secretKey}`);

const drainQueue = () => {
  while (activeRequests < REQUEST_CONCURRENCY && requestQueue.length > 0) {
    const next = requestQueue.shift();
    if (next) void next();
  }
};

const withRequestSlot = <T>(task: () => Promise<T>) => new Promise<T>((resolve, reject) => {
  requestQueue.push(async () => {
    activeRequests += 1;
    try {
      resolve(await task());
    } catch (error) {
      reject(error);
    } finally {
      activeRequests -= 1;
      drainQueue();
    }
  });
  drainQueue();
});

const amplitudeCacheKey = (baseUrl: string, path: string, search?: URLSearchParams) => `${baseUrl}|${path}|${search?.toString() ?? ""}`;

const pruneCache = () => {
  const now = Date.now();
  for (const [key, entry] of responseCache) {
    if (entry.expiresAt <= now) responseCache.delete(key);
  }
  while (responseCache.size >= RESPONSE_CACHE_MAX_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (typeof oldest !== "string") break;
    responseCache.delete(oldest);
  }
};

const requestAmplitude = async <T>(baseUrl: string, auth: string, path: string, search?: URLSearchParams): Promise<T> => {
  const url = new URL(path, baseUrl);
  if (search) url.search = search.toString();
  return withRequestSlot(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${auth}`,
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        const retryAfter = response.headers.get("retry-after");
        const suffix = retryAfter ? `; ${retryAfter}초 후 재시도` : "";
        throw new Error(`Amplitude API 응답 오류 (${response.status})${suffix}`);
      }
      return await response.json() as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("Amplitude API 요청 시간이 초과되었습니다.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  });
};

export const cachedAmplitudeRequest = async <T>(baseUrl: string, auth: string, path: string, search?: URLSearchParams): Promise<T> => {
  const cacheKey = amplitudeCacheKey(baseUrl, path, search);
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  if (cached) responseCache.delete(cacheKey);

  const pending = responseInFlight.get(cacheKey);
  if (pending) return pending as Promise<T>;

  const request = requestAmplitude<T>(baseUrl, auth, path, search)
    .then((value) => {
      pruneCache();
      responseCache.set(cacheKey, { value, expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS });
      return value;
    })
    .finally(() => {
      if (responseInFlight.get(cacheKey) === request) responseInFlight.delete(cacheKey);
    });
  responseInFlight.set(cacheKey, request);
  return request;
};
