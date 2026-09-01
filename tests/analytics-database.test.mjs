import assert from "node:assert/strict";
import test from "node:test";

process.env.NEKI_ADMIN_DATABASE_PATH = ":memory:";

test("initializes the self-hosted SQLite analytics cache", async () => {
  const { getDatabase } = await import("../db/index.ts");
  const database = await getDatabase();
  await database.prepare(`
    INSERT INTO analytics_daily_statuses (metric_date, finalized, fetched_at)
    VALUES (?, ?, ?)
  `).bind("2026-08-31", 1, "2026-09-01T00:00:00.000Z").run();
  const row = await database.prepare(`
    SELECT metric_date, finalized
    FROM analytics_daily_statuses
    WHERE metric_date = ?
  `).bind("2026-08-31").first();
  assert.deepEqual({ ...row }, { metric_date: "2026-08-31", finalized: 1 });
});
