
-- ============ ENUMS ============
CREATE TYPE public.quote_status AS ENUM ('draft','sent','accepted','rejected','expired','converted');
CREATE TYPE public.sales_order_status AS ENUM ('draft','confirmed','fulfilled','cancelled');
CREATE TYPE public.invoice_status AS ENUM ('draft','sent','partially_paid','paid','overdue','void');
CREATE TYPE public.payment_method_type AS ENUM ('cash','bank_transfer','credit_card','check','stripe','paypal','other');
CREATE TYPE public.doc_type AS ENUM ('quote','sales_order','invoice');

-- ============ TAXES ============
CREATE TABLE public.taxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rate NUMERIC(7,4) NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxes TO authenticated;
GRANT ALL ON public.taxes TO service_role;
ALTER TABLE public.taxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "taxes_select" ON public.taxes FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "taxes_insert" ON public.taxes FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "taxes_update" ON public.taxes FOR UPDATE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant','manager']::app_role[]));
CREATE POLICY "taxes_delete" ON public.taxes FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]));
CREATE TRIGGER trg_taxes_updated BEFORE UPDATE ON public.taxes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PAYMENT METHODS ============
CREATE TABLE public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.payment_method_type NOT NULL DEFAULT 'bank_transfer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pm_select" ON public.payment_methods FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "pm_insert" ON public.payment_methods FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "pm_update" ON public.payment_methods FOR UPDATE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant','manager']::app_role[]));
CREATE POLICY "pm_delete" ON public.payment_methods FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]));
CREATE TRIGGER trg_pm_updated BEFORE UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ NUMBER SEQUENCES ============
CREATE TABLE public.invoice_number_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  doc_type public.doc_type NOT NULL,
  prefix TEXT NOT NULL DEFAULT '',
  padding INT NOT NULL DEFAULT 5,
  next_value BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, doc_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_number_sequences TO authenticated;
GRANT ALL ON public.invoice_number_sequences TO service_role;
ALTER TABLE public.invoice_number_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ins_select" ON public.invoice_number_sequences FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "ins_write" ON public.invoice_number_sequences FOR ALL TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[])) WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]));
CREATE TRIGGER trg_ins_updated BEFORE UPDATE ON public.invoice_number_sequences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- next document number RPC
CREATE OR REPLACE FUNCTION public.next_doc_number(_org UUID, _doc public.doc_type)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _seq RECORD; _num BIGINT; _default_prefix TEXT;
BEGIN
  IF NOT public.is_org_member(_org) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  _default_prefix := CASE _doc WHEN 'quote' THEN 'QUO-' WHEN 'sales_order' THEN 'SO-' WHEN 'invoice' THEN 'INV-' END;
  INSERT INTO public.invoice_number_sequences (org_id, doc_type, prefix, next_value)
  VALUES (_org, _doc, _default_prefix, 1)
  ON CONFLICT (org_id, doc_type) DO NOTHING;
  UPDATE public.invoice_number_sequences SET next_value = next_value + 1
   WHERE org_id = _org AND doc_type = _doc
   RETURNING next_value - 1, prefix, padding INTO _num, _seq.prefix, _seq.padding;
  RETURN _seq.prefix || lpad(_num::TEXT, _seq.padding, '0');
END; $$;

-- ============ QUOTES ============
CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  status public.quote_status NOT NULL DEFAULT 'draft',
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  owner_id UUID,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date DATE,
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  converted_sales_order_id UUID,
  converted_invoice_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "q_select" ON public.quotes FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "q_insert" ON public.quotes FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "q_update" ON public.quotes FOR UPDATE TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "q_delete" ON public.quotes FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant','manager','sales_rep']::app_role[]));
CREATE TRIGGER trg_q_updated BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_quotes_org_status ON public.quotes(org_id, status);

CREATE TABLE public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  position INT NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,4) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(7,4) NOT NULL DEFAULT 0,
  tax_id UUID REFERENCES public.taxes(id) ON DELETE SET NULL,
  tax_rate NUMERIC(7,4) NOT NULL DEFAULT 0,
  line_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_items TO authenticated;
