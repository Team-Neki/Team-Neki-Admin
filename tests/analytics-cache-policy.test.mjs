import assert from "node:assert/strict";
import test from "node:test";

import {
  analyticsCollectionWindows,
  isAnalyticsRangeSnapshotReusable,
  isAnalyticsStatusReusable,
  normalizeAnalyticsRange,
} from "../app/api/amplitude/metrics/analytics-cache-policy.ts";

test("reuses finalized days permanently and refreshes live days after the TTL", () => {
  const now = Date.parse("2026-09-01T12:00:00Z");
  assert.equal(isAnalyticsStatusReusable({ metricDate: "2026-08-31", finalized: true, fetchedAt: "2026-08-31T23:59:00Z" }, "2026-08-31", "2026-09-01", now, false), true);
  assert.equal(isAnalyticsStatusReusable({ metricDate: "2026-08-31", finalized: false, fetchedAt: "2026-08-31T23:59:00Z" }, "2026-08-31", "2026-09-01", now, false), false);
  assert.equal(isAnalyticsStatusReusable({ metricDate: "2026-09-01", finalized: false, fetchedAt: "2026-09-01T11:59:30Z" }, "2026-09-01", "2026-09-01", now, false), true);
  assert.equal(isAnalyticsStatusReusable({ metricDate: "2026-09-01", finalized: false, fetchedAt: "2026-09-01T11:58:00Z" }, "2026-09-01", "2026-09-01", now, false), false);
});

test("groups only missing dates into contiguous Amplitude collection windows", () => {
  assert.deepEqual(analyticsCollectionWindows(["2026-08-28", "2026-08-29", "2026-08-31", "2026-09-01"]), [
    { startDate: "2026-08-28", endDate: "2026-08-29" },
    { startDate: "2026-08-31", endDate: "2026-09-01" },
  ]);
});

test("keeps finalized historical range snapshots and caps malformed or oversized ranges", () => {
  const now = Date.parse("2026-09-01T12:00:00Z");
  assert.equal(isAnalyticsRangeSnapshotReusable({ finalized: true, fetchedAt: "2026-08-01T00:00:00Z" }, "2026-08-31", "2026-09-01", now, true), true);
  assert.deepEqual(normalizeAnalyticsRange("2026-09-01", "2026-08-01", "2026-09-01"), { startDate: "2026-08-01", endDate: "2026-09-01" });
  assert.deepEqual(normalizeAnalyticsRange("2020-01-01", "2026-09-01", "2026-09-01"), { startDate: "2023-09-03", endDate: "2026-09-01" });
});
