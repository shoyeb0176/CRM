
-- ============== Enums ==============
DO $$ BEGIN
  CREATE TYPE public.portal_user_status AS ENUM ('invited','active','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.support_ticket_status AS ENUM ('open','pending','in_progress','resolved','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.support_ticket_priority AS ENUM ('low','normal','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.quote_customer_action AS ENUM ('accept','reject','comment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============== customer_portal_users ==============
CREATE TABLE IF NOT EXISTS public.customer_portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  status public.portal_user_status NOT NULL DEFAULT 'invited',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  last_login_at TIMESTAMPTZ,
  invited_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, email),
  UNIQUE(org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cpu_user ON public.customer_portal_users(user_id);
CREATE INDEX IF NOT EXISTS idx_cpu_org_company ON public.customer_portal_users(org_id, company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_portal_users TO authenticated;
GRANT ALL ON public.customer_portal_users TO service_role;
ALTER TABLE public.customer_portal_users ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_cpu_updated BEFORE UPDATE ON public.customer_portal_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== customer_portal_access (per-resource overrides) ==============
CREATE TABLE IF NOT EXISTS public.customer_portal_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portal_user_id UUID NOT NULL REFERENCES public.customer_portal_users(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('invoice','quote','project','company_all')),
  resource_id UUID,
  granted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cpa_lookup ON public.customer_portal_access(portal_user_id, resource_type, resource_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_portal_access TO authenticated;
GRANT ALL ON public.customer_portal_access TO service_role;
ALTER TABLE public.customer_portal_access ENABLE ROW LEVEL SECURITY;

-- ============== support_tickets ==============
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ticket_number TEXT,
  subject TEXT NOT NULL,
  description TEXT,
  status public.support_ticket_status NOT NULL DEFAULT 'open',
  priority public.support_ticket_priority NOT NULL DEFAULT 'normal',
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  portal_user_id UUID REFERENCES public.customer_portal_users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_portal_user_id UUID REFERENCES public.customer_portal_users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_st_org ON public.support_tickets(org_id);
CREATE INDEX IF NOT EXISTS idx_st_company ON public.support_tickets(org_id, company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_st_updated BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== support_ticket_messages ==============
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_portal_user_id UUID REFERENCES public.customer_portal_users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stm_ticket ON public.support_ticket_messages(ticket_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- ============== quote_customer_actions ==============
CREATE TABLE IF NOT EXISTS public.quote_customer_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  portal_user_id UUID REFERENCES public.customer_portal_users(id) ON DELETE SET NULL,
  action public.quote_customer_action NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qca_quote ON public.quote_customer_actions(quote_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_customer_actions TO authenticated;
GRANT ALL ON public.quote_customer_actions TO service_role;
ALTER TABLE public.quote_customer_actions ENABLE ROW LEVEL SECURITY;

-- ============== Project task customer visibility ==============
ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS customer_visible BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.milestones ADD COLUMN IF NOT EXISTS customer_visible BOOLEAN NOT NULL DEFAULT true;

-- ============== Helper functions ==============
CREATE OR REPLACE FUNCTION public.current_portal_user(_org uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.customer_portal_users
  WHERE org_id = _org AND user_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.portal_user_company(_org uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.customer_portal_users
  WHERE org_id = _org AND user_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_portal_user_of_company(_org uuid, _company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _company IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.customer_portal_users
    WHERE org_id = _org AND user_id = auth.uid() AND status = 'active' AND company_id = _company
  );
$$;

CREATE OR REPLACE FUNCTION public.my_portal_orgs()
RETURNS TABLE(org_id uuid, company_id uuid, portal_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id, company_id, id FROM public.customer_portal_users
   WHERE user_id = auth.uid() AND status = 'active';
$$;

-- ============== RLS: customer_portal_users ==============
CREATE POLICY "Org admins manage portal users"
  ON public.customer_portal_users FOR ALL TO authenticated
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager']::app_role[]));

CREATE POLICY "Portal user reads own record"
  ON public.customer_portal_users FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============== RLS: customer_portal_access ==============
CREATE POLICY "Org admins manage portal access"
  ON public.customer_portal_access FOR ALL TO authenticated
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager']::app_role[]));

CREATE POLICY "Portal user reads own access"
  ON public.customer_portal_access FOR SELECT TO authenticated
  USING (portal_user_id = public.current_portal_user(org_id));

-- ============== RLS: support_tickets ==============
CREATE POLICY "Org members read tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Org staff manage tickets"
  ON public.support_tickets FOR ALL TO authenticated
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager','staff']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager','staff']::app_role[]));

CREATE POLICY "Portal user reads own tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (public.is_portal_user_of_company(org_id, company_id));

CREATE POLICY "Portal user creates ticket"
  ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (
    public.is_portal_user_of_company(org_id, company_id)
    AND created_by_portal_user_id = public.current_portal_user(org_id)
  );

CREATE POLICY "Portal user updates own ticket (limited)"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.is_portal_user_of_company(org_id, company_id)
         AND created_by_portal_user_id = public.current_portal_user(org_id))
  WITH CHECK (public.is_portal_user_of_company(org_id, company_id));

-- ============== RLS: support_ticket_messages ==============
CREATE POLICY "Org members read all ticket messages"
  ON public.support_ticket_messages FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Org staff write ticket messages"
  ON public.support_ticket_messages FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager','staff']::app_role[]));

CREATE POLICY "Portal user reads non-internal messages on own tickets"
  ON public.support_ticket_messages FOR SELECT TO authenticated
  USING (
    NOT is_internal
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
       WHERE t.id = support_ticket_messages.ticket_id
         AND public.is_portal_user_of_company(t.org_id, t.company_id)
    )
  );

CREATE POLICY "Portal user replies to own ticket"
  ON public.support_ticket_messages FOR INSERT TO authenticated
  WITH CHECK (
    NOT is_internal
    AND author_portal_user_id = public.current_portal_user(org_id)
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
       WHERE t.id = ticket_id
         AND public.is_portal_user_of_company(t.org_id, t.company_id)
    )
  );

-- ============== RLS: quote_customer_actions ==============
CREATE POLICY "Org members read quote actions"
  ON public.quote_customer_actions FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Portal user reads quote actions for own company"
  ON public.quote_customer_actions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quotes q WHERE q.id = quote_id
      AND public.is_portal_user_of_company(q.org_id, q.company_id)
  ));

CREATE POLICY "Portal user inserts quote action"
  ON public.quote_customer_actions FOR INSERT TO authenticated
  WITH CHECK (
    portal_user_id = public.current_portal_user(org_id)
    AND EXISTS (
      SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.org_id = quote_customer_actions.org_id
        AND public.is_portal_user_of_company(q.org_id, q.company_id)
    )
  );

-- ============== Extra portal SELECT policies on existing tables ==============
CREATE POLICY "Portal user reads own invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (public.is_portal_user_of_company(org_id, company_id));

CREATE POLICY "Portal user reads invoice items"
  ON public.invoice_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i WHERE i.id = invoice_id
      AND public.is_portal_user_of_company(i.org_id, i.company_id)
  ));

