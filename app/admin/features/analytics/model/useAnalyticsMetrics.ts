"use client";

import dayjs from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { adminAdapter } from "../../../admin-adapter";
import type { AnalyticsGranularity, AnalyticsRefreshResult } from "../../../types";
import {
  ANALYTICS_REFRESH_COOLDOWN_MS,
  createDefaultAnalyticsRange,
  type AnalyticsDateRange,
} from "./analytics";

type RefreshOptions = {
  force?: boolean;
  respectCooldown?: boolean;
};

export function useAnalyticsMetrics(active: boolean) {
  const [metrics, setMetrics] = useState<AnalyticsRefreshResult>();
  const [granularity, setGranularity] = useState<AnalyticsGranularity>("day");
  const [range, setRange] = useState<AnalyticsDateRange>(createDefaultAnalyticsRange);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string>();
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const requestSequence = useRef(0);
  const requestedKey = useRef("");
  const cooldownRef = useRef(0);

  useEffect(() => {
    const updateCooldown = () => {
      const remaining = Math.max(0, cooldownUntil - Date.now());
      setCooldownRemaining(Math.ceil(remaining / 1000));
    };
    updateCooldown();
    if (!cooldownUntil) return;
    const timer = window.setInterval(updateCooldown, 500);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const refreshMetrics = useCallback(async (
    requestedGranularity: AnalyticsGranularity,
    requestedRange: AnalyticsDateRange,
    options: RefreshOptions = {},
  ) => {
    const now = Date.now();
    if (options.respectCooldown && cooldownRef.current > now) return;
    const request = ++requestSequence.current;
    setRefreshing(true);
    setRefreshError(undefined);
    try {
      const result = await adminAdapter.refreshAnalytics({
        granularity: requestedGranularity,
        startDate: requestedRange[0].format("YYYY-MM-DD"),
        endDate: requestedRange[1].format("YYYY-MM-DD"),
        refresh: options.force,
      });
      if (request === requestSequence.current) setMetrics(result);
    } catch (error) {
      if (request === requestSequence.current) {
        setRefreshError(error instanceof Error ? error.message : "Amplitude 지표를 불러오지 못했습니다.");
      }
    } finally {
      if (request === requestSequence.current) {
        setRefreshing(false);
        const nextCooldown = Date.now() + ANALYTICS_REFRESH_COOLDOWN_MS;
        cooldownRef.current = nextCooldown;
        setCooldownUntil(nextCooldown);
      }
    }
  }, []);

  const startDate = range[0].format("YYYY-MM-DD");
  const endDate = range[1].format("YYYY-MM-DD");
  const queryKey = `${granularity}:${startDate}:${endDate}`;
  const metricsMatch = metrics?.granularity === granularity
    && metrics.periodStart === startDate
    && metrics.periodEnd === endDate;

  useEffect(() => {
    if (!active || requestedKey.current === queryKey) return;
    requestedKey.current = queryKey;
    void refreshMetrics(granularity, range);
  }, [active, granularity, queryKey, range, refreshMetrics]);

  useEffect(() => {
    if (!active) return;
    let timer = 0;
    const scheduleFinalization = () => {
      const now = dayjs();
      const delay = Math.max(1_000, now.add(1, "day").startOf("day").diff(now) + 1_000);
      timer = window.setTimeout(() => {
        const yesterday = dayjs().subtract(1, "day").startOf("day");
        void adminAdapter.refreshAnalytics({
          granularity: "day",
          startDate: yesterday.format("YYYY-MM-DD"),
          endDate: yesterday.format("YYYY-MM-DD"),
          refresh: true,
        }).catch(() => undefined);
        scheduleFinalization();
      }, delay);
    };
    scheduleFinalization();
    return () => window.clearTimeout(timer);
  }, [active]);

  const refresh = useCallback(() => {
    void refreshMetrics(granularity, range, { force: true, respectCooldown: true });
  }, [granularity, range, refreshMetrics]);

  return {
    metrics: metricsMatch ? metrics : undefined,
    granularity,
    setGranularity,
    range,
    setRange,
    refreshing,
    cooldownRemaining,
    refreshError,
    refresh,
  };
}
