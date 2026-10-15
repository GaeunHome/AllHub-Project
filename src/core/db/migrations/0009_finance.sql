SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "savings_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"purpose_id" integer,
	"opening_balance" integer DEFAULT 0 NOT NULL,
	"opening_cost" integer,
	"monthly_plan" integer,
	"target_amount" integer,
	"due_day" smallint,
	"pay_from_account_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_accounts_kind" CHECK ("savings_accounts"."kind" in ('deposit', 'investment', 'credit')),
	CONSTRAINT "savings_accounts_opening_balance" CHECK ("savings_accounts"."opening_balance" between -100000000 and 100000000),
	CONSTRAINT "savings_accounts_opening_cost" CHECK ("savings_accounts"."opening_cost" is null or ("savings_accounts"."kind" = 'investment' and "savings_accounts"."opening_cost" between 0 and 100000000)),
	CONSTRAINT "savings_accounts_monthly_plan" CHECK ("savings_accounts"."monthly_plan" is null or ("savings_accounts"."kind" <> 'credit' and "savings_accounts"."monthly_plan" between 1 and 100000000)),
	CONSTRAINT "savings_accounts_target_amount" CHECK ("savings_accounts"."target_amount" is null or ("savings_accounts"."kind" <> 'credit' and "savings_accounts"."target_amount" between 1 and 100000000)),
	CONSTRAINT "savings_accounts_due_day" CHECK ("savings_accounts"."due_day" is null or ("savings_accounts"."kind" = 'credit' and "savings_accounts"."due_day" between 1 and 31)),
	CONSTRAINT "savings_accounts_pay_from" CHECK ("savings_accounts"."pay_from_account_id" is null or ("savings_accounts"."kind" = 'credit' and "savings_accounts"."pay_from_account_id" <> "savings_accounts"."id"))
);
--> statement-breakpoint
ALTER TABLE "savings_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "savings_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"monthly_budget" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_categories_kind" CHECK ("savings_categories"."kind" in ('expense', 'income')),
	CONSTRAINT "savings_categories_color" CHECK ("savings_categories"."color" in ('blue', 'teal', 'green', 'amber', 'orange', 'rose', 'violet', 'slate')),
	CONSTRAINT "savings_categories_budget" CHECK ("savings_categories"."monthly_budget" is null or ("savings_categories"."kind" = 'expense' and "savings_categories"."monthly_budget" between 1 and 100000000))
);
--> statement-breakpoint
ALTER TABLE "savings_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "savings_purposes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_purposes_color" CHECK ("savings_purposes"."color" in ('blue', 'teal', 'green', 'amber', 'orange', 'rose', 'violet', 'slate'))
);
--> statement-breakpoint
ALTER TABLE "savings_purposes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "savings_recurring" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"account_id" integer NOT NULL,
	"counter_account_id" integer,
	"category_id" integer,
	"amount" integer NOT NULL,
	"day_of_month" smallint NOT NULL,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_posted_month" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_recurring_kind" CHECK ("savings_recurring"."kind" in ('expense', 'income', 'transfer')),
	CONSTRAINT "savings_recurring_amount" CHECK ("savings_recurring"."amount" between 1 and 100000000),
	CONSTRAINT "savings_recurring_day_of_month" CHECK ("savings_recurring"."day_of_month" between 1 and 31),
	CONSTRAINT "savings_recurring_counter" CHECK (("savings_recurring"."kind" = 'transfer') = ("savings_recurring"."counter_account_id" is not null) and ("savings_recurring"."counter_account_id" is null or "savings_recurring"."counter_account_id" <> "savings_recurring"."account_id")),
	CONSTRAINT "savings_recurring_category" CHECK ("savings_recurring"."category_id" is null or "savings_recurring"."kind" <> 'transfer'),
	CONSTRAINT "savings_recurring_last_posted_first_day" CHECK ("savings_recurring"."last_posted_month" is null or extract(day from "savings_recurring"."last_posted_month") = 1)
);
--> statement-breakpoint
ALTER TABLE "savings_recurring" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "savings_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"account_id" integer NOT NULL,
	"counter_account_id" integer,
	"category_id" integer,
	"amount" integer NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"recurring_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_transactions_kind" CHECK ("savings_transactions"."kind" in ('expense', 'income', 'transfer', 'adjust')),
	CONSTRAINT "savings_transactions_amount" CHECK (case when "savings_transactions"."kind" = 'adjust' then "savings_transactions"."amount" <> 0 and "savings_transactions"."amount" between -100000000 and 100000000 else "savings_transactions"."amount" between 1 and 100000000 end),
	CONSTRAINT "savings_transactions_counter" CHECK (("savings_transactions"."kind" = 'transfer') = ("savings_transactions"."counter_account_id" is not null) and ("savings_transactions"."counter_account_id" is null or "savings_transactions"."counter_account_id" <> "savings_transactions"."account_id")),
	CONSTRAINT "savings_transactions_category" CHECK ("savings_transactions"."category_id" is null or "savings_transactions"."kind" in ('income', 'expense')),
	CONSTRAINT "savings_transactions_date" CHECK ("savings_transactions"."date" >= '2000-01-01')
);
--> statement-breakpoint
ALTER TABLE "savings_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD CONSTRAINT "savings_accounts_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD CONSTRAINT "savings_accounts_purpose_id_savings_purposes_id_fk" FOREIGN KEY ("purpose_id") REFERENCES "public"."savings_purposes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD CONSTRAINT "savings_accounts_pay_from_account_id_savings_accounts_id_fk" FOREIGN KEY ("pay_from_account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_categories" ADD CONSTRAINT "savings_categories_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_purposes" ADD CONSTRAINT "savings_purposes_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD CONSTRAINT "savings_recurring_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD CONSTRAINT "savings_recurring_account_id_savings_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD CONSTRAINT "savings_recurring_counter_account_id_savings_accounts_id_fk" FOREIGN KEY ("counter_account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD CONSTRAINT "savings_recurring_category_id_savings_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."savings_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_account_id_savings_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_counter_account_id_savings_accounts_id_fk" FOREIGN KEY ("counter_account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_category_id_savings_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."savings_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_recurring_id_savings_recurring_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."savings_recurring"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "savings_accounts_user_name_idx" ON "savings_accounts" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "savings_accounts_purpose_id_idx" ON "savings_accounts" USING btree ("purpose_id");--> statement-breakpoint
CREATE INDEX "savings_accounts_pay_from_account_id_idx" ON "savings_accounts" USING btree ("pay_from_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_categories_user_kind_name_idx" ON "savings_categories" USING btree ("user_id","kind","name");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_purposes_user_name_idx" ON "savings_purposes" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "savings_recurring_user_id_idx" ON "savings_recurring" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "savings_recurring_account_id_idx" ON "savings_recurring" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "savings_recurring_counter_account_id_idx" ON "savings_recurring" USING btree ("counter_account_id");--> statement-breakpoint
CREATE INDEX "savings_recurring_category_id_idx" ON "savings_recurring" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "savings_transactions_user_id_date_idx" ON "savings_transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "savings_transactions_account_id_idx" ON "savings_transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "savings_transactions_counter_account_id_idx" ON "savings_transactions" USING btree ("counter_account_id");--> statement-breakpoint
CREATE INDEX "savings_transactions_category_id_idx" ON "savings_transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "savings_transactions_recurring_id_idx" ON "savings_transactions" USING btree ("recurring_id");