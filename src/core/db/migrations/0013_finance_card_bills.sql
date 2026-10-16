SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "savings_card_bills" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" integer NOT NULL,
	"statement_date" date NOT NULL,
	"due_date" date NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_card_bills_amount" CHECK ("savings_card_bills"."amount" between 0 and 100000000)
);
--> statement-breakpoint
ALTER TABLE "savings_card_bills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD COLUMN "card_bill_id" integer;--> statement-breakpoint
ALTER TABLE "savings_card_bills" ADD CONSTRAINT "savings_card_bills_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_card_bills" ADD CONSTRAINT "savings_card_bills_account_id_savings_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "savings_card_bills_account_statement_idx" ON "savings_card_bills" USING btree ("account_id","statement_date");--> statement-breakpoint
CREATE INDEX "savings_card_bills_user_id_idx" ON "savings_card_bills" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_card_bill_id_savings_card_bills_id_fk" FOREIGN KEY ("card_bill_id") REFERENCES "public"."savings_card_bills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "savings_transactions_card_bill_id_idx" ON "savings_transactions" USING btree ("card_bill_id");