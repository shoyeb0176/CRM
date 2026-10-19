
CREATE OR REPLACE FUNCTION public.auto_post_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.accounting_settings%ROWTYPE; _je_id UUID; _credit_acct UUID; _amt NUMERIC; _tax NUMERIC; _ref TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source='expense' AND source_id=NEW.id) THEN RETURN NEW; END IF;
  SELECT * INTO _s FROM public.accounting_settings WHERE org_id = NEW.org_id;
  IF _s.org_id IS NULL OR NOT _s.auto_post_expenses THEN RETURN NEW; END IF;
  IF _s.default_expense_account_id IS NULL THEN RETURN NEW; END IF;

  _amt := COALESCE(NEW.total, COALESCE(NEW.amount,0) + COALESCE(NEW.tax_amount,0));
  _tax := COALESCE(NEW.tax_amount, 0);
  _ref := COALESCE(NEW.expense_number, NEW.description, NEW.id::text);
  IF _amt <= 0 THEN RETURN NEW; END IF;

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
  VALUES (NEW.org_id, COALESCE(NEW.expense_date, CURRENT_DATE), _ref,
          'Auto: Expense ' || _ref, 'draft', 'expense', NEW.id, COALESCE(NEW.currency,'USD'))
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
