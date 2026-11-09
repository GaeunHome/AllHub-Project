SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "savings_asset_snapshots" (
	"user_id" uuid NOT NULL,
	"month" date NOT NULL,
	"investment" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_asset_snapshots_user_id_month_pk" PRIMARY KEY("user_id","month"),
	CONSTRAINT "savings_asset_snapshots_month_first_day" CHECK ("savings_asset_snapshots"."month" is null or extract(day from "savings_asset_snapshots"."month") = 1)
);
--> statement-breakpoint
ALTER TABLE "savings_asset_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "savings_asset_snapshots" ADD CONSTRAINT "savings_asset_snapshots_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;