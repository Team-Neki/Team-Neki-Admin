import { AmplitudeApiError } from "./amplitude-client";

export type AmplitudeGranularity = "day" | "week" | "month";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const formatDate = (date: Date) => date.toISOString().slice(0, 10);
export const formatAmplitudeDate = (value: string) => value.replaceAll("-", "");

export const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

export const parseDate = (value: string | null, fallback: string) => {
  const candidate = value || fallback;
  if (!DATE_PATTERN.test(candidate)) throw invalidRange();
  const parsed = new Date(`${candidate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || formatDate(parsed) !== candidate) throw invalidRange();
  return parsed;
};

export const todayInTimeZone = (timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
};

export const normalizeRange = (startValue: string | null, endValue: string | null, today: string) => {
  const defaultEnd = parseDate(today, today);
  const defaultStart = addDays(defaultEnd, -29);
  const start = parseDate(startValue, formatDate(defaultStart));
  const end = parseDate(endValue, today);
  if (start > end) throw invalidRange();
  if (formatDate(end) > today) throw invalidRange();
  return { startDate: formatDate(start), endDate: formatDate(end) };
};

export const normalizeGranularity = (value: string | null): AmplitudeGranularity =>
  value === "week" || value === "month" ? value : "day";

export const completedRangeCacheTtl = (endDate: string, today: string) =>
  endDate < today ? 24 * 60 * 60 * 1_000 : 5 * 60 * 1_000;

const invalidRange = () => new AmplitudeApiError(
  "조회 기간을 확인해 주세요.",
  400,
  "invalid_amplitude_range",
);
