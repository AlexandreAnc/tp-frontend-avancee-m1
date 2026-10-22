CREATE TABLE "nfc_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"public_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'house' NOT NULL,
	"routine_id" uuid,
	"scan_count" integer DEFAULT 0 NOT NULL,
	"last_scan_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfc_tags_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "routine_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"routine_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"trigger_ref" text,
	"status" text NOT NULL,
	"steps" jsonb NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"schedule" jsonb,
	"steps" jsonb NOT NULL,
	"last_scheduled_for" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nfc_tags" ADD CONSTRAINT "nfc_tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfc_tags" ADD CONSTRAINT "nfc_tags_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_runs" ADD CONSTRAINT "routine_runs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_runs" ADD CONSTRAINT "routine_runs_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nfc_tags_user_id_idx" ON "nfc_tags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "routine_runs_routine_idx" ON "routine_runs" USING btree ("routine_id","created_at");--> statement-breakpoint
CREATE INDEX "routine_runs_user_idx" ON "routine_runs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "routines_user_id_idx" ON "routines" USING btree ("user_id");