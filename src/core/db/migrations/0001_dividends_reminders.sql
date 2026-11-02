SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "reminders_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"date" date NOT NULL,
	"notify_days_before" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_items_notify_days" CHECK ("reminders_items"."notify_days_before" in (0, 1, 3, 7, 14, 30))
);
--> statement-breakpoint
ALTER TABLE "reminders_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "savings_dividend_notices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"ex_date" date NOT NULL,
	"amount_notified" boolean DEFAULT false NOT NULL,
	"reminded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_dividend_notices_symbol" CHECK ("savings_dividend_notices"."symbol" ~ '^[0-9A-Z]{4,6}$')
);
--> statement-breakpoint
ALTER TABLE "savings_dividend_notices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "weather_settings" ADD COLUMN "warning_alert" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders_items" ADD CONSTRAINT "reminders_items_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_dividend_notices" ADD CONSTRAINT "savings_dividend_notices_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminders_items_user_date_idx" ON "reminders_items" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "reminders_items_date_idx" ON "reminders_items" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_dividend_notices_user_symbol_date_idx" ON "savings_dividend_notices" USING btree ("user_id","symbol","ex_date");