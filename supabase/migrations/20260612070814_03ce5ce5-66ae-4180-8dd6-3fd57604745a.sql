
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('trialing','active','past_due','canceled','expired','incomplete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.billing_cycle AS ENUM ('monthly','yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ subscription_plans ============
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_monthly numeric(12,2) NOT NULL DEFAULT 0,
  price_yearly  numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  user_limit integer,
  modules text[] NOT NULL DEFAULT '{}',
  features text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  stripe_price_id_monthly text,
  stripe_price_id_yearly text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO authenticated, anon;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view plans" ON public.subscription_plans;
CREATE POLICY "Anyone can view plans" ON public.subscription_plans
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Platform owners manage plans" ON public.subscription_plans;
CREATE POLICY "Platform owners manage plans" ON public.subscription_plans
  FOR ALL TO authenticated
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

CREATE TRIGGER trg_sub_plans_updated BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ organization_subscriptions ============
CREATE TABLE IF NOT EXISTS public.organization_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  status public.subscription_status NOT NULL DEFAULT 'trialing',
  billing_cycle public.billing_cycle NOT NULL DEFAULT 'monthly',
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  canceled_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_subscriptions TO authenticated;
GRANT ALL ON public.organization_subscriptions TO service_role;
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view subscription" ON public.organization_subscriptions;
CREATE POLICY "Org members view subscription" ON public.organization_subscriptions
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id) OR public.is_platform_owner());

DROP POLICY IF EXISTS "Org admins update subscription" ON public.organization_subscriptions;
CREATE POLICY "Org admins update subscription" ON public.organization_subscriptions
  FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::public.app_role[]) OR public.is_platform_owner())
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::public.app_role[]) OR public.is_platform_owner());

DROP POLICY IF EXISTS "Platform owners manage subscriptions" ON public.organization_subscriptions;
CREATE POLICY "Platform owners manage subscriptions" ON public.organization_subscriptions
  FOR ALL TO authenticated
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

CREATE TRIGGER trg_org_sub_updated BEFORE UPDATE ON public.organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ billing_events ============
CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  description text,
  amount numeric(12,2),
  currency text DEFAULT 'USD',
  stripe_event_id text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.billing_events TO authenticated;
GRANT ALL ON public.billing_events TO service_role;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view billing events" ON public.billing_events;
CREATE POLICY "Org members view billing events" ON public.billing_events
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id) OR public.is_platform_owner());

DROP POLICY IF EXISTS "Org admins insert billing events" ON public.billing_events;
CREATE POLICY "Org admins insert billing events" ON public.billing_events
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::public.app_role[]) OR public.is_platform_owner());

CREATE INDEX IF NOT EXISTS idx_billing_events_org_created ON public.billing_events (org_id, created_at DESC);

-- ============ usage_limits ============
CREATE TABLE IF NOT EXISTS public.usage_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  users_count integer NOT NULL DEFAULT 0,
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.usage_limits TO authenticated;
GRANT ALL ON public.usage_limits TO service_role;
ALTER TABLE public.usage_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view usage" ON public.usage_limits;
CREATE POLICY "Org members view usage" ON public.usage_limits
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id) OR public.is_platform_owner());

CREATE TRIGGER trg_usage_limits_updated BEFORE UPDATE ON public.usage_limits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SEED PLANS ============
INSERT INTO public.subscription_plans (code, name, description, price_monthly, price_yearly, user_limit, modules, features, sort_order)
VALUES
  ('starter',   'Starter',   'For small teams getting started with the essentials.',  29,  290, 3,
    ARRAY['crm','invoices','reports','settings'],
    ARRAY['CRM','Invoices','Basic reports','Email support'], 1),
  ('growth',    'Growth',    'For growing businesses managing the full sales cycle.', 79,  790, 10,
    ARRAY['crm','sales','invoices','inventory','projects','reports','settings'],
    ARRAY['Everything in Starter','Sales pipeline','Inventory','Projects','Advanced reports'], 2),
  ('business',  'Business',  'Operations-ready with purchasing, HR and accounting.',  199, 1990, 25,
    ARRAY['crm','sales','invoices','inventory','purchasing','accounting','projects','hr','reports','settings'],
    ARRAY['Everything in Growth','Purchasing','HR','Accounting','Priority email support'], 3),
  ('enterprise','Enterprise','Tailored for large organizations with custom needs.',    0,   0,   NULL,
    ARRAY['crm','sales','invoices','inventory','purchasing','accounting','projects','hr','reports','settings'],
    ARRAY['Everything in Business','Unlimited users','Priority support','Custom integrations','SSO & SAML'], 4)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  user_limit = EXCLUDED.user_limit,
  modules = EXCLUDED.modules,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order;

-- ============ Seed trial subscriptions for existing orgs ============
INSERT INTO public.organization_subscriptions (org_id, plan_id, status, billing_cycle, trial_ends_at, current_period_start, current_period_end)
SELECT o.id, p.id, 'trialing'::public.subscription_status, 'monthly'::public.billing_cycle,
       now() + interval '14 days', now(), now() + interval '14 days'
  FROM public.organizations o
  CROSS JOIN public.subscription_plans p
 WHERE p.code = 'starter'
   AND NOT EXISTS (SELECT 1 FROM public.organization_subscriptions s WHERE s.org_id = o.id);

INSERT INTO public.usage_limits (org_id, users_count)
SELECT o.id, COALESCE((SELECT count(*) FROM public.memberships m WHERE m.org_id = o.id AND m.status = 'active'), 0)
  FROM public.organizations o
 WHERE NOT EXISTS (SELECT 1 FROM public.usage_limits u WHERE u.org_id = o.id);

-- ============ Helpers ============
CREATE OR REPLACE FUNCTION public.org_has_module(_org uuid, _module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_subscriptions s
      JOIN public.subscription_plans p ON p.id = s.plan_id
     WHERE s.org_id = _org
       AND s.status IN ('trialing','active','past_due')
       AND _module = ANY(p.modules)
  );
$$;

CREATE OR REPLACE FUNCTION public.org_within_user_limit(_org uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _limit int; _count int;
BEGIN
  SELECT p.user_limit INTO _limit
    FROM public.organization_subscriptions s
    JOIN public.subscription_plans p ON p.id = s.plan_id
   WHERE s.org_id = _org;
  IF _limit IS NULL THEN RETURN true; END IF;
  SELECT count(*) INTO _count FROM public.memberships
   WHERE org_id = _org AND status = 'active';
  RETURN _count <= _limit;
END; $$;
