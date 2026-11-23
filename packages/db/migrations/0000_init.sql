CREATE TYPE "public"."contribution_status" AS ENUM('active', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."event_kind" AS ENUM('birthday', 'christmas', 'other');--> statement-breakpoint
CREATE TYPE "public"."history_visibility" AS ENUM('owner', 'guests', 'sealed');--> statement-breakpoint
CREATE TYPE "public"."series_volume_state" AS ENUM('owned', 'wanted', 'given');--> statement-breakpoint
CREATE TYPE "public"."share_scope" AS ENUM('list', 'event');--> statement-breakpoint
CREATE TYPE "public"."wish_kind" AS ENUM('unique', 'quantity', 'pool');--> statement-breakpoint
CREATE TYPE "public"."wish_status" AS ENUM('open', 'received', 'archived');--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wish_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"contributor_id" uuid,
	"guest_name" text,
	"share_link_id" uuid,
	"amount_cents" integer,
	"units" integer,
	"status" "contribution_status" DEFAULT 'active' NOT NULL,
	"message" text,
	"anonymous" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "contributions_who" CHECK ("contributions"."contributor_id" IS NOT NULL OR "contributions"."guest_name" IS NOT NULL),
	CONSTRAINT "contributions_what" CHECK (("contributions"."amount_cents" IS NOT NULL AND "contributions"."amount_cents" > 0) OR ("contributions"."units" IS NOT NULL AND "contributions"."units" > 0))
);
--> statement-breakpoint
CREATE TABLE "event_wishes" (
	"event_id" uuid NOT NULL,
	"wish_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_wishes_event_id_wish_id_pk" PRIMARY KEY("event_id","wish_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "event_kind" DEFAULT 'other' NOT NULL,
	"date" date NOT NULL,
	"reveal_delay_days" integer DEFAULT 3 NOT NULL,
	"revealed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_reveal_delay" CHECK ("events"."reveal_delay_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "item_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"wish_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visibility" "history_visibility" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'books' NOT NULL,
	"total_volumes" integer,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"scope" "share_scope" NOT NULL,
	"list_id" uuid,
	"event_id" uuid,
	"audience" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_target" CHECK (("share_links"."scope" = 'list' AND "share_links"."list_id" IS NOT NULL AND "share_links"."event_id" IS NULL) OR ("share_links"."scope" = 'event' AND "share_links"."event_id" IS NOT NULL AND "share_links"."list_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wish_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"kind" "wish_kind" DEFAULT 'unique' NOT NULL,
	"repeatable" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"notes" text,
	"image_key" text,
	"price_cents" integer,
	"target_cents" integer,
	"quantity" integer,
	"series_id" uuid,
	"series_number" integer,
	"series_state" "series_volume_state",
	"status" "wish_status" DEFAULT 'open' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishes_pool_target" CHECK ("wishes"."kind" <> 'pool' OR "wishes"."target_cents" IS NULL OR "wishes"."target_cents" > 0),
	CONSTRAINT "wishes_quantity" CHECK ("wishes"."kind" <> 'quantity' OR ("wishes"."quantity" IS NOT NULL AND "wishes"."quantity" > 0)),
	CONSTRAINT "wishes_amounts" CHECK (("wishes"."price_cents" IS NULL OR "wishes"."price_cents" >= 0)),
	CONSTRAINT "wishes_series" CHECK (("wishes"."series_id" IS NULL) = ("wishes"."series_number" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_wish_id_wishes_id_fk" FOREIGN KEY ("wish_id") REFERENCES "public"."wishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_contributor_id_users_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_share_link_id_share_links_id_fk" FOREIGN KEY ("share_link_id") REFERENCES "public"."share_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_wishes" ADD CONSTRAINT "event_wishes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_wishes" ADD CONSTRAINT "event_wishes_wish_id_wishes_id_fk" FOREIGN KEY ("wish_id") REFERENCES "public"."wishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_events" ADD CONSTRAINT "item_events_wish_id_wishes_id_fk" FOREIGN KEY ("wish_id") REFERENCES "public"."wishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_events" ADD CONSTRAINT "item_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_list_id_wish_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."wish_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish_lists" ADD CONSTRAINT "wish_lists_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_list_id_wish_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."wish_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contributions_wish_idx" ON "contributions" USING btree ("wish_id","event_id");--> statement-breakpoint
CREATE INDEX "events_owner_idx" ON "events" USING btree ("owner_id","date");--> statement-breakpoint
CREATE INDEX "item_events_wish_idx" ON "item_events" USING btree ("wish_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_token_idx" ON "share_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "wish_lists_owner_idx" ON "wish_lists" USING btree ("owner_id","position");--> statement-breakpoint
CREATE INDEX "wishes_list_idx" ON "wishes" USING btree ("list_id","position");--> statement-breakpoint
CREATE INDEX "wishes_series_idx" ON "wishes" USING btree ("series_id","series_number");