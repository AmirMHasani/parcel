CREATE TABLE `agency_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`key_hash` text NOT NULL,
	`email` text,
	`stripe_customer` text,
	`stripe_subscription` text,
	`stripe_session` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`period_start` integer,
	`period_end` integer,
	`status_checked_at` integer,
	`cancel_at_period_end` integer DEFAULT 0 NOT NULL,
	`suspended` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agency_accounts_key_hash_unique` ON `agency_accounts` (`key_hash`);--> statement-breakpoint
CREATE INDEX `agency_accounts_status` ON `agency_accounts` (`status`,`status_checked_at`);--> statement-breakpoint
CREATE TABLE `invite_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`account_id` text,
	`used_at` integer,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `usage_cycles` (
	`account_id` text NOT NULL,
	`period_start` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`account_id`, `period_start`)
);
--> statement-breakpoint
ALTER TABLE `exports` ADD `agency_id` text;--> statement-breakpoint
ALTER TABLE `exports` ADD `priority` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `exports` ADD `client_name` text;--> statement-breakpoint
CREATE INDEX `exports_agency` ON `exports` (`agency_id`,`created`);