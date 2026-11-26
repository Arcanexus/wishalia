CREATE TYPE "public"."enrichment_step" AS ENUM('images');--> statement-breakpoint
ALTER TABLE "wishes" ADD COLUMN "enrichment_step" "enrichment_step";