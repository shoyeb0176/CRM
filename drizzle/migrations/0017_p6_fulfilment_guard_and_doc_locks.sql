CREATE OR REPLACE FUNCTION public.guard_sales_order_fulfilled()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'fulfilled' AND OLD.status IS DISTINCT FROM 'fulfilled'
     AND COALESCE(current_setting('inuberry.fulfilling_so', true), '') <> NEW.id::text THEN
    RAISE EXCEPTION 'Use "Mark fulfilled" to fulfil an order so stock is updated' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_so_guard_fulfilled ON public.sales_orders;
CREATE TRIGGER trg_so_guard_fulfilled BEFORE UPDATE OF status ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_sales_order_fulfilled();

CREATE OR REPLACE FUNCTION public.fulfill_sales_order(_so uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  PERFORM set_config('inuberry.fulfilling_so', _so::text, true);
  UPDATE public.sales_orders SET status = 'fulfilled' WHERE id = _so;
  PERFORM set_config('inuberry.fulfilling_so', '', true);
END; $function$;

-- Lock lines of non-draft invoices and vendor bills
CREATE OR REPLACE FUNCTION public.guard_locked_doc_lines()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _status text; _doc uuid;
BEGIN
  IF TG_TABLE_NAME = 'invoice_items' THEN
    _doc := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
    SELECT status::text INTO _status FROM public.invoices WHERE id = _doc;
    IF _status IS NOT NULL AND _status <> 'draft' THEN
      RAISE EXCEPTION 'This invoice is no longer a draft. Void and duplicate it to make changes.' USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
      SELECT status::text INTO _status FROM public.invoices WHERE id = OLD.invoice_id;
      IF _status IS NOT NULL AND _status <> 'draft' THEN
        RAISE EXCEPTION 'This invoice is no longer a draft.' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSE
    _doc := CASE WHEN TG_OP = 'DELETE' THEN OLD.vendor_bill_id ELSE NEW.vendor_bill_id END;
    SELECT status::text INTO _status FROM public.vendor_bills WHERE id = _doc;
    IF _status IS NOT NULL AND _status <> 'draft' THEN
      RAISE EXCEPTION 'This bill is approved. Void and duplicate it to make changes.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END; $$;
REVOKE EXECUTE ON FUNCTION public.guard_locked_doc_lines() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ii_lock ON public.invoice_items;
CREATE TRIGGER trg_ii_lock BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.guard_locked_doc_lines();
DROP TRIGGER IF EXISTS trg_vbi_lock ON public.vendor_bill_items;
CREATE TRIGGER trg_vbi_lock BEFORE INSERT OR UPDATE OR DELETE ON public.vendor_bill_items
FOR EACH ROW EXECUTE FUNCTION public.guard_locked_doc_lines();

-- Totals of locked documents can't be edited directly either
CREATE OR REPLACE FUNCTION public.guard_locked_doc_totals()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status::text <> 'draft' AND pg_trigger_depth() = 1
     AND (NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.tax_total IS DISTINCT FROM OLD.tax_total
          OR NEW.discount_total IS DISTINCT FROM OLD.discount_total OR NEW.total IS DISTINCT FROM OLD.total) THEN
    RAISE EXCEPTION 'Totals of a non-draft document can''t be changed. Void and duplicate it instead.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_inv_lock_totals ON public.invoices;
CREATE TRIGGER trg_inv_lock_totals BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_locked_doc_totals();
DROP TRIGGER IF EXISTS trg_vb_lock_totals ON public.vendor_bills;
CREATE TRIGGER trg_vb_lock_totals BEFORE UPDATE ON public.vendor_bills
FOR EACH ROW EXECUTE FUNCTION public.guard_locked_doc_totals();