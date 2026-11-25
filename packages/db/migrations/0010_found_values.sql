ALTER TABLE "wishes" ADD COLUMN "found_title" text;--> statement-breakpoint
ALTER TABLE "wishes" ADD COLUMN "found_price_cents" integer;--> statement-breakpoint
-- What the worker wrote before this column existed, from the items' history (the "enriched" entries)
UPDATE "wishes" SET
  "found_title" = (
    SELECT "payload"->>'title' FROM "item_events"
    WHERE "item_events"."wish_id" = "wishes"."id" AND "type" = 'enriched' AND "payload" ? 'title'
    ORDER BY "at" DESC, "id" DESC LIMIT 1
  ),
  "found_price_cents" = (
    SELECT ("payload"->>'priceCents')::integer FROM "item_events"
    WHERE "item_events"."wish_id" = "wishes"."id" AND "type" = 'enriched' AND "payload" ? 'priceCents'
    ORDER BY "at" DESC, "id" DESC LIMIT 1
  )
WHERE "url" IS NOT NULL;
