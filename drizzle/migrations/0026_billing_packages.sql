-- New billing model (no per-seat pricing):
--   free_package: every new company gets 10 users for 12 months, free, with every module.
--   package:      after that, a prepaid package: N users × M months (price set by the platform owner).
--   storage:      a yearly plan sized by storage and bandwidth, with unlimited users.
--   legacy:       the old per-seat Starter/Growth/Business/Enterprise plans (kept for existing
--                 Stripe subscribers until renewal; hidden from sale).
-- Every active package includes all modules. When a company's plan has lapsed, the database makes
-- its business data read-only (it can still see and export everything) until it renews.
-- Safe to run more than once.

-- ------------------------------------------------------------------ plan catalogue
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS plan_kind text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS term_months integer,
  ADD COLUMN IF NOT EXISTS price_total numeric(12,2),
  ADD COLUMN IF NOT EXISTS storage_limit_gb numeric(12,2),
  ADD COLUMN IF NOT EXISTS bandwidth_limit_gb numeric(12,2),
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  ALTER TABLE public.subscription_plans
    ADD CONSTRAINT subscription_plans_kind_chk CHECK (plan_kind IN ('free_package', 'package', 'storage', 'legacy'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.subscription_plans
    ADD CONSTRAINT subscription_plans_term_chk CHECK (term_months IS NULL OR term_months BETWEEN 1 AND 120);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The per-seat plans stop being sold.
UPDATE public.subscription_plans SET plan_kind = 'legacy', is_public = false
 WHERE code IN ('starter', 'growth', 'business', 'enterprise');

-- All business modules (used for the new kinds; access there doesn't depend on this list).
INSERT INTO public.subscription_plans
  (code, name, description, plan_kind, user_limit, term_months, price_total, price_monthly, price_yearly,
   currency, modules, features, is_active, is_public, sort_order)
VALUES
  ('free_10x12', 'Free first year', 'Up to 10 users for 12 months, every module, free.',
   'free_package', 10, 12, 0, 0, 0, 'USD',
   ARRAY['crm','sales','invoices','inventory','purchasing','accounting','projects','hr','reports','settings'],
   ARRAY['Every module', 'Up to 10 users', '12 months free', 'Hosted, backed up and updated for you'],
   true, true, 10),
  ('package_10x12', 'Team package', 'Prepaid package: set users, months and price in the platform console before activating.',
   'package', 10, 12, NULL, 0, 0, 'USD',
   ARRAY['crm','sales','invoices','inventory','purchasing','accounting','projects','hr','reports','settings'],
   ARRAY['Every module', 'Up to 10 users', '12 months, paid up front', 'Swap people freely within the cap'],
   false, true, 20),
  ('storage_yearly', 'Storage plan', 'Yearly plan sized by storage and bandwidth, unlimited users. Set limits and price before activating.',
   'storage', NULL, 12, NULL, 0, 0, 'USD',
   ARRAY['crm','sales','invoices','inventory','purchasing','accounting','projects','hr','reports','settings'],
   ARRAY['Every module', 'Unlimited users', 'Storage and bandwidth included', 'Billed yearly'],
   false, true, 30)
ON CONFLICT (code) DO NOTHING;

UPDATE public.subscription_plans SET storage_limit_gb = 50, bandwidth_limit_gb = 500
 WHERE code = 'storage_yearly' AND storage_limit_gb IS NULL;

-- ------------------------------------------------------------------ is the company's plan in force?
-- No subscription row = active (fail open: a billing glitch must never lock a company out).
CREATE OR REPLACE FUNCTION public.org_is_active(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT s.status IN ('active', 'trialing', 'past_due')
       AND (s.current_period_end IS NULL OR s.current_period_end > now())
       AND (s.status <> 'trialing' OR s.trial_ends_at IS NULL OR s.trial_ends_at > now())
      FROM public.organization_subscriptions s
     WHERE s.org_id = _org
  ), true);
$$;

-- Module access. New plan kinds: every module while the plan is in force.
-- Legacy plans: the plan's (or custom offering's) module list, while in force.
CREATE OR REPLACE FUNCTION public.org_has_module(_org uuid, _module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT public.org_is_active(_org) AND (
             p.plan_kind <> 'legacy'
             OR _module = ANY(COALESCE(NULLIF(o.modules, '{}'::text[]), p.modules))
           )
      FROM public.organization_subscriptions s
      JOIN public.subscription_plans p ON p.id = s.plan_id
      LEFT JOIN public.custom_offerings o ON o.id = s.custom_offering_id AND o.is_active
     WHERE s.org_id = _org
  ), true);
$$;

