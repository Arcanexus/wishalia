ALTER TYPE "public"."wish_kind" ADD VALUE 'series';--> statement-breakpoint
ALTER TABLE "wishes" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_parent_id_wishes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."wishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wishes_parent_idx" ON "wishes" USING btree ("parent_id","position");--> statement-breakpoint
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_parent_self" CHECK ("wishes"."parent_id" IS NULL OR "wishes"."parent_id" <> "wishes"."id");