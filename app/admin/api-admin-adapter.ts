import { mockAdminAdapter } from "./mock-admin-adapter";
import type { AdminAdapter, AnalyticsGranularity, AnalyticsRefreshResult } from "./types";

type AnalyticsApiError = {
  message?: string;
};

const refreshAnalytics = async (granularity: AnalyticsGranularity): Promise<AnalyticsRefreshResult> => {
  const response = await fetch(`/api/amplitude/metrics?granularity=${granularity}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const payload = await response.json() as AnalyticsRefreshResult | AnalyticsApiError;
  if (!response.ok) {
    throw new Error("message" in payload && payload.message ? payload.message : "Amplitude 지표를 불러오지 못했습니다.");
  }

  return payload as AnalyticsRefreshResult;
};

/** 운영 CRUD는 목 구현체를 유지하고, 지표 새로고침만 서버 API를 통과합니다. */
export const apiAdminAdapter: AdminAdapter = {
  ...mockAdminAdapter,
  refreshAnalytics,
};