CREATE POLICY "Portal user reads own quotes"
  ON public.quotes FOR SELECT TO authenticated
  USING (public.is_portal_user_of_company(org_id, company_id));

CREATE POLICY "Portal user reads quote items"
  ON public.quote_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quotes q WHERE q.id = quote_id
      AND public.is_portal_user_of_company(q.org_id, q.company_id)
  ));

CREATE POLICY "Portal user reads own projects"
  ON public.projects FOR SELECT TO authenticated
  USING (public.is_portal_user_of_company(org_id, customer_company_id));

CREATE POLICY "Portal user reads customer-visible milestones"
  ON public.milestones FOR SELECT TO authenticated
  USING (
    customer_visible
    AND EXISTS (
      SELECT 1 FROM public.projects p WHERE p.id = project_id
        AND public.is_portal_user_of_company(p.org_id, p.customer_company_id)
    )
  );

CREATE POLICY "Portal user reads customer-visible tasks"
  ON public.project_tasks FOR SELECT TO authenticated
  USING (
    customer_visible
    AND EXISTS (
      SELECT 1 FROM public.projects p WHERE p.id = project_id
        AND public.is_portal_user_of_company(p.org_id, p.customer_company_id)
    )
  );

CREATE POLICY "Portal user reads own company"
  ON public.companies FOR SELECT TO authenticated
  USING (public.is_portal_user_of_company(org_id, id));

CREATE POLICY "Portal user reads payments on own invoices"
  ON public.payments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i WHERE i.id = invoice_id
      AND public.is_portal_user_of_company(i.org_id, i.company_id)
  ));

-- Allow portal user to read minimal organization branding
CREATE POLICY "Portal user reads org branding"
  ON public.organizations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.customer_portal_users cpu
     WHERE cpu.org_id = organizations.id AND cpu.user_id = auth.uid() AND cpu.status = 'active'
  ));
