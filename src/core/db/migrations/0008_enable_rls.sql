SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "core_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core_notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core_rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core_users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "savings_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "savings_goals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "starrail_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "starrail_checkin_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "twitch_follows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "twitch_stream_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "twitch_streamers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "youtube_channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "youtube_follows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "youtube_saved_videos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "youtube_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "youtube_translations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "youtube_videos" ENABLE ROW LEVEL SECURITY;