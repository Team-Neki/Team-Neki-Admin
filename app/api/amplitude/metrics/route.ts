type AmplitudeUsersResponse = {
  data?: {
    xValues?: string[];
    series?: number[][];
  };
};

type AmplitudeTaxonomyEvent = {
  event_type?: string;
  deleted?: string | null;
  is_active?: boolean;
  is_hidden_from_dropdowns?: boolean;
};

type AmplitudeTaxonomyResponse = {
  data?: AmplitudeTaxonomyEvent[];
};

type AmplitudeSegmentationResponse = {
  data?: {
    series?: number[][];
    seriesCollapsed?: Array<Array<{ value?: number }>>;
    seriesLabels?: unknown[];
  };
};

type AnalyticsGranularity = "day" | "week" | "month";
type AnalyticsMetric = { name: string; total: number; uniques: number };
type AnalyticsMetricsResponse = {
  source: "amplitude";
  granularity: AnalyticsGranularity;
  fetchedAt: string;
  periodStart: string;
  periodEnd: string;
  events: AnalyticsMetric[];
  activeUsers: Array<{ date: string; value: number }>;
};

const METRICS_CACHE_TTL_MS = 60_000;
const metricsCache = new Map<AnalyticsGranularity, { value: AnalyticsMetricsResponse; expiresAt: number }>();
const metricsInFlight = new Map<AnalyticsGranularity, Promise<AnalyticsMetricsResponse>>();
const AMPLITUDE_REQUEST_CONCURRENCY = 4;
const amplitudeRequestQueue: Array<() => Promise<void>> = [];
let activeAmplitudeRequests = 0;

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

const amplitudeRequest = async <T>(baseUrl: string, auth: string, path: string, search?: URLSearchParams): Promise<T> => {
  const url = new URL(path, baseUrl);
  if (search) url.search = search.toString();
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

const normalizeEventMetricName = (value: string) => value.replace(/^ce:/, "");

const getGroupedMetricMap = (response: AmplitudeSegmentationResponse) => {
  const labels = response.data?.seriesLabels ?? [];
  const collapsed = response.data?.seriesCollapsed ?? [];
  const series = response.data?.series ?? [];
  const values = Array.from({ length: Math.max(labels.length, collapsed.length, series.length) }, (_, index) => {
    const label = labels[index];
    const labelValue = Array.isArray(label) ? label.at(-1) : label;
    const name = typeof labelValue === "string" ? normalizeEventMetricName(labelValue) : "";
    const collapsedValue = collapsed[index]?.[0]?.value;
    const seriesValue = series[index]?.reduce((total, value) => total + Number(value || 0), 0) ?? 0;
    return { name, value: typeof collapsedValue === "number" ? collapsedValue : seriesValue };
  });
  return new Map(values.filter((item) => item.name).map((item) => [item.name, item.value]));
};

export async function GET(request: Request) {
  const [apiKey, secretKey, region] = await Promise.all([
    getRuntimeValue("AMPLITUDE_API_KEY"),
    getRuntimeValue("AMPLITUDE_SECRET_KEY"),
    getRuntimeValue("AMPLITUDE_REGION"),
  ]);
  if (!apiKey || !secretKey) {
    return json({ code: "amplitude_not_configured", message: "Amplitude API 키를 설정한 뒤 다시 시도해 주세요." }, 503);
  }

  const baseUrl = region.toLowerCase() === "eu" ? "https://analytics.eu.amplitude.com" : "https://amplitude.com";
  const requestedGranularity = new URL(request.url).searchParams.get("granularity");
  const granularity: AnalyticsGranularity = requestedGranularity === "week" || requestedGranularity === "month" ? requestedGranularity : "day";
  const period = granularity === "day"
    ? { days: 29, interval: 1 }
    : granularity === "week"
      ? { days: 83, interval: 7 }
      : { days: 364, interval: 30 };
  const auth = btoa(`${apiKey}:${secretKey}`);
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - period.days);

  const cached = metricsCache.get(granularity);
  if (cached && cached.expiresAt > Date.now()) return json(cached.value, 200, "private, max-age=60");
  if (cached) metricsCache.delete(granularity);

  const loadMetrics = async (): Promise<AnalyticsMetricsResponse> => {
    const [taxonomyResponse, usersResponse] = await Promise.all([
      amplitudeRequest<AmplitudeTaxonomyResponse>(baseUrl, auth, "/api/2/taxonomy/event"),
      amplitudeRequest<AmplitudeUsersResponse>(baseUrl, auth, "/api/2/users", new URLSearchParams({
        start: formatAmplitudeDate(startDate),
        end: formatAmplitudeDate(endDate),
        i: String(period.interval),
        m: "active",
      })),
    ]);

    const eventNames = Array.from(new Set((taxonomyResponse.data ?? [])
      .filter((event) => event.event_type && event.deleted == null && event.is_active !== false && event.is_hidden_from_dropdowns !== true)
      .map((event) => event.event_type as string)));
    const fetchGroupedEventMetrics = async () => {
      const definition = {
        event_type: "_all",
        filters: [{
          subprop_type: "event",
          subprop_key: "event_type_value",
          subprop_op: "is",
          subprop_value: eventNames,
        }],
        group_by: [{ type: "event", value: "event_type_value" }],
      };
      const baseParams = new URLSearchParams({
        start: formatAmplitudeDate(startDate),
        end: formatAmplitudeDate(endDate),
        i: String(period.interval),
        e: JSON.stringify(definition),
      });
      const totalParams = new URLSearchParams(baseParams);
      totalParams.set("m", "totals");
      const uniqueParams = new URLSearchParams(baseParams);
      uniqueParams.set("m", "uniques");
      const [totalResponse, uniqueResponse] = await Promise.all([
        amplitudeRequest<AmplitudeSegmentationResponse>(baseUrl, auth, "/api/2/events/segmentation", totalParams),
        amplitudeRequest<AmplitudeSegmentationResponse>(baseUrl, auth, "/api/2/events/segmentation", uniqueParams),
      ]);
      const totals = getGroupedMetricMap(totalResponse);
      const uniques = getGroupedMetricMap(uniqueResponse);
      return eventNames.map((name) => ({
        name,
        total: totals.get(normalizeEventMetricName(name)) ?? 0,
        uniques: uniques.get(normalizeEventMetricName(name)) ?? 0,
      }));
    };

    const events: AnalyticsMetric[] = await fetchGroupedEventMetrics();

    const userDates = usersResponse.data?.xValues ?? [];
    const userValues = usersResponse.data?.series?.[0] ?? [];
    return {
      source: "amplitude",
      granularity,
      fetchedAt: new Date().toISOString(),
      periodStart: formatDate(startDate),
      periodEnd: formatDate(endDate),
      events,
      activeUsers: userDates.map((date, index) => ({ date, value: Number(userValues[index] ?? 0) })),
    };
  };

  let requestPromise = metricsInFlight.get(granularity);
  if (!requestPromise) {
    requestPromise = loadMetrics();
    metricsInFlight.set(granularity, requestPromise);
  }

  try {
    const payload = await requestPromise;
    metricsCache.set(granularity, { value: payload, expiresAt: Date.now() + METRICS_CACHE_TTL_MS });
    return json(payload, 200, "private, max-age=60");
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("Amplitude API")
      ? error.message
      : "Amplitude 지표를 불러오지 못했습니다.";
    return json({ code: "amplitude_request_failed", message }, 502);
  } finally {
    if (metricsInFlight.get(granularity) === requestPromise) metricsInFlight.delete(granularity);
  }
}
