-- The plans on the pricing page, applied in the app (no payment step yet: the platform owner sets
-- a workspace's plan in Platform admin until online checkout is switched on).
--   * Six tier plans with their limits as data (subscription_plans.limits).
--   * New workspaces start on Startup: free, with no end date. A workspace's free first year
--     moves to Startup when it ends, instead of going read-only.
--   * Record limits (contacts, open leads and deals, active projects, employees, invoices a month,
--     automations) are checked by the database when something is added.
--   * AI actions: one per message to the assistant or an agent, AI summary or knowledge answer,
--     counted per calendar month. Calls on the workspace's own AI key don't count.
-- A missing limit means no limit. Safe to run more than once.

-- ------------------------------------------------------------------ tier plans
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS tier_key text,
  ADD COLUMN IF NOT EXISTS limits jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_kind_chk;
ALTER TABLE public.subscription_plans
  ADD CONSTRAINT subscription_plans_kind_chk CHECK (plan_kind IN ('free_package', 'package', 'storage', 'legacy', 'tier'));

INSERT INTO public.subscription_plans
  (code, tier_key, name, description, plan_kind, user_limit, term_months, price_total, price_monthly, price_yearly,
   currency, modules, features, is_active, is_public, sort_order, storage_limit_gb, limits)
VALUES
  ('tier_startup', 'startup', 'Startup', 'Free for small businesses.', 'tier', NULL, NULL, 0, 0, 0, 'USD',
   ARRAY['crm','sales','invoices','inventory','purchasing','accounting','projects','hr','reports','settings'],
   ARRAY['250 contacts', '100 open leads and deals', '10 active projects', '15 employees', '25 invoices a month', '25 AI actions a month', '1 automation', '1 GB storage'],
   true, true, 1, 1,
   '{"contacts":250,"open_pipeline":100,"active_projects":10,"employees":15,"invoices_month":25,"automations":1,"ai_actions_month":25,"storage_gb":1,"sponsor_offers":true}'),
  ('tier_startup_plus', 'startup_plus', 'Startup Plus', 'More room, no sponsor offers.', 'tier', NULL, NULL, 12, 12, 120, 'USD',
   ARRAY['crm','sales','invoices','inventory','purchasing','accounting','projects','hr','reports','settings'],
   ARRAY['1,000 contacts', '25 active projects', '15 employees', '100 AI actions a month', '5 automations', '5 GB storage'],
   true, true, 2, 5,
   '{"contacts":1000,"active_projects":25,"employees":15,"automations":5,"ai_actions_month":100,"storage_gb":5}'),
  ('tier_core', 'core', 'Core', 'Run your business.', 'tier', NULL, NULL, 49, 49, 490, 'USD',
   ARRAY['crm','sales','invoices','inventory','purchasing','accounting','projects','hr','reports','settings'],
   ARRAY['No record limits', '250 AI actions a month', '20 automations', '10 GB storage'],
   true, true, 3, 10, '{"automations":20,"ai_actions_month":250,"storage_gb":10}'),
  ('tier_growth', 'growth', 'Growth', 'Automate your business.', 'tier', NULL, NULL, 149, 149, 1490, 'USD',
   ARRAY['crm','sales','invoices','inventory','purchasing','accounting','projects','hr','reports','settings'],
   ARRAY['No record limits', '1,000 AI actions a month', 'Unlimited automations', '10 GB storage'],
   true, true, 4, 10, '{"ai_actions_month":1000,"storage_gb":10}'),
  ('tier_business', 'business', 'Business', 'Control complex operations.', 'tier', NULL, NULL, 349, 349, 3490, 'USD',
   ARRAY['crm','sales','invoices','inventory','purchasing','accounting','projects','hr','reports','settings'],
   ARRAY['No record limits', '3,000 AI actions a month', 'Unlimited automations', '10 GB storage'],
   true, true, 5, 10, '{"ai_actions_month":3000,"storage_gb":10}'),
  ('tier_enterprise', 'enterprise', 'Enterprise', 'Built around your requirements. Limits are set per company.', 'tier', NULL, NULL, NULL, 999, 9990, 'USD',
   ARRAY['crm','sales','invoices','inventory','purchasing','accounting','projects','hr','reports','settings'],
   ARRAY['Custom limits', 'Custom AI actions'],
   true, false, 6, 10, '{"ai_actions_month":10000,"storage_gb":10}')
ON CONFLICT (code) DO NOTHING;

-- The free first year: no record limits, Core-level AI.
UPDATE public.subscription_plans SET limits = '{"ai_actions_month":250}'::jsonb
 WHERE code = 'free_10x12' AND limits = '{}'::jsonb;

-- ------------------------------------------------------------------ limits for one workspace
-- The plan's limits with the custom offering's overrides on top.
CREATE OR REPLACE FUNCTION public.org_limits(_org uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT COALESCE(p.limits, '{}'::jsonb) || COALESCE(o.override_limits, '{}'::jsonb)
      FROM public.organization_subscriptions s
      JOIN public.subscription_plans p ON p.id = s.plan_id
      LEFT JOIN public.custom_offerings o ON o.id = s.custom_offering_id AND o.is_active
     WHERE s.org_id = _org), '{}'::jsonb);
