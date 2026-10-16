-- 之前的 migration 合併成一個 時間戳記跟正式資料庫最後一筆一樣 所以正式資料庫會略過
CREATE TABLE "core_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"note" text,
	CONSTRAINT "core_invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "core_invites_used_count_range" CHECK ("core_invites"."used_count" between 0 and "core_invites"."max_uses"),
	CONSTRAINT "core_invites_max_uses_range" CHECK ("core_invites"."max_uses" between 1 and 100),
	CONSTRAINT "core_invites_note_length" CHECK (char_length("core_invites"."note") <= 50)
);
--> statement-breakpoint
ALTER TABLE "core_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "core_notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core_rate_limits" (
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"attempts" integer NOT NULL,
	CONSTRAINT "core_rate_limits_scope_key_hash_pk" PRIMARY KEY("scope","key_hash")
);
--> statement-breakpoint
ALTER TABLE "core_rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"disabled_at" timestamp with time zone,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	CONSTRAINT "core_users_username_unique" UNIQUE("username"),
	CONSTRAINT "core_users_username_format" CHECK ("core_users"."username" ~ '^[a-z0-9_.-]{3,32}$'),
	CONSTRAINT "core_users_role_valid" CHECK ("core_users"."role" in ('owner', 'member')),
	CONSTRAINT "core_users_failed_logins_non_negative" CHECK ("core_users"."failed_logins" >= 0)
);
--> statement-breakpoint
ALTER TABLE "core_users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "savings_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"purpose_id" integer,
	"opening_balance" integer DEFAULT 0 NOT NULL,
	"opening_cost" integer,
	"monthly_plan" integer,
	"target_amount" integer,
	"due_day" smallint,
	"pay_from_account_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"statement_day" smallint,
	"autopay" boolean DEFAULT false NOT NULL,
	"card_notified_on" date,
	CONSTRAINT "savings_accounts_kind" CHECK ("savings_accounts"."kind" in ('deposit', 'investment', 'credit')),
	CONSTRAINT "savings_accounts_opening_balance" CHECK ("savings_accounts"."opening_balance" between -100000000 and 100000000),
	CONSTRAINT "savings_accounts_opening_cost" CHECK ("savings_accounts"."opening_cost" is null or ("savings_accounts"."kind" = 'investment' and "savings_accounts"."opening_cost" between 0 and 100000000)),
	CONSTRAINT "savings_accounts_monthly_plan" CHECK ("savings_accounts"."monthly_plan" is null or ("savings_accounts"."kind" <> 'credit' and "savings_accounts"."monthly_plan" between 1 and 100000000)),
	CONSTRAINT "savings_accounts_target_amount" CHECK ("savings_accounts"."target_amount" is null or ("savings_accounts"."kind" <> 'credit' and "savings_accounts"."target_amount" between 1 and 100000000)),
	CONSTRAINT "savings_accounts_due_day" CHECK ("savings_accounts"."due_day" is null or ("savings_accounts"."kind" = 'credit' and "savings_accounts"."due_day" between 1 and 31)),
	CONSTRAINT "savings_accounts_pay_from" CHECK ("savings_accounts"."pay_from_account_id" is null or ("savings_accounts"."kind" = 'credit' and "savings_accounts"."pay_from_account_id" <> "savings_accounts"."id")),
	CONSTRAINT "savings_accounts_statement_day" CHECK ("savings_accounts"."statement_day" is null or ("savings_accounts"."kind" = 'credit' and "savings_accounts"."statement_day" between 1 and 31)),
	CONSTRAINT "savings_accounts_autopay" CHECK (not "savings_accounts"."autopay" or "savings_accounts"."kind" = 'credit')
);
--> statement-breakpoint
ALTER TABLE "savings_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "savings_card_bills" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" integer NOT NULL,
	"statement_date" date NOT NULL,
	"due_date" date NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_card_bills_amount" CHECK ("savings_card_bills"."amount" between 0 and 100000000)
);
--> statement-breakpoint
ALTER TABLE "savings_card_bills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "savings_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"monthly_budget" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_categories_kind" CHECK ("savings_categories"."kind" in ('expense', 'income')),
	CONSTRAINT "savings_categories_color" CHECK ("savings_categories"."color" in ('blue', 'teal', 'green', 'amber', 'orange', 'rose', 'violet', 'slate')),
	CONSTRAINT "savings_categories_budget" CHECK ("savings_categories"."monthly_budget" is null or ("savings_categories"."kind" = 'expense' and "savings_categories"."monthly_budget" between 1 and 100000000))
);
--> statement-breakpoint
ALTER TABLE "savings_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "savings_holdings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"shares" integer NOT NULL,
	"cost" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_holdings_symbol" CHECK ("savings_holdings"."symbol" ~ '^[0-9A-Z]{4,6}$'),
	CONSTRAINT "savings_holdings_shares" CHECK ("savings_holdings"."shares" between 0 and 1000000000),
	CONSTRAINT "savings_holdings_cost" CHECK ("savings_holdings"."cost" between 0 and 100000000)
);
--> statement-breakpoint
ALTER TABLE "savings_holdings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "savings_purposes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_purposes_color" CHECK ("savings_purposes"."color" in ('blue', 'teal', 'green', 'amber', 'orange', 'rose', 'violet', 'slate'))
);
--> statement-breakpoint
ALTER TABLE "savings_purposes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "savings_recurring" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"account_id" integer NOT NULL,
	"counter_account_id" integer,
	"category_id" integer,
	"amount" integer NOT NULL,
	"day_of_month" smallint NOT NULL,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_posted_month" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text,
	"interval_months" smallint DEFAULT 1 NOT NULL,
	"start_month" date,
	"holiday_rule" text DEFAULT 'none' NOT NULL,
	"mode" text DEFAULT 'auto' NOT NULL,
	"holding_id" integer,
	"allocate" boolean DEFAULT false NOT NULL,
	"last_notified_on" date,
	CONSTRAINT "savings_recurring_kind" CHECK ("savings_recurring"."kind" in ('expense', 'income', 'transfer')),
	CONSTRAINT "savings_recurring_amount" CHECK ("savings_recurring"."amount" between 1 and 100000000),
	CONSTRAINT "savings_recurring_day_of_month" CHECK ("savings_recurring"."day_of_month" between 1 and 31),
	CONSTRAINT "savings_recurring_counter" CHECK (("savings_recurring"."kind" = 'transfer') = ("savings_recurring"."counter_account_id" is not null) and ("savings_recurring"."counter_account_id" is null or "savings_recurring"."counter_account_id" <> "savings_recurring"."account_id")),
	CONSTRAINT "savings_recurring_category" CHECK ("savings_recurring"."category_id" is null or "savings_recurring"."kind" <> 'transfer'),
	CONSTRAINT "savings_recurring_last_posted_first_day" CHECK ("savings_recurring"."last_posted_month" is null or extract(day from "savings_recurring"."last_posted_month") = 1),
	CONSTRAINT "savings_recurring_interval_months" CHECK ("savings_recurring"."interval_months" in (1, 2, 3, 6, 12)),
	CONSTRAINT "savings_recurring_start_month_first_day" CHECK ("savings_recurring"."start_month" is null or extract(day from "savings_recurring"."start_month") = 1),
	CONSTRAINT "savings_recurring_holiday_rule" CHECK ("savings_recurring"."holiday_rule" in ('none', 'before', 'after')),
	CONSTRAINT "savings_recurring_mode" CHECK ("savings_recurring"."mode" in ('confirm', 'auto')),
	CONSTRAINT "savings_recurring_holding" CHECK ("savings_recurring"."holding_id" is null or ("savings_recurring"."kind" = 'transfer' and "savings_recurring"."mode" = 'confirm')),
	CONSTRAINT "savings_recurring_allocate" CHECK (not "savings_recurring"."allocate" or ("savings_recurring"."kind" = 'income' and "savings_recurring"."mode" = 'confirm'))
);
--> statement-breakpoint
ALTER TABLE "savings_recurring" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "savings_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"account_id" integer NOT NULL,
	"counter_account_id" integer,
	"category_id" integer,
	"amount" integer NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"recurring_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"holding_id" integer,
	"shares" integer,
	"cost_change" integer,
	"recurring_period" date,
	"card_bill_id" integer,
	CONSTRAINT "savings_transactions_kind" CHECK ("savings_transactions"."kind" in ('expense', 'income', 'transfer', 'adjust')),
	CONSTRAINT "savings_transactions_amount" CHECK (case when "savings_transactions"."kind" = 'adjust' then "savings_transactions"."amount" <> 0 and "savings_transactions"."amount" between -100000000 and 100000000 else "savings_transactions"."amount" between 1 and 100000000 end),
	CONSTRAINT "savings_transactions_counter" CHECK (("savings_transactions"."kind" = 'transfer') = ("savings_transactions"."counter_account_id" is not null) and ("savings_transactions"."counter_account_id" is null or "savings_transactions"."counter_account_id" <> "savings_transactions"."account_id")),
	CONSTRAINT "savings_transactions_category" CHECK ("savings_transactions"."category_id" is null or "savings_transactions"."kind" in ('income', 'expense')),
	CONSTRAINT "savings_transactions_date" CHECK ("savings_transactions"."date" >= '2000-01-01'),
	CONSTRAINT "savings_transactions_shares" CHECK ("savings_transactions"."shares" is null or ("savings_transactions"."kind" = 'transfer' and "savings_transactions"."shares" <> 0)),
	CONSTRAINT "savings_transactions_cost_change" CHECK ("savings_transactions"."cost_change" is null or "savings_transactions"."cost_change" between -100000000 and 100000000),
	CONSTRAINT "savings_transactions_recurring_period_first_day" CHECK ("savings_transactions"."recurring_period" is null or extract(day from "savings_transactions"."recurring_period") = 1)
);
--> statement-breakpoint
ALTER TABLE "savings_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "starrail_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ltuid" text NOT NULL,
	"cookie_encrypted" text NOT NULL,
	"uid" text NOT NULL,
	"nickname" text,
	"region" text NOT NULL,
	"level" integer,
	"stamina_alert_threshold" integer,
	"last_stamina_alert_at" timestamp with time zone,
	"cookie_invalid" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"auto_redeem" boolean DEFAULT false NOT NULL,
	"game_reminders" boolean DEFAULT true NOT NULL,
	CONSTRAINT "starrail_accounts_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
