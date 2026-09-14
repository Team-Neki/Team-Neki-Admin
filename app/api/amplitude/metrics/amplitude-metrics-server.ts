import "server-only";

import { mockAnalyticsEvents } from "../../../admin/mock-analytics-events";
import type { AnalyticsRefreshResult } from "../../../admin/types";
import { getAmplitudeRuntime, requestAmplitude } from "../amplitude-client";
import {
  completedRangeCacheTtl,
  formatAmplitudeDate,
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

const collectMetrics = async (input: MetricsInput): Promise<AnalyticsRefreshResult> => {
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
  return {
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
};

export const getAmplitudeMetrics = async (input: MetricsInput) => {
  getAmplitudeRuntime();
  const cacheKey = `${input.granularity}:${input.startDate}:${input.endDate}`;
  const cached = resultCache.get(cacheKey);
  if (!input.force && cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) resultCache.delete(cacheKey);

  const inFlightKey = `${cacheKey}:${input.force ? "refresh" : "cached"}`;
  const pending = resultInFlight.get(inFlightKey);
  if (pending) return pending;

  const promise = collectMetrics(input)
    .then((value) => {
      pruneResultCache();
      resultCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + completedRangeCacheTtl(input.endDate, input.today),
      });
      return value;
    })
    .finally(() => {
      if (resultInFlight.get(inFlightKey) === promise) resultInFlight.delete(inFlightKey);
    });
  resultInFlight.set(inFlightKey, promise);
  return promise;
};
