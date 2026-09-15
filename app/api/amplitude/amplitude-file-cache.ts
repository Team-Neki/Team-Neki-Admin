import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

import type { AnalyticsEventMetric, AnalyticsRefreshResult, DashboardMetrics } from "../../admin/types";

const CACHE_SCHEMA_VERSION = 1;
const MAX_CACHE_FILE_BYTES = 8 * 1_024 * 1_024;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PROJECT_CACHE_KEY_PATTERN = /^[a-f0-9]{16}$/;
const DEFAULT_CACHE_ROOT = process.env.NODE_ENV === "production"
  ? "/app/.data/amplitude"
  : "/tmp/neki-admin-amplitude";

type RangeCacheNamespace = "dashboard-ranges" | "metrics-ranges";

type RangeCacheEnvelope<T> = {
  schemaVersion: 1;
  cacheKeyHash: string;
  expiresAt: number | null;
  finalized: boolean;
  storedAt: string;
  value: T;
};

export type DailyAnalyticsSnapshot = {
  schemaVersion: 1;
  source: "amplitude";
  projectCacheKey: string;
  date: string;
  finalized: boolean;
  expiresAt: number | null;
  fetchedAt: string;
  events: AnalyticsEventMetric[];
  activeUsers: number;
};

const cacheRoot = () => {
  const configured = process.env.AMPLITUDE_CACHE_DIR?.trim() ?? "";
  return configured && isAbsolute(configured) ? configured : DEFAULT_CACHE_ROOT;
};

const cacheKeyHash = (key: string) => createHash("sha256").update(key).digest("hex");

const readJson = async (path: string): Promise<unknown | null> => {
  try {
    const info = await stat(/* turbopackIgnore: true */ path);
    if (!info.isFile() || info.size > MAX_CACHE_FILE_BYTES) return null;
    return JSON.parse(await readFile(/* turbopackIgnore: true */ path, "utf8")) as unknown;
  } catch {
    return null;
  }
};

const atomicWriteJson = async (path: string, value: unknown) => {
  const directory = dirname(path);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(/* turbopackIgnore: true */ temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(/* turbopackIgnore: true */ temporary, path);
    return true;
  } catch {
    await unlink(temporary).catch(() => undefined);
    return false;
  }
};

const isEventMetric = (value: unknown): value is AnalyticsEventMetric => {
  if (!value || typeof value !== "object") return false;
  const metric = value as Partial<AnalyticsEventMetric>;
  return typeof metric.name === "string"
    && typeof metric.total === "number"
    && (metric.uniques === undefined || typeof metric.uniques === "number");
};

export const isAnalyticsRefreshResult = (value: unknown): value is AnalyticsRefreshResult => {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<AnalyticsRefreshResult>;
  return result.source === "amplitude"
    && (result.granularity === "day" || result.granularity === "week" || result.granularity === "month")
    && typeof result.fetchedAt === "string"
    && typeof result.periodStart === "string"
    && typeof result.periodEnd === "string"
    && Array.isArray(result.events)
    && result.events.every(isEventMetric)
    && Array.isArray(result.activeUsers)
    && result.activeUsers.every((point) => point
      && typeof point === "object"
      && typeof point.date === "string"
      && typeof point.value === "number");
};

export const isDashboardMetrics = (value: unknown): value is DashboardMetrics => {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<DashboardMetrics>;
  const isNullableNumber = (candidate: unknown) => candidate === null || typeof candidate === "number";
  const isMetricValue = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return false;
    const metric = candidate as { value?: unknown; startDate?: unknown; endDate?: unknown };
    return typeof metric.value === "number"
      && typeof metric.startDate === "string"
      && typeof metric.endDate === "string";
  };
  const isTrendPoint = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return false;
    const point = candidate as {
      date?: unknown;
      label?: unknown;
      activeUsers?: unknown;
      totalUsers?: unknown;
      androidUsers?: unknown;
      iosUsers?: unknown;
    };
    return typeof point.date === "string"
      && typeof point.label === "string"
      && typeof point.activeUsers === "number"
      && isNullableNumber(point.totalUsers)
      && isNullableNumber(point.androidUsers)
      && isNullableNumber(point.iosUsers);
  };
  const activeUsers = result.activeUsers as Record<string, unknown> | undefined;
  const metricTrends = result.metricTrends as Record<string, unknown> | undefined;
  return typeof result.hasData === "boolean"
    && typeof result.asOfDate === "string"
    && typeof result.updatedAt === "string"
    && isMetricValue(activeUsers?.dau)
    && isMetricValue(activeUsers?.wau)
    && isMetricValue(activeUsers?.mau)
    && isNullableNumber(result.totalUsers)
    && isNullableNumber(result.androidUsers)
    && isNullableNumber(result.iosUsers)
    && Array.isArray(result.trend)
    && result.trend.every(isTrendPoint)
    && Array.isArray(metricTrends?.dau)
    && metricTrends.dau.every(isTrendPoint)
    && Array.isArray(metricTrends?.wau)
    && metricTrends.wau.every(isTrendPoint)
    && Array.isArray(metricTrends?.mau)
    && metricTrends.mau.every(isTrendPoint);
};

