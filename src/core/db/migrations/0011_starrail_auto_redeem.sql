SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "starrail_redeem_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"code" text NOT NULL,
	"result" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "starrail_redeem_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "starrail_accounts" ADD COLUMN "auto_redeem" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "starrail_redeem_codes" ADD CONSTRAINT "starrail_redeem_codes_account_id_starrail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."starrail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "starrail_redeem_codes_account_code" ON "starrail_redeem_codes" USING btree ("account_id","code");