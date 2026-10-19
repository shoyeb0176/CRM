
-- ============ Enums ============
DO $$ BEGIN
  CREATE TYPE public.po_status AS ENUM ('draft','sent','approved','partially_received','received','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.vendor_bill_status AS ENUM ('draft','approved','partially_paid','paid','overdue','void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.expense_status AS ENUM ('draft','submitted','approved','reimbursed','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend doc_type enum
ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'purchase_order';
ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'vendor_bill';
ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'expense';

-- ============ expense_categories ============
CREATE TABLE public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ec_select" ON public.expense_categories FOR SELECT TO authenticated USING (is_org_member(org_id));
CREATE POLICY "ec_insert" ON public.expense_categories FOR INSERT TO authenticated WITH CHECK (has_org_role(org_id, ARRAY['org_owner','org_admin','manager','accountant']::app_role[]));
CREATE POLICY "ec_update" ON public.expense_categories FOR UPDATE TO authenticated USING (has_org_role(org_id, ARRAY['org_owner','org_admin','manager','accountant']::app_role[]));
CREATE POLICY "ec_delete" ON public.expense_categories FOR DELETE TO authenticated USING (has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));
CREATE TRIGGER trg_ec_updated BEFORE UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ purchase_orders ============
CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  po_number TEXT NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  status public.po_status NOT NULL DEFAULT 'draft',
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date DATE,
  currency TEXT NOT NULL DEFAULT 'USD',
  reference TEXT,
  notes TEXT,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  received_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, po_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_select" ON public.purchase_orders FOR SELECT TO authenticated USING (is_org_member(org_id));
CREATE POLICY "po_insert" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (has_org_role(org_id, ARRAY['org_owner','org_admin','manager','inventory_manager']::app_role[]));
CREATE POLICY "po_update" ON public.purchase_orders FOR UPDATE TO authenticated USING (has_org_role(org_id, ARRAY['org_owner','org_admin','manager','inventory_manager']::app_role[]));
CREATE POLICY "po_delete" ON public.purchase_orders FOR DELETE TO authenticated USING (has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_po_org ON public.purchase_orders(org_id, status);
CREATE INDEX idx_po_supplier ON public.purchase_orders(supplier_id);

-- ============ purchase_order_items ============
CREATE TABLE public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(14,4) NOT NULL DEFAULT 1,
  quantity_received NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_price NUMERIC(14,4) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(6,3) NOT NULL DEFAULT 0,
  tax_id UUID REFERENCES public.taxes(id) ON DELETE SET NULL,
  tax_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  line_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "poi_select" ON public.purchase_order_items FOR SELECT TO authenticated USING (is_org_member(org_id));
CREATE POLICY "poi_write" ON public.purchase_order_items FOR ALL TO authenticated
  USING (has_org_role(org_id, ARRAY['org_owner','org_admin','manager','inventory_manager']::app_role[]))
  WITH CHECK (has_org_role(org_id, ARRAY['org_owner','org_admin','manager','inventory_manager']::app_role[]));

CREATE TRIGGER trg_poi_amounts BEFORE INSERT OR UPDATE ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION public.compute_line_amounts();

-- Recalc PO totals
CREATE OR REPLACE FUNCTION public.recalc_po_totals(_id UUID) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sub NUMERIC; _disc NUMERIC; _tax NUMERIC; _tot NUMERIC;
BEGIN
  SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * unit_price * discount_pct / 100), 0),
    COALESCE(SUM(line_tax), 0),
    COALESCE(SUM(line_total), 0)
  INTO _sub, _disc, _tax, _tot FROM public.purchase_order_items WHERE purchase_order_id = _id;
  UPDATE public.purchase_orders SET subtotal = _sub, discount_total = _disc, tax_total = _tax, total = _tot WHERE id = _id;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_recalc_po() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN PERFORM public.recalc_po_totals(COALESCE(NEW.purchase_order_id, OLD.purchase_order_id)); RETURN NULL; END; $$;

CREATE TRIGGER trg_poi_recalc AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_po();

-- ============ purchase_receipts ============
CREATE TABLE public.purchase_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_receipts TO authenticated;
GRANT ALL ON public.purchase_receipts TO service_role;
ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pr_select" ON public.purchase_receipts FOR SELECT TO authenticated USING (is_org_member(org_id));
CREATE POLICY "pr_write" ON public.purchase_receipts FOR ALL TO authenticated
  USING (has_org_role(org_id, ARRAY['org_owner','org_admin','manager','inventory_manager']::app_role[]))
  WITH CHECK (has_org_role(org_id, ARRAY['org_owner','org_admin','manager','inventory_manager']::app_role[]));

