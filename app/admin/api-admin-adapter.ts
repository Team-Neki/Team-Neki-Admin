import { mockAdminAdapter } from "./mock-admin-adapter";
import type {
  AdminAdapter,
  AnalyticsMetricsQuery,
  AnalyticsRefreshResult,
  DashboardMetrics,
  DashboardMetricsQuery,
  GroupAccountQuery,
  GroupAccountStatus,
  GroupAccountTransactionsResponse,
  LoadMode,
} from "./types";

type AnalyticsApiError = {
  message?: string;
};

type GroupAccountApiError = {
  message?: string;
};

const ANALYTICS_CLIENT_CACHE_TTL_MS = 60_000;
const analyticsCache = new Map<string, { value: AnalyticsRefreshResult; expiresAt: number }>();
const analyticsInFlight = new Map<string, Promise<AnalyticsRefreshResult>>();
const DASHBOARD_CLIENT_CACHE_TTL_MS = 60_000;
const DASHBOARD_CLIENT_CACHE_MAX_ENTRIES = 32;
const dashboardCache = new Map<string, { value: DashboardMetrics; expiresAt: number }>();
const dashboardInFlight = new Map<string, Promise<DashboardMetrics>>();
const GROUP_ACCOUNT_CLIENT_CACHE_TTL_MS = 60_000;
const GROUP_ACCOUNT_CLIENT_CACHE_MAX_ENTRIES = 32;
const groupAccountStatusCache: { value?: GroupAccountStatus; expiresAt: number } = { expiresAt: 0 };
const groupAccountStatusInFlight: { value?: Promise<GroupAccountStatus> } = {};
const groupAccountTransactionsCache = new Map<string, { value: GroupAccountTransactionsResponse; expiresAt: number }>();
const groupAccountTransactionsInFlight = new Map<string, Promise<GroupAccountTransactionsResponse>>();

