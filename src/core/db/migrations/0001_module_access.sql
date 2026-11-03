SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "core_module_denials" (
	"user_id" uuid NOT NULL,
	"module_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_module_denials_user_id_module_id_pk" PRIMARY KEY("user_id","module_id")
);
--> statement-breakpoint
ALTER TABLE "core_module_denials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core_users" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "core_module_denials" ADD CONSTRAINT "core_module_denials_user_id_core_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."core_users"("id") ON DELETE cascade ON UPDATE no action;