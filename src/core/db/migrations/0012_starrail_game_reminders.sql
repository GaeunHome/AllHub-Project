SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "starrail_accounts" ADD COLUMN "game_reminders" boolean DEFAULT true NOT NULL;