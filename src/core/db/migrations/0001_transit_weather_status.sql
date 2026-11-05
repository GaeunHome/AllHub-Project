SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "core_avatar_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"image" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_avatar_images_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "core_avatar_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core_cron_status" (
	"task" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"ok" boolean NOT NULL,
	"summary" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core_cron_status" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core_service_status" (
	"service" text PRIMARY KEY NOT NULL,
	"last_ok_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "core_service_status" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transit_routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"system" text DEFAULT '' NOT NULL,
	"line" text DEFAULT '' NOT NULL,
	"origin_id" text NOT NULL,
	"origin_name" text NOT NULL,
	"destination_id" text NOT NULL,
	"destination_name" text NOT NULL,
	"tracked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transit_routes_mode" CHECK ("transit_routes"."mode" in ('thsr', 'tra', 'metro', 'bus'))
);
--> statement-breakpoint
ALTER TABLE "transit_routes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "weather_places" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"latitude" double precision,
	"longitude" double precision,
	"timezone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weather_places_kind" CHECK ("weather_places"."kind" in ('county', 'world'))
);
--> statement-breakpoint
ALTER TABLE "weather_places" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core_avatar_images" ADD CONSTRAINT "core_avatar_images_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transit_routes" ADD CONSTRAINT "transit_routes_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_places" ADD CONSTRAINT "weather_places_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transit_routes_user_route" ON "transit_routes" USING btree ("user_id","mode","system","line","origin_id","destination_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weather_places_user_name" ON "weather_places" USING btree ("user_id","name");--> statement-breakpoint
ALTER TABLE "youtube_videos" DROP COLUMN "zh_captions";--> statement-breakpoint
ALTER TABLE "youtube_videos" DROP COLUMN "zh_captions_checked_at";