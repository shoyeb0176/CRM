
-- Seed default chart of accounts and accounting settings for an organization
CREATE OR REPLACE FUNCTION public.seed_default_coa(_org UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ar UUID; _ap UUID; _cash UUID; _rev UUID; _tax UUID; _exp UUID; _cogs UUID; _eq UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE org_id = _org) THEN
    -- ensure settings row exists
    INSERT INTO public.accounting_settings(org_id) VALUES (_org) ON CONFLICT DO NOTHING;
    RETURN;
  END IF;

  INSERT INTO public.chart_of_accounts(org_id, code, name, account_type, is_system) VALUES
    (_org, '1000', 'Cash',                 'asset',     true) RETURNING id INTO _cash;
  INSERT INTO public.chart_of_accounts(org_id, code, name, account_type, is_system) VALUES
    (_org, '1100', 'Accounts Receivable',  'asset',     true) RETURNING id INTO _ar;
  INSERT INTO public.chart_of_accounts(org_id, code, name, account_type, is_system) VALUES
    (_org, '1200', 'Inventory',            'asset',     true);
  INSERT INTO public.chart_of_accounts(org_id, code, name, account_type, is_system) VALUES
    (_org, '2000', 'Accounts Payable',     'liability', true) RETURNING id INTO _ap;
  INSERT INTO public.chart_of_accounts(org_id, code, name, account_type, is_system) VALUES
    (_org, '2100', 'Tax Payable',          'liability', true) RETURNING id INTO _tax;
  INSERT INTO public.chart_of_accounts(org_id, code, name, account_type, is_system) VALUES
    (_org, '3000', 'Owner''s Equity',      'equity',    true) RETURNING id INTO _eq;
  INSERT INTO public.chart_of_accounts(org_id, code, name, account_type, is_system) VALUES
    (_org, '3100', 'Retained Earnings',    'equity',    true);
  INSERT INTO public.chart_of_accounts(org_id, code, name, account_type, is_system) VALUES
    (_org, '4000', 'Sales Revenue',        'revenue',   true) RETURNING id INTO _rev;
  INSERT INTO public.chart_of_accounts(org_id, code, name, account_type, is_system) VALUES
    (_org, '5000', 'Cost of Goods Sold',   'cogs',      true) RETURNING id INTO _cogs;
  INSERT INTO public.chart_of_accounts(org_id, code, name, account_type, is_system) VALUES
    (_org, '6000', 'General Expenses',     'expense',   true) RETURNING id INTO _exp;
  INSERT INTO public.chart_of_accounts(org_id, code, name, account_type, is_system) VALUES
    (_org, '6100', 'Office Expenses',      'expense',   false);
  INSERT INTO public.chart_of_accounts(org_id, code, name, account_type, is_system) VALUES
    (_org, '6200', 'Travel & Meals',       'expense',   false);

  INSERT INTO public.accounting_settings(
    org_id, default_ar_account_id, default_ap_account_id, default_cash_account_id,
    default_revenue_account_id, default_tax_payable_account_id,
    default_expense_account_id, default_cogs_account_id,
    auto_post_invoices, auto_post_payments, auto_post_expenses
  ) VALUES (_org, _ar, _ap, _cash, _rev, _tax, _exp, _cogs, true, true, true)
  ON CONFLICT (org_id) DO UPDATE SET
    default_ar_account_id      = COALESCE(public.accounting_settings.default_ar_account_id, EXCLUDED.default_ar_account_id),
    default_ap_account_id      = COALESCE(public.accounting_settings.default_ap_account_id, EXCLUDED.default_ap_account_id),
    default_cash_account_id    = COALESCE(public.accounting_settings.default_cash_account_id, EXCLUDED.default_cash_account_id),
    default_revenue_account_id = COALESCE(public.accounting_settings.default_revenue_account_id, EXCLUDED.default_revenue_account_id),
    default_tax_payable_account_id = COALESCE(public.accounting_settings.default_tax_payable_account_id, EXCLUDED.default_tax_payable_account_id),
    default_expense_account_id = COALESCE(public.accounting_settings.default_expense_account_id, EXCLUDED.default_expense_account_id),
    default_cogs_account_id    = COALESCE(public.accounting_settings.default_cogs_account_id, EXCLUDED.default_cogs_account_id);
END;
$$;

