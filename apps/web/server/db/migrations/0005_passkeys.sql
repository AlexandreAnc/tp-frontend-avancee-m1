CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp with time zone,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "step_ups" (
	"session_id" text PRIMARY KEY NOT NULL,
	"verified_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "lock_after_minutes" integer;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "biometric_for_sensitive" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_ups" ADD CONSTRAINT "step_ups_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "passkey_user_id_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_credential_id_idx" ON "passkey" USING btree ("credential_id");