-- 1. Copy a document and its lines in one step: quote → sales order, quote → invoice,
--    sales order → invoice, invoice → invoice (duplicate). The browser used to do this in three
--    calls (header, lines, mark the source) and ignored a failure on the lines, which could leave an
--    empty invoice behind. Here it all happens in one transaction or not at all.
--    SECURITY INVOKER: the caller's row-level security and the existing triggers (line amounts,
--    totals, locks, numbering) apply exactly as they do for the old calls.
-- 2. The feedback screenshot bucket was first made by hand, so the image-only and 10 MB limits from
--    0041 never landed (its INSERT skips an existing bucket). Set them.
-- Safe to run more than once.

CREATE OR REPLACE FUNCTION public.copy_document(_from text, _id uuid, _to text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _org uuid; _contact uuid; _company uuid; _currency text; _notes text; _terms text;
  _new uuid; _num text; _uid uuid := auth.uid();
  _src_items text; _src_fk text; _dst_items text; _dst_fk text;
BEGIN
  IF _from = 'quote' THEN
    SELECT org_id, contact_id, company_id, currency, notes, terms INTO _org, _contact, _company, _currency, _notes, _terms
      FROM quotes WHERE id = _id;
    _src_items := 'quote_items'; _src_fk := 'quote_id';
  ELSIF _from = 'sales_order' THEN
    SELECT org_id, contact_id, company_id, currency, notes INTO _org, _contact, _company, _currency, _notes
      FROM sales_orders WHERE id = _id;
    _src_items := 'sales_order_items'; _src_fk := 'sales_order_id';
  ELSIF _from = 'invoice' THEN
    SELECT org_id, contact_id, company_id, currency, notes, terms INTO _org, _contact, _company, _currency, _notes, _terms
      FROM invoices WHERE id = _id;
    _src_items := 'invoice_items'; _src_fk := 'invoice_id';
  ELSE
    RAISE EXCEPTION 'Unknown document type %', _from;
  END IF;
  IF _org IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;

  IF _to = 'sales_order' AND _from = 'quote' THEN
    _num := public.next_doc_number(_org, 'sales_order');
    INSERT INTO sales_orders (org_id, number, status, created_by, owner_id, contact_id, company_id, quote_id, currency, notes)
    VALUES (_org, _num, 'draft', _uid, _uid, _contact, _company, _id, _currency, _notes)
    RETURNING id INTO _new;
    _dst_items := 'sales_order_items'; _dst_fk := 'sales_order_id';
  ELSIF _to = 'invoice' THEN
    _num := public.next_doc_number(_org, 'invoice');
    INSERT INTO invoices (org_id, number, status, created_by, owner_id, contact_id, company_id, currency, notes, terms, quote_id, sales_order_id)
    VALUES (_org, _num, 'draft', _uid, _uid, _contact, _company, _currency, _notes, _terms,
            CASE WHEN _from = 'quote' THEN _id END, CASE WHEN _from = 'sales_order' THEN _id END)
    RETURNING id INTO _new;
    _dst_items := 'invoice_items'; _dst_fk := 'invoice_id';
  ELSE
    RAISE EXCEPTION 'Cannot turn a % into a %', _from, _to;
  END IF;

  EXECUTE format(
    'INSERT INTO public.%I (org_id, %I, position, product_id, description, quantity, unit_price, discount_pct, tax_id, tax_rate)
     SELECT org_id, $1, (row_number() OVER (ORDER BY position, created_at) - 1)::int, product_id,
            COALESCE(NULLIF(description, ''''), ''Item''), quantity, unit_price, discount_pct, tax_id, tax_rate
     FROM public.%I WHERE %I = $2', _dst_items, _dst_fk, _src_items, _src_fk)
  USING _new, _id;

  IF _from = 'quote' AND _to = 'invoice' THEN
    UPDATE quotes SET status = 'converted', converted_invoice_id = _new WHERE id = _id;
  ELSIF _from = 'quote' AND _to = 'sales_order' THEN
    UPDATE quotes SET status = 'converted', converted_sales_order_id = _new WHERE id = _id;
  ELSIF _from = 'sales_order' THEN
    UPDATE sales_orders SET invoice_id = _new WHERE id = _id;
  END IF;
  RETURN _new;
END;
$$;
REVOKE ALL ON FUNCTION public.copy_document(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_document(text, uuid, text) TO authenticated;

UPDATE storage.buckets
SET file_size_limit = 10485760, allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
WHERE id = 'feedback';
