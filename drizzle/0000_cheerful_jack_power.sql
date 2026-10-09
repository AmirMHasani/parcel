CREATE TABLE `error_events` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`code` text NOT NULL,
	`detail` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `error_events_created` ON `error_events` (`created`);--> statement-breakpoint
CREATE TABLE `export_images` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`position` integer NOT NULL,
	`object_key` text,
	`status` text NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `export_images_job` ON `export_images` (`job_id`,`position`);--> statement-breakpoint
CREATE TABLE `export_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`part` integer NOT NULL,
	`object_key` text NOT NULL,
	`bytes` integer NOT NULL,
	`images` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `export_parts_job` ON `export_parts` (`job_id`,`part`);--> statement-breakpoint
CREATE TABLE `exports` (
	`id` text PRIMARY KEY NOT NULL,
	`key_hash` text NOT NULL,
	`owner` text NOT NULL,
	`ip` text NOT NULL,
	`hash` text NOT NULL,
	`manifest` text NOT NULL,
	`state` text NOT NULL,
	`total` integer NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`pack_cursor` integer DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`max_bytes` integer NOT NULL,
	`parts` integer DEFAULT 0 NOT NULL,
	`amount` integer NOT NULL,
	`session` text,
	`payment_intent` text,
	`refund_state` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_run` integer NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lease_owner` text,
	`created` integer NOT NULL,
	`expires` integer NOT NULL,
	`last_error` text,
	`review_id` text,
	`idempotency` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exports_idempotency_unique` ON `exports` (`idempotency`);--> statement-breakpoint
CREATE INDEX `exports_due` ON `exports` (`state`,`next_run`,`lease_until`);--> statement-breakpoint
CREATE INDEX `exports_owner` ON `exports` (`owner`,`created`);--> statement-breakpoint
CREATE TABLE `usage_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `worker_health` (
	`id` text PRIMARY KEY NOT NULL,
	`seen` integer NOT NULL,
	`version` text NOT NULL
);
