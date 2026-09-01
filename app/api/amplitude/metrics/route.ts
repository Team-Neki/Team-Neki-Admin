import { getDatabase, type AnalyticsDatabase } from "../../../../db";
import { cachedAmplitudeRequest, getAmplitudeAuth, getAmplitudeBaseUrl, getAmplitudeRuntime } from "../amplitude-client";
import {
  ANALYTICS_LIVE_CACHE_TTL_MS,
  addAnalyticsDays,
  analyticsCollectionWindows,
  analyticsRangeCacheKey,
  analyticsRangeDays,
  isAnalyticsRangeSnapshotReusable,
  isAnalyticsStatusReusable,
  listAnalyticsDates,
  normalizeAnalyticsRange,
  type AnalyticsDailyStatus,
  type AnalyticsDateWindow,
} from "./analytics-cache-policy";

type AmplitudeUsersResponse = {
  data?: {
    xValues?: string[];
    series?: number[][];
  };
};

type AmplitudeTaxonomyEvent = {
  event_type?: string;
  deleted?: string | null;
  is_active?: boolean;
  is_hidden_from_dropdowns?: boolean;
};

type AmplitudeTaxonomyResponse = {
  data?: AmplitudeTaxonomyEvent[];
};

type AmplitudeSegmentationResponse = {
  data?: {
    xValues?: string[];
    series?: number[][];
    seriesCollapsed?: Array<Array<{ value?: number }>>;
    seriesLabels?: unknown[];
  };
};

type AnalyticsGranularity = "day" | "week" | "month";
type AnalyticsMetric = { name: string; total: number; uniques: number };
type AnalyticsActiveUserPoint = { date: string; value: number };
type AnalyticsMetricsResponse = {
  source: "amplitude";
  granularity: AnalyticsGranularity;
  fetchedAt: string;
  periodStart: string;
  periodEnd: string;
  events: AnalyticsMetric[];
  activeUsers: AnalyticsActiveUserPoint[];
  cache: {
    storedDays: number;
    refreshedDays: number;
    finalizedDays: number;
  };
};

type DailyStatusRow = {
  metric_date: string;
  finalized: number;
  fetched_at: string;
};

type AggregatedEventRow = {
  event_name: string;
  total: number;
};

type RangeSnapshotRow = {
  cache_key: string;
  event_uniques_json: string;
  active_users_json: string;
  finalized: number;
  fetched_at: string;
};

type RangeSnapshot = {
  cacheKey: string;
  eventUniques: Record<string, number>;
  activeUsers: AnalyticsActiveUserPoint[];
  finalized: boolean;
  fetchedAt: string;
};

type DailyMetricRow = {
  date: string;
  eventName: string;
  total: number;
  dailyUniques: number;
};

const MAX_AMPLITUDE_DAILY_WINDOW_DAYS = 365;
const metricsInFlight = new Map<string, Promise<AnalyticsMetricsResponse>>();
const formatAmplitudeDate = (value: string) => value.replaceAll("-", "");

const json = (body: Record<string, unknown>, status = 200, cacheControl = "no-store") => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": cacheControl,
  },
});

const normalizeEventMetricName = (value: string) => value.replace(/^ce:/, "");

const eventNameFromLabel = (label: unknown) => {
  const value = Array.isArray(label) ? label.at(-1) : label;
  return typeof value === "string" ? normalizeEventMetricName(value) : "";
};

const getGroupedMetricMap = (response: AmplitudeSegmentationResponse) => {
  const labels = response.data?.seriesLabels ?? [];
  const collapsed = response.data?.seriesCollapsed ?? [];
  const series = response.data?.series ?? [];
  const values = Array.from({ length: Math.max(labels.length, collapsed.length, series.length) }, (_, index) => {
    const name = eventNameFromLabel(labels[index]);
    const collapsedValue = collapsed[index]?.[0]?.value;
    const seriesValue = series[index]?.reduce((total, value) => total + Number(value || 0), 0) ?? 0;
    return { name, value: typeof collapsedValue === "number" ? collapsedValue : seriesValue };
  });
  return new Map(values.filter((item) => item.name).map((item) => [item.name, item.value]));
};

const getGroupedDailyMetricMap = (response: AmplitudeSegmentationResponse) => {
  const dates = response.data?.xValues ?? [];
  const labels = response.data?.seriesLabels ?? [];
  const series = response.data?.series ?? [];
  const daily = new Map<string, Map<string, number>>();
  labels.forEach((label, seriesIndex) => {
    const name = eventNameFromLabel(label);
    if (!name) return;
    dates.forEach((date, dateIndex) => {
      const values = daily.get(date) ?? new Map<string, number>();
      values.set(name, Number(series[seriesIndex]?.[dateIndex] ?? 0));
      daily.set(date, values);
    });
  });
  return daily;
};

const dateInTimeZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
};

const splitDailyWindows = (windows: AnalyticsDateWindow[]) => windows.flatMap((window) => {
  const chunks: AnalyticsDateWindow[] = [];
  let startDate = window.startDate;
  while (startDate <= window.endDate) {
    const candidateEnd = addAnalyticsDays(startDate, MAX_AMPLITUDE_DAILY_WINDOW_DAYS - 1);
    const endDate = candidateEnd < window.endDate ? candidateEnd : window.endDate;
    chunks.push({ startDate, endDate });
    startDate = addAnalyticsDays(endDate, 1);
  }
  return chunks;
});

const readDailyStatuses = async (db: AnalyticsDatabase, startDate: string, endDate: string) => {
  const result = await db.prepare(`
    SELECT metric_date, finalized, fetched_at
    FROM analytics_daily_statuses
    WHERE metric_date BETWEEN ? AND ?
    ORDER BY metric_date
  `).bind(startDate, endDate).all<DailyStatusRow>();
  return new Map((result.results ?? []).map((row) => [row.metric_date, {
    metricDate: row.metric_date,
    finalized: row.finalized === 1,
    fetchedAt: row.fetched_at,
  } satisfies AnalyticsDailyStatus]));
};

const readRangeSnapshot = async (db: AnalyticsDatabase, cacheKey: string): Promise<RangeSnapshot | undefined> => {
  const row = await db.prepare(`
    SELECT cache_key, event_uniques_json, active_users_json, finalized, fetched_at
    FROM analytics_range_snapshots
    WHERE cache_key = ?
  `).bind(cacheKey).first<RangeSnapshotRow>();
  if (!row) return undefined;
  try {
    return {
      cacheKey: row.cache_key,
      eventUniques: JSON.parse(row.event_uniques_json) as Record<string, number>,
      activeUsers: JSON.parse(row.active_users_json) as AnalyticsActiveUserPoint[],
      finalized: row.finalized === 1,
      fetchedAt: row.fetched_at,
    };
  } catch {
    return undefined;
  }
};

const readAggregatedEvents = async (db: AnalyticsDatabase, startDate: string, endDate: string) => {
  const result = await db.prepare(`
    SELECT event_name, SUM(total) AS total
    FROM analytics_daily_event_metrics
    WHERE metric_date BETWEEN ? AND ?
    GROUP BY event_name
  `).bind(startDate, endDate).all<AggregatedEventRow>();
  return new Map((result.results ?? []).map((row) => [row.event_name, Number(row.total ?? 0)]));
};

const writeDailyMetrics = async (db: AnalyticsDatabase, dates: string[], rows: DailyMetricRow[], fetchedAt: string, today: string) => {
  const rowsByDate = new Map<string, DailyMetricRow[]>();
  rows.forEach((row) => rowsByDate.set(row.date, [...(rowsByDate.get(row.date) ?? []), row]));
  for (const date of dates) {
    const statements = (rowsByDate.get(date) ?? []).map((row) => db.prepare(`
      INSERT INTO analytics_daily_event_metrics (metric_date, event_name, total, daily_uniques, fetched_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(metric_date, event_name) DO UPDATE SET
        total = excluded.total,
        daily_uniques = excluded.daily_uniques,
        fetched_at = excluded.fetched_at
    `).bind(row.date, row.eventName, row.total, row.dailyUniques, fetchedAt));
    statements.push(db.prepare(`
      INSERT INTO analytics_daily_statuses (metric_date, finalized, fetched_at)
      VALUES (?, ?, ?)
      ON CONFLICT(metric_date) DO UPDATE SET
        finalized = excluded.finalized,
        fetched_at = excluded.fetched_at
    `).bind(date, date < today ? 1 : 0, fetchedAt));
    await db.batch(statements);
  }
};

const writeRangeSnapshot = async (db: AnalyticsDatabase, snapshot: RangeSnapshot, startDate: string, endDate: string, granularity: AnalyticsGranularity) => {
  await db.prepare(`
    INSERT INTO analytics_range_snapshots (
      cache_key, start_date, end_date, granularity, event_uniques_json, active_users_json, finalized, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      event_uniques_json = excluded.event_uniques_json,
      active_users_json = excluded.active_users_json,
      finalized = excluded.finalized,
      fetched_at = excluded.fetched_at
  `).bind(
    snapshot.cacheKey,
    startDate,
    endDate,
    granularity,
    JSON.stringify(snapshot.eventUniques),
    JSON.stringify(snapshot.activeUsers),
    snapshot.finalized ? 1 : 0,
    snapshot.fetchedAt,
  ).run();
};

