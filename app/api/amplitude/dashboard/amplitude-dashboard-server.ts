import "server-only";

import type {
  DashboardMetricKey,
  DashboardMetricValue,
  DashboardMetrics,
  DashboardTrendPoint,
} from "../../../admin/types";
import { getAmplitudeRuntime } from "../amplitude-client";
import {
  addDays,
  completedRangeCacheTtl,
  formatDate,
  normalizeRange,
  parseDate,
} from "../amplitude-dates";
import { loadAmplitudeUsers, type AmplitudeUserSeries } from "../amplitude-users";

export type DashboardGranularity = "day" | "week" | "month" | "range";

type DashboardInput = {
  granularity: DashboardGranularity;
  anchorDate: string | null;
  rangeStartDate: string | null;
  rangeEndDate: string | null;
  today: string;
};

type MetricConfig = {
  key: DashboardMetricKey;
  interval: 1 | 7 | 30;
  points: number;
};

const RESULT_CACHE_MAX_ENTRIES = 32;
const resultCache = new Map<string, { value: DashboardMetrics; expiresAt: number }>();
const resultInFlight = new Map<string, Promise<DashboardMetrics>>();
const EMPTY_SERIES: AmplitudeUserSeries = { dates: [], active: [], total: [], android: [], ios: [] };
const METRIC_CONFIGS: MetricConfig[] = [
  { key: "dau", interval: 1, points: 14 },
  { key: "wau", interval: 7, points: 12 },
  { key: "mau", interval: 30, points: 12 },
];

const startOfWeek = (date: Date) => addDays(date, -date.getUTCDay());
const startOfMonth = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
const endOfMonth = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

const selectedMetricKey = (granularity: DashboardGranularity): DashboardMetricKey =>
  granularity === "day" || granularity === "range" ? "dau" : granularity === "week" ? "wau" : "mau";

const selectedPeriod = (input: DashboardInput) => {
  const todayDate = parseDate(input.today, input.today);
  if (input.granularity === "range" || input.rangeStartDate || input.rangeEndDate) {
    const range = normalizeRange(input.rangeStartDate, input.rangeEndDate, input.today);
    return { start: parseDate(range.startDate, input.today), end: parseDate(range.endDate, input.today) };
  }
  const anchor = parseDate(input.anchorDate, input.today);
  const safeAnchor = anchor > todayDate ? todayDate : anchor;
  if (input.granularity === "week") {
    const start = startOfWeek(safeAnchor);
    const end = addDays(start, 6);
    return { start, end: end > todayDate ? todayDate : end };
  }
  if (input.granularity === "month") {
    const end = endOfMonth(safeAnchor);
    return { start: startOfMonth(safeAnchor), end: end > todayDate ? todayDate : end };
  }
  return { start: safeAnchor, end: safeAnchor };
};

