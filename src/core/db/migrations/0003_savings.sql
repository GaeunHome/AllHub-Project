CREATE TABLE "savings_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"month" date NOT NULL,
	"goal_id" integer,
	"goal_name" text,
	"amount" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_entries_amount_range" CHECK ("savings_entries"."amount" between 1 and 100000000),
	CONSTRAINT "savings_entries_month_first_day" CHECK (extract(day from "savings_entries"."month") = 1),
	CONSTRAINT "savings_entries_goal_name_snapshot" CHECK ("savings_entries"."goal_id" is null or "savings_entries"."goal_name" is not null)
);
--> statement-breakpoint
CREATE TABLE "savings_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"monthly_amount" integer NOT NULL,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_goals_monthly_amount_range" CHECK ("savings_goals"."monthly_amount" between 1 and 100000000)
);
--> statement-breakpoint
ALTER TABLE "savings_entries" ADD CONSTRAINT "savings_entries_goal_id_savings_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."savings_goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "savings_entries_month_idx" ON "savings_entries" USING btree ("month");--> statement-breakpoint
CREATE INDEX "savings_entries_goal_id_idx" ON "savings_entries" USING btree ("goal_id");