const activeUserInterval = (granularity: AnalyticsGranularity) => granularity === "week" ? 7 : granularity === "month" ? 30 : 1;

const eventUniqueInterval = (startDate: string, endDate: string) => analyticsRangeDays(startDate, endDate) > MAX_AMPLITUDE_DAILY_WINDOW_DAYS ? 30 : 1;

const eventDefinition = (eventNames: string[]) => ({
  event_type: "_all",
  filters: [{
    subprop_type: "event",
    subprop_key: "event_type_value",
    subprop_op: "is",
    subprop_value: eventNames,
  }],
  group_by: [{ type: "event", value: "event_type_value" }],
});

const fetchEventMetrics = <T extends AmplitudeSegmentationResponse>(baseUrl: string, auth: string, eventNames: string[], startDate: string, endDate: string, metric: "totals" | "uniques", interval: number) => cachedAmplitudeRequest<T>(baseUrl, auth, "/api/2/events/segmentation", new URLSearchParams({
  start: formatAmplitudeDate(startDate),
  end: formatAmplitudeDate(endDate),
  i: String(interval),
  e: JSON.stringify(eventDefinition(eventNames)),
  m: metric,
}));

const fetchActiveUsers = (baseUrl: string, auth: string, startDate: string, endDate: string, granularity: AnalyticsGranularity) => cachedAmplitudeRequest<AmplitudeUsersResponse>(baseUrl, auth, "/api/2/users", new URLSearchParams({
  start: formatAmplitudeDate(startDate),
  end: formatAmplitudeDate(endDate),
  i: String(activeUserInterval(granularity)),
  m: "active",
}));

const readEventNames = async (baseUrl: string, auth: string) => {
  const taxonomy = await cachedAmplitudeRequest<AmplitudeTaxonomyResponse>(baseUrl, auth, "/api/2/taxonomy/event");
  return Array.from(new Set((taxonomy.data ?? [])
    .filter((event) => event.event_type && event.deleted == null && event.is_active !== false && event.is_hidden_from_dropdowns !== true)
    .map((event) => event.event_type as string)));
};

const toActiveUserPoints = (response: AmplitudeUsersResponse) => {
  const dates = response.data?.xValues ?? [];
  const values = response.data?.series?.[0] ?? [];
  return dates.map((date, index) => ({ date, value: Number(values[index] ?? 0) }));
};

