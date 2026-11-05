SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "weather_places" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DROP TABLE "starrail_warps" CASCADE;--> statement-breakpoint
DELETE FROM "core_cron_status" WHERE "task" = 'starrail:warps';