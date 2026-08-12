type AmplitudeEvent = {
  value?: string;
  display?: string;
  totals?: number;
  uniques?: number;
  pct_dau?: number;
};

type AmplitudeEventListResponse = {
  data?: AmplitudeEvent[];
};

type AmplitudeUsersResponse = {
  data?: {
    xValues?: string[];
    series?: number[][];
  };
};

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

export async function GET() {
  const [apiKey, secretKey, region] = await Promise.all([
    getRuntimeValue("AMPLITUDE_API_KEY"),
    getRuntimeValue("AMPLITUDE_SECRET_KEY"),
    getRuntimeValue("AMPLITUDE_REGION"),
  ]);
  if (!apiKey || !secretKey) {
    return json({ code: "amplitude_not_configured", message: "Amplitude API 키를 설정한 뒤 다시 시도해 주세요." }, 503);
  }

  const baseUrl = region.toLowerCase() === "eu" ? "https://analytics.eu.amplitude.com" : "https://amplitude.com";
  const auth = btoa(`${apiKey}:${secretKey}`);
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 6);

  try {
    const [eventsResponse, usersResponse] = await Promise.all([
      amplitudeRequest<AmplitudeEventListResponse>(baseUrl, auth, "/api/2/events/list"),
      amplitudeRequest<AmplitudeUsersResponse>(baseUrl, auth, "/api/2/users", new URLSearchParams({
        start: formatAmplitudeDate(startDate),
        end: formatAmplitudeDate(endDate),
        i: "1",
        m: "active",
      })),
    ]);

    const userDates = usersResponse.data?.xValues ?? [];
    const userValues = usersResponse.data?.series?.[0] ?? [];
    return json({
      source: "amplitude",
      fetchedAt: new Date().toISOString(),
      periodStart: formatDate(startDate),
      periodEnd: formatDate(endDate),
      events: (eventsResponse.data ?? []).map((event) => ({
        name: event.value ?? event.display ?? "",
        total: Number(event.totals ?? 0),
        ...(typeof event.uniques === "number" ? { uniques: event.uniques } : {}),
        ...(typeof event.pct_dau === "number" ? { pctDau: event.pct_dau } : {}),
      })).filter((event) => event.name),
      activeUsers: userDates.map((date, index) => ({ date, value: Number(userValues[index] ?? 0) })),
    });
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("Amplitude API")
      ? error.message
      : "Amplitude 지표를 불러오지 못했습니다.";
    return json({ code: "amplitude_request_failed", message }, 502);
  }
}
