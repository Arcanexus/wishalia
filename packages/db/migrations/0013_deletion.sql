ALTER TABLE "wish_lists" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wishes" ADD COLUMN "deleted_at" timestamp with time zone;