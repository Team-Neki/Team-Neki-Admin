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
  };
};

type AnalyticsGranularity = "day" | "week" | "month";

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

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
});

const amplitudeRequest = async <T>(baseUrl: string, auth: string, path: string, search?: URLSearchParams): Promise<T> => {
  const url = new URL(path, baseUrl);
  if (search) url.search = search.toString();
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${auth}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Amplitude API 응답 오류 (${response.status})`);
  }
  return await response.json() as T;
};

const withConcurrency = async <T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) => {
  const results: R[] = [];
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
};

const getCollapsedMetric = (response: AmplitudeSegmentationResponse) => {
  const collapsed = response.data?.seriesCollapsed?.[0]?.[0]?.value;
  if (typeof collapsed === "number") return collapsed;
  return response.data?.series?.[0]?.reduce((total, value) => total + Number(value || 0), 0) ?? 0;
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

  try {
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
    const events = await withConcurrency(eventNames, 5, async (name) => {
      const searchBase = {
        e: JSON.stringify({ event_type: name }),
        start: formatAmplitudeDate(startDate),
        end: formatAmplitudeDate(endDate),
      };
      const totalResponse = await Promise.resolve().then(() => amplitudeRequest<AmplitudeSegmentationResponse>(baseUrl, auth, "/api/2/events/segmentation", new URLSearchParams({ ...searchBase, m: "totals" }))).catch(() => undefined);
      const uniqueResponse = await Promise.resolve().then(() => amplitudeRequest<AmplitudeSegmentationResponse>(baseUrl, auth, "/api/2/events/segmentation", new URLSearchParams({ ...searchBase, m: "uniques" }))).catch(() => undefined);
      return {
        name,
        total: totalResponse ? getCollapsedMetric(totalResponse) : 0,
        uniques: uniqueResponse ? getCollapsedMetric(uniqueResponse) : 0,
      };
    });

    const userDates = usersResponse.data?.xValues ?? [];
    const userValues = usersResponse.data?.series?.[0] ?? [];
    return json({
      source: "amplitude",
      granularity,
      fetchedAt: new Date().toISOString(),
      periodStart: formatDate(startDate),
      periodEnd: formatDate(endDate),
      events,
      activeUsers: userDates.map((date, index) => ({ date, value: Number(userValues[index] ?? 0) })),
    });
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("Amplitude API")
      ? error.message
      : "Amplitude 지표를 불러오지 못했습니다.";
    return json({ code: "amplitude_request_failed", message }, 502);
  }
}
