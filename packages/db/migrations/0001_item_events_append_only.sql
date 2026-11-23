-- item_events is append-only (spec, section 7): no UPDATE, no DELETE, even by the application.
CREATE OR REPLACE FUNCTION item_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'item_events is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER item_events_no_update_delete
  BEFORE UPDATE OR DELETE ON item_events
  FOR EACH ROW EXECUTE FUNCTION item_events_append_only();
--> statement-breakpoint
CREATE TRIGGER item_events_no_truncate
  BEFORE TRUNCATE ON item_events
  FOR EACH STATEMENT EXECUTE FUNCTION item_events_append_only();