GRANT ALL ON public.quote_items TO service_role;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qi_select" ON public.quote_items FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "qi_write" ON public.quote_items FOR ALL TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE TRIGGER trg_qi_updated BEFORE UPDATE ON public.quote_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_qi_quote ON public.quote_items(quote_id);

-- ============ SALES ORDERS ============
CREATE TABLE public.sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  status public.sales_order_status NOT NULL DEFAULT 'draft',
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  owner_id UUID,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery DATE,
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  invoice_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_orders TO authenticated;
GRANT ALL ON public.sales_orders TO service_role;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "so_select" ON public.sales_orders FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "so_insert" ON public.sales_orders FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "so_update" ON public.sales_orders FOR UPDATE TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "so_delete" ON public.sales_orders FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant','manager','sales_rep']::app_role[]));
CREATE TRIGGER trg_so_updated BEFORE UPDATE ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.sales_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  position INT NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,4) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(7,4) NOT NULL DEFAULT 0,
  tax_id UUID REFERENCES public.taxes(id) ON DELETE SET NULL,
  tax_rate NUMERIC(7,4) NOT NULL DEFAULT 0,
  line_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_order_items TO authenticated;
GRANT ALL ON public.sales_order_items TO service_role;
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "soi_select" ON public.sales_order_items FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "soi_write" ON public.sales_order_items FOR ALL TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE TRIGGER trg_soi_updated BEFORE UPDATE ON public.sales_order_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_soi_order ON public.sales_order_items(sales_order_id);

-- ============ INVOICES ============
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  sales_order_id UUID REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  owner_id UUID,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_due NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  sent_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_select" ON public.invoices FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "inv_insert" ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "inv_update" ON public.invoices FOR UPDATE TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "inv_delete" ON public.invoices FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]));
CREATE TRIGGER trg_inv_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_inv_org_status ON public.invoices(org_id, status);
CREATE INDEX idx_inv_due_date ON public.invoices(org_id, due_date);

CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  position INT NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,4) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(7,4) NOT NULL DEFAULT 0,
  tax_id UUID REFERENCES public.taxes(id) ON DELETE SET NULL,
  tax_rate NUMERIC(7,4) NOT NULL DEFAULT 0,
  line_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ii_select" ON public.invoice_items FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "ii_write" ON public.invoice_items FOR ALL TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE TRIGGER trg_ii_updated BEFORE UPDATE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_ii_invoice ON public.invoice_items(invoice_id);

-- ============ PAYMENTS ============
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  reference TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pay_select" ON public.payments FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "pay_insert" ON public.payments FOR INSERT TO authenticated WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant','manager','sales_rep']::app_role[]));
CREATE POLICY "pay_update" ON public.payments FOR UPDATE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]));
CREATE POLICY "pay_delete" ON public.payments FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','accountant']::app_role[]));
CREATE TRIGGER trg_pay_updated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_pay_invoice ON public.payments(invoice_id);

-- ============ DOC TOTALS RECALC ============
CREATE OR REPLACE FUNCTION public.recalc_quote_totals(_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sub NUMERIC; _disc NUMERIC; _tax NUMERIC; _tot NUMERIC;
BEGIN
  SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * unit_price * discount_pct / 100), 0),
    COALESCE(SUM(line_tax), 0),
    COALESCE(SUM(line_total), 0)
  INTO _sub, _disc, _tax, _tot FROM public.quote_items WHERE quote_id = _id;
  UPDATE public.quotes SET subtotal = _sub, discount_total = _disc, tax_total = _tax, total = _tot WHERE id = _id;
END; $$;

CREATE OR REPLACE FUNCTION public.recalc_sales_order_totals(_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sub NUMERIC; _disc NUMERIC; _tax NUMERIC; _tot NUMERIC;
BEGIN
  SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * unit_price * discount_pct / 100), 0),
    COALESCE(SUM(line_tax), 0),
    COALESCE(SUM(line_total), 0)
  INTO _sub, _disc, _tax, _tot FROM public.sales_order_items WHERE sales_order_id = _id;
  UPDATE public.sales_orders SET subtotal = _sub, discount_total = _disc, tax_total = _tax, total = _tot WHERE id = _id;
