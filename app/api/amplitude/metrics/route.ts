import { AmplitudeApiError, getAmplitudeRuntime } from "../amplitude-client";
import { normalizeGranularity, normalizeRange, todayInTimeZone } from "../amplitude-dates";
import { getAmplitudeMetrics } from "./amplitude-metrics-server";

const json = (body: Record<string, unknown>, status = 200, cacheControl = "no-store") => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": cacheControl,
  },
});

export async function GET(request: Request) {
  try {
    const runtime = getAmplitudeRuntime();
    const params = new URL(request.url).searchParams;
    const today = todayInTimeZone(runtime.timeZone);
    const range = normalizeRange(params.get("startDate"), params.get("endDate"), today);
    const payload = await getAmplitudeMetrics({
      granularity: normalizeGranularity(params.get("granularity")),
      ...range,
      force: params.get("refresh") === "1",
      today,
    });
    return json(payload, 200, "private, max-age=60");
  } catch (error) {
    if (error instanceof AmplitudeApiError) return json({ code: error.code, message: error.message }, error.status);
    return json({ code: "amplitude_request_failed", message: "Amplitude 지표를 불러오지 못했습니다." }, 502);
  }
}
