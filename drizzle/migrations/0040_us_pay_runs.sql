-- US pay runs: W-4 and deduction fields on payroll profiles, pay runs with one line per employee,
-- and two steps that write to the ledger: approve (wages, taxes owed, net pay owed) and mark paid
-- (net pay out of cash). Taxes are worked out in the app (src/lib/payroll/us.ts) while the run is
-- a draft; once approved the lines are locked. No tax filing, no money moves.

-- 1. W-4 and deductions per employee.
ALTER TABLE public.payroll_profiles
  ADD COLUMN IF NOT EXISTS filing_status text NOT NULL DEFAULT 'single'
    CHECK (filing_status IN ('single', 'married_jointly', 'head_of_household')),
  ADD COLUMN IF NOT EXISTS w4_step2 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS w4_dependents numeric(12,2) NOT NULL DEFAULT 0 CHECK (w4_dependents >= 0),
  ADD COLUMN IF NOT EXISTS w4_other_income numeric(12,2) NOT NULL DEFAULT 0 CHECK (w4_other_income >= 0),
  ADD COLUMN IF NOT EXISTS w4_deductions numeric(12,2) NOT NULL DEFAULT 0 CHECK (w4_deductions >= 0),
  ADD COLUMN IF NOT EXISTS w4_extra_withholding numeric(12,2) NOT NULL DEFAULT 0 CHECK (w4_extra_withholding >= 0),
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS state_tax_rate numeric(6,3) NOT NULL DEFAULT 0 CHECK (state_tax_rate BETWEEN 0 AND 20),
  ADD COLUMN IF NOT EXISTS retirement_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (retirement_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS health_deduction numeric(12,2) NOT NULL DEFAULT 0 CHECK (health_deduction >= 0);

-- 2. Pay runs and their lines.
CREATE TABLE IF NOT EXISTS public.pay_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  pay_date date NOT NULL,
  pay_frequency text NOT NULL DEFAULT 'biweekly' CHECK (pay_frequency IN ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  payment_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  approved_by uuid, approved_at timestamptz,
  paid_by uuid, paid_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_pay_runs_org ON public.pay_runs(org_id, pay_date DESC);

CREATE TABLE IF NOT EXISTS public.pay_run_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pay_run_id uuid NOT NULL REFERENCES public.pay_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  hours numeric(8,2),
  gross numeric(14,2) NOT NULL DEFAULT 0 CHECK (gross >= 0),
  retirement numeric(14,2) NOT NULL DEFAULT 0 CHECK (retirement >= 0),
  health numeric(14,2) NOT NULL DEFAULT 0 CHECK (health >= 0),
  federal_tax numeric(14,2) NOT NULL DEFAULT 0 CHECK (federal_tax >= 0),
  social_security numeric(14,2) NOT NULL DEFAULT 0 CHECK (social_security >= 0),
  medicare numeric(14,2) NOT NULL DEFAULT 0 CHECK (medicare >= 0),
  state_tax numeric(14,2) NOT NULL DEFAULT 0 CHECK (state_tax >= 0),
  net numeric(14,2) NOT NULL DEFAULT 0 CHECK (net >= 0),
  employer_social_security numeric(14,2) NOT NULL DEFAULT 0 CHECK (employer_social_security >= 0),
  employer_medicare numeric(14,2) NOT NULL DEFAULT 0 CHECK (employer_medicare >= 0),
  futa numeric(14,2) NOT NULL DEFAULT 0 CHECK (futa >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pay_run_id, employee_id),
  -- Gross pay always splits exactly into net pay, deductions and the employee's taxes.
  CHECK (gross = net + retirement + health + federal_tax + social_security + medicare + state_tax)
);
CREATE INDEX IF NOT EXISTS idx_pay_run_lines_run ON public.pay_run_lines(pay_run_id);
CREATE INDEX IF NOT EXISTS idx_pay_run_lines_employee ON public.pay_run_lines(employee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pay_runs, public.pay_run_lines TO authenticated;
GRANT ALL ON public.pay_runs, public.pay_run_lines TO service_role;
ALTER TABLE public.pay_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_run_lines ENABLE ROW LEVEL SECURITY;

-- HR (owners, admins, HR managers) only. Drafts can be edited or deleted; approving and paying go
-- through the functions below, so a run's status can't be changed by a direct update.
DROP POLICY IF EXISTS pay_runs_select ON public.pay_runs;
CREATE POLICY pay_runs_select ON public.pay_runs FOR SELECT TO authenticated USING (public.has_hr_access(org_id));
DROP POLICY IF EXISTS pay_runs_insert ON public.pay_runs;
CREATE POLICY pay_runs_insert ON public.pay_runs FOR INSERT TO authenticated
  WITH CHECK (public.has_hr_access(org_id) AND status = 'draft');
DROP POLICY IF EXISTS pay_runs_update ON public.pay_runs;
CREATE POLICY pay_runs_update ON public.pay_runs FOR UPDATE TO authenticated
  USING (public.has_hr_access(org_id) AND status = 'draft') WITH CHECK (public.has_hr_access(org_id) AND status = 'draft');
DROP POLICY IF EXISTS pay_runs_delete ON public.pay_runs;
CREATE POLICY pay_runs_delete ON public.pay_runs FOR DELETE TO authenticated
  USING (public.has_hr_access(org_id) AND status = 'draft');

DROP POLICY IF EXISTS pay_run_lines_select ON public.pay_run_lines;
CREATE POLICY pay_run_lines_select ON public.pay_run_lines FOR SELECT TO authenticated USING (public.has_hr_access(org_id));
DROP POLICY IF EXISTS pay_run_lines_write ON public.pay_run_lines;
CREATE POLICY pay_run_lines_write ON public.pay_run_lines FOR ALL TO authenticated
  USING (public.has_hr_access(org_id) AND EXISTS (SELECT 1 FROM public.pay_runs r WHERE r.id = pay_run_id AND r.org_id = pay_run_lines.org_id AND r.status = 'draft'))
  WITH CHECK (public.has_hr_access(org_id) AND EXISTS (SELECT 1 FROM public.pay_runs r WHERE r.id = pay_run_id AND r.org_id = pay_run_lines.org_id AND r.status = 'draft'));

DROP TRIGGER IF EXISTS trg_pay_runs_updated ON public.pay_runs;
CREATE TRIGGER trg_pay_runs_updated BEFORE UPDATE ON public.pay_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. A payroll account, found by name or added to the chart of accounts.
CREATE OR REPLACE FUNCTION public.payroll_account(_org uuid, _code text, _name text, _type public.account_type)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  SELECT id INTO _id FROM public.chart_of_accounts WHERE org_id = _org AND lower(name) = lower(_name) LIMIT 1;
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  IF EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE org_id = _org AND code = _code) THEN _code := _code || '-PAY'; END IF;
  INSERT INTO public.chart_of_accounts (org_id, code, name, account_type, is_system)
  VALUES (_org, _code, _name, _type, false) RETURNING id INTO _id;
  RETURN _id;
END; $$;
REVOKE ALL ON FUNCTION public.payroll_account(uuid, text, text, public.account_type) FROM PUBLIC, anon, authenticated;

-- 4. Approve: lock the lines and record the cost.
--   Dr Wages and Salaries (gross)      Dr Payroll Tax Expense (employer taxes)
--   Cr Payroll Taxes Payable (employee + employer taxes)
--   Cr Benefits and Retirement Payable (401(k) and health)   Cr Wages Payable (net pay)
CREATE OR REPLACE FUNCTION public.approve_pay_run(_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.pay_runs%ROWTYPE; _t record; _je uuid; _pos int := 0;
BEGIN
  SELECT * INTO _r FROM public.pay_runs WHERE id = _id FOR UPDATE;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'Pay run not found'; END IF;
  IF NOT public.has_hr_access(_r.org_id) THEN
    RAISE EXCEPTION 'Only owners, admins and HR managers can approve pay runs' USING ERRCODE = '42501';
  END IF;
  IF _r.status <> 'draft' THEN RAISE EXCEPTION 'This pay run is already approved' USING ERRCODE = 'P0001'; END IF;

  SELECT count(*) AS n, COALESCE(sum(gross), 0) AS gross, COALESCE(sum(retirement + health), 0) AS deductions,
         COALESCE(sum(federal_tax + social_security + medicare + state_tax), 0) AS employee_taxes,
         COALESCE(sum(employer_social_security + employer_medicare + futa), 0) AS employer_taxes,
         COALESCE(sum(net), 0) AS net
    INTO _t FROM public.pay_run_lines WHERE pay_run_id = _id;
  IF _t.n = 0 OR _t.gross <= 0 THEN RAISE EXCEPTION 'Add at least one employee with pay before approving' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO public.journal_entries (org_id, entry_date, reference, memo, status, source, source_id, currency, created_by)
  VALUES (_r.org_id, _r.pay_date, 'PAYROLL ' || to_char(_r.pay_date, 'YYYY-MM-DD'),
          'Payroll ' || to_char(_r.period_start, 'Mon DD') || ' – ' || to_char(_r.period_end, 'Mon DD, YYYY'),
          'draft', 'manual', _r.id, _r.currency, auth.uid())
  RETURNING id INTO _je;

  INSERT INTO public.journal_entry_lines (org_id, journal_entry_id, account_id, debit, credit, memo, position)
  SELECT _r.org_id, _je, public.payroll_account(_r.org_id, l.code, l.name, l.kind::public.account_type), l.dr, l.cr, l.name, l.pos
  FROM (VALUES
    ('6500', 'Wages and Salaries', 'expense', _t.gross, 0::numeric, 1),
    ('6510', 'Payroll Tax Expense', 'expense', _t.employer_taxes, 0, 2),
    ('2200', 'Payroll Taxes Payable', 'liability', 0, _t.employee_taxes + _t.employer_taxes, 3),
    ('2210', 'Benefits and Retirement Payable', 'liability', 0, _t.deductions, 4),
    ('2220', 'Wages Payable', 'liability', 0, _t.net, 5)
  ) AS l(code, name, kind, dr, cr, pos)
  WHERE l.dr > 0 OR l.cr > 0;

  -- Posts when the approver may post journals (owner, admin, accountant); otherwise it waits as a draft.
  BEGIN PERFORM public.post_journal_entry(_je); EXCEPTION WHEN OTHERS THEN NULL; END;

  UPDATE public.pay_runs SET status = 'approved', approved_by = auth.uid(), approved_at = now(), journal_entry_id = _je
  WHERE id = _id;
  RETURN _je;
END; $$;

-- 5. Mark paid: Dr Wages Payable / Cr Cash for the net pay.
CREATE OR REPLACE FUNCTION public.mark_pay_run_paid(_id uuid, _paid_on date DEFAULT CURRENT_DATE)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.pay_runs%ROWTYPE; _net numeric; _cash uuid; _je uuid;
BEGIN
  SELECT * INTO _r FROM public.pay_runs WHERE id = _id FOR UPDATE;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'Pay run not found'; END IF;
  IF NOT public.has_hr_access(_r.org_id) THEN
    RAISE EXCEPTION 'Only owners, admins and HR managers can mark pay runs paid' USING ERRCODE = '42501';
  END IF;
  IF _r.status <> 'approved' THEN RAISE EXCEPTION 'Approve the pay run before marking it paid' USING ERRCODE = 'P0001'; END IF;

  SELECT COALESCE(sum(net), 0) INTO _net FROM public.pay_run_lines WHERE pay_run_id = _id;
  SELECT default_cash_account_id INTO _cash FROM public.accounting_settings WHERE org_id = _r.org_id;
  _cash := COALESCE(_cash, public.payroll_account(_r.org_id, '1000', 'Cash', 'asset'));

  IF _net > 0 THEN
    INSERT INTO public.journal_entries (org_id, entry_date, reference, memo, status, source, source_id, currency, created_by)
    VALUES (_r.org_id, COALESCE(_paid_on, CURRENT_DATE), 'PAYROLL ' || to_char(_r.pay_date, 'YYYY-MM-DD'),
            'Net pay paid for ' || to_char(_r.period_start, 'Mon DD') || ' – ' || to_char(_r.period_end, 'Mon DD, YYYY'),
            'draft', 'manual', _r.id, _r.currency, auth.uid())
    RETURNING id INTO _je;
    INSERT INTO public.journal_entry_lines (org_id, journal_entry_id, account_id, debit, credit, memo, position) VALUES
      (_r.org_id, _je, public.payroll_account(_r.org_id, '2220', 'Wages Payable', 'liability'), _net, 0, 'Wages Payable', 1),
      (_r.org_id, _je, _cash, 0, _net, 'Cash', 2);
    BEGIN PERFORM public.post_journal_entry(_je); EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  UPDATE public.pay_runs SET status = 'paid', paid_by = auth.uid(), paid_at = now(), payment_entry_id = _je WHERE id = _id;
  RETURN _je;
END; $$;

REVOKE ALL ON FUNCTION public.approve_pay_run(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_pay_run_paid(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_pay_run(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pay_run_paid(uuid, date) TO authenticated;
