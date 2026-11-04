SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "starrail_warps" (
	"account_id" integer NOT NULL,
	"id" bigint NOT NULL,
	"banner_type" integer NOT NULL,
	"gacha_id" integer,
	"item_id" integer,
	"name" text NOT NULL,
	"item_type" text,
	"rarity" integer NOT NULL,
	"time" timestamp with time zone NOT NULL,
	CONSTRAINT "starrail_warps_account_id_id_pk" PRIMARY KEY("account_id","id")
);--> statement-breakpoint
ALTER TABLE "starrail_warps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core_users" ADD COLUMN "avatar" text;--> statement-breakpoint
ALTER TABLE "starrail_warps" ADD CONSTRAINT "starrail_warps_account_id_starrail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."starrail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "starrail_warps_account_banner_idx" ON "starrail_warps" USING btree ("account_id","banner_type","id");