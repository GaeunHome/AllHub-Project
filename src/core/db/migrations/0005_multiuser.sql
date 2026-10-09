SET LOCAL lock_timeout = '5s';--> statement-breakpoint
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
CREATE TABLE "core_rate_limits" (
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"attempts" integer NOT NULL,
	CONSTRAINT "core_rate_limits_scope_key_hash_pk" PRIMARY KEY("scope","key_hash")
);
--> statement-breakpoint
ALTER TABLE "core_users" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "core_users" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core_users" ADD COLUMN "failed_logins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "core_users" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core_invites" ADD CONSTRAINT "core_invites_created_by_core_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "core_invites_created_by_idx" ON "core_invites" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "core_rate_limits_window_started_at_idx" ON "core_rate_limits" USING btree ("window_started_at");--> statement-breakpoint
ALTER TABLE "core_users" ADD CONSTRAINT "core_users_role_valid" CHECK ("core_users"."role" in ('owner', 'member'));--> statement-breakpoint
ALTER TABLE "core_users" ADD CONSTRAINT "core_users_failed_logins_non_negative" CHECK ("core_users"."failed_logins" >= 0);--> statement-breakpoint
-- 舊版只能用 npm run account 建立帳號、給站長一個人用，所以既有帳號都是站長
UPDATE "core_users" SET "role" = 'owner';
