-- Self-check for conversation memory and saved import tokens (0043). Run on a TEST database after `bun run db:migrate`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/selftest-import-connections.sql
-- One transaction, rolled back. Prints "import connections selftest: ok" or raises.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.act_as(_u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', _u, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', _u::text, true);
$$;

DO $$
DECLARE
  _own uuid := gen_random_uuid(); _staff uuid := gen_random_uuid(); _other uuid := gen_random_uuid();
  _org uuid; _org2 uuid; _conv uuid; _n int;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
    (_own, 'owner@ic.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_staff, 'staff@ic.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_other, 'other@ic.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('IC', 'ic-' || left(_own::text, 8), _own) RETURNING id INTO _org;
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('IC2', 'ic2-' || left(_other::text, 8), _other) RETURNING id INTO _org2;
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES
    (_org, _own, 'org_owner', 'active'), (_org, _staff, 'staff', 'active'), (_org2, _other, 'org_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';

  -- The server (service role) saves a token; one per provider per workspace.
  INSERT INTO public.import_connections (org_id, provider, label, token, token_last4, created_by)
  VALUES (_org, 'notion', 'Acme', 'enc:v1:abc:def', 'wxyz', _own);
  BEGIN
    INSERT INTO public.import_connections (org_id, provider, token) VALUES (_org, 'notion', 'x');
    RAISE EXCEPTION 'second notion token allowed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.import_connections (org_id, provider, token) VALUES (_org, 'dropbox', 'x');
    RAISE EXCEPTION 'unknown provider allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  SET LOCAL ROLE authenticated;

  -- Nobody reads the token from the browser, not even the owner.
  PERFORM pg_temp.act_as(_own);
  BEGIN
    PERFORM token FROM public.import_connections;
    RAISE EXCEPTION 'browser could read import tokens';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- The owner sees that it exists (safe columns only); staff and other workspaces see nothing.
  SELECT count(*) INTO _n FROM public.list_import_connections(_org) WHERE token_last4 = 'wxyz';
  IF _n <> 1 THEN RAISE EXCEPTION 'owner should see the connection, got %', _n; END IF;
  PERFORM pg_temp.act_as(_staff);
  SELECT count(*) INTO _n FROM public.list_import_connections(_org);
  IF _n <> 0 THEN RAISE EXCEPTION 'staff saw the connection'; END IF;
  PERFORM pg_temp.act_as(_other);
  SELECT count(*) INTO _n FROM public.list_import_connections(_org);
  IF _n <> 0 THEN RAISE EXCEPTION 'another workspace saw the connection'; END IF;

  -- A user can keep a summary and snapshot on their own conversation.
  PERFORM pg_temp.act_as(_own);
  INSERT INTO public.ai_conversations (org_id, user_id, title) VALUES (_org, _own, 'Chat') RETURNING id INTO _conv;
  UPDATE public.ai_conversations SET summary = 'Talked about Acme.', summarized_upto = now(), snapshot = 'ctx', snapshot_at = now()
  WHERE id = _conv;
  SELECT count(*) INTO _n FROM public.ai_conversations WHERE id = _conv AND summary = 'Talked about Acme.' AND snapshot = 'ctx';
  IF _n <> 1 THEN RAISE EXCEPTION 'conversation memory not saved'; END IF;

  RESET ROLE;
  RAISE NOTICE 'import connections selftest: ok';
END $$;

ROLLBACK;
