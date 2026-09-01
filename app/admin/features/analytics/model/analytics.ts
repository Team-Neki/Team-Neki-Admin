import dayjs, { type Dayjs } from "dayjs";
import type { AnalyticsGranularity } from "../../../types";

export type AnalyticsDateRange = [Dayjs, Dayjs];
export type AnalyticsGroup = "all" | "archiving" | "map" | "pose";

export const ANALYTICS_MIN_DATE = dayjs("2024-01-01");
export const ANALYTICS_REFRESH_COOLDOWN_MS = 30_000;

export const ANALYTICS_GROUP_OPTIONS: Array<{ label: string; value: AnalyticsGroup }> = [
  { label: "전체", value: "all" },
  { label: "아카이빙", value: "archiving" },
  { label: "맵", value: "map" },
  { label: "포즈", value: "pose" },
];

export const ANALYTICS_GROUP_AREAS: Record<Exclude<AnalyticsGroup, "all">, string> = {
  archiving: "아카이빙",
  map: "지도",
  pose: "포즈",
};

export const ANALYTICS_GRANULARITY_OPTIONS: Array<{ label: string; value: AnalyticsGranularity }> = [
  { label: "일별", value: "day" },
  { label: "주별", value: "week" },
  { label: "월별", value: "month" },
];

export const createDefaultAnalyticsRange = (): AnalyticsDateRange => {
  const today = dayjs().startOf("day");
  return [today.subtract(29, "day"), today];
};

export const analyticsRangePresets = () => [
  { label: "오늘", value: [dayjs().startOf("day"), dayjs().startOf("day")] as AnalyticsDateRange },
  { label: "최근 7일", value: [dayjs().subtract(6, "day").startOf("day"), dayjs().startOf("day")] as AnalyticsDateRange },
  { label: "최근 30일", value: createDefaultAnalyticsRange() },
  { label: "이번 달", value: [dayjs().startOf("month"), dayjs().startOf("day")] as AnalyticsDateRange },
];

export const analyticsGranularityLabel = (value: AnalyticsGranularity) =>
  ANALYTICS_GRANULARITY_OPTIONS.find((option) => option.value === value)?.label ?? "일별";
