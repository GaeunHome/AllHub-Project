SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "savings_asset_days" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"investment" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_asset_days_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "savings_asset_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "travel_expense_payers" (
	"expense_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	CONSTRAINT "travel_expense_payers_expense_id_user_id_pk" PRIMARY KEY("expense_id","user_id"),
	CONSTRAINT "travel_expense_payers_amount" CHECK ("travel_expense_payers"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "travel_expense_payers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "travel_expense_shares" ADD COLUMN "weight" integer;--> statement-breakpoint
ALTER TABLE "travel_expenses" ADD COLUMN "spent_on" date;--> statement-breakpoint
ALTER TABLE "travel_expenses" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "travel_expenses" ADD COLUMN "split" text DEFAULT 'even' NOT NULL;--> statement-breakpoint
ALTER TABLE "savings_asset_days" ADD CONSTRAINT "savings_asset_days_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_expense_payers" ADD CONSTRAINT "travel_expense_payers_expense_id_travel_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."travel_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_expense_payers" ADD CONSTRAINT "travel_expense_payers_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "travel_expense_payers_user_id_idx" ON "travel_expense_payers" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "travel_expense_shares" ADD CONSTRAINT "travel_expense_shares_weight" CHECK ("travel_expense_shares"."weight" is null or "travel_expense_shares"."weight" > 0);--> statement-breakpoint
ALTER TABLE "travel_expenses" ADD CONSTRAINT "travel_expenses_category" CHECK ("travel_expenses"."category" is null or "travel_expenses"."category" in ('food', 'transport', 'lodging', 'tickets', 'shopping', 'fun', 'souvenirs', 'other'));--> statement-breakpoint
ALTER TABLE "travel_expenses" ADD CONSTRAINT "travel_expenses_split" CHECK ("travel_expenses"."split" in ('even', 'amount', 'ratio'));