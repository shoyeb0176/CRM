-- 1. Fix auto_post_invoice column name
CREATE OR REPLACE FUNCTION public.auto_post_invoice()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _s public.accounting_settings%ROWTYPE;
  _je_id UUID;
  _net NUMERIC; _tax NUMERIC; _total NUMERIC;
BEGIN
  IF NEW.status NOT IN ('sent','partially_paid','paid','overdue') THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source='invoice' AND source_id=NEW.id AND status <> 'reversed') THEN RETURN NEW; END IF;
  SELECT * INTO _s FROM public.accounting_settings WHERE org_id = NEW.org_id;
  IF _s.org_id IS NULL OR NOT _s.auto_post_invoices THEN RETURN NEW; END IF;
  IF _s.default_ar_account_id IS NULL OR _s.default_revenue_account_id IS NULL THEN RETURN NEW; END IF;
  _total := COALESCE(NEW.total, 0);
  _tax   := COALESCE(NEW.tax_total, 0);
  _net   := _total - _tax;
  IF _total <= 0 THEN RETURN NEW; END IF;
  INSERT INTO public.journal_entries(org_id, entry_date, reference, memo, status, source, source_id, currency)
  VALUES (NEW.org_id, COALESCE(NEW.issue_date, CURRENT_DATE), NEW.number,
          'Auto: Invoice ' || COALESCE(NEW.number, NEW.id::text), 'draft', 'invoice', NEW.id, COALESCE(NEW.currency,'USD'))
  RETURNING id INTO _je_id;
  INSERT INTO public.journal_entry_lines(org_id, journal_entry_id, account_id, debit, credit, memo, position) VALUES
    (NEW.org_id, _je_id, _s.default_ar_account_id, _total, 0, 'AR', 1),
    (NEW.org_id, _je_id, _s.default_revenue_account_id, 0, _net, 'Revenue', 2);
  IF _tax > 0 AND _s.default_tax_payable_account_id IS NOT NULL THEN
    INSERT INTO public.journal_entry_lines(org_id, journal_entry_id, account_id, debit, credit, memo, position)
    VALUES (NEW.org_id, _je_id, _s.default_tax_payable_account_id, 0, _tax, 'Tax payable', 3);
  ELSIF _tax > 0 THEN
    UPDATE public.journal_entry_lines SET credit = _total WHERE journal_entry_id = _je_id AND position = 2;
  END IF;
  BEGIN PERFORM public.post_journal_entry(_je_id); EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END; $function$;

-- Helper: reverse journal entries for a source (no role check; used by triggers)
CREATE OR REPLACE FUNCTION public.reverse_source_journals(_source public.journal_source, _source_id uuid, _memo text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _je public.journal_entries%ROWTYPE; _new_id uuid;
BEGIN
  FOR _je IN SELECT * FROM public.journal_entries WHERE source = _source AND source_id = _source_id AND status <> 'reversed' LOOP
    IF _je.status = 'draft' THEN
      DELETE FROM public.journal_entry_lines WHERE journal_entry_id = _je.id;
      DELETE FROM public.journal_entries WHERE id = _je.id;
    ELSE
      INSERT INTO public.journal_entries(org_id, entry_date, reference, memo, status, source, source_id, currency, created_by)
      VALUES (_je.org_id, CURRENT_DATE, _je.reference, _memo, 'draft', 'adjustment', _je.id, _je.currency, auth.uid())
      RETURNING id INTO _new_id;
      INSERT INTO public.journal_entry_lines(org_id, journal_entry_id, account_id, debit, credit, memo, position)
      SELECT org_id, _new_id, account_id, credit, debit, memo, position FROM public.journal_entry_lines WHERE journal_entry_id = _je.id;
      PERFORM public.post_journal_entry(_new_id);
      UPDATE public.journal_entries SET status = 'reversed', reversed_by = _new_id WHERE id = _je.id;
    END IF;
  END LOOP;
END; $function$;
REVOKE ALL ON FUNCTION public.reverse_source_journals(public.journal_source, uuid, text) FROM PUBLIC, anon, authenticated;

-- 2. Overpayment guard on invoice payments
CREATE OR REPLACE FUNCTION public.guard_invoice_payment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _total numeric; _other numeric; _status public.invoice_status;
BEGIN
  IF NEW.invoice_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.amount,0) <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than 0' USING ERRCODE='P0001'; END IF;
  SELECT total, status INTO _total, _status FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF _status IN ('draft','void') THEN RAISE EXCEPTION 'Payments can only be recorded on sent invoices' USING ERRCODE='P0001'; END IF;
  SELECT COALESCE(SUM(amount),0) INTO _other FROM public.payments WHERE invoice_id = NEW.invoice_id AND id <> NEW.id;
  IF _other + NEW.amount > COALESCE(_total,0) + 0.004 THEN
    RAISE EXCEPTION 'Payment exceeds balance due (%)', trim_scale(round(GREATEST(COALESCE(_total,0) - _other, 0), 2)) USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS trg_pay_guard ON public.payments;
