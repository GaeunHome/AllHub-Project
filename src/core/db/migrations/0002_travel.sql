SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "travel_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "travel_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "travel_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "travel_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "travel_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"day" date,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"maps_url" text,
	"lat" double precision,
	"lng" double precision,
	"note" text,
	"stay_minutes" integer NOT NULL,
	"travel_minutes" integer NOT NULL,
	"fixed_time" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "travel_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "travel_members" (
	"trip_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "travel_members_trip_id_user_id_pk" PRIMARY KEY("trip_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "travel_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "travel_trips" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"destination" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"join_open" boolean DEFAULT false NOT NULL,
	"join_generation" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "travel_trips_dates" CHECK ("travel_trips"."end_date" >= "travel_trips"."start_date")
);
--> statement-breakpoint
ALTER TABLE "travel_trips" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "travel_checks" ADD CONSTRAINT "travel_checks_trip_id_travel_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."travel_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_comments" ADD CONSTRAINT "travel_comments_item_id_travel_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."travel_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_comments" ADD CONSTRAINT "travel_comments_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_items" ADD CONSTRAINT "travel_items_trip_id_travel_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."travel_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_members" ADD CONSTRAINT "travel_members_trip_id_travel_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."travel_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_members" ADD CONSTRAINT "travel_members_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "travel_checks_trip_id_idx" ON "travel_checks" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "travel_comments_item_id_idx" ON "travel_comments" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "travel_comments_user_id_idx" ON "travel_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "travel_items_trip_day_idx" ON "travel_items" USING btree ("trip_id","day","position");--> statement-breakpoint
CREATE INDEX "travel_members_user_id_idx" ON "travel_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "travel_trips_end_date_idx" ON "travel_trips" USING btree ("end_date");