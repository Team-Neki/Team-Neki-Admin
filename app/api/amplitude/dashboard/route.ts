type AmplitudeUsersResponse = {
  data?: {
    series?: number[][];
    seriesLabels?: Array<string | { segment?: string; segments?: string[] }>;
    seriesMeta?: Array<string | { segment?: string; segments?: string[] }>;
    xValues?: string[];
  };
};

type DashboardGranularity = "day" | "week" | "month" | "range";
type DashboardMetricValue = {
  value: number;
  startDate: string;
  endDate: string;
};
type DashboardTrendPoint = {
  date: string;
  label: string;
  activeUsers: number;
  totalUsers: number | null;
  androidUsers: number | null;
  iosUsers: number | null;
};
type DashboardMetricsResponse = {
  hasData: boolean;
  asOfDate: string;
  updatedAt: string;
  activeUsers: {
    dau: DashboardMetricValue;
    wau: DashboardMetricValue;
    mau: DashboardMetricValue;
  };
  totalUsers: number | null;
  androidUsers: number | null;
  iosUsers: number | null;
  trend: DashboardTrendPoint[];
};
type UserMetricKey = "dau" | "wau" | "mau";
type UserMetricConfig = {
  key: UserMetricKey;
  interval: 1 | 7 | 30;
  points: number;
};
type UserMetricSeries = {
  dates: string[];
  active: number[];
  total: number[];
  android: number[];
  ios: number[];
};

const METRICS_CACHE_TTL_MS = 60_000;
const metricsCache = new Map<string, { value: DashboardMetricsResponse; expiresAt: number }>();
const metricsInFlight = new Map<string, Promise<DashboardMetricsResponse>>();
const AMPLITUDE_REQUEST_CONCURRENCY = 1;
const NEKI_PROD_API_KEY_ENV = "NEKI_PROD_AMPLITUDE_API_KEY";
const NEKI_PROD_SECRET_KEY_ENV = "NEKI_PROD_AMPLITUDE_SECRET_KEY";
const amplitudeRequestQueue: Array<() => Promise<void>> = [];
let activeAmplitudeRequests = 0;
const amplitudeResponseCache = new Map<string, { value: unknown; expiresAt: number }>();
const amplitudeResponseInFlight = new Map<string, Promise<unknown>>();

const getRuntimeValue = async (name: string) => {
  let runtime: Record<string, unknown> = {};
  try {
    const workerModule = await import("cloudflare:workers");
    runtime = workerModule.env as unknown as Record<string, unknown>;
  } catch {
    // Node-based local rendering does not provide Cloudflare's runtime module.
  }
  const value = runtime[name] ?? process.env[name];
  return typeof value === "string" ? value.trim() : "";
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);
const formatAmplitudeDate = (date: Date) => formatDate(date).replaceAll("-", "");
const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

const json = (body: Record<string, unknown>, status = 200, cacheControl = "no-store") => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": cacheControl,
  },
});

const drainAmplitudeRequestQueue = () => {
  while (activeAmplitudeRequests < AMPLITUDE_REQUEST_CONCURRENCY && amplitudeRequestQueue.length > 0) {
    const next = amplitudeRequestQueue.shift();
    if (next) void next();
  }
};

const withAmplitudeRequestSlot = <T>(task: () => Promise<T>) => new Promise<T>((resolve, reject) => {
  amplitudeRequestQueue.push(async () => {
    activeAmplitudeRequests += 1;
    try {
      resolve(await task());
    } catch (error) {
      reject(error);
    } finally {
      activeAmplitudeRequests -= 1;
      drainAmplitudeRequestQueue();
    }
  });
  drainAmplitudeRequestQueue();
});

