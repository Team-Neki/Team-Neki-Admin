import "server-only";

import { mockAnalyticsEvents } from "../../../admin/mock-analytics-events";
import type { AnalyticsRefreshResult } from "../../../admin/types";
import {
  isAnalyticsRefreshResult,
  readAmplitudeDailyCache,
  readAmplitudeRangeCache,
  type DailyAnalyticsSnapshot,
  writeAmplitudeDailyCache,
  writeAmplitudeRangeCache,
} from "../amplitude-file-cache";
import { getAmplitudeRuntime, requestAmplitude } from "../amplitude-client";
import {
  addDays,
  completedRangeCacheTtl,
  formatDate,
  formatAmplitudeDate,
  parseDate,
  type AmplitudeGranularity,
} from "../amplitude-dates";
import { loadAmplitudeUsers } from "../amplitude-users";

type MetricsInput = {
  granularity: AmplitudeGranularity;
  startDate: string;
  endDate: string;
  force: boolean;
  today: string;
};

type AmplitudeSegmentationResponse = {
  data?: {
    series?: number[][];
    seriesCollapsed?: Array<Array<{ value?: number }>>;
    seriesLabels?: unknown[];
    xValues?: string[];
  };
};

const RESULT_CACHE_MAX_ENTRIES = 64;
const resultCache = new Map<string, { value: AnalyticsRefreshResult; expiresAt: number }>();
const resultInFlight = new Map<string, Promise<AnalyticsRefreshResult>>();
const eventNames = Array.from(new Set(mockAnalyticsEvents.map((event) => event.name)));

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

const eventDefinition = {
  event_type: "_all",
  filters: [{
    subprop_type: "event",
    subprop_key: "event_type_value",
    subprop_op: "is",
    subprop_value: eventNames,
  }],
  group_by: [{ type: "event", value: "event_type_value" }],
};

const eventNameFromLabel = (label: unknown) => {
  const value = Array.isArray(label) ? label.at(-1) : label;
  return typeof value === "string" ? value.replace(/^ce:/, "") : "";
};

const groupedMetricMap = (response: AmplitudeSegmentationResponse) => {
  const labels = response.data?.seriesLabels ?? [];
  const collapsed = response.data?.seriesCollapsed ?? [];
  const series = response.data?.series ?? [];
  return new Map(labels.flatMap((label, index) => {
    const name = eventNameFromLabel(label);
    if (!name) return [];
    const collapsedValue = collapsed[index]?.[0]?.value;
    const value = typeof collapsedValue === "number"
      ? collapsedValue
      : (series[index] ?? []).reduce((total, item) => total + Number(item || 0), 0);
    return [[name, value] as const];
  }));
};

const groupedSeriesMap = (response: AmplitudeSegmentationResponse) => {
  const labels = response.data?.seriesLabels ?? [];
  const series = response.data?.series ?? [];
  return new Map(labels.flatMap((label, index) => {
    const name = eventNameFromLabel(label);
    return name ? [[name, series[index] ?? []] as const] : [];
  }));
};

const normalizeProviderDate = (value: string) => /^\d{8}$/.test(value)
  ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  : value.slice(0, 10);

const fetchEventMetric = (input: MetricsInput, metric: "totals" | "uniques") => requestAmplitude<AmplitudeSegmentationResponse>({
  path: "/api/2/events/segmentation",
  search: new URLSearchParams({
    start: formatAmplitudeDate(input.startDate),
    end: formatAmplitudeDate(input.endDate),
    i: input.granularity === "week" ? "7" : input.granularity === "month" ? "30" : "1",
    e: JSON.stringify(eventDefinition),
    m: metric,
  }),
  force: input.force,
});

const collectMetrics = async (input: MetricsInput, projectCacheKey: string) => {
  const interval = input.granularity === "week" ? 7 : input.granularity === "month" ? 30 : 1;
  const [totalsResponse, uniquesResponse, activeUsers] = await Promise.all([
    fetchEventMetric(input, "totals"),
    fetchEventMetric(input, "uniques"),
    loadAmplitudeUsers({
      start: input.startDate,
      end: input.endDate,
      metric: "active",
      interval,
      force: input.force,
    }),
  ]);
  const totals = groupedMetricMap(totalsResponse);
  const uniques = groupedMetricMap(uniquesResponse);
  const result: AnalyticsRefreshResult = {
    source: "amplitude",
    granularity: input.granularity,
    fetchedAt: new Date().toISOString(),
    periodStart: input.startDate,
    periodEnd: input.endDate,
    events: eventNames.map((name) => ({
      name,
      total: totals.get(name) ?? 0,
      uniques: uniques.get(name) ?? 0,
    })),
    activeUsers: activeUsers.dates.map((date, index) => ({
      date,
      value: activeUsers.active[index] ?? 0,
    })),
  };
  const totalSeries = groupedSeriesMap(totalsResponse);
  const uniqueSeries = groupedSeriesMap(uniquesResponse);
  const dates = (totalsResponse.data?.xValues ?? activeUsers.dates).map(normalizeProviderDate);
  const daily = input.granularity === "day" ? dates.flatMap((date, index): DailyAnalyticsSnapshot[] => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < input.startDate || date > input.endDate) return [];
    const finalized = date < input.today;
    return [{
      schemaVersion: 1,
      source: "amplitude",
      projectCacheKey,
      date,
      finalized,
      expiresAt: finalized ? null : Date.now() + completedRangeCacheTtl(date, input.today),
      fetchedAt: result.fetchedAt,
      events: eventNames.map((name) => ({
        name,
        total: Number(totalSeries.get(name)?.[index] ?? (dates.length === 1 ? totals.get(name) : 0) ?? 0),
        uniques: Number(uniqueSeries.get(name)?.[index] ?? (dates.length === 1 ? uniques.get(name) : 0) ?? 0),
      })),
      activeUsers: Number(activeUsers.active[index] ?? 0),
    }];
  }) : [];
  return { result, daily };
};