-- User cap: custom offering override, else the plan's limit; NULL = unlimited (storage plans).
CREATE OR REPLACE FUNCTION public.org_within_user_limit(_org uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _limit int; _count int;
BEGIN
  SELECT COALESCE((o.override_limits->>'user_limit')::int, p.user_limit) INTO _limit
    FROM public.organization_subscriptions s
    JOIN public.subscription_plans p ON p.id = s.plan_id
    LEFT JOIN public.custom_offerings o ON o.id = s.custom_offering_id AND o.is_active
   WHERE s.org_id = _org;
  IF _limit IS NULL THEN RETURN true; END IF;
  SELECT count(*) INTO _count FROM public.memberships WHERE org_id = _org AND status = 'active';
  RETURN _count <= _limit;
END; $$;

GRANT EXECUTE ON FUNCTION public.org_is_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_has_module(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_within_user_limit(uuid) TO authenticated;

-- ------------------------------------------------------------------ new companies: free first year
CREATE OR REPLACE FUNCTION public.ensure_org_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _plan uuid; _months int;
BEGIN
  SELECT id, COALESCE(term_months, 12) INTO _plan, _months
    FROM public.subscription_plans WHERE code = 'free_10x12';
  IF _plan IS NULL THEN
    SELECT id, NULL INTO _plan, _months FROM public.subscription_plans WHERE code = 'starter';
  END IF;
  IF _plan IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.organization_subscriptions
    (org_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
  VALUES (NEW.id, _plan, 'active', 'yearly', now(),
          CASE WHEN _months IS NULL THEN NULL ELSE now() + make_interval(months => _months) END)
  ON CONFLICT (org_id) DO NOTHING;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.ensure_org_subscription() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------ existing companies
-- Everyone not paying through Stripe moves to the free first year, starting today.
UPDATE public.organization_subscriptions s
   SET plan_id = (SELECT id FROM public.subscription_plans WHERE code = 'free_10x12'),
       status = 'active',
       billing_cycle = 'yearly',
       current_period_start = now(),
       current_period_end = now() + interval '12 months',
       trial_ends_at = NULL,
       cancel_at_period_end = false
  FROM public.subscription_plans p
 WHERE p.id = s.plan_id
   AND p.plan_kind = 'legacy'
   AND s.stripe_subscription_id IS NULL
   AND s.custom_offering_id IS NULL;

-- ------------------------------------------------------------------ read-only when lapsed
-- RESTRICTIVE policies are ANDed with the existing ones, so they only ever take rights away.
-- Reads are untouched. Settings, members, billing, audit and portal tables are not locked, so a
-- lapsed company can still manage its account and pay.
DO $$
DECLARE
  _map text[][] := ARRAY[
    -- CRM
    ['companies','crm'],['contacts','crm'],['leads','crm'],['deal_stages','crm'],['deals','crm'],
    ['activities','crm'],['notes','crm'],['tags','crm'],['comm_events','crm'],
    -- Sales and invoicing
    ['quotes','sales'],['quote_items','sales'],['sales_orders','sales'],['sales_order_items','sales'],
    ['invoices','invoices'],['invoice_items','invoices'],['payments','invoices'],
    -- Products and inventory
    ['product_categories','inventory'],['products','inventory'],['product_variants','inventory'],
    ['warehouses','inventory'],['inventory_locations','inventory'],['inventory_stock','inventory'],
    ['inventory_movements','inventory'],['inventory_adjustments','inventory'],
    -- Purchasing
    ['suppliers','purchasing'],['expense_categories','purchasing'],['purchase_orders','purchasing'],
    ['purchase_order_items','purchasing'],['purchase_receipts','purchasing'],['vendor_bills','purchasing'],
    ['vendor_bill_items','purchasing'],['vendor_bill_payments','purchasing'],['expenses','purchasing'],
    -- Accounting
    ['chart_of_accounts','accounting'],['fiscal_periods','accounting'],['journal_entries','accounting'],
    ['journal_entry_lines','accounting'],
    -- Projects
    ['projects','projects'],['project_members','projects'],['milestones','projects'],
    ['project_tasks','projects'],['task_comments','projects'],['task_checklists','projects'],['timesheets','projects'],
    -- HR
    ['departments','hr'],['job_titles','hr'],['employees','hr'],['employee_documents','hr'],
    ['leave_requests','hr'],['attendance_records','hr'],['payroll_profiles','hr'],
    -- Workspace, databases, forms, knowledge, automations, AI agents
    ['workspaces','settings'],['pages','settings'],['blocks','settings'],['custom_databases','settings'],
    ['custom_fields','settings'],['custom_records','settings'],['database_views','settings'],
    ['form_definitions','settings'],['knowledge_docs','settings'],['workflows','settings'],
    ['ai_agents','settings'],['ai_agent_runs','settings']
  ];
  _t text; _m text; i int;
BEGIN
  FOR i IN 1 .. array_length(_map, 1) LOOP
    _t := _map[i][1]; _m := _map[i][2];
    -- Skip tables that don't exist here or have no org_id column.
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = _t AND column_name = 'org_id');
    EXECUTE format('DROP POLICY IF EXISTS plan_lock_insert ON public.%I', _t);
    EXECUTE format('DROP POLICY IF EXISTS plan_lock_update ON public.%I', _t);
    EXECUTE format('DROP POLICY IF EXISTS plan_lock_delete ON public.%I', _t);
    EXECUTE format('CREATE POLICY plan_lock_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.org_has_module(org_id, %L))', _t, _m);
    EXECUTE format('CREATE POLICY plan_lock_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.org_has_module(org_id, %L)) WITH CHECK (public.org_has_module(org_id, %L))', _t, _m, _m);
    EXECUTE format('CREATE POLICY plan_lock_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.org_has_module(org_id, %L))', _t, _m);
  END LOOP;
END $$;

-- ------------------------------------------------------------------ daily expiry
-- Access already follows the dates above; this keeps the status column honest for reports.
CREATE OR REPLACE FUNCTION public.expire_lapsed_subscriptions()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH x AS (
    UPDATE public.organization_subscriptions
       SET status = 'expired'
     WHERE status IN ('active', 'trialing', 'past_due')
       AND stripe_subscription_id IS NULL
       AND current_period_end IS NOT NULL AND current_period_end <= now()
    RETURNING 1)
  SELECT count(*)::int FROM x;
$$;
REVOKE EXECUTE ON FUNCTION public.expire_lapsed_subscriptions() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  PERFORM cron.schedule('expire-subscriptions', '30 0 * * *', 'SELECT public.expire_lapsed_subscriptions()');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