ALTER TABLE "starrail_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "starrail_checkin_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"result" text NOT NULL,
	"message" text,
	"total_sign_day" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "starrail_checkin_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "starrail_redeem_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"code" text NOT NULL,
	"result" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "starrail_redeem_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "twitch_follows" (
	"user_id" uuid NOT NULL,
	"streamer_id" integer NOT NULL,
	"notify_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "twitch_follows_user_id_streamer_id_pk" PRIMARY KEY("user_id","streamer_id")
);
--> statement-breakpoint
ALTER TABLE "twitch_follows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "twitch_stream_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"broadcaster_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text,
	"category" text,
	"started_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "twitch_stream_events_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "twitch_stream_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "twitch_streamers" (
	"id" serial PRIMARY KEY NOT NULL,
	"broadcaster_id" text NOT NULL,
	"login" text NOT NULL,
	"display_name" text NOT NULL,
	"profile_image_url" text,
	"online_subscription_id" text,
	"offline_subscription_id" text,
	"subscription_status" text,
	"is_live" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notify_enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "twitch_streamers_broadcaster_id_unique" UNIQUE("broadcaster_id")
);
--> statement-breakpoint
ALTER TABLE "twitch_streamers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "youtube_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"title" text NOT NULL,
	"thumbnail" text,
	"lease_expires_at" timestamp with time zone,
	"subscription_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notify_enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "youtube_channels_channel_id_unique" UNIQUE("channel_id")
);
--> statement-breakpoint
ALTER TABLE "youtube_channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "youtube_follows" (
	"user_id" uuid NOT NULL,
	"channel_id" text NOT NULL,
	"notify_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youtube_follows_user_id_channel_id_pk" PRIMARY KEY("user_id","channel_id")
);
--> statement-breakpoint
ALTER TABLE "youtube_follows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
ALTER TABLE "youtube_saved_videos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "youtube_settings" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "youtube_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 2 CACHE 1),
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	CONSTRAINT "youtube_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "youtube_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	"lock_id" uuid,
	"requested_by" uuid,
	"glossary" jsonb,
	CONSTRAINT "youtube_translations_video_id_unique" UNIQUE("video_id")
);
--> statement-breakpoint
ALTER TABLE "youtube_translations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "youtube_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"title" text NOT NULL,
	"published_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"zh_captions" text DEFAULT 'unknown' NOT NULL,
	"zh_captions_checked_at" timestamp with time zone,
	CONSTRAINT "youtube_videos_video_id_unique" UNIQUE("video_id")
);
--> statement-breakpoint
ALTER TABLE "youtube_videos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core_invites" ADD CONSTRAINT "core_invites_created_by_core_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_notifications" ADD CONSTRAINT "core_notifications_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD CONSTRAINT "savings_accounts_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD CONSTRAINT "savings_accounts_purpose_id_savings_purposes_id_fk" FOREIGN KEY ("purpose_id") REFERENCES "public"."savings_purposes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD CONSTRAINT "savings_accounts_pay_from_account_id_savings_accounts_id_fk" FOREIGN KEY ("pay_from_account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_card_bills" ADD CONSTRAINT "savings_card_bills_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_card_bills" ADD CONSTRAINT "savings_card_bills_account_id_savings_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_categories" ADD CONSTRAINT "savings_categories_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_holdings" ADD CONSTRAINT "savings_holdings_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_holdings" ADD CONSTRAINT "savings_holdings_account_id_savings_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_purposes" ADD CONSTRAINT "savings_purposes_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD CONSTRAINT "savings_recurring_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD CONSTRAINT "savings_recurring_account_id_savings_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD CONSTRAINT "savings_recurring_counter_account_id_savings_accounts_id_fk" FOREIGN KEY ("counter_account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD CONSTRAINT "savings_recurring_category_id_savings_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."savings_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_recurring" ADD CONSTRAINT "savings_recurring_holding_id_savings_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."savings_holdings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_account_id_savings_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_counter_account_id_savings_accounts_id_fk" FOREIGN KEY ("counter_account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_category_id_savings_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."savings_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_recurring_id_savings_recurring_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."savings_recurring"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_holding_id_savings_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."savings_holdings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_card_bill_id_savings_card_bills_id_fk" FOREIGN KEY ("card_bill_id") REFERENCES "public"."savings_card_bills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starrail_accounts" ADD CONSTRAINT "starrail_accounts_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starrail_checkin_logs" ADD CONSTRAINT "starrail_checkin_logs_account_id_starrail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."starrail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starrail_redeem_codes" ADD CONSTRAINT "starrail_redeem_codes_account_id_starrail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."starrail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitch_follows" ADD CONSTRAINT "twitch_follows_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitch_follows" ADD CONSTRAINT "twitch_follows_streamer_id_twitch_streamers_id_fk" FOREIGN KEY ("streamer_id") REFERENCES "public"."twitch_streamers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_follows" ADD CONSTRAINT "youtube_follows_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_follows" ADD CONSTRAINT "youtube_follows_channel_id_youtube_channels_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."youtube_channels"("channel_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_saved_videos" ADD CONSTRAINT "youtube_saved_videos_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_settings" ADD CONSTRAINT "youtube_settings_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_translations" ADD CONSTRAINT "youtube_translations_requested_by_core_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."core_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "core_invites_created_by_idx" ON "core_invites" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "core_notifications_created_at_idx" ON "core_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "core_notifications_unread_idx" ON "core_notifications" USING btree ("module") WHERE "core_notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX "core_notifications_user_created_at_idx" ON "core_notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "core_notifications_user_unread_idx" ON "core_notifications" USING btree ("user_id","module") WHERE "core_notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX "core_rate_limits_window_started_at_idx" ON "core_rate_limits" USING btree ("window_started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_accounts_user_name_idx" ON "savings_accounts" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "savings_accounts_purpose_id_idx" ON "savings_accounts" USING btree ("purpose_id");--> statement-breakpoint
CREATE INDEX "savings_accounts_pay_from_account_id_idx" ON "savings_accounts" USING btree ("pay_from_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_card_bills_account_statement_idx" ON "savings_card_bills" USING btree ("account_id","statement_date");--> statement-breakpoint
CREATE INDEX "savings_card_bills_user_id_idx" ON "savings_card_bills" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_categories_user_kind_name_idx" ON "savings_categories" USING btree ("user_id","kind","name");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_holdings_account_symbol_idx" ON "savings_holdings" USING btree ("account_id","symbol");--> statement-breakpoint
CREATE INDEX "savings_holdings_user_id_idx" ON "savings_holdings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_purposes_user_name_idx" ON "savings_purposes" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "savings_recurring_user_id_idx" ON "savings_recurring" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "savings_recurring_account_id_idx" ON "savings_recurring" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "savings_recurring_counter_account_id_idx" ON "savings_recurring" USING btree ("counter_account_id");--> statement-breakpoint
CREATE INDEX "savings_recurring_category_id_idx" ON "savings_recurring" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "savings_recurring_holding_id_idx" ON "savings_recurring" USING btree ("holding_id");--> statement-breakpoint
CREATE INDEX "savings_transactions_user_id_date_idx" ON "savings_transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "savings_transactions_account_id_idx" ON "savings_transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "savings_transactions_counter_account_id_idx" ON "savings_transactions" USING btree ("counter_account_id");--> statement-breakpoint
CREATE INDEX "savings_transactions_category_id_idx" ON "savings_transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "savings_transactions_recurring_id_idx" ON "savings_transactions" USING btree ("recurring_id");--> statement-breakpoint
CREATE INDEX "savings_transactions_holding_id_idx" ON "savings_transactions" USING btree ("holding_id");--> statement-breakpoint
CREATE INDEX "savings_transactions_card_bill_id_idx" ON "savings_transactions" USING btree ("card_bill_id");--> statement-breakpoint
CREATE INDEX "starrail_accounts_user_id_idx" ON "starrail_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "starrail_redeem_codes_account_code" ON "starrail_redeem_codes" USING btree ("account_id","code");--> statement-breakpoint
CREATE INDEX "twitch_follows_streamer_id_idx" ON "twitch_follows" USING btree ("streamer_id");--> statement-breakpoint
CREATE INDEX "youtube_follows_channel_id_idx" ON "youtube_follows" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "youtube_saved_videos_user_updated_at_idx" ON "youtube_saved_videos" USING btree ("user_id","updated_at");