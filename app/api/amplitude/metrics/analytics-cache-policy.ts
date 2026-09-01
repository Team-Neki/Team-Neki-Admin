export const ANALYTICS_LIVE_CACHE_TTL_MS = 60_000;
export const ANALYTICS_MAX_RANGE_DAYS = 1_095;

export type AnalyticsDailyStatus = {
  metricDate: string;
  finalized: boolean;
  fetchedAt: string;
};

export type AnalyticsDateWindow = {
  startDate: string;
  endDate: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const parseAnalyticsDate = (value: string) => new Date(`${value}T00:00:00Z`);

export const formatAnalyticsDate = (date: Date) => date.toISOString().slice(0, 10);

export const addAnalyticsDays = (value: string, days: number) => {
  const date = parseAnalyticsDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatAnalyticsDate(date);
};

export const analyticsRangeDays = (startDate: string, endDate: string) =>
  Math.floor((parseAnalyticsDate(endDate).getTime() - parseAnalyticsDate(startDate).getTime()) / 86_400_000) + 1;

export const normalizeAnalyticsRange = (startValue: string | null, endValue: string | null, today: string): AnalyticsDateWindow => {
  const defaultStart = addAnalyticsDays(today, -29);
  const validStart = startValue && DATE_PATTERN.test(startValue) ? startValue : defaultStart;
  const validEnd = endValue && DATE_PATTERN.test(endValue) ? endValue : today;
  const startDate = validStart <= validEnd ? validStart : validEnd;
  const endDate = (validStart <= validEnd ? validEnd : validStart) > today ? today : (validStart <= validEnd ? validEnd : validStart);
  const clampedStart = startDate > endDate ? endDate : startDate;
  if (analyticsRangeDays(clampedStart, endDate) > ANALYTICS_MAX_RANGE_DAYS) {
    return { startDate: addAnalyticsDays(endDate, -(ANALYTICS_MAX_RANGE_DAYS - 1)), endDate };
  }
  return { startDate: clampedStart, endDate };
};

export const listAnalyticsDates = (startDate: string, endDate: string) => {
  const dates: string[] = [];
  for (let date = startDate; date <= endDate; date = addAnalyticsDays(date, 1)) dates.push(date);
  return dates;
};

export const isAnalyticsStatusReusable = (status: AnalyticsDailyStatus | undefined, date: string, today: string, now: number, forceLiveRefresh: boolean) => {
  if (!status) return false;
  if (date < today) return status.finalized;
  if (forceLiveRefresh) return false;
  const fetchedAt = Date.parse(status.fetchedAt);
  return Number.isFinite(fetchedAt) && fetchedAt + ANALYTICS_LIVE_CACHE_TTL_MS > now;
};

export const analyticsCollectionWindows = (dates: string[]): AnalyticsDateWindow[] => {
  if (dates.length === 0) return [];
  const sorted = [...new Set(dates)].sort();
  const windows: AnalyticsDateWindow[] = [];
  let startDate = sorted[0];
  let endDate = sorted[0];
  for (const date of sorted.slice(1)) {
    if (date === addAnalyticsDays(endDate, 1)) {
      endDate = date;
      continue;
    }
    windows.push({ startDate, endDate });
    startDate = date;
    endDate = date;
  }
  windows.push({ startDate, endDate });
  return windows;
};

export const analyticsRangeCacheKey = (startDate: string, endDate: string, granularity: string) =>
  `${startDate}:${endDate}:${granularity}`;

export const isAnalyticsRangeSnapshotReusable = (snapshot: { finalized: boolean; fetchedAt: string } | undefined, endDate: string, today: string, now: number, forceLiveRefresh: boolean) => {
  if (!snapshot) return false;
  if (endDate < today) return snapshot.finalized;
  if (forceLiveRefresh) return false;
  const fetchedAt = Date.parse(snapshot.fetchedAt);
  return Number.isFinite(fetchedAt) && fetchedAt + ANALYTICS_LIVE_CACHE_TTL_MS > now;
};
