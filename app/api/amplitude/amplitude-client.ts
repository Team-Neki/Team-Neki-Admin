import "server-only";

const DEFAULT_BASE_URL = "https://amplitude.com";
const EU_BASE_URL = "https://analytics.eu.amplitude.com";
const REQUEST_TIMEOUT_MS = 20_000;
const REQUEST_CACHE_TTL_MS = 60_000;
const REQUEST_CACHE_MAX_ENTRIES = 64;
const REQUEST_CONCURRENCY = 1;

type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

export type AmplitudeRuntime = {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  timeZone: string;
  projectStartDate: string;
};

type AmplitudeRequest = {
  path: string;
  search: URLSearchParams;
  force?: boolean;
};

const responseCache = new Map<string, CacheEntry>();
const responseInFlight = new Map<string, Promise<unknown>>();
const requestQueue: Array<() => Promise<void>> = [];
let activeRequests = 0;

export class AmplitudeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AmplitudeApiError";
  }
}

const readEnvironment = (name: string) => process.env[name]?.trim() ?? "";

export const getAmplitudeRuntime = (): AmplitudeRuntime => {
  const apiKey = readEnvironment("AMPLITUDE_API_KEY");
  const secretKey = readEnvironment("AMPLITUDE_SECRET_KEY");
  if (!apiKey || !secretKey) {
    throw new AmplitudeApiError(
      "Amplitude API 키를 설정한 뒤 다시 시도해 주세요.",
      503,
      "amplitude_not_configured",
    );
  }

  const configuredBaseUrl = readEnvironment("AMPLITUDE_API_BASE_URL");
  let baseUrl = readEnvironment("AMPLITUDE_REGION").toLowerCase() === "eu" ? EU_BASE_URL : DEFAULT_BASE_URL;
  if (configuredBaseUrl) {
    try {
      baseUrl = new URL(configuredBaseUrl).origin;
    } catch {
      throw new AmplitudeApiError("Amplitude API 주소를 확인해 주세요.", 503, "amplitude_base_url_invalid");
    }
  }

  return {
    apiKey,
    secretKey,
    baseUrl,
    timeZone: readEnvironment("AMPLITUDE_TIME_ZONE") || "Asia/Seoul",
    projectStartDate: readEnvironment("AMPLITUDE_PROJECT_START_DATE") || "2024-01-01",
  };
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

const drainQueue = () => {
  while (activeRequests < REQUEST_CONCURRENCY && requestQueue.length > 0) {
    const next = requestQueue.shift();
    if (next) void next();
  }
};

const pruneCache = () => {
  const now = Date.now();
  for (const [key, entry] of responseCache) {
    if (entry.expiresAt <= now) responseCache.delete(key);
  }
  while (responseCache.size >= REQUEST_CACHE_MAX_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (typeof oldest !== "string") break;
    responseCache.delete(oldest);
  }
};

const toProviderError = (status: number) => {
  if (status === 401 || status === 403) {
    return new AmplitudeApiError("Amplitude API 인증 정보를 확인해 주세요.", 502, "amplitude_auth_failed");
  }
  if (status === 429) {
    return new AmplitudeApiError("Amplitude 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.", 429, "amplitude_rate_limited");
  }
  return new AmplitudeApiError("Amplitude API 응답을 받지 못했습니다.", 502, "amplitude_request_failed");
};

const executeRequest = async <T>(runtime: AmplitudeRuntime, request: AmplitudeRequest): Promise<T> => {
  const url = new URL(request.path, runtime.baseUrl);
  url.search = request.search.toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${runtime.apiKey}:${runtime.secretKey}`).toString("base64")}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw toProviderError(response.status);
    return await response.json() as T;
  } catch (error) {
    if (error instanceof AmplitudeApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AmplitudeApiError("Amplitude API 요청 시간이 초과되었습니다.", 504, "amplitude_timeout");
    }
    throw new AmplitudeApiError("Amplitude API에 연결하지 못했습니다.", 502, "amplitude_unavailable");
  } finally {
    clearTimeout(timeout);
  }
};

export const requestAmplitude = async <T>(request: AmplitudeRequest): Promise<T> => {
  const runtime = getAmplitudeRuntime();
  const cacheKey = `${runtime.baseUrl}|${request.path}|${request.search.toString()}`;
  const cached = responseCache.get(cacheKey);
  if (!request.force && cached && cached.expiresAt > Date.now()) return cached.value as T;
  if (cached) responseCache.delete(cacheKey);

  const pending = responseInFlight.get(cacheKey);
  if (pending) return pending as Promise<T>;

  const promise = withRequestSlot(() => executeRequest<T>(runtime, request))
    .then((value) => {
      pruneCache();
      responseCache.set(cacheKey, { value, expiresAt: Date.now() + REQUEST_CACHE_TTL_MS });
      return value;
    })
    .finally(() => {
      if (responseInFlight.get(cacheKey) === promise) responseInFlight.delete(cacheKey);
    });
  responseInFlight.set(cacheKey, promise);
  return promise;
};
