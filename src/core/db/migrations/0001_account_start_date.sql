SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD COLUMN "start_date" date;