-- ============ vendor_bills ============
CREATE TABLE public.vendor_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bill_number TEXT NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  status public.vendor_bill_status NOT NULL DEFAULT 'draft',
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  currency TEXT NOT NULL DEFAULT 'USD',
  reference TEXT,
  notes TEXT,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_due NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, bill_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_bills TO authenticated;
GRANT ALL ON public.vendor_bills TO service_role;
ALTER TABLE public.vendor_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vb_select" ON public.vendor_bills FOR SELECT TO authenticated USING (is_org_member(org_id));
CREATE POLICY "vb_insert" ON public.vendor_bills FOR INSERT TO authenticated WITH CHECK (has_org_role(org_id, ARRAY['org_owner','org_admin','manager','accountant']::app_role[]));
CREATE POLICY "vb_update" ON public.vendor_bills FOR UPDATE TO authenticated USING (has_org_role(org_id, ARRAY['org_owner','org_admin','manager','accountant']::app_role[]));
CREATE POLICY "vb_delete" ON public.vendor_bills FOR DELETE TO authenticated USING (has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));
CREATE TRIGGER trg_vb_updated BEFORE UPDATE ON public.vendor_bills FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ vendor_bill_items ============
CREATE TABLE public.vendor_bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vendor_bill_id UUID NOT NULL REFERENCES public.vendor_bills(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  expense_category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(14,4) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,4) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(6,3) NOT NULL DEFAULT 0,
  tax_id UUID REFERENCES public.taxes(id) ON DELETE SET NULL,
  tax_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  line_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_bill_items TO authenticated;
GRANT ALL ON public.vendor_bill_items TO service_role;
ALTER TABLE public.vendor_bill_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vbi_select" ON public.vendor_bill_items FOR SELECT TO authenticated USING (is_org_member(org_id));
CREATE POLICY "vbi_write" ON public.vendor_bill_items FOR ALL TO authenticated
  USING (has_org_role(org_id, ARRAY['org_owner','org_admin','manager','accountant']::app_role[]))
  WITH CHECK (has_org_role(org_id, ARRAY['org_owner','org_admin','manager','accountant']::app_role[]));

CREATE TRIGGER trg_vbi_amounts BEFORE INSERT OR UPDATE ON public.vendor_bill_items FOR EACH ROW EXECUTE FUNCTION public.compute_line_amounts();

CREATE OR REPLACE FUNCTION public.recalc_vendor_bill_totals(_id UUID) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sub NUMERIC; _disc NUMERIC; _tax NUMERIC; _tot NUMERIC; _bal NUMERIC; _status public.vendor_bill_status; _due DATE; _paid NUMERIC;
BEGIN
  SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * unit_price * discount_pct / 100), 0),
    COALESCE(SUM(line_tax), 0),
    COALESCE(SUM(line_total), 0)
  INTO _sub, _disc, _tax, _tot FROM public.vendor_bill_items WHERE vendor_bill_id = _id;
  SELECT amount_paid, status, due_date INTO _paid, _status, _due FROM public.vendor_bills WHERE id = _id;
  _paid := COALESCE(_paid, 0);
  _bal := _tot - _paid;
  IF _status NOT IN ('void','draft') THEN
    IF _paid <= 0 THEN
      IF _due IS NOT NULL AND _due < CURRENT_DATE THEN _status := 'overdue'; ELSE _status := 'approved'; END IF;
    ELSIF _bal <= 0 THEN _status := 'paid';
    ELSE _status := 'partially_paid';
    END IF;
  END IF;
  UPDATE public.vendor_bills SET subtotal = _sub, discount_total = _disc, tax_total = _tax, total = _tot, balance_due = _bal, status = _status WHERE id = _id;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_recalc_vendor_bill() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN PERFORM public.recalc_vendor_bill_totals(COALESCE(NEW.vendor_bill_id, OLD.vendor_bill_id)); RETURN NULL; END; $$;

CREATE TRIGGER trg_vbi_recalc AFTER INSERT OR UPDATE OR DELETE ON public.vendor_bill_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_vendor_bill();

-- ============ expenses ============
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  expense_number TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status public.expense_status NOT NULL DEFAULT 'draft',
  billable BOOLEAN NOT NULL DEFAULT false,
  billable_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  billable_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  receipt_url TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exp_select" ON public.expenses FOR SELECT TO authenticated USING (is_org_member(org_id));
CREATE POLICY "exp_insert" ON public.expenses FOR INSERT TO authenticated WITH CHECK (is_org_member(org_id));
CREATE POLICY "exp_update" ON public.expenses FOR UPDATE TO authenticated USING (is_org_member(org_id));
CREATE POLICY "exp_delete" ON public.expenses FOR DELETE TO authenticated USING (has_org_role(org_id, ARRAY['org_owner','org_admin','manager','accountant']::app_role[]));
CREATE TRIGGER trg_exp_updated BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_exp_org_date ON public.expenses(org_id, expense_date DESC);

