-- Self-check for AI app connections and personal keys (0036). Run on a TEST database after `bun run db:migrate`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/selftest-ai-connections.sql
-- Everything runs in one transaction and is rolled back. Prints "ai connections selftest: ok" or raises.
BEGIN;

DO $$
DECLARE
  _a uuid := gen_random_uuid();
  _b uuid := gen_random_uuid();
  _org uuid;
  _other uuid;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
    (_a, 'a@conn.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_b, 'b@conn.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('Conn A', 'conn-a-' || left(_a::text, 8), _a) RETURNING id INTO _org;
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('Conn B', 'conn-b-' || left(_b::text, 8), _b) RETURNING id INTO _other;
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_org, _a, 'staff', 'active'), (_other, _b, 'org_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';
  -- Keys are created by the server (service role).
  INSERT INTO public.personal_api_keys (user_id, org_id, name, prefix, key_hash) VALUES
    (_a, _org, 'A key', 'inbp_aaaaaa', 'hash-a'), (_b, _other, 'B key', 'inbp_bbbbbb', 'hash-b');
  PERFORM set_config('conntest.a', _a::text, true);
  PERFORM set_config('conntest.org', _org::text, true);
  PERFORM set_config('conntest.other', _other::text, true);
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  _a uuid := current_setting('conntest.a')::uuid;
  _org uuid := current_setting('conntest.org')::uuid;
  _other uuid := current_setting('conntest.other')::uuid;
  _n int;
  _ok boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _a::text, true);

  -- Keys: only your own are visible; you can revoke yours; you can't move a key or create one.
  SELECT count(*) INTO _n FROM public.personal_api_keys;
  IF _n <> 1 THEN RAISE EXCEPTION 'user sees % keys, expected only their own', _n; END IF;
  UPDATE public.personal_api_keys SET revoked_at = now() WHERE name = 'A key';
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 1 THEN RAISE EXCEPTION 'user could not revoke their key'; END IF;
  BEGIN
    UPDATE public.personal_api_keys SET org_id = _other WHERE name = 'A key';
    _ok := true;
  EXCEPTION WHEN insufficient_privilege THEN _ok := false; END;
  IF _ok THEN RAISE EXCEPTION 'user could move a key to another workspace'; END IF;
  BEGIN
    INSERT INTO public.personal_api_keys (user_id, org_id, name, prefix, key_hash) VALUES (_a, _org, 'x', 'inbp_x', 'hash-x');
    _ok := true;
  EXCEPTION WHEN insufficient_privilege THEN _ok := false; END;
  IF _ok THEN RAISE EXCEPTION 'user could insert a key directly'; END IF;

  -- App connections: only to a workspace you belong to.
  INSERT INTO public.mcp_connections (user_id, client_id, client_name, org_id) VALUES (_a, 'client-1', 'Claude', _org);
  BEGIN
    INSERT INTO public.mcp_connections (user_id, client_id, org_id) VALUES (_a, 'client-2', _other);
    _ok := true;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN _ok := false; END;
  IF _ok THEN RAISE EXCEPTION 'user connected an app to a workspace they are not in'; END IF;
  BEGIN
    UPDATE public.mcp_connections SET org_id = _other WHERE client_id = 'client-1';
    GET DIAGNOSTICS _n = ROW_COUNT;
    _ok := _n > 0;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN _ok := false; END;
  IF _ok THEN RAISE EXCEPTION 'user moved an app connection to a workspace they are not in'; END IF;
  RAISE NOTICE 'ai connections selftest: ok';
END $$;

ROLLBACK;
