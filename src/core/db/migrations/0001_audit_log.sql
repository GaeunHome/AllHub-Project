SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "core_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"batch_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_name" text NOT NULL,
	"ip" text NOT NULL,
	"module" text NOT NULL,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"target" text,
	"detail" text,
	"attempts" integer DEFAULT 1 NOT NULL,
	"merge_key" text,
	CONSTRAINT "core_audit_logs_merge_key_unique" UNIQUE("merge_key"),
	CONSTRAINT "core_audit_logs_outcome" CHECK ("core_audit_logs"."outcome" in ('success', 'failure'))
);
--> statement-breakpoint
ALTER TABLE "core_audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core_invites" ADD COLUMN "denied_modules" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX "core_audit_logs_created_at_idx" ON "core_audit_logs" USING btree ("created_at");