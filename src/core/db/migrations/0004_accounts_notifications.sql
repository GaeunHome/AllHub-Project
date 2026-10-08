CREATE TABLE "core_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_users_username_unique" UNIQUE("username"),
	CONSTRAINT "core_users_username_format" CHECK ("core_users"."username" ~ '^[a-z0-9_.-]{3,32}$')
);
--> statement-breakpoint
ALTER TABLE "twitch_streamers" ADD COLUMN "notify_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "youtube_channels" ADD COLUMN "notify_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "youtube_videos" ADD COLUMN "zh_captions" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "youtube_videos" ADD COLUMN "zh_captions_checked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "core_notifications_created_at_idx" ON "core_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "core_notifications_unread_idx" ON "core_notifications" USING btree ("module") WHERE "core_notifications"."read_at" is null;