CREATE TYPE "public"."list_reveal_mode" AS ENUM('received', 'manual');--> statement-breakpoint
ALTER TABLE "contributions" ALTER COLUMN "event_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "withdraw_key_hash" text;--> statement-breakpoint
ALTER TABLE "wish_lists" ADD COLUMN "reveal_mode" "list_reveal_mode" DEFAULT 'received' NOT NULL;--> statement-breakpoint
ALTER TABLE "wish_lists" ADD COLUMN "revealed_at" timestamp with time zone;