export const readAmplitudeRangeCache = async <T>(
  namespace: RangeCacheNamespace,
  key: string,
  validate: (value: unknown) => value is T,
  force: boolean,
) => {
  const hash = cacheKeyHash(key);
  const path = join(cacheRoot(), namespace, `${hash}.json`);
  const parsed = await readJson(path);
  if (!parsed || typeof parsed !== "object") return null;
  const envelope = parsed as Partial<RangeCacheEnvelope<unknown>>;
  if (envelope.schemaVersion !== CACHE_SCHEMA_VERSION
    || envelope.cacheKeyHash !== hash
    || typeof envelope.finalized !== "boolean"
    || (envelope.expiresAt !== null && typeof envelope.expiresAt !== "number")
    || !validate(envelope.value)) return null;
  if (!envelope.finalized && (force || !envelope.expiresAt || envelope.expiresAt <= Date.now())) return null;
  return envelope.value;
};

export const writeAmplitudeRangeCache = async <T>(
  namespace: RangeCacheNamespace,
  key: string,
  value: T,
  finalized: boolean,
  ttlMs: number,
) => {
  const hash = cacheKeyHash(key);
  const envelope: RangeCacheEnvelope<T> = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    cacheKeyHash: hash,
    finalized,
    expiresAt: finalized ? null : Date.now() + ttlMs,
    storedAt: new Date().toISOString(),
    value,
  };
  return atomicWriteJson(join(cacheRoot(), namespace, `${hash}.json`), envelope);
};

const isDailySnapshot = (value: unknown): value is DailyAnalyticsSnapshot => {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<DailyAnalyticsSnapshot>;
  return snapshot.schemaVersion === CACHE_SCHEMA_VERSION
    && snapshot.source === "amplitude"
    && typeof snapshot.projectCacheKey === "string"
    && PROJECT_CACHE_KEY_PATTERN.test(snapshot.projectCacheKey)
    && typeof snapshot.date === "string"
    && DATE_PATTERN.test(snapshot.date)
    && typeof snapshot.finalized === "boolean"
    && (snapshot.expiresAt === null || typeof snapshot.expiresAt === "number")
    && typeof snapshot.fetchedAt === "string"
    && typeof snapshot.activeUsers === "number"
    && Array.isArray(snapshot.events)
    && snapshot.events.every(isEventMetric);
};

export const readAmplitudeDailyCache = async (projectCacheKey: string, date: string, force: boolean) => {
  if (!PROJECT_CACHE_KEY_PATTERN.test(projectCacheKey) || !DATE_PATTERN.test(date)) return null;
  const snapshot = await readJson(join(cacheRoot(), "daily", projectCacheKey, `${date}.json`));
  if (!isDailySnapshot(snapshot)
    || snapshot.projectCacheKey !== projectCacheKey
    || snapshot.date !== date) return null;
  if (!snapshot.finalized && (force || !snapshot.expiresAt || snapshot.expiresAt <= Date.now())) return null;
  return snapshot;
};

export const writeAmplitudeDailyCache = async (snapshot: DailyAnalyticsSnapshot) => {
  if (!isDailySnapshot(snapshot)) return false;
  return atomicWriteJson(
    join(cacheRoot(), "daily", snapshot.projectCacheKey, `${snapshot.date}.json`),
    snapshot,
  );
};
