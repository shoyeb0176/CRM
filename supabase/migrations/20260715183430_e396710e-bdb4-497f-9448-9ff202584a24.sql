
CREATE TABLE public.custom_offerings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  override_price numeric,
  override_currency text DEFAULT 'USD',
  override_interval text CHECK (override_interval IN ('monthly','yearly','none')),
  modules text[],
  override_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  trial_ends_at timestamptz,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.custom_offerings(org_id);
GRANT SELECT ON public.custom_offerings TO authenticated;
GRANT ALL ON public.custom_offerings TO service_role;
ALTER TABLE public.custom_offerings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_offerings_platform_all" ON public.custom_offerings
  FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
CREATE POLICY "custom_offerings_org_read" ON public.custom_offerings
  FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));

CREATE TABLE public.org_suspensions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reason text NOT NULL,
  suspended_at timestamptz NOT NULL DEFAULT now(),
  suspended_by uuid REFERENCES auth.users(id),
  reactivated_at timestamptz,
  reactivated_by uuid REFERENCES auth.users(id)
);
CREATE INDEX ON public.org_suspensions(org_id, reactivated_at);
GRANT SELECT ON public.org_suspensions TO authenticated;
GRANT ALL ON public.org_suspensions TO service_role;
ALTER TABLE public.org_suspensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_suspensions_platform_all" ON public.org_suspensions
  FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
CREATE POLICY "org_suspensions_org_read" ON public.org_suspensions
  FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));

CREATE TABLE public.platform_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id uuid REFERENCES auth.users(id),
  target_org uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.platform_audit_logs(target_org, created_at DESC);
CREATE INDEX ON public.platform_audit_logs(actor_id, created_at DESC);
GRANT SELECT, INSERT ON public.platform_audit_logs TO authenticated;
GRANT ALL ON public.platform_audit_logs TO service_role;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_audit_platform_read" ON public.platform_audit_logs
  FOR SELECT TO authenticated USING (public.is_platform_owner());
CREATE POLICY "platform_audit_insert" ON public.platform_audit_logs
  FOR INSERT TO authenticated WITH CHECK (public.is_platform_owner());

CREATE TABLE public.impersonation_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','active','expired','revoked','ended')),
  approval_token_hash text,
  authorized_by uuid REFERENCES auth.users(id),
  authorized_by_email text,
  authorized_at timestamptz,
  expires_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.impersonation_requests(org_id, status);
CREATE INDEX ON public.impersonation_requests(requested_by);
GRANT SELECT ON public.impersonation_requests TO authenticated;
GRANT ALL ON public.impersonation_requests TO service_role;
ALTER TABLE public.impersonation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "impersonation_requests_platform_all" ON public.impersonation_requests
  FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
CREATE POLICY "impersonation_requests_org_read" ON public.impersonation_requests
  FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));

CREATE TABLE public.impersonation_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.impersonation_requests(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id),
  event_type text NOT NULL,
  route text,
  table_name text,
  row_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.impersonation_events(org_id, created_at DESC);
CREATE INDEX ON public.impersonation_events(request_id, created_at DESC);
GRANT SELECT, INSERT ON public.impersonation_events TO authenticated;
GRANT ALL ON public.impersonation_events TO service_role;
ALTER TABLE public.impersonation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "impersonation_events_platform_read" ON public.impersonation_events
  FOR SELECT TO authenticated USING (public.is_platform_owner());
CREATE POLICY "impersonation_events_org_read" ON public.impersonation_events
  FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));
CREATE POLICY "impersonation_events_insert" ON public.impersonation_events
  FOR INSERT TO authenticated WITH CHECK (public.is_platform_owner());

