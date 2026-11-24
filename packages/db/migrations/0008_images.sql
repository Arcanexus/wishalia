CREATE TYPE "public"."image_source" AS ENUM('page', 'upload');--> statement-breakpoint
CREATE TABLE "wish_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wish_id" uuid NOT NULL,
	"source" "image_source" NOT NULL,
	"key" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wish_images_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "wishes" ADD COLUMN "image_id" uuid;--> statement-breakpoint
ALTER TABLE "wishes" ADD COLUMN "image_crop" jsonb;--> statement-breakpoint
ALTER TABLE "wish_images" ADD CONSTRAINT "wish_images_wish_id_wishes_id_fk" FOREIGN KEY ("wish_id") REFERENCES "public"."wishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wish_images_wish_idx" ON "wish_images" USING btree ("wish_id","position");--> statement-breakpoint
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_image_id_wish_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."wish_images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishes" DROP COLUMN "image_key";--> statement-breakpoint
-- The items already completed from their link go back to the worker once, for their images
UPDATE "wishes" SET "enrichment" = 'pending', "enrichment_attempts" = 0, "enrichment_at" = NULL WHERE "url" IS NOT NULL AND "status" = 'open';
