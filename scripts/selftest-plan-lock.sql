-- Self-check for the plan lock (0026 + 0029). Run on a TEST database after `bun run db:migrate`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/selftest-plan-lock.sql
-- Everything runs in one transaction and is rolled back. Prints "plan lock selftest: ok" or raises.
BEGIN;

DO $$
DECLARE
  _uid uuid := gen_random_uuid();
  _org uuid;
  _co uuid;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role)
  VALUES (_uid, 'locktest@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('Lock Test', 'lock-test-' || left(_uid::text, 8), _uid)
  RETURNING id INTO _org;
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_org, _uid, 'org_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'org_owner', status = 'active';
  INSERT INTO public.companies (org_id, name) VALUES (_org, 'Existing') RETURNING id INTO _co;
  -- On a paid package that ended yesterday. (A free first year never locks: it becomes Startup.)
  INSERT INTO public.organization_subscriptions (org_id, plan_id, status, billing_cycle, current_period_end)
  SELECT _org, id, 'active', 'yearly', now() - interval '1 day' FROM public.subscription_plans WHERE code = 'package_10x12'
  ON CONFLICT (org_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = 'active', current_period_end = EXCLUDED.current_period_end;
  PERFORM set_config('locktest.org', _org::text, true);
  PERFORM set_config('locktest.co', _co::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true); -- older auth.uid() reads this one
END $$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  _org uuid := current_setting('locktest.org')::uuid;
  _co uuid := current_setting('locktest.co')::uuid;
  _n int;
  _ok boolean;
BEGIN
  -- Reading still works.
  SELECT count(*) INTO _n FROM public.companies WHERE org_id = _org;
  IF _n <> 1 THEN RAISE EXCEPTION 'read: expected 1 company, got %', _n; END IF;

  -- Insert, update and delete each fail with the plan message (not silently).
  BEGIN INSERT INTO public.companies (org_id, name) VALUES (_org, 'New'); _ok := true;
  EXCEPTION WHEN others THEN _ok := false;
    IF SQLERRM NOT LIKE 'Your plan has ended%' THEN RAISE EXCEPTION 'insert: wrong error: %', SQLERRM; END IF; END;
  IF _ok THEN RAISE EXCEPTION 'insert was allowed on a lapsed plan'; END IF;

  BEGIN UPDATE public.companies SET name = 'Changed' WHERE id = _co; _ok := true;
  EXCEPTION WHEN others THEN _ok := false;
    IF SQLERRM NOT LIKE 'Your plan has ended%' THEN RAISE EXCEPTION 'update: wrong error: %', SQLERRM; END IF; END;
  IF _ok THEN RAISE EXCEPTION 'update did not raise on a lapsed plan'; END IF;

  BEGIN DELETE FROM public.companies WHERE id = _co; _ok := true;
  EXCEPTION WHEN others THEN _ok := false;
    IF SQLERRM NOT LIKE 'Your plan has ended%' THEN RAISE EXCEPTION 'delete: wrong error: %', SQLERRM; END IF; END;
  IF _ok THEN RAISE EXCEPTION 'delete did not raise on a lapsed plan'; END IF;
END $$;

-- Renew: the same writes now go through.
RESET ROLE;
UPDATE public.organization_subscriptions SET current_period_end = now() + interval '1 year'
 WHERE org_id = current_setting('locktest.org')::uuid;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  _org uuid := current_setting('locktest.org')::uuid;
  _co uuid := current_setting('locktest.co')::uuid;
  _n int;
BEGIN
  INSERT INTO public.companies (org_id, name) VALUES (_org, 'New');
  UPDATE public.companies SET name = 'Changed' WHERE id = _co;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 1 THEN RAISE EXCEPTION 'update after renewal changed % rows', _n; END IF;
  DELETE FROM public.companies WHERE id = _co;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 1 THEN RAISE EXCEPTION 'delete after renewal removed % rows', _n; END IF;
  RAISE NOTICE 'plan lock selftest: ok';
END $$;

ROLLBACK;
