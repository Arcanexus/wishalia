CREATE TYPE "public"."list_visibility" AS ENUM('private', 'public');--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN "open_token" text;--> statement-breakpoint
ALTER TABLE "wish_lists" ADD COLUMN "visibility" "list_visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
CREATE INDEX "wish_lists_public_idx" ON "wish_lists" USING btree ("created_at") WHERE "wish_lists"."visibility" = 'public' AND "wish_lists"."archived_at" IS NULL;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_open_list" CHECK ("share_links"."open_token" IS NULL OR ("share_links"."scope" = 'list' AND "share_links"."list_id" IS NOT NULL));