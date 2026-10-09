ALTER TABLE `exports` ADD `checkout_payload` text;--> statement-breakpoint
ALTER TABLE `exports` ADD `checkout_started` integer;--> statement-breakpoint
ALTER TABLE `exports` ADD `checkout_review` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `exports` ADD `review_resolved_at` integer;--> statement-breakpoint
ALTER TABLE `exports` ADD `email_reviewed_at` integer;