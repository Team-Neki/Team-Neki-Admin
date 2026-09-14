import { requestAmplitude } from "./amplitude-client";

type AmplitudeUsersResponse = {
  data?: {
    series?: number[][];
    seriesLabels?: Array<string | { segment?: string; segments?: string[] }>;
    seriesMeta?: Array<string | { segment?: string; segments?: string[] }>;
    xValues?: string[];
  };
};

export type AmplitudeUserSeries = {
  dates: string[];
  active: number[];
  total: number[];
  android: number[];
  ios: number[];
};

type LoadUsersInput = {
  start: string;
  end: string;
  metric: "active" | "new";
  interval: number;
  groupByPlatform?: boolean;
  force?: boolean;
};

const platformLabel = (value: unknown) => {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (!value || typeof value !== "object") return "";
  const label = value as { segment?: unknown; segments?: unknown };
  if (typeof label.segment === "string") return label.segment.trim().toLowerCase();
  if (Array.isArray(label.segments)) {
    return label.segments.filter((item): item is string => typeof item === "string").join(",").toLowerCase();
  }
  return "";
};

const parseUserSeries = (response: AmplitudeUsersResponse): AmplitudeUserSeries => {
  const dates = response.data?.xValues ?? [];
  const series = response.data?.series ?? [];
  const labels = response.data?.seriesLabels ?? response.data?.seriesMeta ?? [];
  const rows = series.map((values, index) => ({ label: platformLabel(labels[index]), values }));
  const total = dates.map((_, index) => rows.reduce((sum, row) => sum + Number(row.values[index] ?? 0), 0));
  const android = dates.map((_, index) => rows
    .filter((row) => row.label.includes("android"))
    .reduce((sum, row) => sum + Number(row.values[index] ?? 0), 0));
  const ios = dates.map((_, index) => rows
    .filter((row) => row.label.includes("ios"))
    .reduce((sum, row) => sum + Number(row.values[index] ?? 0), 0));
  return { dates, active: total, total, android, ios };
};

export const loadAmplitudeUsers = async (input: LoadUsersInput) => {
  const search = new URLSearchParams({
    start: input.start.replaceAll("-", ""),
    end: input.end.replaceAll("-", ""),
    m: input.metric,
    i: String(input.interval),
  });
  if (input.groupByPlatform) search.set("g", "platform");
  const response = await requestAmplitude<AmplitudeUsersResponse>({
    path: "/api/2/users",
    search,
    force: input.force,
  });
  return parseUserSeries(response);
};
