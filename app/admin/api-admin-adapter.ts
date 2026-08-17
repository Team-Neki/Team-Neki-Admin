import { mockAdminAdapter } from "./mock-admin-adapter";
import type { AdminAdapter, AnalyticsGranularity, AnalyticsRefreshResult, DashboardMetrics, DashboardMetricsQuery, LoadMode } from "./types";

type AnalyticsApiError = {
  message?: string;
};

const ANALYTICS_CLIENT_CACHE_TTL_MS = 60_000;
const analyticsCache = new Map<AnalyticsGranularity, { value: AnalyticsRefreshResult; expiresAt: number }>();
const analyticsInFlight = new Map<AnalyticsGranularity, Promise<AnalyticsRefreshResult>>();
const DASHBOARD_CLIENT_CACHE_TTL_MS = 60_000;
const dashboardCache = new Map<string, { value: DashboardMetrics; expiresAt: number }>();
const dashboardInFlight = new Map<string, Promise<DashboardMetrics>>();

const normalizeDashboardAnchor = (query: DashboardMetricsQuery) => {
  const parsed = new Date(`${query.anchorDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return query.anchorDate;
  if (query.granularity === "month") {
    parsed.setUTCDate(1);
  } else if (query.granularity === "week") {
    parsed.setUTCDate(parsed.getUTCDate() - parsed.getUTCDay());
  }
  return parsed.toISOString().slice(0, 10);
};

const getDashboardMetrics = async (query: DashboardMetricsQuery, mode: LoadMode = "success"): Promise<DashboardMetrics> => {
  if (mode !== "success") return mockAdminAdapter.getDashboardMetrics(query, mode);

  const cacheKey = `${query.granularity}:${normalizeDashboardAnchor(query)}`;
  const now = Date.now();
  const cached = dashboardCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) dashboardCache.delete(cacheKey);

  const pending = dashboardInFlight.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    const params = new URLSearchParams({ granularity: query.granularity, anchorDate: query.anchorDate });
    const response = await fetch(`/api/amplitude/dashboard?${params.toString()}`, {
      headers: { Accept: "application/json" },
      cache: "default",
    });
    const payload = await response.json() as DashboardMetrics | AnalyticsApiError;
    if (!response.ok) {
      throw new Error("message" in payload && payload.message ? payload.message : "Amplitude 사용자 지표를 불러오지 못했습니다.");
    }
    const result = payload as DashboardMetrics;
    dashboardCache.set(cacheKey, { value: result, expiresAt: Date.now() + DASHBOARD_CLIENT_CACHE_TTL_MS });
    return result;
  })();

  dashboardInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (dashboardInFlight.get(cacheKey) === request) dashboardInFlight.delete(cacheKey);
  }
};

const refreshAnalytics = async (granularity: AnalyticsGranularity): Promise<AnalyticsRefreshResult> => {
  const now = Date.now();
  const cached = analyticsCache.get(granularity);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) analyticsCache.delete(granularity);

  const pending = analyticsInFlight.get(granularity);
  if (pending) return pending;

  const request = (async () => {
    const response = await fetch(`/api/amplitude/metrics?granularity=${granularity}`, {
      headers: { Accept: "application/json" },
      cache: "default",
    });

    const payload = await response.json() as AnalyticsRefreshResult | AnalyticsApiError;
    if (!response.ok) {
      throw new Error("message" in payload && payload.message ? payload.message : "Amplitude 지표를 불러오지 못했습니다.");
    }

    const result = payload as AnalyticsRefreshResult;
    analyticsCache.set(granularity, { value: result, expiresAt: Date.now() + ANALYTICS_CLIENT_CACHE_TTL_MS });
    return result;
  })();

  analyticsInFlight.set(granularity, request);
  try {
    return await request;
  } finally {
    if (analyticsInFlight.get(granularity) === request) analyticsInFlight.delete(granularity);
  }
};

/** 운영 CRUD는 목 구현체를 유지하고, 지표 새로고침만 서버 API를 통과합니다. */
export const apiAdminAdapter: AdminAdapter = {
  ...mockAdminAdapter,
  getDashboardMetrics,
  refreshAnalytics,
};
