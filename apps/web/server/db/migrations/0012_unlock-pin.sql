ALTER TABLE "user_settings" ADD COLUMN "unlock_pin_hash" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "unlock_pin_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "unlock_pin_locked_until" timestamp with time zone;