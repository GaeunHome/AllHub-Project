SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "transit_routes" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "youtube_settings" DROP CONSTRAINT "youtube_settings_pkey";
--> statement-breakpoint
ALTER TABLE "youtube_settings" ADD PRIMARY KEY ("user_id");
--> statement-breakpoint
ALTER TABLE "youtube_settings" DROP CONSTRAINT "youtube_settings_user_id_unique";
--> statement-breakpoint
ALTER TABLE "savings_categories" DROP COLUMN "color";
--> statement-breakpoint
ALTER TABLE "savings_accounts" DROP COLUMN "due_day";
--> statement-breakpoint
ALTER TABLE "twitch_stream_events" DROP COLUMN "type";
--> statement-breakpoint
ALTER TABLE "youtube_settings" DROP COLUMN "anthropic_key";
--> statement-breakpoint
ALTER TABLE "youtube_settings" DROP COLUMN "anthropic_model";
--> statement-breakpoint
ALTER TABLE "youtube_settings" DROP COLUMN "openai_key";
--> statement-breakpoint
ALTER TABLE "youtube_settings" DROP COLUMN "openai_model";
--> statement-breakpoint
ALTER TABLE "youtube_settings" DROP COLUMN "gemini_key";
--> statement-breakpoint
ALTER TABLE "youtube_settings" DROP COLUMN "gemini_model";
--> statement-breakpoint
ALTER TABLE "youtube_translations" DROP COLUMN "batches";
--> statement-breakpoint
ALTER TABLE "youtube_translations" DROP COLUMN "next_batch";
