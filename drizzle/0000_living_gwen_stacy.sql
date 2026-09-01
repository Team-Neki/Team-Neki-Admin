CREATE TABLE `analytics_daily_event_metrics` (
	`metric_date` text NOT NULL,
	`event_name` text NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`daily_uniques` integer DEFAULT 0 NOT NULL,
	`fetched_at` text NOT NULL,
	PRIMARY KEY(`metric_date`, `event_name`)
);
--> statement-breakpoint
CREATE TABLE `analytics_daily_statuses` (
	`metric_date` text PRIMARY KEY NOT NULL,
	`finalized` integer DEFAULT false NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `analytics_range_snapshots` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`granularity` text NOT NULL,
	`event_uniques_json` text NOT NULL,
	`active_users_json` text NOT NULL,
	`finalized` integer DEFAULT false NOT NULL,
	`fetched_at` text NOT NULL
);
