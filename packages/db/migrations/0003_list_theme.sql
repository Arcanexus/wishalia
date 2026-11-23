CREATE TYPE "public"."list_theme" AS ENUM('neutral', 'christmas');--> statement-breakpoint
ALTER TABLE "wish_lists" ADD COLUMN "theme" "list_theme";