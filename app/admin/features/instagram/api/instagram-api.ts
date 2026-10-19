import type { InstagramMetricsSnapshot } from "../../../types";
import { authenticatedFetch } from "../../../shared/api/authenticated-fetch";

export class InstagramRequestError extends Error {
  constructor(message: string, public retryAfter = 0) { super(message); }
}

export async function fetchInstagramMetrics(startDate: string, endDate: string, cursor: string | undefined, signal: AbortSignal, refresh = false): Promise<InstagramMetricsSnapshot> {
  const params = new URLSearchParams({ startDate, endDate });
  if (cursor) params.set("cursor", cursor);
  if (refresh) params.set("refresh", "1");
  const response = await authenticatedFetch(`/api/instagram/metrics?${params}`, { signal, cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) {
    throw new InstagramRequestError(typeof payload.message === "string" ? payload.message : "Instagram 지표를 불러오지 못했습니다.", Number(payload.retryAfter) || 0);
  }
  if (payload.source !== "instagram" || !Array.isArray(payload.posts) || !Array.isArray(payload.trend) || !Array.isArray(payload.warnings)) {
    throw new InstagramRequestError("Instagram 응답을 확인할 수 없습니다.");
  }
  return payload;
}