-- Recalc totals on entry from its lines
CREATE OR REPLACE FUNCTION public.recalc_journal_entry_totals(_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d NUMERIC; _c NUMERIC;
BEGIN
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
    INTO _d, _c FROM public.journal_entry_lines WHERE journal_entry_id = _id;
  UPDATE public.journal_entries SET total_debit = _d, total_credit = _c WHERE id = _id;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_recalc_je()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN PERFORM public.recalc_journal_entry_totals(COALESCE(NEW.journal_entry_id, OLD.journal_entry_id)); RETURN NULL; END; $$;

CREATE TRIGGER trg_jel_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_je();

-- Post a journal entry (validate balanced)
CREATE OR REPLACE FUNCTION public.post_journal_entry(_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _je public.journal_entries%ROWTYPE; _line_count INT;
BEGIN
  SELECT * INTO _je FROM public.journal_entries WHERE id = _id;
  IF _je.id IS NULL THEN RAISE EXCEPTION 'Journal entry not found'; END IF;
  IF NOT public.has_org_role(_je.org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized to post journal entries';
  END IF;
  IF _je.status = 'posted' THEN RETURN; END IF;
  IF _je.status = 'reversed' THEN RAISE EXCEPTION 'Cannot post a reversed entry'; END IF;

  PERFORM public.recalc_journal_entry_totals(_id);
  SELECT COUNT(*) INTO _line_count FROM public.journal_entry_lines WHERE journal_entry_id = _id;
  IF _line_count < 2 THEN RAISE EXCEPTION 'Journal entry must have at least 2 lines'; END IF;

  SELECT * INTO _je FROM public.journal_entries WHERE id = _id;
  IF ROUND(_je.total_debit,2) <> ROUND(_je.total_credit,2) THEN
    RAISE EXCEPTION 'Journal entry not balanced: debit % vs credit %', _je.total_debit, _je.total_credit;
  END IF;
  IF _je.total_debit <= 0 THEN
    RAISE EXCEPTION 'Journal entry has zero value';
  END IF;

  UPDATE public.journal_entries
    SET status = 'posted', posted_at = now(), posted_by = auth.uid(),
        entry_number = COALESCE(entry_number, public.next_doc_number(_je.org_id, 'journal'))
    WHERE id = _id;
END; $$;

CREATE OR REPLACE FUNCTION public.reverse_journal_entry(_id UUID, _memo TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _je public.journal_entries%ROWTYPE; _new_id UUID;
BEGIN
  SELECT * INTO _je FROM public.journal_entries WHERE id = _id;
  IF _je.id IS NULL THEN RAISE EXCEPTION 'Journal entry not found'; END IF;
  IF NOT public.has_org_role(_je.org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _je.status <> 'posted' THEN RAISE EXCEPTION 'Only posted entries can be reversed'; END IF;

  INSERT INTO public.journal_entries(org_id, entry_date, reference, memo, status, source, source_id, currency, created_by)
  VALUES (_je.org_id, CURRENT_DATE, _je.reference, COALESCE(_memo, 'Reversal of ' || COALESCE(_je.entry_number, _je.id::text)),
          'draft', 'adjustment', _je.id, _je.currency, auth.uid())
  RETURNING id INTO _new_id;

  INSERT INTO public.journal_entry_lines(org_id, journal_entry_id, account_id, debit, credit, memo, position)
  SELECT org_id, _new_id, account_id, credit, debit, memo, position
    FROM public.journal_entry_lines WHERE journal_entry_id = _id;

  PERFORM public.post_journal_entry(_new_id);
  UPDATE public.journal_entries SET status = 'reversed', reversed_by = _new_id WHERE id = _id;
  RETURN _new_id;
END; $$;

-- ============== AUTO POSTING HOOKS ==============

-- INVOICES → AR / Revenue / Tax
CREATE OR REPLACE FUNCTION public.auto_post_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.accounting_settings%ROWTYPE;
  _je_id UUID;
  _net NUMERIC; _tax NUMERIC; _total NUMERIC;
BEGIN
  IF NEW.status NOT IN ('sent','partially_paid','paid','overdue') THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source='invoice' AND source_id=NEW.id) THEN RETURN NEW; END IF;

  SELECT * INTO _s FROM public.accounting_settings WHERE org_id = NEW.org_id;
  IF _s.org_id IS NULL OR NOT _s.auto_post_invoices THEN RETURN NEW; END IF;
  IF _s.default_ar_account_id IS NULL OR _s.default_revenue_account_id IS NULL THEN RETURN NEW; END IF;

  _total := COALESCE(NEW.total, 0);
  _tax   := COALESCE(NEW.tax_total, 0);
  _net   := _total - _tax;
  IF _total <= 0 THEN RETURN NEW; END IF;

  INSERT INTO public.journal_entries(org_id, entry_date, reference, memo, status, source, source_id, currency)
  VALUES (NEW.org_id, COALESCE(NEW.issue_date, CURRENT_DATE), NEW.invoice_number,
          'Auto: Invoice ' || COALESCE(NEW.invoice_number, NEW.id::text), 'draft', 'invoice', NEW.id, COALESCE(NEW.currency,'USD'))
  RETURNING id INTO _je_id;

  INSERT INTO public.journal_entry_lines(org_id, journal_entry_id, account_id, debit, credit, memo, position) VALUES
    (NEW.org_id, _je_id, _s.default_ar_account_id, _total, 0, 'AR', 1),
    (NEW.org_id, _je_id, _s.default_revenue_account_id, 0, _net, 'Revenue', 2);
  IF _tax > 0 AND _s.default_tax_payable_account_id IS NOT NULL THEN
    INSERT INTO public.journal_entry_lines(org_id, journal_entry_id, account_id, debit, credit, memo, position)
    VALUES (NEW.org_id, _je_id, _s.default_tax_payable_account_id, 0, _tax, 'Tax payable', 3);
  END IF;

  BEGIN PERFORM public.post_journal_entry(_je_id); EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_invoice_auto_post
AFTER UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.auto_post_invoice();

-- PAYMENTS → Cash / AR
CREATE OR REPLACE FUNCTION public.auto_post_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.accounting_settings%ROWTYPE; _je_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source='payment' AND source_id=NEW.id) THEN RETURN NEW; END IF;
  SELECT * INTO _s FROM public.accounting_settings WHERE org_id = NEW.org_id;
  IF _s.org_id IS NULL OR NOT _s.auto_post_payments THEN RETURN NEW; END IF;
  IF _s.default_cash_account_id IS NULL OR _s.default_ar_account_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.amount,0) <= 0 THEN RETURN NEW; END IF;

  INSERT INTO public.journal_entries(org_id, entry_date, reference, memo, status, source, source_id, currency)
  VALUES (NEW.org_id, COALESCE(NEW.payment_date, CURRENT_DATE), NEW.reference,
          'Auto: Payment ' || COALESCE(NEW.reference, NEW.id::text), 'draft', 'payment', NEW.id, COALESCE(NEW.currency,'USD'))
  RETURNING id INTO _je_id;

  INSERT INTO public.journal_entry_lines(org_id, journal_entry_id, account_id, debit, credit, memo, position) VALUES
    (NEW.org_id, _je_id, _s.default_cash_account_id, NEW.amount, 0, 'Cash received', 1),
    (NEW.org_id, _je_id, _s.default_ar_account_id, 0, NEW.amount, 'AR settled', 2);

  BEGIN PERFORM public.post_journal_entry(_je_id); EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_payment_auto_post
AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.auto_post_payment();

-- EXPENSES → Expense / Cash or AP
CREATE OR REPLACE FUNCTION public.auto_post_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.accounting_settings%ROWTYPE; _je_id UUID; _credit_acct UUID; _amt NUMERIC; _tax NUMERIC;
BEGIN
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source='expense' AND source_id=NEW.id) THEN RETURN NEW; END IF;
  SELECT * INTO _s FROM public.accounting_settings WHERE org_id = NEW.org_id;
  IF _s.org_id IS NULL OR NOT _s.auto_post_expenses THEN RETURN NEW; END IF;
  IF _s.default_expense_account_id IS NULL THEN RETURN NEW; END IF;

  _amt := COALESCE(NEW.total, COALESCE(NEW.amount,0) + COALESCE(NEW.tax_amount,0));
  _tax := COALESCE(NEW.tax_amount, 0);
  IF _amt <= 0 THEN RETURN NEW; END IF;

  -- if payment_method present treat as paid (cash), else AP
  IF NEW.payment_method_id IS NOT NULL AND _s.default_cash_account_id IS NOT NULL THEN
    _credit_acct := _s.default_cash_account_id;
  ELSIF _s.default_ap_account_id IS NOT NULL THEN
    _credit_acct := _s.default_ap_account_id;
  ELSIF _s.default_cash_account_id IS NOT NULL THEN
    _credit_acct := _s.default_cash_account_id;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.journal_entries(org_id, entry_date, reference, memo, status, source, source_id, currency)
  VALUES (NEW.org_id, COALESCE(NEW.expense_date, CURRENT_DATE), NEW.reference,
          'Auto: Expense ' || COALESCE(NEW.reference, NEW.id::text), 'draft', 'expense', NEW.id, COALESCE(NEW.currency,'USD'))
  RETURNING id INTO _je_id;

  INSERT INTO public.journal_entry_lines(org_id, journal_entry_id, account_id, debit, credit, memo, position) VALUES
    (NEW.org_id, _je_id, _s.default_expense_account_id, _amt - _tax, 0, 'Expense', 1);
  IF _tax > 0 AND _s.default_tax_payable_account_id IS NOT NULL THEN
    INSERT INTO public.journal_entry_lines(org_id, journal_entry_id, account_id, debit, credit, memo, position)
    VALUES (NEW.org_id, _je_id, _s.default_tax_payable_account_id, _tax, 0, 'Tax', 2);
  END IF;
  INSERT INTO public.journal_entry_lines(org_id, journal_entry_id, account_id, debit, credit, memo, position)
  VALUES (NEW.org_id, _je_id, _credit_acct, 0, _amt, 'Paid/Owed', 3);

  BEGIN PERFORM public.post_journal_entry(_je_id); EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_expense_auto_post
AFTER INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.auto_post_expense();