const periodLabel = (date: string, granularity: DashboardGranularity) => {
  const parsed = parseDate(date, date);
  if (granularity === "month") return `${String(parsed.getUTCFullYear()).slice(-2)}.${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
  if (granularity === "week") return `${parsed.getUTCMonth() + 1}.${parsed.getUTCDate()} 주`;
  return `${parsed.getUTCMonth() + 1}.${parsed.getUTCDate()}`;
};

const toTrend = (series: AmplitudeUserSeries, granularity: DashboardGranularity): DashboardTrendPoint[] =>
  series.dates.map((date, index) => ({
    date,
    label: periodLabel(date, granularity),
    activeUsers: series.active[index] ?? 0,
    totalUsers: series.total[index] ?? null,
    androidUsers: series.android[index] ?? null,
    iosUsers: series.ios[index] ?? null,
  }));

const metricValue = (series: AmplitudeUserSeries, defaultDate: string, interval: number): DashboardMetricValue => {
  const endDate = series.dates.at(-1) ?? defaultDate;
  return {
    value: series.active.at(-1) ?? 0,
    startDate: formatDate(addDays(parseDate(endDate, defaultDate), -(interval - 1))),
    endDate,
  };
};

const sum = (values: number[]) => values.reduce((total, value) => total + Number(value || 0), 0);

const pruneResultCache = () => {
  const now = Date.now();
  for (const [key, entry] of resultCache) {
    if (entry.expiresAt <= now) resultCache.delete(key);
  }
  while (resultCache.size >= RESULT_CACHE_MAX_ENTRIES) {
    const oldest = resultCache.keys().next().value;
    if (typeof oldest !== "string") break;
    resultCache.delete(oldest);
  }
};

const collectDashboard = async (
  input: DashboardInput,
  period: { start: Date; end: Date },
): Promise<DashboardMetrics> => {
  const runtime = getAmplitudeRuntime();
  const activeKey = selectedMetricKey(input.granularity);
  const rangeDays = Math.max(1, Math.floor((period.end.getTime() - period.start.getTime()) / 86_400_000) + 1);
  const configs = METRIC_CONFIGS.map((config) => input.granularity === "range"
    ? { ...config, points: Math.max(1, Math.ceil(rangeDays / config.interval)) }
    : config.key === activeKey ? config : { ...config, points: 1 });

  const metricSeries = new Map<DashboardMetricKey, AmplitudeUserSeries>();
  for (const config of configs) {
    const start = addDays(period.end, -(config.points - 1) * config.interval);
    metricSeries.set(config.key, await loadAmplitudeUsers({
      start: formatDate(start < period.start && input.granularity === "range" ? period.start : start),
      end: formatDate(period.end),
      metric: "active",
      interval: config.interval,
      groupByPlatform: true,
    }));
  }

  const projectStart = parseDate(runtime.projectStartDate, "2024-01-01");
  const newUsers = await loadAmplitudeUsers({
    start: formatDate(projectStart > period.end ? period.end : projectStart),
    end: formatDate(period.end),
    metric: "new",
    interval: 30,
    groupByPlatform: true,
  });

  const dau = metricSeries.get("dau") ?? EMPTY_SERIES;
  const wau = metricSeries.get("wau") ?? EMPTY_SERIES;
  const mau = metricSeries.get("mau") ?? EMPTY_SERIES;
  const metricTrends = {
    dau: toTrend(dau, input.granularity),
    wau: toTrend(wau, input.granularity),
    mau: toTrend(mau, input.granularity),
  };
  const hasNewUsers = newUsers.dates.length > 0;
  return {
    hasData: metricSeries.size > 0 && Array.from(metricSeries.values()).some((series) => series.dates.length > 0),
    asOfDate: formatDate(period.end),
    updatedAt: new Date().toISOString(),
    activeUsers: {
      dau: metricValue(dau, formatDate(period.end), 1),
      wau: metricValue(wau, formatDate(period.end), 7),
      mau: metricValue(mau, formatDate(period.end), 30),
    },
    totalUsers: hasNewUsers ? sum(newUsers.total) : null,
    androidUsers: hasNewUsers ? sum(newUsers.android) : null,
    iosUsers: hasNewUsers ? sum(newUsers.ios) : null,
    trend: metricTrends[activeKey],
    metricTrends,
  };
};

export const getAmplitudeDashboard = async (input: DashboardInput) => {
  getAmplitudeRuntime();
  const period = selectedPeriod(input);
  const cacheKey = `${input.granularity}:${formatDate(period.start)}:${formatDate(period.end)}`;
  const cached = resultCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) resultCache.delete(cacheKey);

  const pending = resultInFlight.get(cacheKey);
  if (pending) return pending;
  const promise = collectDashboard(input, period)
    .then((value) => {
      pruneResultCache();
      resultCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + completedRangeCacheTtl(formatDate(period.end), input.today),
      });
      return value;
    })
    .finally(() => {
      if (resultInFlight.get(cacheKey) === promise) resultInFlight.delete(cacheKey);
    });
  resultInFlight.set(cacheKey, promise);
  return promise;
};
