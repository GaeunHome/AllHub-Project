SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "core_announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_announcements_kind" CHECK ("core_announcements"."kind" in ('outage', 'maintenance', 'general')),
	CONSTRAINT "core_announcements_period" CHECK ("core_announcements"."starts_at" is null or "core_announcements"."ends_at" is null or "core_announcements"."ends_at" > "core_announcements"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "core_announcements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE "core_push_mutes" (
	"endpoint" text NOT NULL,
	"module_id" text NOT NULL,
	CONSTRAINT "core_push_mutes_endpoint_module_id_pk" PRIMARY KEY("endpoint","module_id")
);
--> statement-breakpoint
ALTER TABLE "core_push_mutes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE "core_push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core_push_subscriptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE "travel_expense_shares" (
	"expense_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "travel_expense_shares_expense_id_user_id_pk" PRIMARY KEY("expense_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "travel_expense_shares" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE "travel_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"paid_by" uuid NOT NULL,
	"title" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"rate_micros" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "travel_expenses_amount" CHECK ("travel_expenses"."amount_cents" > 0),
	CONSTRAINT "travel_expenses_rate" CHECK ("travel_expenses"."rate_micros" > 0),
	CONSTRAINT "travel_expenses_currency" CHECK ("travel_expenses"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "travel_expenses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE "travel_settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"from_user" uuid NOT NULL,
	"to_user" uuid NOT NULL,
	"amount_twd" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "travel_settlements_amount" CHECK ("travel_settlements"."amount_twd" > 0),
	CONSTRAINT "travel_settlements_people" CHECK ("travel_settlements"."from_user" <> "travel_settlements"."to_user")
);
--> statement-breakpoint
ALTER TABLE "travel_settlements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE "youtube_ai_keys" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"api_key" text,
	"model" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youtube_ai_keys_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "youtube_ai_keys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "reminders_items" ADD COLUMN "repeat" text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD COLUMN "subscription" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "core_push_mutes" ADD CONSTRAINT "core_push_mutes_endpoint_core_push_subscriptions_endpoint_fk" FOREIGN KEY ("endpoint") REFERENCES "public"."core_push_subscriptions"("endpoint") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core_push_subscriptions" ADD CONSTRAINT "core_push_subscriptions_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "travel_expense_shares" ADD CONSTRAINT "travel_expense_shares_expense_id_travel_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."travel_expenses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "travel_expense_shares" ADD CONSTRAINT "travel_expense_shares_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "travel_expenses" ADD CONSTRAINT "travel_expenses_trip_id_travel_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."travel_trips"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "travel_expenses" ADD CONSTRAINT "travel_expenses_paid_by_core_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "travel_settlements" ADD CONSTRAINT "travel_settlements_trip_id_travel_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."travel_trips"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "travel_settlements" ADD CONSTRAINT "travel_settlements_from_user_core_users_id_fk" FOREIGN KEY ("from_user") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "travel_settlements" ADD CONSTRAINT "travel_settlements_to_user_core_users_id_fk" FOREIGN KEY ("to_user") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "youtube_ai_keys" ADD CONSTRAINT "youtube_ai_keys_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "core_push_subscriptions_user_id_idx" ON "core_push_subscriptions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "travel_expense_shares_user_id_idx" ON "travel_expense_shares" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "travel_expenses_trip_id_idx" ON "travel_expenses" USING btree ("trip_id");
--> statement-breakpoint
CREATE INDEX "travel_expenses_paid_by_idx" ON "travel_expenses" USING btree ("paid_by");
--> statement-breakpoint
CREATE INDEX "travel_settlements_trip_id_idx" ON "travel_settlements" USING btree ("trip_id");
--> statement-breakpoint
CREATE INDEX "travel_settlements_from_user_idx" ON "travel_settlements" USING btree ("from_user");
--> statement-breakpoint
CREATE INDEX "travel_settlements_to_user_idx" ON "travel_settlements" USING btree ("to_user");
--> statement-breakpoint
CREATE INDEX "starrail_checkin_logs_account_created_at_idx" ON "starrail_checkin_logs" USING btree ("account_id","created_at");
--> statement-breakpoint
CREATE INDEX "starrail_checkin_logs_created_at_idx" ON "starrail_checkin_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "twitch_stream_events_broadcaster_id_idx" ON "twitch_stream_events" USING btree ("broadcaster_id");
--> statement-breakpoint
CREATE INDEX "twitch_stream_events_received_at_idx" ON "twitch_stream_events" USING btree ("received_at");
--> statement-breakpoint
CREATE INDEX "youtube_translations_requested_by_idx" ON "youtube_translations" USING btree ("requested_by");
--> statement-breakpoint
CREATE INDEX "youtube_videos_channel_id_idx" ON "youtube_videos" USING btree ("channel_id");
--> statement-breakpoint
ALTER TABLE "reminders_items" ADD CONSTRAINT "reminders_items_repeat" CHECK ("reminders_items"."repeat" in ('none', 'monthly', 'yearly'));
--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD CONSTRAINT "savings_recurring_subscription" CHECK (not "savings_recurring"."subscription" or "savings_recurring"."kind" = 'expense');
--> statement-breakpoint
ALTER TABLE "savings_categories" ALTER COLUMN "color" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "twitch_stream_events" ALTER COLUMN "type" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "youtube_translations" ALTER COLUMN "batches" DROP NOT NULL;
--> statement-breakpoint
DELETE FROM "twitch_stream_events" WHERE "type" = 'offline';
--> statement-breakpoint
INSERT INTO "youtube_ai_keys" ("user_id", "provider", "api_key", "model", "updated_at")
SELECT "user_id", "picked"."provider", "picked"."api_key", "picked"."model", "updated_at"
FROM "youtube_settings"
CROSS JOIN LATERAL (VALUES
	('anthropic', "anthropic_key", "anthropic_model"),
	('openai', "openai_key", "openai_model"),
	('gemini', "gemini_key", "gemini_model")
) AS "picked" ("provider", "api_key", "model")
WHERE "picked"."api_key" IS NOT NULL OR "picked"."model" IS NOT NULL
ON CONFLICT DO NOTHING;