CREATE TABLE public.demo_orgs (
  org_id uuid NOT NULL PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  seed_depth text NOT NULL DEFAULT 'basic' CHECK (seed_depth IN ('none','basic','rich')),
  expires_at timestamptz,
  torn_down_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.demo_orgs TO authenticated;
GRANT ALL ON public.demo_orgs TO service_role;
ALTER TABLE public.demo_orgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo_orgs_platform_all" ON public.demo_orgs
  FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

ALTER TABLE public.organization_subscriptions
  ADD COLUMN IF NOT EXISTS custom_offering_id uuid REFERENCES public.custom_offerings(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.resolve_org_offering(_org uuid)
RETURNS TABLE(
  modules text[],
  user_limit int,
  ai_agent_limit int,
  effective_price numeric,
  billing_interval text,
  trial_ends_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _s public.organization_subscriptions%ROWTYPE; _p public.subscription_plans%ROWTYPE; _o public.custom_offerings%ROWTYPE;
BEGIN
  SELECT * INTO _s FROM public.organization_subscriptions WHERE org_id = _org;
  IF _s.org_id IS NULL THEN RETURN; END IF;
  SELECT * INTO _p FROM public.subscription_plans WHERE id = _s.plan_id;
  IF _s.custom_offering_id IS NOT NULL THEN
    SELECT * INTO _o FROM public.custom_offerings WHERE id = _s.custom_offering_id AND is_active;
  END IF;
  modules := COALESCE(_o.modules, _p.modules);
  user_limit := COALESCE( (_o.override_limits->>'user_limit')::int, _p.user_limit );
  ai_agent_limit := COALESCE( (_o.override_limits->>'ai_agent_limit')::int, _p.ai_agent_limit );
  effective_price := COALESCE(_o.override_price, _p.price_monthly);
  billing_interval := COALESCE(_o.override_interval, _s.billing_cycle::text);
  trial_ends_at := COALESCE(_o.trial_ends_at, _s.trial_ends_at);
  RETURN NEXT;
END; $$;

CREATE OR REPLACE FUNCTION public.has_permission(_org uuid, _key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE _key
    WHEN 'org.manage'         THEN public.has_org_role(_org, ARRAY['org_owner','org_admin']::public.app_role[])
    WHEN 'members.manage'     THEN public.has_org_role(_org, ARRAY['org_owner','org_admin']::public.app_role[])
    WHEN 'billing.manage'     THEN public.has_org_role(_org, ARRAY['org_owner','org_admin']::public.app_role[])
    WHEN 'accounting.read'    THEN public.has_org_role(_org, ARRAY['org_owner','org_admin','accountant']::public.app_role[])
    WHEN 'accounting.write'   THEN public.has_org_role(_org, ARRAY['org_owner','org_admin','accountant']::public.app_role[])
    WHEN 'hr.read'            THEN public.has_hr_access(_org)
    WHEN 'hr.write'           THEN public.has_hr_access(_org)
    WHEN 'payroll.read'       THEN public.has_hr_access(_org)
    WHEN 'inventory.write'    THEN public.has_org_role(_org, ARRAY['org_owner','org_admin','manager','inventory_manager']::public.app_role[])
    WHEN 'purchasing.write'   THEN public.has_org_role(_org, ARRAY['org_owner','org_admin','manager','accountant']::public.app_role[])
    WHEN 'sales.write'        THEN public.has_org_role(_org, ARRAY['org_owner','org_admin','manager','sales_rep','accountant']::public.app_role[])
    WHEN 'audit.read'         THEN public.has_org_role(_org, ARRAY['org_owner','org_admin']::public.app_role[])
    WHEN 'platform.manage'    THEN public.is_platform_owner()
    WHEN 'platform.impersonate' THEN public.is_platform_owner()
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.platform_overview_stats()
RETURNS TABLE(
  total_orgs bigint,
  active_orgs bigint,
  trialing_orgs bigint,
  past_due_orgs bigint,
  suspended_orgs bigint,
  demo_orgs bigint,
  total_active_users bigint,
  trials_expiring_7d bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.organizations),
    (SELECT count(*) FROM public.organization_subscriptions WHERE status = 'active'),
    (SELECT count(*) FROM public.organization_subscriptions WHERE status = 'trialing'),
    (SELECT count(*) FROM public.organization_subscriptions WHERE status = 'past_due'),
    (SELECT count(DISTINCT org_id) FROM public.org_suspensions WHERE reactivated_at IS NULL),
    (SELECT count(*) FROM public.demo_orgs WHERE torn_down_at IS NULL),
    (SELECT count(*) FROM public.memberships WHERE status = 'active'),
    (SELECT count(*) FROM public.organization_subscriptions
      WHERE status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at BETWEEN now() AND now() + interval '7 days')
  WHERE public.is_platform_owner();
$$;
REVOKE ALL ON FUNCTION public.platform_overview_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.platform_overview_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_org_stats(_org uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _out jsonb;
BEGIN
  IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT jsonb_build_object(
    'members_active',  (SELECT count(*) FROM public.memberships WHERE org_id = _org AND status = 'active'),
    'deals',           (SELECT count(*) FROM public.deals WHERE org_id = _org),
    'contacts',        (SELECT count(*) FROM public.contacts WHERE org_id = _org),
    'companies',       (SELECT count(*) FROM public.companies WHERE org_id = _org),
    'invoices',        (SELECT count(*) FROM public.invoices WHERE org_id = _org),
    'invoices_total',  (SELECT COALESCE(sum(total),0) FROM public.invoices WHERE org_id = _org AND status IN ('sent','paid','partially_paid','overdue')),
    'products',        (SELECT count(*) FROM public.products WHERE org_id = _org),
    'employees',       (SELECT count(*) FROM public.employees WHERE org_id = _org),
    'agents',          (SELECT count(*) FROM public.ai_agents WHERE org_id = _org AND status <> 'archived'),
    'agent_runs_30d',  (SELECT count(*) FROM public.ai_agent_runs WHERE org_id = _org AND created_at > now() - interval '30 days'),
    'last_activity',   (SELECT max(created_at) FROM public.activities WHERE org_id = _org)
  ) INTO _out;
  RETURN _out;
END; $$;
REVOKE ALL ON FUNCTION public.platform_org_stats(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_org_stats(uuid) TO authenticated;

CREATE TRIGGER trg_custom_offerings_updated BEFORE UPDATE ON public.custom_offerings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_impersonation_requests_updated BEFORE UPDATE ON public.impersonation_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
