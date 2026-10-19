-- B4: sales orders can't be created as fulfilled; vendor bills post to AP on approval
-- (opt-in setting); voiding a posted invoice or bill reverses its journal; invoice status
-- changes are written to the audit log.

-- 1. Guard fulfilment on INSERT as well as UPDATE (only fulfill_sales_order may set it).
CREATE OR REPLACE FUNCTION public.guard_sales_order_fulfilled()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'fulfilled'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'fulfilled')
     AND COALESCE(current_setting('inuberry.fulfilling_so', true), '') <> NEW.id::text THEN
    RAISE EXCEPTION 'Use "Mark fulfilled" to fulfil an order so stock is updated' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_so_guard_fulfilled_insert ON public.sales_orders;
CREATE TRIGGER trg_so_guard_fulfilled_insert BEFORE INSERT ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_sales_order_fulfilled();

-- 2. Vendor bills: post Dr expense / Cr AP when approved; reverse when voided.
ALTER TABLE public.accounting_settings ADD COLUMN IF NOT EXISTS auto_post_bills boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.auto_post_vendor_bill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.accounting_settings%ROWTYPE; _je uuid; _total numeric;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.status = 'void' THEN
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source = 'vendor_bill' AND source_id = NEW.id AND status <> 'reversed')
       AND NOT public.has_org_role(NEW.org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]) THEN
      RAISE EXCEPTION 'This bill is posted to the ledger; only owners, admins or accountants can void it' USING ERRCODE = 'P0001';
    END IF;
    PERFORM public.reverse_source_journals('vendor_bill', NEW.id, 'Reversal: voided bill ' || COALESCE(NEW.bill_number, NEW.id::text));
    RETURN NEW;
  END IF;
  IF OLD.status <> 'draft' OR NEW.status NOT IN ('approved','partially_paid','paid','overdue') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source = 'vendor_bill' AND source_id = NEW.id AND status <> 'reversed') THEN RETURN NEW; END IF;
  SELECT * INTO _s FROM public.accounting_settings WHERE org_id = NEW.org_id;
  IF _s.org_id IS NULL OR NOT _s.auto_post_bills THEN RETURN NEW; END IF;
  IF _s.default_ap_account_id IS NULL OR _s.default_expense_account_id IS NULL THEN RETURN NEW; END IF;
  _total := COALESCE(NEW.total, 0);
  IF _total <= 0 THEN RETURN NEW; END IF;
  INSERT INTO public.journal_entries(org_id, entry_date, reference, memo, status, source, source_id, currency)
  VALUES (NEW.org_id, COALESCE(NEW.bill_date, CURRENT_DATE), NEW.bill_number,
          'Auto: Bill ' || COALESCE(NEW.bill_number, NEW.id::text), 'draft', 'vendor_bill', NEW.id, COALESCE(NEW.currency, 'USD'))
  RETURNING id INTO _je;
  -- ponytail: tax is expensed with the bill; split it out if an input-tax account is added.
  INSERT INTO public.journal_entry_lines(org_id, journal_entry_id, account_id, debit, credit, memo, position) VALUES
    (NEW.org_id, _je, _s.default_expense_account_id, _total, 0, 'Expense', 1),
    (NEW.org_id, _je, _s.default_ap_account_id, 0, _total, 'AP', 2);
  BEGIN PERFORM public.post_journal_entry(_je); EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_vb_auto_post ON public.vendor_bills;
CREATE TRIGGER trg_vb_auto_post AFTER UPDATE OF status ON public.vendor_bills
FOR EACH ROW EXECUTE FUNCTION public.auto_post_vendor_bill();

-- 3. Invoices: reverse the journal on void, and audit every status change.
CREATE OR REPLACE FUNCTION public.invoice_status_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.status = 'void' THEN
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source = 'invoice' AND source_id = NEW.id AND status <> 'reversed')
       AND NOT public.has_org_role(NEW.org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]) THEN
      RAISE EXCEPTION 'This invoice is posted to the ledger; only owners, admins or accountants can void it' USING ERRCODE = 'P0001';
    END IF;
    PERFORM public.reverse_source_journals('invoice', NEW.id, 'Reversal: voided invoice ' || COALESCE(NEW.number, NEW.id::text));
  END IF;
  INSERT INTO public.audit_logs(org_id, user_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (NEW.org_id, auth.uid(), 'invoice.status_changed', 'invoice', NEW.id,
          jsonb_build_object('status', OLD.status, 'number', NEW.number),
          jsonb_build_object('status', NEW.status, 'number', NEW.number));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_inv_status_changed ON public.invoices;
CREATE TRIGGER trg_inv_status_changed AFTER UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.invoice_status_changed();

REVOKE ALL ON FUNCTION public.auto_post_vendor_bill(), public.invoice_status_changed() FROM PUBLIC, anon, authenticated;
