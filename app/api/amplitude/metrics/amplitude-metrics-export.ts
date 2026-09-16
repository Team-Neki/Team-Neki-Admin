import "server-only";

import { mockAnalyticsEvents } from "../../../admin/mock-analytics-events";
import type { AnalyticsRefreshResult } from "../../../admin/types";

export type AnalyticsExportFormat = "csv" | "json";

type AnalyticsExportInput = {
  format: AnalyticsExportFormat;
  metrics: AnalyticsRefreshResult;
  eventNames?: string[];
};

const definitionByName = new Map(mockAnalyticsEvents.map((event) => [event.name, event]));

const selectEvents = (metrics: AnalyticsRefreshResult, eventNames?: string[]) => {
  if (!eventNames) return metrics.events;
  const selected = new Set(eventNames);
  return metrics.events.filter((event) => selected.has(event.name));
};

const csvCell = (value: string | number) => `"\t${String(value).replaceAll('"', '""')}"`;
const csvRow = (values: Array<string | number>) => values.map(csvCell).join(",");

const createCsv = (metrics: AnalyticsRefreshResult, eventNames?: string[]) => {
  const events = selectEvents(metrics, eventNames);
  const rows = [
    csvRow(["NEKI Amplitude Metrics"]),
    csvRow([`${metrics.periodStart} - ${metrics.periodEnd}`]),
    csvRow([metrics.granularity]),
    "",
    csvRow(["Event Metrics"]),
    csvRow(["Custom Events"]),
    "",
    csvRow(["Event", "Feature Area", "Page / Feature", "Occurrences", "Unique Users"]),
    ...events.map((metric) => {
      const definition = definitionByName.get(metric.name);
      return csvRow([
        metric.name,
        definition?.area ?? "",
        definition?.screen ?? "",
        metric.total,
        metric.uniques ?? 0,
      ]);
    }),
    "",
    csvRow(["Active Users"]),
    csvRow(["[Amplitude] Any Active Event"]),
    "",
    csvRow(["Segment", ...metrics.activeUsers.map((point) => point.date)]),
    csvRow(["All Users", ...metrics.activeUsers.map((point) => point.value)]),
  ];
  return `\uFEFF${rows.join("\r\n")}\r\n`;
};

const createJson = (metrics: AnalyticsRefreshResult, eventNames?: string[]) => ({
  source: metrics.source,
  granularity: metrics.granularity,
  periodStart: metrics.periodStart,
  periodEnd: metrics.periodEnd,
  fetchedAt: metrics.fetchedAt,
  events: selectEvents(metrics, eventNames).map((metric) => {
    const definition = definitionByName.get(metric.name);
    return {
      name: metric.name,
      featureArea: definition?.area ?? null,
      pageOrFeature: definition?.screen ?? null,
      occurrences: metric.total,
      uniqueUsers: metric.uniques ?? 0,
    };
  }),
  activeUsers: metrics.activeUsers,
});

export const createAmplitudeMetricsExport = ({ format, metrics, eventNames }: AnalyticsExportInput) => {
  const extension = format === "csv" ? "csv" : "json";
  const filename = `neki-amplitude-metrics-${metrics.periodStart}-${metrics.periodEnd}.${extension}`;
  if (format === "csv") {
    return {
      body: createCsv(metrics, eventNames),
      contentType: "text/csv; charset=utf-8",
      filename,
    };
  }
  return {
    body: JSON.stringify(createJson(metrics, eventNames), null, 2),
    contentType: "application/json; charset=utf-8",
    filename,
  };
};
