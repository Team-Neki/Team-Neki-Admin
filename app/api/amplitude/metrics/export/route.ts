import { AmplitudeApiError, getAmplitudeRuntime } from "../../amplitude-client";
import { normalizeGranularity, normalizeRange, todayInTimeZone } from "../../amplitude-dates";
import { createAmplitudeMetricsExport, type AnalyticsExportFormat } from "../amplitude-metrics-export";
import { getAmplitudeMetrics } from "../amplitude-metrics-server";

const errorResponse = (body: Record<string, unknown>, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
});

const normalizeFormat = (value: string | null): AnalyticsExportFormat => {
  if (value === "csv" || value === "json") return value;
  throw new AmplitudeApiError("CSV 또는 JSON 형식을 선택해 주세요.", 400, "invalid_export_format");
};

const parseEventNames = (value: string | null) => {
  if (value === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length > 100 || parsed.some((item) => typeof item !== "string")) {
      throw new Error("invalid events");
    }
    return parsed as string[];
  } catch {
    throw new AmplitudeApiError("내보낼 이벤트 범위를 확인해 주세요.", 400, "invalid_export_events");
  }
};

export async function GET(request: Request) {
  try {
    const runtime = getAmplitudeRuntime();
    const params = new URL(request.url).searchParams;
    const today = todayInTimeZone(runtime.timeZone);
    const range = normalizeRange(params.get("startDate"), params.get("endDate"), today);
    const metrics = await getAmplitudeMetrics({
      granularity: normalizeGranularity(params.get("granularity")),
      ...range,
      force: false,
      today,
    });
    const exported = createAmplitudeMetricsExport({
      format: normalizeFormat(params.get("format")),
      metrics,
      eventNames: parseEventNames(params.get("events")),
    });
    return new Response(exported.body, {
      headers: {
        "content-type": exported.contentType,
        "content-disposition": `attachment; filename="${exported.filename}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AmplitudeApiError) {
      return errorResponse({ code: error.code, message: error.message }, error.status);
    }
    return errorResponse({ code: "amplitude_export_failed", message: "Amplitude 지표 파일을 만들지 못했습니다." }, 502);
  }
}
