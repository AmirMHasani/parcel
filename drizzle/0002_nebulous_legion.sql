CREATE TABLE `email_outbox` (
	`job_id` text PRIMARY KEY NOT NULL,
	`payload` text,
	`message` text,
	`state` text NOT NULL,
	`provider_id` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_run` integer NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lease_owner` text
);
--> statement-breakpoint
ALTER TABLE `exports` ADD `ready_at` integer;--> statement-breakpoint
ALTER TABLE `exports` ADD `payment_provider` text DEFAULT 'stripe' NOT NULL;