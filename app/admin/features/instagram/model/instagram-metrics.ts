import dayjs, { type Dayjs } from "dayjs";

export type InstagramRangePreset = "7d" | "30d" | "90d";
export const INSTAGRAM_RANGE_OPTIONS: Array<{ label: string; value: InstagramRangePreset }> = [
  { label: "7일", value: "7d" }, { label: "30일", value: "30d" }, { label: "90일", value: "90d" },
];
export const instagramToday = () => dayjs(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
export const instagramRangeForPreset = (preset: InstagramRangePreset, end = instagramToday()): [Dayjs, Dayjs] => [
  end.subtract((preset === "7d" ? 7 : preset === "30d" ? 30 : 90) - 1, "day"), end,
];
export const INSTAGRAM_MIN_DATE = instagramToday().subtract(89, "day");

export function instagramRangeFromSearch(search: string): [Dayjs, Dayjs] {
  const params = new URLSearchParams(search);
  const start = params.get("igStart");
  const end = params.get("igEnd");
  if (start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    const first = dayjs(start);
    const last = dayjs(end);
    if (first.format("YYYY-MM-DD") === start && last.format("YYYY-MM-DD") === end &&
      !first.isBefore(instagramToday().subtract(89, "day"), "day") && !last.isAfter(instagramToday(), "day") && !first.isAfter(last, "day")) return [first, last];
  }
  return instagramRangeForPreset("30d");
}

export const formatInstagramMetric = (value: number | null | undefined) => typeof value === "number" ? value.toLocaleString("ko-KR") : "—";
