SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "youtube_saved_videos" (
	"user_id" uuid NOT NULL,
	"video_id" text NOT NULL,
	"title" text,
	"channel_title" text,
	"pinned" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youtube_saved_videos_user_id_video_id_pk" PRIMARY KEY("user_id","video_id")
);
--> statement-breakpoint
ALTER TABLE "youtube_saved_videos" ADD CONSTRAINT "youtube_saved_videos_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "youtube_saved_videos_user_updated_at_idx" ON "youtube_saved_videos" USING btree ("user_id","updated_at");