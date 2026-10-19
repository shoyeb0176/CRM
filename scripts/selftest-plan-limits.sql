-- Self-check for tier plans, record limits and AI actions (0042). Run on a TEST database after
-- `bun run db:migrate`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/selftest-plan-limits.sql
-- One transaction, rolled back. Prints "plan limits selftest: ok" or raises.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.act_as(_u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', _u, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', _u::text, true);
$$;

DO $$
DECLARE
  _a uuid := gen_random_uuid(); _b uuid := gen_random_uuid();
  _orgA uuid; _orgB uuid; _orgC uuid; _offer uuid; _r jsonb; _n int; _code text; _msg text; _hint text; _id bigint;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
    (_a, 'a@limits.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_b, 'b@limits.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('Lim A', 'lim-a-' || left(_a::text, 8), _a) RETURNING id INTO _orgA;
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('Lim B', 'lim-b-' || left(_b::text, 8), _b) RETURNING id INTO _orgB;
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_orgA, _a, 'org_owner', 'active'), (_orgB, _b, 'org_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';

  -- New workspaces start on Startup with no end date.
  SELECT p.code INTO _code FROM public.organization_subscriptions s JOIN public.subscription_plans p ON p.id = s.plan_id WHERE s.org_id = _orgA;
  IF _code IS DISTINCT FROM 'tier_startup' THEN RAISE EXCEPTION 'new workspace plan is %', _code; END IF;
  IF (SELECT current_period_end FROM public.organization_subscriptions WHERE org_id = _orgA) IS NOT NULL THEN RAISE EXCEPTION 'Startup has an end date'; END IF;
  IF (public.org_limits(_orgA) ->> 'contacts')::int <> 250 THEN RAISE EXCEPTION 'contacts limit %', public.org_limits(_orgA); END IF;

  -- 250 contacts fit; the 251st is refused with a plain message.
  INSERT INTO public.contacts (org_id, first_name) SELECT _orgA, 'C' || g FROM generate_series(1, 250) g;
  BEGIN
    INSERT INTO public.contacts (org_id, first_name) VALUES (_orgA, 'One too many');
    RAISE EXCEPTION 'contact 251 accepted';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT, _hint = PG_EXCEPTION_HINT;
    IF _msg = 'contact 251 accepted' THEN RAISE; END IF;
    IF _hint <> 'plan_limit' OR _msg NOT LIKE '%Startup plan includes 250 contacts%' THEN RAISE EXCEPTION 'unexpected refusal: % (%)', _msg, _hint; END IF;
  END;

  -- Another workspace is not affected.
  INSERT INTO public.contacts (org_id, first_name) VALUES (_orgB, 'Fine');

  -- A custom offering lifts the limit.
  INSERT INTO public.custom_offerings (org_id, name, override_limits, is_active) VALUES (_orgA, 'More contacts', '{"contacts": 260}', true) RETURNING id INTO _offer;
  UPDATE public.organization_subscriptions SET custom_offering_id = _offer WHERE org_id = _orgA;
  INSERT INTO public.contacts (org_id, first_name) VALUES (_orgA, 'Allowed now');

  -- Open leads and deals share one allowance of 100; closed ones don't count.
  INSERT INTO public.leads (org_id, name) SELECT _orgA, 'L' || g FROM generate_series(1, 99) g;
  INSERT INTO public.deals (org_id, title, status) VALUES (_orgA, 'D1', 'open');
  INSERT INTO public.leads (org_id, name, status) VALUES (_orgA, 'Already lost', 'lost');
  BEGIN
    INSERT INTO public.deals (org_id, title, status) VALUES (_orgA, 'D2', 'open');
    RAISE EXCEPTION 'open item 101 accepted';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg NOT LIKE '%100 open leads and deals%' THEN RAISE; END IF;
  END;

  -- One automation on Startup.
  INSERT INTO public.workflows (org_id, name) VALUES (_orgA, 'First');
  BEGIN
    INSERT INTO public.workflows (org_id, name) VALUES (_orgA, 'Second');
    RAISE EXCEPTION 'second automation accepted';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg NOT LIKE '%1 automation%' THEN RAISE; END IF;
  END;

  -- Growth has no record limits.
  UPDATE public.organization_subscriptions SET custom_offering_id = NULL,
    plan_id = (SELECT id FROM public.subscription_plans WHERE code = 'tier_growth') WHERE org_id = _orgA;
  INSERT INTO public.workflows (org_id, name) VALUES (_orgA, 'Second, on Growth');
  INSERT INTO public.contacts (org_id, first_name) VALUES (_orgA, 'No limit');
  UPDATE public.organization_subscriptions SET plan_id = (SELECT id FROM public.subscription_plans WHERE code = 'tier_startup') WHERE org_id = _orgA;

  -- AI actions: 25 a month on Startup; own-key actions never refused; last month doesn't count.
  INSERT INTO public.ai_usage_events (org_id, user_id, kind, created_at)
  SELECT _orgA, _a, 'assistant', date_trunc('month', now()) - interval '2 days' FROM generate_series(1, 30);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.act_as(_a);
  FOR _n IN 1..25 LOOP
    _r := public.consume_ai_action(_orgA, 'assistant', false);
    IF NOT (_r ->> 'ok')::boolean THEN RAISE EXCEPTION 'action % refused: %', _n, _r; END IF;
  END LOOP;
  _r := public.consume_ai_action(_orgA, 'assistant', false);
  IF (_r ->> 'ok')::boolean OR (_r ->> 'used')::int <> 25 THEN RAISE EXCEPTION 'action 26 allowed: %', _r; END IF;
  _r := public.consume_ai_action(_orgA, 'agent', true);
  IF NOT (_r ->> 'ok')::boolean THEN RAISE EXCEPTION 'own-key action refused'; END IF;
  _r := public.ai_usage_summary(_orgA);
  IF (_r ->> 'used')::int <> 25 OR (_r ->> 'own_key')::int <> 1 OR (_r ->> 'limit')::int <> 25 THEN RAISE EXCEPTION 'summary %', _r; END IF;

  -- A refund gives one back.
  _r := public.consume_ai_action(_orgA, 'assistant', true);
  _id := (_r ->> 'id')::bigint;
  PERFORM public.refund_ai_action(_id);
  IF EXISTS (SELECT 1 FROM public.ai_usage_events WHERE id = _id) THEN RAISE EXCEPTION 'refund failed'; END IF;

  -- Someone else can't use or read this workspace's allowance.
  PERFORM pg_temp.act_as(_b);
  BEGIN
    PERFORM public.consume_ai_action(_orgA, 'assistant', false);
    RAISE EXCEPTION 'outsider charged an action';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO _n FROM public.ai_usage_events WHERE org_id = _orgA;
  IF _n <> 0 THEN RAISE EXCEPTION 'outsider sees usage'; END IF;
  RESET ROLE;

  -- Owners heard about 80% (the 20th action).
  IF NOT EXISTS (SELECT 1 FROM public.notification_events WHERE org_id = _orgA AND kind = 'billing.ai_usage_high' AND user_id = _a) THEN
    RAISE EXCEPTION 'no 80%% notice';
  END IF;

  -- The billing page summary.
  PERFORM pg_temp.act_as(_a);
  _r := public.org_usage(_orgA);
  IF _r ->> 'tier' <> 'startup' OR (_r -> 'usage' -> 'contacts' ->> 'used')::int < 252 OR (_r -> 'usage' -> 'contacts' ->> 'limit')::int <> 250 THEN
    RAISE EXCEPTION 'org_usage %', _r;
  END IF;

  -- A free first year never goes read-only, and becomes Startup when it ends.
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('Lim C', 'lim-c-' || left(_b::text, 8), _b) RETURNING id INTO _orgC;
  UPDATE public.organization_subscriptions
     SET plan_id = (SELECT id FROM public.subscription_plans WHERE code = 'free_10x12'), current_period_end = now() - interval '1 day'
   WHERE org_id = _orgC;
  IF NOT public.org_is_active(_orgC) THEN RAISE EXCEPTION 'ended free year is read-only'; END IF;
  PERFORM public.expire_lapsed_subscriptions();
  SELECT p.code INTO _code FROM public.organization_subscriptions s JOIN public.subscription_plans p ON p.id = s.plan_id WHERE s.org_id = _orgC;
  IF _code <> 'tier_startup' OR (SELECT status FROM public.organization_subscriptions WHERE org_id = _orgC) <> 'active' THEN
    RAISE EXCEPTION 'ended free year became % / %', _code, (SELECT status FROM public.organization_subscriptions WHERE org_id = _orgC);
  END IF;

  RAISE NOTICE 'plan limits selftest: ok';
END $$;

ROLLBACK;
