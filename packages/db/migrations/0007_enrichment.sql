CREATE TYPE "public"."enrichment_state" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
ALTER TABLE "wishes" ADD COLUMN "enrichment" "enrichment_state";--> statement-breakpoint
ALTER TABLE "wishes" ADD COLUMN "enrichment_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wishes" ADD COLUMN "enrichment_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "wishes_enrichment_idx" ON "wishes" USING btree ("enrichment","created_at");