CREATE TRIGGER trg_pay_guard BEFORE INSERT OR UPDATE OF amount, invoice_id ON public.payments FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_payment();

CREATE OR REPLACE FUNCTION public.reverse_payment_journal()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.reverse_source_journals('payment', OLD.id, 'Reversal: deleted payment ' || COALESCE(OLD.reference, OLD.id::text));
  RETURN OLD;
END; $function$;
DROP TRIGGER IF EXISTS trg_pay_reverse ON public.payments;
CREATE TRIGGER trg_pay_reverse AFTER DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.reverse_payment_journal();

-- 5. Overdue: recalc marks unpaid-balance invoices past due as overdue
CREATE OR REPLACE FUNCTION public.recalc_invoice_totals(_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _sub NUMERIC; _disc NUMERIC; _tax NUMERIC; _tot NUMERIC; _paid NUMERIC; _bal NUMERIC; _status public.invoice_status; _due DATE;
BEGIN
  SELECT COALESCE(SUM(quantity * unit_price), 0), COALESCE(SUM(quantity * unit_price * discount_pct / 100), 0),
         COALESCE(SUM(line_tax), 0), COALESCE(SUM(line_total), 0)
  INTO _sub, _disc, _tax, _tot FROM public.invoice_items WHERE invoice_id = _id;
  SELECT COALESCE(SUM(amount), 0) INTO _paid FROM public.payments WHERE invoice_id = _id;
  _bal := _tot - _paid;
  SELECT status, due_date INTO _status, _due FROM public.invoices WHERE id = _id;
  IF _status NOT IN ('void','draft') THEN
    IF _bal <= 0 AND _tot > 0 THEN _status := 'paid';
    ELSIF _due IS NOT NULL AND _due < CURRENT_DATE THEN _status := 'overdue';
    ELSIF _paid > 0 THEN _status := 'partially_paid';
    ELSE _status := 'sent';
    END IF;
  END IF;
  UPDATE public.invoices SET subtotal = _sub, discount_total = _disc, tax_total = _tax, total = _tot,
    amount_paid = _paid, balance_due = _bal, status = _status WHERE id = _id;
END; $function$;

CREATE OR REPLACE FUNCTION public.invoice_overdue_on_update()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('sent','partially_paid') AND NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE
     AND COALESCE(NEW.balance_due,0) > 0 THEN
    NEW.status := 'overdue';
  ELSIF NEW.status = 'overdue' AND (NEW.due_date IS NULL OR NEW.due_date >= CURRENT_DATE) THEN
    NEW.status := CASE WHEN COALESCE(NEW.amount_paid,0) > 0 THEN 'partially_paid'::public.invoice_status ELSE 'sent'::public.invoice_status END;
  END IF;
  RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS trg_inv_overdue ON public.invoices;
CREATE TRIGGER trg_inv_overdue BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.invoice_overdue_on_update();

CREATE OR REPLACE FUNCTION public.mark_overdue_invoices(_org uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _n integer;
BEGIN
  IF _org IS NOT NULL AND auth.uid() IS NOT NULL AND NOT public.is_org_member(_org) THEN RETURN 0; END IF;
  UPDATE public.invoices SET status = 'overdue'
   WHERE (_org IS NULL OR org_id = _org) AND status IN ('sent','partially_paid')
     AND due_date IS NOT NULL AND due_date < CURRENT_DATE AND balance_due > 0;
  GET DIAGNOSTICS _n = ROW_COUNT;
  UPDATE public.vendor_bills SET status = 'overdue'
   WHERE (_org IS NULL OR org_id = _org) AND status IN ('approved','partially_paid')
     AND due_date IS NOT NULL AND due_date < CURRENT_DATE AND balance_due > 0;
  RETURN _n;
END; $function$;
REVOKE ALL ON FUNCTION public.mark_overdue_invoices(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_overdue_invoices(uuid) TO authenticated;

DO $$ BEGIN
  PERFORM cron.schedule('mark-overdue-invoices', '15 0 * * *', 'SELECT public.mark_overdue_invoices(NULL)');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 3. Sales order fulfilment with stock movements
CREATE OR REPLACE FUNCTION public.fulfill_sales_order(_so uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _row public.sales_orders%ROWTYPE; _wh uuid; _wh_name text; _it record; _on_hand numeric;
BEGIN
  SELECT * INTO _row FROM public.sales_orders WHERE id = _so FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Sales order not found'; END IF;
  IF NOT public.has_org_role(_row.org_id, ARRAY['org_owner','org_admin','manager','staff','sales_rep','inventory_manager']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized to fulfil sales orders';
  END IF;
  IF _row.status = 'fulfilled' THEN RAISE EXCEPTION 'Order is already fulfilled'; END IF;
  IF _row.status = 'cancelled' THEN RAISE EXCEPTION 'Cancelled orders cannot be fulfilled'; END IF;

  FOR _it IN SELECT i.product_id, p.name, SUM(i.quantity) AS qty
               FROM public.sales_order_items i JOIN public.products p ON p.id = i.product_id
              WHERE i.sales_order_id = _so AND COALESCE(p.track_inventory,false) AND COALESCE(i.quantity,0) > 0
              GROUP BY i.product_id, p.name LOOP
    IF _wh IS NULL THEN
      SELECT id, name INTO _wh, _wh_name FROM public.warehouses WHERE org_id = _row.org_id AND is_active
        ORDER BY is_default DESC, created_at LIMIT 1;
      IF _wh IS NULL THEN RAISE EXCEPTION 'Add a warehouse before fulfilling orders with stocked products' USING ERRCODE='P0001'; END IF;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext(_it.product_id::text || _wh::text));
    SELECT COALESCE(SUM(quantity),0) INTO _on_hand FROM public.inventory_stock
     WHERE org_id = _row.org_id AND product_id = _it.product_id AND warehouse_id = _wh AND variant_id IS NULL;
    IF _on_hand < _it.qty THEN
      RAISE EXCEPTION 'Only % of "%" in stock in % (needs %)', trim_scale(_on_hand), _it.name, _wh_name, trim_scale(_it.qty) USING ERRCODE='P0001';
    END IF;
    INSERT INTO public.inventory_movements (org_id, product_id, warehouse_id, movement_type, quantity, notes, created_by, reference_type, reference_id)
    VALUES (_row.org_id, _it.product_id, _wh, 'sale', -_it.qty, 'Sales order ' || COALESCE(_row.number,''), auth.uid(), 'sales_order', _so);
    INSERT INTO public.inventory_stock (org_id, product_id, variant_id, warehouse_id, quantity)
    VALUES (_row.org_id, _it.product_id, NULL, _wh, -_it.qty)
    ON CONFLICT (org_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), warehouse_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET quantity = public.inventory_stock.quantity - _it.qty, updated_at = now();
  END LOOP;

  UPDATE public.sales_orders SET status = 'fulfilled' WHERE id = _so;
END; $function$;
REVOKE ALL ON FUNCTION public.fulfill_sales_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fulfill_sales_order(uuid) TO authenticated;

-- 4. Vendor bill payments
CREATE TABLE IF NOT EXISTS public.vendor_bill_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vendor_bill_id uuid NOT NULL REFERENCES public.vendor_bills(id) ON DELETE CASCADE,
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD',
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendor_bill_payments_bill_idx ON public.vendor_bill_payments(vendor_bill_id);
GRANT SELECT, INSERT, DELETE ON public.vendor_bill_payments TO authenticated;
GRANT ALL ON public.vendor_bill_payments TO service_role;
ALTER TABLE public.vendor_bill_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY vbp_select ON public.vendor_bill_payments FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY vbp_insert ON public.vendor_bill_payments FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager','accountant']::app_role[]));
CREATE POLICY vbp_delete ON public.vendor_bill_payments FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager','accountant']::app_role[]));

CREATE OR REPLACE FUNCTION public.recalc_vendor_bill_totals(_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _sub NUMERIC; _disc NUMERIC; _tax NUMERIC; _tot NUMERIC; _bal NUMERIC; _status public.vendor_bill_status; _due DATE; _paid NUMERIC;
BEGIN
  SELECT COALESCE(SUM(quantity * unit_price), 0), COALESCE(SUM(quantity * unit_price * discount_pct / 100), 0),
         COALESCE(SUM(line_tax), 0), COALESCE(SUM(line_total), 0)
  INTO _sub, _disc, _tax, _tot FROM public.vendor_bill_items WHERE vendor_bill_id = _id;
  SELECT COALESCE(SUM(amount),0) INTO _paid FROM public.vendor_bill_payments WHERE vendor_bill_id = _id;
  SELECT status, due_date INTO _status, _due FROM public.vendor_bills WHERE id = _id;
  _bal := _tot - _paid;
  IF _status NOT IN ('void','draft') THEN
    IF _bal <= 0 AND _tot > 0 THEN _status := 'paid';
    ELSIF _due IS NOT NULL AND _due < CURRENT_DATE THEN _status := 'overdue';
    ELSIF _paid > 0 THEN _status := 'partially_paid';
    ELSE _status := 'approved';
    END IF;
  END IF;
  UPDATE public.vendor_bills SET subtotal = _sub, discount_total = _disc, tax_total = _tax, total = _tot,
    amount_paid = _paid, balance_due = _bal, status = _status WHERE id = _id;
END; $function$;

CREATE OR REPLACE FUNCTION public.guard_bill_payment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _total numeric; _other numeric; _status public.vendor_bill_status; _org uuid;
BEGIN
  SELECT total, status, org_id INTO _total, _status, _org FROM public.vendor_bills WHERE id = NEW.vendor_bill_id FOR UPDATE;
  IF _org IS DISTINCT FROM NEW.org_id THEN RAISE EXCEPTION 'Bill not found'; END IF;
  IF _status IN ('draft','void') THEN RAISE EXCEPTION 'Approve the bill before recording a payment' USING ERRCODE='P0001'; END IF;
  SELECT COALESCE(SUM(amount),0) INTO _other FROM public.vendor_bill_payments WHERE vendor_bill_id = NEW.vendor_bill_id AND id <> NEW.id;
  IF _other + NEW.amount > COALESCE(_total,0) + 0.004 THEN
    RAISE EXCEPTION 'Payment exceeds balance due (%)', trim_scale(round(GREATEST(COALESCE(_total,0) - _other, 0), 2)) USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END; $function$;
CREATE TRIGGER trg_vbp_guard BEFORE INSERT ON public.vendor_bill_payments FOR EACH ROW EXECUTE FUNCTION public.guard_bill_payment();

CREATE OR REPLACE FUNCTION public.trg_recalc_bill_from_payment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.reverse_source_journals('payment', OLD.id, 'Reversal: deleted bill payment ' || COALESCE(OLD.reference, OLD.id::text));
    PERFORM public.recalc_vendor_bill_totals(OLD.vendor_bill_id);
    RETURN OLD;
  END IF;
  PERFORM public.recalc_vendor_bill_totals(NEW.vendor_bill_id);
  RETURN NEW;
END; $function$;
CREATE TRIGGER trg_vbp_recalc AFTER INSERT OR DELETE ON public.vendor_bill_payments FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_bill_from_payment();

CREATE OR REPLACE FUNCTION public.auto_post_bill_payment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _s public.accounting_settings%ROWTYPE; _je_id uuid; _num text;
BEGIN
  SELECT * INTO _s FROM public.accounting_settings WHERE org_id = NEW.org_id;
  IF _s.org_id IS NULL OR NOT _s.auto_post_payments THEN RETURN NEW; END IF;
  IF _s.default_cash_account_id IS NULL OR _s.default_ap_account_id IS NULL THEN RETURN NEW; END IF;
  SELECT bill_number INTO _num FROM public.vendor_bills WHERE id = NEW.vendor_bill_id;
  INSERT INTO public.journal_entries(org_id, entry_date, reference, memo, status, source, source_id, currency)
  VALUES (NEW.org_id, NEW.payment_date, COALESCE(NEW.reference, _num),
          'Auto: Bill payment ' || COALESCE(_num, NEW.id::text), 'draft', 'payment', NEW.id, COALESCE(NEW.currency,'USD'))
  RETURNING id INTO _je_id;
  INSERT INTO public.journal_entry_lines(org_id, journal_entry_id, account_id, debit, credit, memo, position) VALUES
    (NEW.org_id, _je_id, _s.default_ap_account_id, NEW.amount, 0, 'AP settled', 1),
    (NEW.org_id, _je_id, _s.default_cash_account_id, 0, NEW.amount, 'Cash paid', 2);
  BEGIN PERFORM public.post_journal_entry(_je_id); EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END; $function$;
CREATE TRIGGER trg_vbp_auto_post AFTER INSERT ON public.vendor_bill_payments FOR EACH ROW EXECUTE FUNCTION public.auto_post_bill_payment();

REVOKE ALL ON FUNCTION public.guard_invoice_payment(), public.reverse_payment_journal(), public.invoice_overdue_on_update(),
  public.guard_bill_payment(), public.trg_recalc_bill_from_payment(), public.auto_post_bill_payment() FROM PUBLIC, anon, authenticated;

-- 7. Atomic document line replacement
CREATE OR REPLACE FUNCTION public.replace_document_lines(_doc_type text, _doc uuid, _lines jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _org uuid; _tbl text; _fk text; _parent text;
BEGIN
  CASE _doc_type
    WHEN 'quote' THEN _tbl := 'quote_items'; _fk := 'quote_id'; _parent := 'quotes';
    WHEN 'sales_order' THEN _tbl := 'sales_order_items'; _fk := 'sales_order_id'; _parent := 'sales_orders';
    WHEN 'invoice' THEN _tbl := 'invoice_items'; _fk := 'invoice_id'; _parent := 'invoices';
    WHEN 'purchase_order' THEN _tbl := 'purchase_order_items'; _fk := 'purchase_order_id'; _parent := 'purchase_orders';
    WHEN 'vendor_bill' THEN _tbl := 'vendor_bill_items'; _fk := 'vendor_bill_id'; _parent := 'vendor_bills';
    ELSE RAISE EXCEPTION 'Unknown document type %', _doc_type;
  END CASE;
  EXECUTE format('SELECT org_id FROM public.%I WHERE id = $1', _parent) INTO _org USING _doc;
  IF _org IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF NOT public.is_org_member(_org) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  EXECUTE format('DELETE FROM public.%I WHERE %I = $1', _tbl, _fk) USING _doc;
  EXECUTE format(
    'INSERT INTO public.%I (org_id, %I, position, product_id, description, quantity, unit_price, discount_pct, tax_id, tax_rate)
     SELECT $1, $2, COALESCE((l->>''position'')::int, (ord - 1)::int), NULLIF(l->>''product_id'','''')::uuid,
            COALESCE(NULLIF(l->>''description'',''''), ''Item''), COALESCE((l->>''quantity'')::numeric, 1),
            COALESCE((l->>''unit_price'')::numeric, 0), COALESCE((l->>''discount_pct'')::numeric, 0),
            NULLIF(l->>''tax_id'','''')::uuid, COALESCE((l->>''tax_rate'')::numeric, 0)
     FROM jsonb_array_elements(COALESCE($3, ''[]''::jsonb)) WITH ORDINALITY AS t(l, ord)', _tbl, _fk)
  USING _org, _doc, _lines;
END; $function$;
REVOKE ALL ON FUNCTION public.replace_document_lines(text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_document_lines(text, uuid, jsonb) TO authenticated;