$$;
REVOKE ALL ON FUNCTION public.org_limits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_limits(uuid) TO authenticated;

-- A free first year never makes a workspace read-only: when it ends it becomes Startup.
CREATE OR REPLACE FUNCTION public.org_is_active(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT p.plan_kind = 'free_package'
        OR (s.status IN ('active', 'trialing', 'past_due')
            AND (s.current_period_end IS NULL OR s.current_period_end > now())
            AND (s.status <> 'trialing' OR s.trial_ends_at IS NULL OR s.trial_ends_at > now()))
      FROM public.organization_subscriptions s
      LEFT JOIN public.subscription_plans p ON p.id = s.plan_id
     WHERE s.org_id = _org
  ), true);
$$;

-- New workspaces: Startup, active, no end date.
CREATE OR REPLACE FUNCTION public.ensure_org_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _plan uuid;
BEGIN
  SELECT id INTO _plan FROM public.subscription_plans WHERE code = 'tier_startup';
  IF _plan IS NULL THEN SELECT id INTO _plan FROM public.subscription_plans WHERE code = 'free_10x12'; END IF;
  IF _plan IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.organization_subscriptions (org_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
  VALUES (NEW.id, _plan, 'active', 'monthly', now(), NULL)
  ON CONFLICT (org_id) DO NOTHING;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.ensure_org_subscription() FROM PUBLIC, anon, authenticated;

-- Daily: free first years that ended become Startup; other lapsed plans are marked expired.
CREATE OR REPLACE FUNCTION public.expire_lapsed_subscriptions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _startup uuid; _moved int := 0; _expired int := 0;
BEGIN
  SELECT id INTO _startup FROM public.subscription_plans WHERE code = 'tier_startup';
  IF _startup IS NOT NULL THEN
    WITH m AS (
      UPDATE public.organization_subscriptions s
         SET plan_id = _startup, status = 'active', billing_cycle = 'monthly',
             current_period_start = now(), current_period_end = NULL
        FROM public.subscription_plans p
       WHERE p.id = s.plan_id AND p.plan_kind = 'free_package'
         AND s.current_period_end IS NOT NULL AND s.current_period_end <= now()
      RETURNING 1)
    SELECT count(*) INTO _moved FROM m;
  END IF;
  WITH x AS (
    UPDATE public.organization_subscriptions
       SET status = 'expired'
     WHERE status IN ('active', 'trialing', 'past_due')
       AND stripe_subscription_id IS NULL
       AND current_period_end IS NOT NULL AND current_period_end <= now()
    RETURNING 1)
  SELECT count(*) INTO _expired FROM x;
  RETURN _moved + _expired;
END $$;
REVOKE EXECUTE ON FUNCTION public.expire_lapsed_subscriptions() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------ record limits
-- How many of a limited thing the workspace has now.
CREATE OR REPLACE FUNCTION public.org_limit_count(_org uuid, _key text)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE _key
    WHEN 'contacts' THEN (SELECT count(*) FROM public.contacts WHERE org_id = _org)
    WHEN 'open_pipeline' THEN
      (SELECT count(*) FROM public.leads WHERE org_id = _org AND status NOT IN ('converted', 'lost', 'unqualified'))
      + (SELECT count(*) FROM public.deals WHERE org_id = _org AND status = 'open')
    WHEN 'active_projects' THEN (SELECT count(*) FROM public.projects WHERE org_id = _org AND status IN ('planned', 'active', 'on_hold'))
    WHEN 'employees' THEN (SELECT count(*) FROM public.employees WHERE org_id = _org AND status IN ('active', 'on_leave'))
    WHEN 'invoices_month' THEN (SELECT count(*) FROM public.invoices WHERE org_id = _org AND created_at >= date_trunc('month', now()))
    WHEN 'automations' THEN (SELECT count(*) FROM public.workflows WHERE org_id = _org)
  END;
$$;
REVOKE ALL ON FUNCTION public.org_limit_count(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.plan_limit_label(_key text, _n bigint)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _key
    WHEN 'contacts' THEN format('%s contacts', _n)
    WHEN 'open_pipeline' THEN format('%s open leads and deals', _n)
    WHEN 'active_projects' THEN format('%s active projects', _n)
    WHEN 'employees' THEN format('%s employees', _n)
    WHEN 'invoices_month' THEN format('%s invoices a month', _n)
    WHEN 'automations' THEN format(CASE WHEN _n = 1 THEN '%s automation' ELSE '%s automations' END, _n)
    ELSE format('%s %s', _n, _key) END;
$$;

-- BEFORE INSERT trigger: refuses the row once the workspace is at its plan's limit.
-- TG_ARGV[0] is the limit key. Migrations and seed scripts can set inuberry.skip_limits = 'on'.
CREATE OR REPLACE FUNCTION public.enforce_plan_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _key text := TG_ARGV[0]; _limit bigint; _plan text;
BEGIN
  IF COALESCE(current_setting('inuberry.skip_limits', true), '') = 'on' THEN RETURN NEW; END IF;
  -- Only rows that count toward the limit (e.g. a lead added as already lost doesn't).
  -- (Nested IFs: NEW.status is only read on tables that have it.)
  IF _key IN ('open_pipeline', 'active_projects', 'employees') THEN
    IF TG_TABLE_NAME = 'leads' THEN
      IF NEW.status::text IN ('converted', 'lost', 'unqualified') THEN RETURN NEW; END IF;
    ELSIF TG_TABLE_NAME = 'deals' THEN
      IF NEW.status::text <> 'open' THEN RETURN NEW; END IF;
    ELSIF TG_TABLE_NAME = 'projects' THEN
      IF NEW.status::text NOT IN ('planned', 'active', 'on_hold') THEN RETURN NEW; END IF;
    ELSIF TG_TABLE_NAME = 'employees' THEN
      IF NEW.status::text NOT IN ('active', 'on_leave') THEN RETURN NEW; END IF;
    END IF;
  END IF;
  _limit := (public.org_limits(NEW.org_id) ->> _key)::bigint;
  IF _limit IS NULL THEN RETURN NEW; END IF;
  IF public.org_limit_count(NEW.org_id, _key) >= _limit THEN
    SELECT p.name INTO _plan FROM public.organization_subscriptions s JOIN public.subscription_plans p ON p.id = s.plan_id WHERE s.org_id = NEW.org_id;
    RAISE EXCEPTION 'Your % plan includes %. Upgrade in Settings › Billing, or archive or remove some to add more.',
      COALESCE(_plan, 'current'), public.plan_limit_label(_key, _limit)
      USING ERRCODE = 'P0001', HINT = 'plan_limit';
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE _t text; _k text;
BEGIN
  FOR _t, _k IN VALUES ('contacts', 'contacts'), ('leads', 'open_pipeline'), ('deals', 'open_pipeline'),
                       ('projects', 'active_projects'), ('employees', 'employees'), ('invoices', 'invoices_month'),
                       ('workflows', 'automations') LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS plan_limit ON public.%I', _t);
    EXECUTE format('CREATE TRIGGER plan_limit BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit(%L)', _t, _k);
  END LOOP;
END $$;

-- ------------------------------------------------------------------ AI actions
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id         bigserial PRIMARY KEY,
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind       text NOT NULL CHECK (kind IN ('assistant', 'agent', 'brief', 'knowledge')),
  byo        boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_events_org_month_idx ON public.ai_usage_events (org_id, created_at DESC);
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_events FROM anon, authenticated;
GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;
DROP POLICY IF EXISTS ai_usage_events_read ON public.ai_usage_events;
CREATE POLICY ai_usage_events_read ON public.ai_usage_events FOR SELECT TO authenticated USING (public.is_org_member(org_id));

-- This month's AI actions against the plan's allowance.
CREATE OR REPLACE FUNCTION public.ai_usage_summary(_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _limit int; _used int; _byo int; _start timestamptz := date_trunc('month', now());
BEGIN
  IF NOT public.is_org_member(_org) THEN RAISE EXCEPTION 'Not a member of this workspace' USING ERRCODE = '42501'; END IF;
  _limit := (public.org_limits(_org) ->> 'ai_actions_month')::int;
  SELECT count(*) FILTER (WHERE NOT byo), count(*) FILTER (WHERE byo) INTO _used, _byo
    FROM public.ai_usage_events WHERE org_id = _org AND created_at >= _start;
  RETURN jsonb_build_object('used', _used, 'limit', _limit, 'own_key', _byo,
                            'resets_on', to_char(_start + interval '1 month', 'YYYY-MM-DD'));
END $$;
REVOKE ALL ON FUNCTION public.ai_usage_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_usage_summary(uuid) TO authenticated;

-- Count one AI action, or refuse it when the month's allowance is used up. Own-key actions are
-- recorded but never refused. Returns {ok, id, used, limit, resets_on}.
CREATE OR REPLACE FUNCTION public.consume_ai_action(_org uuid, _kind text, _byo boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _limit int; _used int; _id bigint; _start timestamptz := date_trunc('month', now()); _admins uuid[];
BEGIN
  IF NOT public.is_org_member(_org) THEN RAISE EXCEPTION 'Not a member of this workspace' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_usage:' || _org::text, 0));
  _limit := (public.org_limits(_org) ->> 'ai_actions_month')::int;
  SELECT count(*) INTO _used FROM public.ai_usage_events WHERE org_id = _org AND NOT byo AND created_at >= _start;
  IF NOT _byo AND _limit IS NOT NULL AND _used >= _limit THEN
    RETURN jsonb_build_object('ok', false, 'used', _used, 'limit', _limit, 'resets_on', to_char(_start + interval '1 month', 'YYYY-MM-DD'));
  END IF;
  INSERT INTO public.ai_usage_events (org_id, user_id, kind, byo) VALUES (_org, auth.uid(), _kind, _byo) RETURNING id INTO _id;
  IF NOT _byo THEN _used := _used + 1; END IF;
  -- Once a month, tell owners and admins when 80% is used.
  IF NOT _byo AND _limit IS NOT NULL AND _limit > 0 AND _used = ceil(_limit * 0.8)::int
     AND NOT public.notified_recently('billing.ai_usage_high', _org, 25) THEN
    _admins := public.notify_recipients(_org, ARRAY[]::public.app_role[]);
    PERFORM public.notify(_org, _admins, format('%s of %s AI actions used this month', _used, _limit),
      'Upgrade in Settings › Billing, or connect your own AI key in Settings › AI, so the assistant keeps working.',
      'warning', 'billing', '/app/settings/billing', 'organization', _org, NULL, 'billing.ai_usage_high', true, 'See plans');
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', _id, 'used', _used, 'limit', _limit, 'resets_on', to_char(_start + interval '1 month', 'YYYY-MM-DD'));
END $$;
REVOKE ALL ON FUNCTION public.consume_ai_action(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_action(uuid, text, boolean) TO authenticated;

-- Give an action back when it failed before the AI answered (only your own, within 10 minutes).
CREATE OR REPLACE FUNCTION public.refund_ai_action(_id bigint)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.ai_usage_events WHERE id = _id AND user_id = auth.uid() AND created_at > now() - interval '10 minutes';
$$;
REVOKE ALL ON FUNCTION public.refund_ai_action(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_ai_action(bigint) TO authenticated;

-- Everything the billing page shows: plan, limits and how much of each is used.
CREATE OR REPLACE FUNCTION public.org_usage(_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _limits jsonb; _plan record; _out jsonb := '{}'::jsonb; _k text;
BEGIN
  IF NOT public.is_org_member(_org) THEN RAISE EXCEPTION 'Not a member of this workspace' USING ERRCODE = '42501'; END IF;
  _limits := public.org_limits(_org);
  SELECT p.name, p.tier_key, p.plan_kind, s.current_period_end INTO _plan
    FROM public.organization_subscriptions s JOIN public.subscription_plans p ON p.id = s.plan_id WHERE s.org_id = _org;
  FOREACH _k IN ARRAY ARRAY['contacts', 'open_pipeline', 'active_projects', 'employees', 'invoices_month', 'automations'] LOOP
    _out := _out || jsonb_build_object(_k, jsonb_build_object('used', public.org_limit_count(_org, _k), 'limit', _limits -> _k));
  END LOOP;
  RETURN jsonb_build_object(
    'plan', _plan.name, 'tier', _plan.tier_key, 'kind', _plan.plan_kind, 'ends', _plan.current_period_end,
    'limits', _limits, 'usage', _out, 'ai', public.ai_usage_summary(_org),
    'storage', jsonb_build_object('used_bytes', public.org_storage_used_bytes(_org), 'limit_gb', _limits -> 'storage_gb'));
END $$;
REVOKE ALL ON FUNCTION public.org_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_usage(uuid) TO authenticated;

-- ------------------------------------------------------------------ AI call log detail
ALTER TABLE public.ai_call_logs
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS cached_tokens integer;