const rangeDates = (startDate: string, endDate: string) => {
  const result: string[] = [];
  const end = parseDate(endDate, endDate);
  for (let cursor = parseDate(startDate, startDate); cursor <= end; cursor = addDays(cursor, 1)) {
    result.push(formatDate(cursor));
  }
  return result;
};

const missingDateRanges = (dates: string[], snapshots: Array<DailyAnalyticsSnapshot | null>) => {
  const ranges: Array<{ startDate: string; endDate: string }> = [];
  let startDate: string | null = null;
  dates.forEach((date, index) => {
    if (!snapshots[index] && !startDate) startDate = date;
    if (startDate && (snapshots[index] || index === dates.length - 1)) {
      const endIndex = snapshots[index] ? index - 1 : index;
      ranges.push({ startDate, endDate: dates[endIndex] });
      startDate = null;
    }
  });
  return ranges;
};

const persistDaily = async (snapshots: DailyAnalyticsSnapshot[]) => {
  for (const snapshot of snapshots) await writeAmplitudeDailyCache(snapshot);
};

const collectAndPersist = async (input: MetricsInput, projectCacheKey: string) => {
  const collected = await collectMetrics(input, projectCacheKey);
  await persistDaily(collected.daily);
  return collected.result;
};

const assembleDailyMetrics = async (input: MetricsInput, snapshots: DailyAnalyticsSnapshot[]) => {
  const totals = new Map<string, number>();
  snapshots.forEach((snapshot) => snapshot.events.forEach((event) => {
    totals.set(event.name, (totals.get(event.name) ?? 0) + event.total);
  }));
  let uniques: Map<string, number>;
  if (snapshots.length === 1) {
    uniques = new Map(snapshots[0].events.map((event) => [event.name, event.uniques ?? 0]));
  } else {
    uniques = groupedMetricMap(await fetchEventMetric(input, "uniques"));
  }
  return {
    source: "amplitude",
    granularity: "day",
    fetchedAt: new Date().toISOString(),
    periodStart: input.startDate,
    periodEnd: input.endDate,
    events: eventNames.map((name) => ({ name, total: totals.get(name) ?? 0, uniques: uniques.get(name) ?? 0 })),
    activeUsers: snapshots.map((snapshot) => ({ date: snapshot.date, value: snapshot.activeUsers })),
  } satisfies AnalyticsRefreshResult;
};

const loadDayGranularityMetrics = async (input: MetricsInput, projectCacheKey: string) => {
  const dates = rangeDates(input.startDate, input.endDate);
  let snapshots = await Promise.all(dates.map((date) => (
    readAmplitudeDailyCache(projectCacheKey, date, input.force)
  )));
  const missing = missingDateRanges(dates, snapshots);
  if (missing.length === 1
    && missing[0].startDate === input.startDate
    && missing[0].endDate === input.endDate) {
    return collectAndPersist(input, projectCacheKey);
  }
  for (const range of missing) {
    await collectAndPersist({ ...input, ...range, granularity: "day" }, projectCacheKey);
  }
  if (missing.length > 0) {
    snapshots = await Promise.all(dates.map((date) => (
      readAmplitudeDailyCache(projectCacheKey, date, false)
    )));
  }
  if (snapshots.some((snapshot) => !snapshot)) return collectAndPersist(input, projectCacheKey);
  return assembleDailyMetrics(input, snapshots as DailyAnalyticsSnapshot[]);
};

export const getAmplitudeMetrics = async (input: MetricsInput) => {
  const runtime = getAmplitudeRuntime();
  const cacheKey = `${runtime.projectCacheKey}:${input.granularity}:${input.startDate}:${input.endDate}`;
  const finalized = input.endDate < input.today;
  const cached = resultCache.get(cacheKey);
  if ((!input.force || finalized) && cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) resultCache.delete(cacheKey);

  const persisted = await readAmplitudeRangeCache(
    "metrics-ranges",
    cacheKey,
    isAnalyticsRefreshResult,
    input.force && !finalized,
  );
  if (persisted) {
    resultCache.set(cacheKey, {
      value: persisted,
      expiresAt: Date.now() + completedRangeCacheTtl(input.endDate, input.today),
    });
    return persisted;
  }

  const inFlightKey = `${cacheKey}:${input.force ? "refresh" : "cached"}`;
  const pending = resultInFlight.get(inFlightKey);
  if (pending) return pending;

  const promise = (input.granularity === "day"
    ? loadDayGranularityMetrics(input, runtime.projectCacheKey)
    : collectAndPersist(input, runtime.projectCacheKey))
    .then(async (value) => {
      pruneResultCache();
      resultCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + completedRangeCacheTtl(input.endDate, input.today),
      });
      await writeAmplitudeRangeCache(
        "metrics-ranges",
        cacheKey,
        value,
        finalized,
        completedRangeCacheTtl(input.endDate, input.today),
      );
      return value;
    })
    .finally(() => {
      if (resultInFlight.get(inFlightKey) === promise) resultInFlight.delete(inFlightKey);
    });
  resultInFlight.set(inFlightKey, promise);
  return promise;
};
