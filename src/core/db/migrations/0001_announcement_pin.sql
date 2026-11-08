SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "core_announcements" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "youtube_settings" DROP COLUMN "id";
