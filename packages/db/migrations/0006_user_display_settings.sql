CREATE TYPE "public"."mode_choice" AS ENUM('device', 'light', 'dark');--> statement-breakpoint
CREATE TYPE "public"."theme_choice" AS ENUM('auto', 'neutral', 'christmas');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme" "theme_choice" DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mode" "mode_choice" DEFAULT 'device' NOT NULL;