END; $$;

CREATE OR REPLACE FUNCTION public.recalc_invoice_totals(_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sub NUMERIC; _disc NUMERIC; _tax NUMERIC; _tot NUMERIC; _paid NUMERIC; _bal NUMERIC; _status public.invoice_status; _due DATE;
BEGIN
  SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * unit_price * discount_pct / 100), 0),
    COALESCE(SUM(line_tax), 0),
    COALESCE(SUM(line_total), 0)
  INTO _sub, _disc, _tax, _tot FROM public.invoice_items WHERE invoice_id = _id;
  SELECT COALESCE(SUM(amount), 0) INTO _paid FROM public.payments WHERE invoice_id = _id;
  _bal := _tot - _paid;
  SELECT status, due_date INTO _status, _due FROM public.invoices WHERE id = _id;
  IF _status NOT IN ('void','draft') THEN
    IF _paid <= 0 THEN
      IF _due IS NOT NULL AND _due < CURRENT_DATE THEN _status := 'overdue';
      ELSE _status := 'sent'; END IF;
    ELSIF _bal <= 0 THEN _status := 'paid';
    ELSE _status := 'partially_paid';
    END IF;
  END IF;
  UPDATE public.invoices SET subtotal = _sub, discount_total = _disc, tax_total = _tax, total = _tot,
    amount_paid = _paid, balance_due = _bal, status = _status WHERE id = _id;
END; $$;

-- triggers: recompute line + parent on item changes
CREATE OR REPLACE FUNCTION public.compute_line_amounts() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE _gross NUMERIC; _disc NUMERIC; _net NUMERIC; _tax NUMERIC;
BEGIN
  _gross := COALESCE(NEW.quantity,0) * COALESCE(NEW.unit_price,0);
  _disc := _gross * COALESCE(NEW.discount_pct,0) / 100;
  _net := _gross - _disc;
  _tax := _net * COALESCE(NEW.tax_rate,0) / 100;
  NEW.line_subtotal := round(_net, 2);
  NEW.line_tax := round(_tax, 2);
  NEW.line_total := round(_net + _tax, 2);
  RETURN NEW;
END; $$ SET search_path = public;

CREATE TRIGGER trg_qi_compute BEFORE INSERT OR UPDATE ON public.quote_items FOR EACH ROW EXECUTE FUNCTION public.compute_line_amounts();
CREATE TRIGGER trg_soi_compute BEFORE INSERT OR UPDATE ON public.sales_order_items FOR EACH ROW EXECUTE FUNCTION public.compute_line_amounts();
CREATE TRIGGER trg_ii_compute BEFORE INSERT OR UPDATE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.compute_line_amounts();

CREATE OR REPLACE FUNCTION public.trg_recalc_quote() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN PERFORM public.recalc_quote_totals(COALESCE(NEW.quote_id, OLD.quote_id)); RETURN NULL; END; $$ SET search_path = public;
CREATE TRIGGER trg_qi_recalc AFTER INSERT OR UPDATE OR DELETE ON public.quote_items FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_quote();

CREATE OR REPLACE FUNCTION public.trg_recalc_so() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN PERFORM public.recalc_sales_order_totals(COALESCE(NEW.sales_order_id, OLD.sales_order_id)); RETURN NULL; END; $$ SET search_path = public;
CREATE TRIGGER trg_soi_recalc AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_items FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_so();

CREATE OR REPLACE FUNCTION public.trg_recalc_invoice() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN PERFORM public.recalc_invoice_totals(COALESCE(NEW.invoice_id, OLD.invoice_id)); RETURN NULL; END; $$ SET search_path = public;
CREATE TRIGGER trg_ii_recalc AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_invoice();
CREATE TRIGGER trg_pay_recalc AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_invoice();
