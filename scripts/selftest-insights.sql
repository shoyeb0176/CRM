-- Self-check for 0048: platform_insights answers a platform owner and refuses everyone else.
-- Run on a TEST database after `bun run db:migrate`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/selftest-insights.sql
-- One transaction, rolled back. Prints "insights selftest: ok" or raises.
BEGIN;

DO $$
DECLARE
  _owner uuid := gen_random_uuid();
  _user uuid := gen_random_uuid();
  _org uuid; _out jsonb;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role, last_sign_in_at) VALUES
    (_owner, 'owner@in.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now()),
    (_user, 'user@in.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now() - interval '2 days');
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('In Co', 'in-co-' || left(_user::text, 8), _user) RETURNING id INTO _org;
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_org, _user, 'org_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'org_owner', status = 'active';
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_org, _owner, 'platform_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'platform_owner', status = 'active';

  -- A normal workspace owner is refused.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _user::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.platform_insights();
    RAISE EXCEPTION 'a normal user read platform insights';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Not authorized' THEN RAISE; END IF;
  END;
  RESET ROLE;

  -- The platform owner gets totals, 12 weeks, the workspace and both users with their emails.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  SET LOCAL ROLE authenticated;
  _out := public.platform_insights();
  RESET ROLE;

  IF jsonb_array_length(_out->'weeks') <> 12 THEN RAISE EXCEPTION 'expected 12 weeks, got %', jsonb_array_length(_out->'weeks'); END IF;
  IF (_out->'totals'->>'active_7d')::int < 2 THEN RAISE EXCEPTION 'active_7d too low: %', _out->'totals'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_out->'users') u WHERE u->>'email' = 'user@in.test'
                 AND u->'workspaces' @> '[{"name":"In Co","role":"org_owner"}]') THEN
    RAISE EXCEPTION 'user row with workspace missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_out->'workspaces') w WHERE w->>'name' = 'In Co' AND (w->>'members')::int = 2) THEN
    RAISE EXCEPTION 'workspace row missing or wrong member count';
  END IF;
  IF NOT (_out->'modules_30d' ? 'invoices') THEN RAISE EXCEPTION 'modules_30d missing'; END IF;

  RAISE NOTICE 'insights selftest: ok';
END $$;

ROLLBACK;
