
-- ============== ENUMS ==============
CREATE TYPE public.account_type AS ENUM ('asset','liability','equity','revenue','expense','cogs');
CREATE TYPE public.journal_status AS ENUM ('draft','posted','reversed');
CREATE TYPE public.journal_source AS ENUM ('manual','invoice','payment','expense','vendor_bill','adjustment');

-- ============== CHART OF ACCOUNTS ==============
CREATE TABLE public.chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type public.account_type NOT NULL,
  parent_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  description TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_of_accounts TO authenticated;
GRANT ALL ON public.chart_of_accounts TO service_role;
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coa_select" ON public.chart_of_accounts FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "coa_insert" ON public.chart_of_accounts FOR INSERT TO authenticated WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]));
CREATE POLICY "coa_update" ON public.chart_of_accounts FOR UPDATE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]));
CREATE POLICY "coa_delete" ON public.chart_of_accounts FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]) AND is_system = false);
CREATE TRIGGER trg_coa_updated BEFORE UPDATE ON public.chart_of_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_coa_org ON public.chart_of_accounts(org_id);
CREATE INDEX idx_coa_type ON public.chart_of_accounts(org_id, account_type);

-- ============== FISCAL PERIODS ==============
CREATE TABLE public.fiscal_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_periods TO authenticated;
GRANT ALL ON public.fiscal_periods TO service_role;
ALTER TABLE public.fiscal_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fp_select" ON public.fiscal_periods FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "fp_write" ON public.fiscal_periods FOR ALL TO authenticated
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]));
CREATE TRIGGER trg_fp_updated BEFORE UPDATE ON public.fiscal_periods FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== JOURNAL ENTRIES ==============
CREATE TABLE public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_number TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference TEXT,
  memo TEXT,
  status public.journal_status NOT NULL DEFAULT 'draft',
  source public.journal_source NOT NULL DEFAULT 'manual',
  source_id UUID,
  currency TEXT NOT NULL DEFAULT 'USD',
  total_debit NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_credit NUMERIC(14,2) NOT NULL DEFAULT 0,
  posted_at TIMESTAMPTZ,
  posted_by UUID,
  reversed_by UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "je_select" ON public.journal_entries FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "je_insert" ON public.journal_entries FOR INSERT TO authenticated WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]));
CREATE POLICY "je_update" ON public.journal_entries FOR UPDATE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]));
CREATE POLICY "je_delete" ON public.journal_entries FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]) AND status = 'draft');
CREATE TRIGGER trg_je_updated BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_je_org_date ON public.journal_entries(org_id, entry_date DESC);
CREATE INDEX idx_je_source ON public.journal_entries(source, source_id);

-- ============== JOURNAL ENTRY LINES ==============
CREATE TABLE public.journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  debit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  memo TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entry_lines TO authenticated;
GRANT ALL ON public.journal_entry_lines TO service_role;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jel_select" ON public.journal_entry_lines FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "jel_write" ON public.journal_entry_lines FOR ALL TO authenticated
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]));
CREATE INDEX idx_jel_entry ON public.journal_entry_lines(journal_entry_id);
CREATE INDEX idx_jel_account ON public.journal_entry_lines(account_id);

-- ============== ACCOUNT BALANCES ==============
CREATE TABLE public.account_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE CASCADE,
  period_id UUID REFERENCES public.fiscal_periods(id) ON DELETE SET NULL,
  debit_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, period_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_balances TO authenticated;
GRANT ALL ON public.account_balances TO service_role;
ALTER TABLE public.account_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ab_select" ON public.account_balances FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "ab_write" ON public.account_balances FOR ALL TO authenticated
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]));

-- ============== ACCOUNTING SETTINGS ==============
CREATE TABLE public.accounting_settings (
  org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  default_ar_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  default_ap_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  default_cash_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  default_revenue_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  default_tax_payable_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  default_expense_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  default_cogs_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  auto_post_invoices BOOLEAN NOT NULL DEFAULT false,
  auto_post_payments BOOLEAN NOT NULL DEFAULT false,
  auto_post_expenses BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_settings TO authenticated;
GRANT ALL ON public.accounting_settings TO service_role;
ALTER TABLE public.accounting_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "as_select" ON public.accounting_settings FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "as_write" ON public.accounting_settings FOR ALL TO authenticated
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]));
CREATE TRIGGER trg_as_updated BEFORE UPDATE ON public.accounting_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== JOURNAL DOC NUMBER ==============
ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'journal';
