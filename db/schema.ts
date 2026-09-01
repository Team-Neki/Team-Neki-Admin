import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const analyticsDailyEventMetrics = sqliteTable("analytics_daily_event_metrics", {
  metricDate: text("metric_date").notNull(),
  eventName: text("event_name").notNull(),
  total: integer("total").notNull().default(0),
  dailyUniques: integer("daily_uniques").notNull().default(0),
  fetchedAt: text("fetched_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.metricDate, table.eventName] }),
]);

export const analyticsDailyStatuses = sqliteTable("analytics_daily_statuses", {
  metricDate: text("metric_date").primaryKey(),
  finalized: integer("finalized", { mode: "boolean" }).notNull().default(false),
  fetchedAt: text("fetched_at").notNull(),
});

export const analyticsRangeSnapshots = sqliteTable("analytics_range_snapshots", {
  cacheKey: text("cache_key").primaryKey(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  granularity: text("granularity").notNull(),
  eventUniquesJson: text("event_uniques_json").notNull(),
  activeUsersJson: text("active_users_json").notNull(),
  finalized: integer("finalized", { mode: "boolean" }).notNull().default(false),
  fetchedAt: text("fetched_at").notNull(),
});
