SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "savings_holdings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"shares" integer NOT NULL,
	"cost" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_holdings_symbol" CHECK ("savings_holdings"."symbol" ~ '^[0-9A-Z]{4,6}$'),
	CONSTRAINT "savings_holdings_shares" CHECK ("savings_holdings"."shares" between 0 and 1000000000),
	CONSTRAINT "savings_holdings_cost" CHECK ("savings_holdings"."cost" between 0 and 100000000)
);
--> statement-breakpoint
ALTER TABLE "savings_holdings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "savings_entries";--> statement-breakpoint
DROP TABLE "savings_goals";--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD COLUMN "statement_day" smallint;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD COLUMN "autopay" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD COLUMN "card_notified_on" date;--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD COLUMN "interval_months" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD COLUMN "start_month" date;--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD COLUMN "holiday_rule" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD COLUMN "mode" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD COLUMN "holding_id" integer;--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD COLUMN "allocate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD COLUMN "last_notified_on" date;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD COLUMN "holding_id" integer;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD COLUMN "shares" integer;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD COLUMN "cost_change" integer;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD COLUMN "recurring_period" date;--> statement-breakpoint
ALTER TABLE "savings_holdings" ADD CONSTRAINT "savings_holdings_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_holdings" ADD CONSTRAINT "savings_holdings_account_id_savings_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "savings_holdings_account_symbol_idx" ON "savings_holdings" USING btree ("account_id","symbol");--> statement-breakpoint
CREATE INDEX "savings_holdings_user_id_idx" ON "savings_holdings" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD CONSTRAINT "savings_recurring_holding_id_savings_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."savings_holdings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_holding_id_savings_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."savings_holdings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "savings_recurring_holding_id_idx" ON "savings_recurring" USING btree ("holding_id");--> statement-breakpoint
CREATE INDEX "savings_transactions_holding_id_idx" ON "savings_transactions" USING btree ("holding_id");--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD CONSTRAINT "savings_accounts_statement_day" CHECK ("savings_accounts"."statement_day" is null or ("savings_accounts"."kind" = 'credit' and "savings_accounts"."statement_day" between 1 and 31));--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD CONSTRAINT "savings_accounts_autopay" CHECK (not "savings_accounts"."autopay" or "savings_accounts"."kind" = 'credit');--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD CONSTRAINT "savings_recurring_interval_months" CHECK ("savings_recurring"."interval_months" in (1, 2, 3, 6, 12));--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD CONSTRAINT "savings_recurring_start_month_first_day" CHECK ("savings_recurring"."start_month" is null or extract(day from "savings_recurring"."start_month") = 1);--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD CONSTRAINT "savings_recurring_holiday_rule" CHECK ("savings_recurring"."holiday_rule" in ('none', 'before', 'after'));--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD CONSTRAINT "savings_recurring_mode" CHECK ("savings_recurring"."mode" in ('confirm', 'auto'));--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD CONSTRAINT "savings_recurring_holding" CHECK ("savings_recurring"."holding_id" is null or ("savings_recurring"."kind" = 'transfer' and "savings_recurring"."mode" = 'confirm'));--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD CONSTRAINT "savings_recurring_allocate" CHECK (not "savings_recurring"."allocate" or ("savings_recurring"."kind" = 'income' and "savings_recurring"."mode" = 'confirm'));--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_shares" CHECK ("savings_transactions"."shares" is null or ("savings_transactions"."kind" = 'transfer' and "savings_transactions"."shares" <> 0));--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_cost_change" CHECK ("savings_transactions"."cost_change" is null or "savings_transactions"."cost_change" between -100000000 and 100000000);--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_recurring_period_first_day" CHECK ("savings_transactions"."recurring_period" is null or extract(day from "savings_transactions"."recurring_period") = 1);