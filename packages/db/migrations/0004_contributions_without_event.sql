ALTER TABLE "contributions" ALTER COLUMN "event_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "withdraw_key_hash" text;