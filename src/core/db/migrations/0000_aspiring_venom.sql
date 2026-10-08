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
	CONSTRAINT "starrail_accounts_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
CREATE TABLE "starrail_checkin_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"result" text NOT NULL,
	"message" text,
	"total_sign_day" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	CONSTRAINT "twitch_streamers_broadcaster_id_unique" UNIQUE("broadcaster_id")
);
--> statement-breakpoint
ALTER TABLE "starrail_checkin_logs" ADD CONSTRAINT "starrail_checkin_logs_account_id_starrail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."starrail_accounts"("id") ON DELETE cascade ON UPDATE no action;