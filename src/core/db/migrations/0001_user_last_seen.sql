SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "core_users" ADD COLUMN "last_seen_at" timestamp with time zone;