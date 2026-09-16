"use client";

import { useCallback, useState } from "react";
import type { AnalyticsGranularity } from "../../../types";

export type AnalyticsExportFormat = "csv" | "json";

type AnalyticsExportQuery = {
  granularity: AnalyticsGranularity;
  startDate: string;
  endDate: string;
  eventNames: string[];
};

type AnalyticsExportError = {
  message?: string;
};

const filenameFromDisposition = (value: string | null, format: AnalyticsExportFormat) => {
  const match = value?.match(/filename="([^"]+)"/i);
  return match?.[1] ?? `neki-amplitude-metrics.${format}`;
};

export function useAnalyticsExport() {
  const [exporting, setExporting] = useState<AnalyticsExportFormat>();
  const [exportError, setExportError] = useState<string>();

  const download = useCallback(async (format: AnalyticsExportFormat, query: AnalyticsExportQuery) => {
    setExporting(format);
    setExportError(undefined);
    try {
      const params = new URLSearchParams({
        format,
        granularity: query.granularity,
        startDate: query.startDate,
        endDate: query.endDate,
        events: JSON.stringify(query.eventNames),
      });
      const response = await fetch(`/api/amplitude/metrics/export?${params.toString()}`, {
        headers: { Accept: format === "csv" ? "text/csv" : "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as AnalyticsExportError;
        throw new Error(payload.message || "Amplitude 지표 파일을 만들지 못했습니다.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filenameFromDisposition(response.headers.get("content-disposition"), format);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Amplitude 지표 파일을 만들지 못했습니다.");
    } finally {
      setExporting(undefined);
    }
  }, []);

  return { download, exporting, exportError };
}
