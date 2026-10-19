-- 1. Each person can hide modules they never use from their own sidebar (Settings › My sidebar).
-- 2. Startup eligibility: the workspace's employee and yearly revenue bands, asked at sign-up and in
--    Settings › Organization. Startup is for 15 or fewer employees OR under $100,000 a year.
-- 3. Sponsor offers: partner offers the platform owner manages, shown only to workspaces whose plan
--    allows them (plan limit sponsor_offers), and only on the dashboard. No workspace data is
--    stored with an offer or sent anywhere: an offer is a title, a line of text and a link.
-- 4. inbox_approvals: what the assistant, AI apps and agents asked to do, from both tables in one
--    list; attention_counts: the sidebar badges (approvals waiting, unassigned tickets) in one call
--    instead of three every minute.
-- 5. dashboard_overview (from 0046) also counts quotes, sent quotes, invoices and payments, for the
--    "Your first sale" checklist on the dashboard.
-- Safe to run more than once.

-- 1 ---------------------------------------------------------------------------------------------
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS hidden_modules text[] NOT NULL DEFAULT '{}';

-- 2 ---------------------------------------------------------------------------------------------
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS employee_band text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS revenue_band text;
DO $$ BEGIN
  ALTER TABLE public.organizations ADD CONSTRAINT organizations_employee_band_check
    CHECK (employee_band IS NULL OR employee_band IN ('1-15', '16-50', '51-200', '201+'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.organizations ADD CONSTRAINT organizations_revenue_band_check
    CHECK (revenue_band IS NULL OR revenue_band IN ('under-100k', '100k-1m', '1m-10m', 'over-10m'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3 ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sponsor_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 200),
  url text NOT NULL CHECK (url ~ '^https://'),
  category text NOT NULL DEFAULT 'tools',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sponsor_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sponsor_offers_read ON public.sponsor_offers;
CREATE POLICY sponsor_offers_read ON public.sponsor_offers FOR SELECT TO authenticated
  USING (is_active OR public.is_platform_owner());
DROP POLICY IF EXISTS sponsor_offers_write ON public.sponsor_offers;
CREATE POLICY sponsor_offers_write ON public.sponsor_offers FOR ALL TO authenticated
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsor_offers TO authenticated;

-- 4 ---------------------------------------------------------------------------------------------
-- security_invoker: each table's own row-level security still decides what a person sees.
CREATE OR REPLACE VIEW public.inbox_approvals WITH (security_invoker = true) AS
SELECT 'assistant'::text AS source, p.id, p.org_id, p.action_key AS action, p.title, p.summary,
       p.entity_type, p.entity_id::text AS entity_id, p.payload, NULL::uuid AS agent_id,
       p.status::text AS status, (p.status::text = 'pending') AS waiting, p.error, p.created_at
  FROM public.ai_proposed_actions p
UNION ALL
SELECT 'agent'::text, a.id, a.org_id, a.action_type, a.action_type, NULL,
       a.target_entity_type, a.target_entity_id::text, a.proposed_changes_json, a.agent_id,
       a.status::text, (a.status::text = 'pending_approval'), a.error_message, a.created_at
  FROM public.ai_agent_actions a;
GRANT SELECT ON public.inbox_approvals TO authenticated;

CREATE OR REPLACE FUNCTION public.attention_counts(_org uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'approvals', (SELECT count(*) FROM public.inbox_approvals WHERE org_id = _org AND waiting),
    'support', (SELECT count(*) FROM public.support_tickets WHERE org_id = _org AND status = 'open' AND assignee_id IS NULL));
$$;
REVOKE ALL ON FUNCTION public.attention_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attention_counts(uuid) TO authenticated, service_role;

-- 5 ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_overview(_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN public.dashboard_summary(_org) || jsonb_build_object(
    'stages', public.module_summary(_org, 'crm')->'stages',
    'recentActs', (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb) FROM (
        SELECT id, type, title, completed, created_at FROM activities WHERE org_id = _org ORDER BY created_at DESC LIMIT 5) a),
    'recentPayments', (SELECT COALESCE(jsonb_agg(x ORDER BY x->>'payment_date' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id', p.id, 'amount', p.amount, 'currency', p.currency, 'payment_date', p.payment_date,
                 'invoices', CASE WHEN i.id IS NULL THEN NULL ELSE jsonb_build_object('id', i.id, 'number', i.number,
                   'companies', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('name', c.name) END) END) AS x
          FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id LEFT JOIN companies c ON c.id = i.company_id
         WHERE p.org_id = _org ORDER BY p.payment_date DESC LIMIT 5) r),
    'recentPOs', (SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id', po.id, 'po_number', po.po_number, 'total', po.total, 'status', po.status, 'created_at', po.created_at,
                 'suppliers', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('name', s.name) END) AS x
          FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
         WHERE po.org_id = _org ORDER BY po.created_at DESC LIMIT 5) r),
    'setup', jsonb_build_object(
      'details', (SELECT COALESCE(email, '') <> '' OR COALESCE(address, '') <> '' OR COALESCE(phone, '') <> '' FROM organizations WHERE id = _org),
      'members', (SELECT count(*) FROM memberships WHERE org_id = _org AND status IN ('active', 'invited')),
      'companies', (SELECT count(*) FROM companies WHERE org_id = _org),
      'apps', (SELECT count(*) FROM mcp_connections WHERE org_id = _org AND revoked_at IS NULL)
            + (SELECT count(*) FROM personal_api_keys WHERE org_id = _org AND revoked_at IS NULL),
      -- Your first sale: customer, quote, sent, invoice, payment.
      'quotes', (SELECT count(*) FROM quotes WHERE org_id = _org),
      'sentQuotes', (SELECT count(*) FROM quotes WHERE org_id = _org AND status IN ('sent', 'accepted', 'converted')),
      'invoices', (SELECT count(*) FROM invoices WHERE org_id = _org),
      'payments', (SELECT count(*) FROM payments WHERE org_id = _org)));
END $$;
REVOKE ALL ON FUNCTION public.dashboard_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_overview(uuid) TO authenticated, service_role;
