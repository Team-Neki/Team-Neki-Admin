import { AmplitudeApiError, getAmplitudeRuntime } from "../amplitude-client";
import { todayInTimeZone } from "../amplitude-dates";
import { getAmplitudeDashboard, type DashboardGranularity } from "./amplitude-dashboard-server";

const json = (body: Record<string, unknown>, status = 200, cacheControl = "no-store") => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": cacheControl,
  },
});

const dashboardGranularity = (value: string | null): DashboardGranularity =>
  value === "week" || value === "month" || value === "range" ? value : "day";

export async function GET(request: Request) {
  try {
    const runtime = getAmplitudeRuntime();
    const params = new URL(request.url).searchParams;
    const payload = await getAmplitudeDashboard({
      granularity: dashboardGranularity(params.get("granularity")),
      anchorDate: params.get("anchorDate"),
      rangeStartDate: params.get("rangeStartDate"),
      rangeEndDate: params.get("rangeEndDate"),
      today: todayInTimeZone(runtime.timeZone),
    });
    return json(payload, 200, "private, max-age=60");
  } catch (error) {
    if (error instanceof AmplitudeApiError) return json({ code: error.code, message: error.message }, error.status);
    return json({ code: "amplitude_dashboard_request_failed", message: "Amplitude 사용자 지표를 불러오지 못했습니다." }, 502);
  }
}
