CREATE TABLE "youtube_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"title" text NOT NULL,
	"thumbnail" text,
	"lease_expires_at" timestamp with time zone,
	"subscription_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youtube_channels_channel_id_unique" UNIQUE("channel_id")
);
--> statement-breakpoint
CREATE TABLE "youtube_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'anthropic' NOT NULL,
	"anthropic_key" text,
	"anthropic_key_hint" text,
	"anthropic_model" text,
	"openai_key" text,
	"openai_key_hint" text,
	"openai_model" text,
	"gemini_key" text,
	"gemini_key_hint" text,
	"gemini_model" text,
	"glossary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "youtube_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" text NOT NULL,
	"title" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"source_kind" text NOT NULL,
	"source_cues" jsonb NOT NULL,
	"translated" jsonb NOT NULL,
	"batches" jsonb NOT NULL,
	"next_batch" integer DEFAULT 0 NOT NULL,
	"provider" text,
	"model" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youtube_translations_video_id_unique" UNIQUE("video_id")
);
--> statement-breakpoint
CREATE TABLE "youtube_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"title" text NOT NULL,
	"published_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youtube_videos_video_id_unique" UNIQUE("video_id")
);
