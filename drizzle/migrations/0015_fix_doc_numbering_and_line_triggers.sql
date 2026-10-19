CREATE OR REPLACE FUNCTION public.next_doc_number(_org uuid, _doc doc_type)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _num BIGINT; _prefix TEXT; _padding INT; _default_prefix TEXT;
BEGIN
  IF NOT public.is_org_member(_org) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  _default_prefix := CASE _doc::text WHEN 'quote' THEN 'QUO-' WHEN 'sales_order' THEN 'SO-' WHEN 'invoice' THEN 'INV-'
    WHEN 'purchase_order' THEN 'PO-' WHEN 'vendor_bill' THEN 'BILL-' WHEN 'expense' THEN 'EXP-' WHEN 'journal' THEN 'JE-' ELSE 'DOC-' END;
  INSERT INTO public.invoice_number_sequences (org_id, doc_type, prefix, padding, next_value)
  VALUES (_org, _doc, _default_prefix, 5, 1)
  ON CONFLICT (org_id, doc_type) DO NOTHING;
  UPDATE public.invoice_number_sequences SET next_value = next_value + 1
   WHERE org_id = _org AND doc_type = _doc
   RETURNING next_value - 1, prefix, padding INTO _num, _prefix, _padding;
  RETURN COALESCE(_prefix, _default_prefix) || lpad(_num::TEXT, COALESCE(_padding, 5), '0');
END; $function$;

ALTER FUNCTION public.trg_recalc_invoice() SECURITY DEFINER;
ALTER FUNCTION public.trg_recalc_je() SECURITY DEFINER;
ALTER FUNCTION public.trg_recalc_po() SECURITY DEFINER;
ALTER FUNCTION public.trg_recalc_quote() SECURITY DEFINER;
ALTER FUNCTION public.trg_recalc_so() SECURITY DEFINER;
ALTER FUNCTION public.trg_recalc_vendor_bill() SECURITY DEFINER;
REVOKE EXECUTE ON FUNCTION public.trg_recalc_invoice(), public.trg_recalc_je(), public.trg_recalc_po(), public.trg_recalc_quote(), public.trg_recalc_so(), public.trg_recalc_vendor_bill() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.replace_journal_entry_lines(_entry uuid, _lines jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _org uuid; _status journal_status;
BEGIN
  SELECT org_id, status INTO _org, _status FROM public.journal_entries WHERE id = _entry;
  IF _org IS NULL THEN RAISE EXCEPTION 'Journal entry not found'; END IF;
  IF NOT public.is_org_member(_org) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _status <> 'draft' THEN RAISE EXCEPTION 'Only draft entries can be edited'; END IF;
  DELETE FROM public.journal_entry_lines WHERE journal_entry_id = _entry;
  INSERT INTO public.journal_entry_lines (org_id, journal_entry_id, account_id, debit, credit, memo, position)
  SELECT _org, _entry, (l->>'account_id')::uuid, COALESCE((l->>'debit')::numeric,0), COALESCE((l->>'credit')::numeric,0),
         NULLIF(l->>'memo',''), COALESCE((l->>'position')::int, ord::int)
  FROM jsonb_array_elements(COALESCE(_lines,'[]'::jsonb)) WITH ORDINALITY AS t(l, ord);
END; $function$;
REVOKE EXECUTE ON FUNCTION public.replace_journal_entry_lines(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_journal_entry_lines(uuid, jsonb) TO authenticated;