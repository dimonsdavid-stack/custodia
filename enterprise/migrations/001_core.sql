BEGIN;
CREATE SCHEMA IF NOT EXISTS custodia;
CREATE TABLE custodia.requests (
 tenant_id uuid NOT NULL, id uuid NOT NULL, status text NOT NULL CHECK(status IN ('intake','searching','review','pending_confirmation','released')),
 version bigint NOT NULL DEFAULT 1, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,id));
CREATE TABLE custodia.events (
 tenant_id uuid NOT NULL, sequence bigint NOT NULL, request_id uuid NOT NULL, actor text NOT NULL,
 event_type text NOT NULL, payload jsonb NOT NULL, canonical text NOT NULL, previous_hash text NOT NULL,
 signature text NOT NULL CHECK(length(signature)=64), key_id text NOT NULL, at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,sequence));
CREATE TABLE custodia.demo_requests(id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL, organization text NOT NULL, message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE custodia.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE custodia.requests FORCE ROW LEVEL SECURITY;
ALTER TABLE custodia.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE custodia.events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_requests ON custodia.requests USING(tenant_id=nullif(current_setting('app.current_tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.current_tenant_id',true),'')::uuid);
CREATE POLICY tenant_events ON custodia.events USING(tenant_id=nullif(current_setting('app.current_tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.current_tenant_id',true),'')::uuid);
CREATE FUNCTION custodia.reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Ledger is append-only'; END $$;
CREATE TRIGGER immutable_events BEFORE UPDATE OR DELETE OR TRUNCATE ON custodia.events FOR EACH STATEMENT EXECUTE FUNCTION custodia.reject_ledger_mutation();
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='custodia_app') THEN CREATE ROLE custodia_app NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$;
GRANT USAGE ON SCHEMA custodia TO custodia_app;
GRANT SELECT,INSERT,UPDATE ON custodia.requests TO custodia_app;
GRANT SELECT,INSERT ON custodia.events TO custodia_app;
GRANT INSERT ON custodia.demo_requests TO custodia_app;
COMMIT;