const amplitudeRequest = async <T>(baseUrl: string, auth: string, search: URLSearchParams): Promise<T> => {
  const url = new URL("/api/2/users", baseUrl);
  url.search = search.toString();
  return withAmplitudeRequestSlot(async () => {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${auth}`,
      },
    });
    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      const suffix = retryAfter ? `; ${retryAfter}초 후 재시도` : "";
      throw new Error(`Amplitude API 응답 오류 (${response.status})${suffix}`);
    }
    return await response.json() as T;
  });
};

const cachedAmplitudeRequest = async <T>(baseUrl: string, auth: string, search: URLSearchParams): Promise<T> => {
  const cacheKey = `${baseUrl}|${search.toString()}`;
  const cached = amplitudeResponseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  if (cached) amplitudeResponseCache.delete(cacheKey);

  const pending = amplitudeResponseInFlight.get(cacheKey);
  if (pending) return pending as Promise<T>;

  const request = amplitudeRequest<T>(baseUrl, auth, search)
    .then((value) => {
      amplitudeResponseCache.set(cacheKey, { value, expiresAt: Date.now() + METRICS_CACHE_TTL_MS });
      return value;
    })
    .finally(() => {
      if (amplitudeResponseInFlight.get(cacheKey) === request) amplitudeResponseInFlight.delete(cacheKey);
    });
  amplitudeResponseInFlight.set(cacheKey, request);
  return request;
};

const normalizeAnchorDate = (value: string | null) => {
  const parsed = value ? new Date(`${value}T00:00:00Z`) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const startOfWeek = (date: Date) => {
  const day = date.getUTCDay();
  return addDays(date, -day);
};

const startOfMonth = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
const endOfMonth = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

const getPeriod = (anchor: Date, granularity: DashboardGranularity, rangeStartValue?: string | null, rangeEndValue?: string | null) => {
  if (rangeStartValue || rangeEndValue || granularity === "range") {
    const rangeStart = normalizeAnchorDate(rangeStartValue ?? formatDate(anchor));
    const rangeEnd = normalizeAnchorDate(rangeEndValue ?? formatDate(anchor));
    return rangeStart <= rangeEnd ? { start: rangeStart, end: rangeEnd } : { start: rangeEnd, end: rangeStart };
  }
  if (granularity === "week") {
    const start = startOfWeek(anchor);
    return { start, end: addDays(start, 6) };
  }
  if (granularity === "month") {
    return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
  }
  return { start: anchor, end: anchor };
};

const clampToToday = (date: Date) => {
  const today = new Date();
  const current = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return date > current ? current : date;
};

const metricConfigs: UserMetricConfig[] = [
  { key: "dau", interval: 1, points: 14 },
  { key: "wau", interval: 7, points: 12 },
  { key: "mau", interval: 30, points: 12 },
];

const selectedMetricKey = (granularity: DashboardGranularity): UserMetricKey =>
  granularity === "day" || granularity === "range" ? "dau" : granularity === "week" ? "wau" : "mau";

const platformLabel = (value: unknown) => {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (value && typeof value === "object") {
    const label = value as { segment?: unknown; segments?: unknown };
    if (typeof label.segment === "string") return label.segment.trim().toLowerCase();
    if (Array.isArray(label.segments)) return label.segments.filter((item): item is string => typeof item === "string").join(",").trim().toLowerCase();
  }
  return "";
};

const parseUserMetricSeries = (response: AmplitudeUsersResponse): UserMetricSeries => {
  const dates = response.data?.xValues ?? [];
  const series = response.data?.series ?? [];
  const labels = response.data?.seriesLabels ?? response.data?.seriesMeta ?? [];
  const rows = series.map((values, index) => ({ label: platformLabel(labels[index] ?? ""), values }));
  const total = dates.map((_, index) => rows.reduce((sum, row) => sum + Number(row.values[index] ?? 0), 0));
  const android = dates.map((_, index) => rows.filter((row) => row.label.includes("android")).reduce((sum, row) => sum + Number(row.values[index] ?? 0), 0));
  const ios = dates.map((_, index) => rows.filter((row) => row.label.includes("ios")).reduce((sum, row) => sum + Number(row.values[index] ?? 0), 0));
  const active = total.length > 0 ? total : (series[0] ?? []).map((value) => Number(value ?? 0));
  return { dates, active, total, android, ios };
};

const periodLabel = (date: string, granularity: DashboardGranularity) => {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (granularity === "month") return `${String(parsed.getUTCFullYear()).slice(-2)}.${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
  if (granularity === "week") return `${parsed.getUTCMonth() + 1}.${parsed.getUTCDate()} 주`;
  return `${parsed.getUTCMonth() + 1}.${parsed.getUTCDate()}`;
};

const metricValue = (series: UserMetricSeries, defaultDate: string, interval: number): DashboardMetricValue => {
  const endDate = series.dates.at(-1) ?? defaultDate;
  const end = new Date(`${endDate}T00:00:00Z`);
  const start = addDays(end, -(interval - 1));
  return {
    value: series.active.at(-1) ?? 0,
    startDate: formatDate(start),
    endDate,
  };
};

const sumValues = (values: number[]) => values.reduce((sum, value) => sum + Number(value || 0), 0);

export async function GET(request: Request) {
  const [apiKey, secretKey, region, projectStartDateValue] = await Promise.all([
    getRuntimeValue(NEKI_PROD_API_KEY_ENV),
    getRuntimeValue(NEKI_PROD_SECRET_KEY_ENV),
    getRuntimeValue("AMPLITUDE_REGION"),
    getRuntimeValue("AMPLITUDE_PROJECT_START_DATE"),
  ]);
  if (!apiKey || !secretKey) {
    return json({ code: "amplitude_not_configured", message: "Amplitude API 키를 설정한 뒤 다시 시도해 주세요." }, 503);
  }

  const params = new URL(request.url).searchParams;
  const requestedGranularity = params.get("granularity");
  const granularity: DashboardGranularity = requestedGranularity === "week" || requestedGranularity === "month" || requestedGranularity === "range" ? requestedGranularity : "day";
  const anchor = normalizeAnchorDate(params.get("anchorDate"));
  const selectedPeriod = getPeriod(anchor, granularity, params.get("rangeStartDate"), params.get("rangeEndDate"));
  const asOfDate = clampToToday(selectedPeriod.end);
  const cacheKey = `${granularity}:${formatDate(selectedPeriod.start)}:${formatDate(selectedPeriod.end)}:${formatDate(asOfDate)}`;
  const cached = metricsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return json(cached.value, 200, "private, max-age=60");
  if (cached) metricsCache.delete(cacheKey);

  const loadMetrics = async (): Promise<DashboardMetricsResponse> => {
    const baseUrl = region.toLowerCase() === "eu" ? "https://analytics.eu.amplitude.com" : "https://amplitude.com";
    const auth = btoa(`${apiKey}:${secretKey}`);
    const responses: Array<{ config: UserMetricConfig; series: UserMetricSeries }> = [];
    const activeMetricKey = selectedMetricKey(granularity);
    const rangeDays = Math.max(1, Math.floor((asOfDate.getTime() - selectedPeriod.start.getTime()) / 86_400_000) + 1);
    const queryConfigs = metricConfigs.map((config) => {
      if (config.key !== activeMetricKey) return { ...config, points: 1 };
      return granularity === "range" ? { ...config, points: rangeDays } : config;
    });
    for (const config of queryConfigs) {
      const startDate = addDays(asOfDate, -(config.points - 1) * config.interval);
      const response = await cachedAmplitudeRequest<AmplitudeUsersResponse>(baseUrl, auth, new URLSearchParams({
        start: formatAmplitudeDate(startDate),
        end: formatAmplitudeDate(asOfDate),
        m: "active",
        i: String(config.interval),
        g: "platform",
      }));
      responses.push({ config, series: parseUserMetricSeries(response) });
    }
    const projectStartDate = normalizeAnchorDate(projectStartDateValue || "2024-01-01");
    const newUsersResponse = await cachedAmplitudeRequest<AmplitudeUsersResponse>(baseUrl, auth, new URLSearchParams({
      start: formatAmplitudeDate(projectStartDate > asOfDate ? asOfDate : projectStartDate),
      end: formatAmplitudeDate(asOfDate),
      m: "new",
      i: "30",
      g: "platform",
    }));
    const newUsers = parseUserMetricSeries(newUsersResponse);
    const byMetric = new Map(responses.map((item) => [item.config.key, item]));
    const dau = byMetric.get("dau")?.series ?? { dates: [], active: [], total: [], android: [], ios: [] };
    const wau = byMetric.get("wau")?.series ?? { dates: [], active: [], total: [], android: [], ios: [] };
    const mau = byMetric.get("mau")?.series ?? { dates: [], active: [], total: [], android: [], ios: [] };
    const selectedSeries = granularity === "day" || granularity === "range" ? dau : granularity === "week" ? wau : mau;
    const hasNewUsers = newUsers.dates.length > 0;
    const trend = selectedSeries.dates.map((date, index) => ({
      date,
      label: periodLabel(date, granularity),
      activeUsers: selectedSeries.active[index] ?? 0,
      totalUsers: selectedSeries.total[index] ?? null,
      androidUsers: selectedSeries.android[index] ?? null,
      iosUsers: selectedSeries.ios[index] ?? null,
    }));
    return {
      hasData: responses.some((item) => item.series.active.length > 0),
      asOfDate: formatDate(asOfDate),
      updatedAt: new Date().toISOString(),
      activeUsers: {
        dau: metricValue(dau, formatDate(asOfDate), 1),
        wau: metricValue(wau, formatDate(asOfDate), 7),
        mau: metricValue(mau, formatDate(asOfDate), 30),
      },
      totalUsers: hasNewUsers ? sumValues(newUsers.total) : null,
      androidUsers: hasNewUsers ? sumValues(newUsers.android) : null,
      iosUsers: hasNewUsers ? sumValues(newUsers.ios) : null,
      trend,
    };
  };

  let requestPromise = metricsInFlight.get(cacheKey);
  if (!requestPromise) {
    requestPromise = loadMetrics();
    metricsInFlight.set(cacheKey, requestPromise);
  }

  try {
    const payload = await requestPromise;
    metricsCache.set(cacheKey, { value: payload, expiresAt: Date.now() + METRICS_CACHE_TTL_MS });
    return json(payload, 200, "private, max-age=60");
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("Amplitude API")
      ? error.message
      : "Amplitude 사용자 지표를 불러오지 못했습니다.";
    return json({ code: "amplitude_dashboard_request_failed", message }, 502);
  } finally {
    if (metricsInFlight.get(cacheKey) === requestPromise) metricsInFlight.delete(cacheKey);
  }
}