const normalizeDashboardAnchor = (query: DashboardMetricsQuery) => {
  if (query.rangeStartDate && query.rangeEndDate) {
    return `${query.rangeStartDate}:${query.rangeEndDate}`;
  }
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
    if (query.rangeStartDate && query.rangeEndDate) {
      params.set("rangeStartDate", query.rangeStartDate);
      params.set("rangeEndDate", query.rangeEndDate);
    }
    const response = await fetch(`/api/amplitude/dashboard?${params.toString()}`, {
      headers: { Accept: "application/json" },
      cache: "default",
    });
    const payload = await response.json() as DashboardMetrics | AnalyticsApiError;
    if (!response.ok) {
      throw new Error("message" in payload && payload.message ? payload.message : "Amplitude 사용자 지표를 불러오지 못했습니다.");
    }
    const result = payload as DashboardMetrics;
    while (dashboardCache.size >= DASHBOARD_CLIENT_CACHE_MAX_ENTRIES) {
      const oldest = dashboardCache.keys().next().value;
      if (typeof oldest !== "string") break;
      dashboardCache.delete(oldest);
    }
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

const readGroupAccountJson = async <T>(response: Response) => {
  try {
    return await response.json() as T;
  } catch {
    return {} as T;
  }
};

const groupAccountErrorMessage = (payload: GroupAccountApiError, fallback: string) =>
  payload.message || fallback;

const getGroupAccountStatus = async (): Promise<GroupAccountStatus> => {
  const now = Date.now();
  if (groupAccountStatusCache.value && groupAccountStatusCache.expiresAt > now) return groupAccountStatusCache.value;
  if (groupAccountStatusCache.value) groupAccountStatusCache.value = undefined;
  if (groupAccountStatusInFlight.value) return groupAccountStatusInFlight.value;

  const request = (async () => {
    const response = await fetch("/api/group-account/status", { headers: { Accept: "application/json" }, cache: "default" });
    const payload = await readGroupAccountJson<GroupAccountStatus | GroupAccountApiError>(response);
    if (!response.ok) throw new Error(groupAccountErrorMessage(payload as GroupAccountApiError, "계좌 연결 상태를 확인하지 못했습니다."));
    const result = payload as GroupAccountStatus;
    groupAccountStatusCache.value = result;
    groupAccountStatusCache.expiresAt = Date.now() + GROUP_ACCOUNT_CLIENT_CACHE_TTL_MS;
    return result;
  })();

  groupAccountStatusInFlight.value = request;
  try {
    return await request;
  } finally {
    if (groupAccountStatusInFlight.value === request) groupAccountStatusInFlight.value = undefined;
  }
};

const getGroupAccountTransactions = async (query: GroupAccountQuery): Promise<GroupAccountTransactionsResponse> => {
  const cacheKey = `${query.from}:${query.to}:${query.direction}:${query.page}`;
  const now = Date.now();
  const cached = groupAccountTransactionsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) groupAccountTransactionsCache.delete(cacheKey);
  const pending = groupAccountTransactionsInFlight.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    const params = new URLSearchParams({ from: query.from, to: query.to, direction: query.direction, page: String(query.page) });
    const response = await fetch(`/api/group-account/transactions?${params.toString()}`, { headers: { Accept: "application/json" }, cache: "default" });
    const payload = await readGroupAccountJson<GroupAccountTransactionsResponse | GroupAccountApiError>(response);
    if (!response.ok) throw new Error(groupAccountErrorMessage(payload as GroupAccountApiError, "거래내역을 불러오지 못했습니다."));
    const result = payload as GroupAccountTransactionsResponse;
    while (groupAccountTransactionsCache.size >= GROUP_ACCOUNT_CLIENT_CACHE_MAX_ENTRIES) {
      const oldest = groupAccountTransactionsCache.keys().next().value;
      if (typeof oldest !== "string") break;
      groupAccountTransactionsCache.delete(oldest);
    }
    groupAccountTransactionsCache.set(cacheKey, { value: result, expiresAt: Date.now() + GROUP_ACCOUNT_CLIENT_CACHE_TTL_MS });
    return result;
  })();

  groupAccountTransactionsInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (groupAccountTransactionsInFlight.get(cacheKey) === request) groupAccountTransactionsInFlight.delete(cacheKey);
  }
};

const refreshAnalytics = async (query: AnalyticsMetricsQuery): Promise<AnalyticsRefreshResult> => {
  const cacheKey = `${query.granularity}:${query.startDate}:${query.endDate}`;
  const now = Date.now();
  const cached = analyticsCache.get(cacheKey);
  if (!query.refresh && cached && cached.expiresAt > now) return cached.value;
  if (cached) analyticsCache.delete(cacheKey);

  const pending = analyticsInFlight.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    const params = new URLSearchParams({
      granularity: query.granularity,
      startDate: query.startDate,
      endDate: query.endDate,
    });
    if (query.refresh) params.set("refresh", "1");
    const response = await fetch(`/api/amplitude/metrics?${params.toString()}`, {
      headers: { Accept: "application/json" },
      cache: "default",
    });

    const payload = await response.json() as AnalyticsRefreshResult | AnalyticsApiError;
    if (!response.ok) {
      throw new Error("message" in payload && payload.message ? payload.message : "Amplitude 지표를 불러오지 못했습니다.");
    }

    const result = payload as AnalyticsRefreshResult;
    analyticsCache.set(cacheKey, { value: result, expiresAt: Date.now() + ANALYTICS_CLIENT_CACHE_TTL_MS });
    return result;
  })();

  analyticsInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (analyticsInFlight.get(cacheKey) === request) analyticsInFlight.delete(cacheKey);
  }
};

/** 운영 CRUD는 목 구현체를 유지하고, 지표 새로고침만 서버 API를 통과합니다. */
export const apiAdminAdapter: AdminAdapter = {
  ...mockAdminAdapter,
  getDashboardMetrics,
  refreshAnalytics,
  getGroupAccountStatus,
  getGroupAccountTransactions,
};
