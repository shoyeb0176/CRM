-- ============================================================
-- Inuberry ERP — RLS & Security Hardening Pass
-- ============================================================

-- ------------------------------------------------------------
-- 1. New helper: has_permission(org, permission_key)
--    Maps coarse module permissions to the existing role enum,
--    so app code & future policies don't hard-code role lists.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_permission(_org uuid, _key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.has_permission(uuid, text) IS
'Maps a logical permission key to the role enum. Use in app code and new RLS policies to avoid hard-coding role arrays.';

-- ------------------------------------------------------------
-- 2. Fix usage_limits: had only a SELECT policy. Restrict
--    write to platform owners (mutations are service-role
--    side, but lock down the Data API surface anyway).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Platform owners manage usage limits" ON public.usage_limits;
CREATE POLICY "Platform owners manage usage limits"
  ON public.usage_limits
  FOR ALL TO authenticated
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

-- ------------------------------------------------------------
-- 3. Lock down EXECUTE on SECURITY DEFINER functions.
--    Strategy:
--      - Revoke EXECUTE from PUBLIC and anon on every SECURITY
--        DEFINER helper (linter findings 0028, 0029).
--      - Re-grant to authenticated ONLY for functions the app
--        actually calls from client code; policy helpers stay
--        invisible to the Data API (they still run inside
--        policies because policy evaluation isn't gated by
--        EXECUTE).
-- ------------------------------------------------------------

-- Policy / internal helpers — revoke from anon AND authenticated.
-- They are only ever called from inside RLS policies or other
-- SECURITY DEFINER functions, which bypass EXECUTE checks.
DO $$
DECLARE
  fn text;
  internal_helpers text[] := ARRAY[
    'is_org_member(uuid)',
    'has_org_role(uuid, app_role[])',
    'is_platform_owner()',
    'has_hr_access(uuid)',
    'has_permission(uuid, text)',
    'is_portal_user_of_company(uuid, uuid)',
    'current_portal_user(uuid)',
    'portal_user_company(uuid)',
    'my_portal_orgs()',
    'org_has_module(uuid, text)',
    'org_within_user_limit(uuid)',
    'handle_new_user()',
    'set_updated_at()',
    'compute_line_amounts()',
    'compute_expense_total()',
    'trg_recalc_so()',
    'trg_recalc_invoice()',
    'trg_recalc_quote()',
    'trg_recalc_po()',
    'trg_recalc_vendor_bill()',
    'trg_recalc_je()',
    'recalc_sales_order_totals(uuid)',
    'recalc_invoice_totals(uuid)',
    'recalc_quote_totals(uuid)',
    'recalc_po_totals(uuid)',
    'recalc_vendor_bill_totals(uuid)',
    'recalc_journal_entry_totals(uuid)',
    'auto_post_invoice()',
    'auto_post_payment()',
    'auto_post_expense()',
    'seed_default_warehouse(uuid)',
    'seed_default_deal_stages(uuid)',
    'seed_default_coa(uuid)',
    'mark_overdue_vendor_bills(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_helpers LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'skip missing fn %', fn;
    END;
  END LOOP;
END $$;

-- App-callable RPCs — revoke from PUBLIC/anon, grant to authenticated.
-- These are the only SECURITY DEFINER functions client code may invoke.
DO $$
DECLARE
  fn text;
  app_rpcs text[] := ARRAY[
    'next_doc_number(uuid, doc_type)',
    'post_journal_entry(uuid)',
    'reverse_journal_entry(uuid, text)',
    'receive_purchase_order(uuid, text)',
    'convert_po_to_bill(uuid)',
    'apply_inventory_adjustment(uuid, uuid, uuid, uuid, numeric, text, text)'
  ];
BEGIN
  FOREACH fn IN ARRAY app_rpcs LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'skip missing fn %', fn;
    END;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 4. Documentation: confirm the two intentional public reads
--    so future audits don't flag them.
-- ------------------------------------------------------------
COMMENT ON POLICY "Anyone can view plans" ON public.subscription_plans IS
'Intentional: marketing /pricing page must list plans without auth.';

-- ------------------------------------------------------------
-- 5. Ensure default-deny on usage_limits writes by removing
--    any legacy permissive grants (belt-and-braces).
-- ------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.usage_limits FROM anon;
GRANT  INSERT, UPDATE, DELETE ON public.usage_limits TO authenticated;
GRANT  ALL ON public.usage_limits TO service_role;