-- Auto-compute expense.total
CREATE OR REPLACE FUNCTION public.compute_expense_total() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.total := round(COALESCE(NEW.amount,0) + COALESCE(NEW.tax_amount,0), 2);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_expenses_total BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.compute_expense_total();

-- ============ Mark overdue vendor bills helper (idempotent) ============
CREATE OR REPLACE FUNCTION public.mark_overdue_vendor_bills(_org UUID) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.vendor_bills SET status = 'overdue'
   WHERE org_id = _org AND status IN ('approved') AND due_date IS NOT NULL AND due_date < CURRENT_DATE AND balance_due > 0;
END; $$;

-- ============ Receive PO ============
CREATE OR REPLACE FUNCTION public.receive_purchase_order(_po UUID, _notes TEXT DEFAULT NULL) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user UUID := auth.uid();
  _po_row public.purchase_orders%ROWTYPE;
  _receipt UUID;
  _item RECORD;
  _remaining NUMERIC;
  _all_received BOOLEAN := true;
  _any_received BOOLEAN := false;
BEGIN
  SELECT * INTO _po_row FROM public.purchase_orders WHERE id = _po;
  IF _po_row.id IS NULL THEN RAISE EXCEPTION 'PO not found'; END IF;
  IF NOT public.has_org_role(_po_row.org_id, ARRAY['org_owner','org_admin','manager','inventory_manager']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized to receive purchase orders';
  END IF;
  IF _po_row.warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Set a warehouse on the purchase order before receiving';
  END IF;

  INSERT INTO public.purchase_receipts (org_id, purchase_order_id, warehouse_id, notes, created_by)
  VALUES (_po_row.org_id, _po, _po_row.warehouse_id, _notes, _user)
  RETURNING id INTO _receipt;

  FOR _item IN SELECT i.*, p.track_inventory FROM public.purchase_order_items i
                 LEFT JOIN public.products p ON p.id = i.product_id
                 WHERE i.purchase_order_id = _po LOOP
    _remaining := COALESCE(_item.quantity,0) - COALESCE(_item.quantity_received,0);
    IF _remaining > 0 THEN
      _any_received := true;
      IF _item.product_id IS NOT NULL AND COALESCE(_item.track_inventory,false) THEN
        INSERT INTO public.inventory_movements (org_id, product_id, variant_id, warehouse_id, movement_type, quantity, notes, created_by, reference_type, reference_id)
        VALUES (_po_row.org_id, _item.product_id, _item.variant_id, _po_row.warehouse_id, 'receipt', _remaining,
                'Receipt for PO ' || _po_row.po_number, _user, 'purchase_order', _po);

        INSERT INTO public.inventory_stock (org_id, product_id, variant_id, warehouse_id, quantity)
        VALUES (_po_row.org_id, _item.product_id, _item.variant_id, _po_row.warehouse_id, _remaining)
        ON CONFLICT (org_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), warehouse_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET quantity = public.inventory_stock.quantity + _remaining, updated_at = now();
      END IF;
      UPDATE public.purchase_order_items SET quantity_received = quantity WHERE id = _item.id;
    END IF;
  END LOOP;

  UPDATE public.purchase_orders SET status = 'received', received_at = now() WHERE id = _po;

  RETURN _receipt;
END; $$;

-- ============ Convert PO to Vendor Bill ============
CREATE OR REPLACE FUNCTION public.convert_po_to_bill(_po UUID) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _po_row public.purchase_orders%ROWTYPE;
  _bill UUID;
  _num TEXT;
BEGIN
  SELECT * INTO _po_row FROM public.purchase_orders WHERE id = _po;
  IF _po_row.id IS NULL THEN RAISE EXCEPTION 'PO not found'; END IF;
  IF NOT public.has_org_role(_po_row.org_id, ARRAY['org_owner','org_admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized to create vendor bills';
  END IF;

  _num := public.next_doc_number(_po_row.org_id, 'vendor_bill');

  INSERT INTO public.vendor_bills (org_id, bill_number, supplier_id, purchase_order_id, currency, reference, notes, status)
  VALUES (_po_row.org_id, _num, _po_row.supplier_id, _po, _po_row.currency, _po_row.po_number, _po_row.notes, 'draft')
  RETURNING id INTO _bill;

  INSERT INTO public.vendor_bill_items (org_id, vendor_bill_id, product_id, description, quantity, unit_price, discount_pct, tax_id, tax_rate, position)
  SELECT _po_row.org_id, _bill, product_id, description, quantity, unit_price, discount_pct, tax_id, tax_rate, position
    FROM public.purchase_order_items WHERE purchase_order_id = _po ORDER BY position;

  RETURN _bill;
END; $$;