const collectMetrics = async (request: Request): Promise<AnalyticsMetricsResponse> => {
  const { apiKey, secretKey, region, timeZone } = await getAmplitudeRuntime();
  if (!apiKey || !secretKey) throw new Error("Amplitude API 키를 설정한 뒤 다시 시도해 주세요.");

  const nowDate = new Date();
  const now = nowDate.getTime();
  const today = dateInTimeZone(nowDate, timeZone);
  const params = new URL(request.url).searchParams;
  const requestedGranularity = params.get("granularity");
  const granularity: AnalyticsGranularity = requestedGranularity === "week" || requestedGranularity === "month" ? requestedGranularity : "day";
  const { startDate, endDate } = normalizeAnalyticsRange(params.get("startDate"), params.get("endDate"), today);
  const forceLiveRefresh = params.get("refresh") === "1";
  const rangeKey = analyticsRangeCacheKey(startDate, endDate, granularity);
  const db = await getDatabase();
  const statuses = await readDailyStatuses(db, startDate, endDate);
  const requestedDates = listAnalyticsDates(startDate, endDate);
  const datesToRefresh = requestedDates.filter((date) => !isAnalyticsStatusReusable(statuses.get(date), date, today, now, forceLiveRefresh));
  const collectionWindows = splitDailyWindows(analyticsCollectionWindows(datesToRefresh));
  const storedSnapshot = await readRangeSnapshot(db, rangeKey);
  const snapshotReusable = isAnalyticsRangeSnapshotReusable(storedSnapshot, endDate, today, now, forceLiveRefresh);
  const baseUrl = getAmplitudeBaseUrl(region);
  const auth = getAmplitudeAuth(apiKey, secretKey);

  let snapshot = storedSnapshot;
  let eventNames: string[] = [];
  let fullRangeUniqueResponse: AmplitudeSegmentationResponse | undefined;

  if (collectionWindows.length > 0 || !snapshotReusable) eventNames = await readEventNames(baseUrl, auth);

  if (!snapshotReusable) {
    const [uniqueResponse, activeUsersResponse] = await Promise.all([
      fetchEventMetrics(baseUrl, auth, eventNames, startDate, endDate, "uniques", eventUniqueInterval(startDate, endDate)),
      fetchActiveUsers(baseUrl, auth, startDate, endDate, granularity),
    ]);
    fullRangeUniqueResponse = uniqueResponse;
    snapshot = {
      cacheKey: rangeKey,
      eventUniques: Object.fromEntries(getGroupedMetricMap(uniqueResponse)),
      activeUsers: toActiveUserPoints(activeUsersResponse),
      finalized: endDate < today,
      fetchedAt: new Date().toISOString(),
    };
  }

  for (const window of collectionWindows) {
    const canReuseFullRangeDailyUniques = Boolean(
      fullRangeUniqueResponse &&
      eventUniqueInterval(startDate, endDate) === 1 &&
      window.startDate >= startDate &&
      window.endDate <= endDate,
    );
    const [totalResponse, dailyUniqueResponse] = await Promise.all([
      fetchEventMetrics(baseUrl, auth, eventNames, window.startDate, window.endDate, "totals", 1),
      canReuseFullRangeDailyUniques
        ? Promise.resolve(fullRangeUniqueResponse as AmplitudeSegmentationResponse)
        : fetchEventMetrics(baseUrl, auth, eventNames, window.startDate, window.endDate, "uniques", 1),
    ]);
    const totalsByDate = getGroupedDailyMetricMap(totalResponse);
    const uniquesByDate = getGroupedDailyMetricMap(dailyUniqueResponse);
    const dates = listAnalyticsDates(window.startDate, window.endDate);
    const rows = dates.flatMap((date) => eventNames.map((eventName) => ({
      date,
      eventName,
      total: totalsByDate.get(date)?.get(eventName) ?? 0,
      dailyUniques: uniquesByDate.get(date)?.get(eventName) ?? 0,
    })));
    await writeDailyMetrics(db, dates, rows, new Date().toISOString(), today);
  }

  if (!snapshot) throw new Error("Amplitude 지표 범위를 준비하지 못했습니다.");
  if (!snapshotReusable) await writeRangeSnapshot(db, snapshot, startDate, endDate, granularity);

  const totals = await readAggregatedEvents(db, startDate, endDate);
  const names = Array.from(new Set([...totals.keys(), ...Object.keys(snapshot.eventUniques)])).sort((a, b) => a.localeCompare(b));
  return {
    source: "amplitude",
    granularity,
    fetchedAt: snapshot.fetchedAt,
    periodStart: startDate,
    periodEnd: endDate,
    events: names.map((name) => ({ name, total: totals.get(name) ?? 0, uniques: snapshot.eventUniques[name] ?? 0 })),
    activeUsers: snapshot.activeUsers,
    cache: {
      storedDays: requestedDates.length,
      refreshedDays: datesToRefresh.length,
      finalizedDays: requestedDates.filter((date) => date < today).length,
    },
  };
};

export async function GET(request: Request) {
  const runtime = await getAmplitudeRuntime();
  if (!runtime.apiKey || !runtime.secretKey) {
    return json({ code: "amplitude_not_configured", message: "Amplitude API 키를 설정한 뒤 다시 시도해 주세요." }, 503);
  }

  const requestUrl = new URL(request.url);
  const today = dateInTimeZone(new Date(), runtime.timeZone);
  const range = normalizeAnalyticsRange(requestUrl.searchParams.get("startDate"), requestUrl.searchParams.get("endDate"), today);
  const granularity = requestUrl.searchParams.get("granularity") ?? "day";
  const force = requestUrl.searchParams.get("refresh") === "1";
  const inFlightKey = `${analyticsRangeCacheKey(range.startDate, range.endDate, granularity)}:${force ? "refresh" : "cached"}`;
  let requestPromise = metricsInFlight.get(inFlightKey);
  if (!requestPromise) {
    requestPromise = collectMetrics(request);
    metricsInFlight.set(inFlightKey, requestPromise);
  }

  try {
    const payload = await requestPromise;
    return json(payload, 200, `private, max-age=${Math.floor(ANALYTICS_LIVE_CACHE_TTL_MS / 1000)}`);
  } catch (error) {
    const message = error instanceof Error && (error.message.startsWith("Amplitude API") || error.message.startsWith("Amplitude 지표"))
      ? error.message
      : "Amplitude 지표를 불러오지 못했습니다.";
    return json({ code: "amplitude_request_failed", message }, 502);
  } finally {
    if (metricsInFlight.get(inFlightKey) === requestPromise) metricsInFlight.delete(inFlightKey);
  }
}
