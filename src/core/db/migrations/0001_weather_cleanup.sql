SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "weather_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"county" text NOT NULL,
	"rain_alert" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weather_settings_county" CHECK ("weather_settings"."county" in ('臺北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'))
);
--> statement-breakpoint
ALTER TABLE "weather_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "weather_settings" ADD CONSTRAINT "weather_settings_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- 沒有擁有者的列是多人化以前的舊程式寫的 新程式不讀 先刪掉才改得成 NOT NULL
DELETE FROM "core_notifications" WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "core_notifications" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
DELETE FROM "starrail_accounts" WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "starrail_accounts" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
DELETE FROM "youtube_settings" WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "youtube_settings" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX "core_notifications_unread_idx";--> statement-breakpoint
ALTER TABLE "savings_accounts" DROP CONSTRAINT "savings_accounts_purpose_id_savings_purposes_id_fk";--> statement-breakpoint
DROP INDEX "savings_accounts_purpose_id_idx";--> statement-breakpoint
ALTER TABLE "savings_accounts" DROP COLUMN "purpose_id";--> statement-breakpoint
DROP TABLE "savings_purposes";--> statement-breakpoint
ALTER TABLE "twitch_streamers" DROP COLUMN "notify_enabled";--> statement-breakpoint
ALTER TABLE "youtube_channels" DROP COLUMN "notify_enabled";--> statement-breakpoint
ALTER TABLE "youtube_settings" DROP COLUMN "anthropic_key_hint";--> statement-breakpoint
ALTER TABLE "youtube_settings" DROP COLUMN "openai_key_hint";--> statement-breakpoint
ALTER TABLE "youtube_settings" DROP COLUMN "gemini_key_hint";
