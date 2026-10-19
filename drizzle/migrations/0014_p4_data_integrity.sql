CREATE OR REPLACE FUNCTION public.apply_inventory_adjustment(_org uuid, _warehouse uuid, _product uuid, _variant uuid, _delta numeric, _reason text, _notes text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _user UUID := auth.uid();
  _movement_id UUID;
  _adj_id UUID;
  _on_hand numeric;
  _wh_name text;
BEGIN
  IF NOT public.has_org_role(_org, ARRAY['org_owner','org_admin','inventory_manager','manager']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized to adjust inventory';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(_product::text || _warehouse::text));
  SELECT COALESCE(SUM(quantity),0) INTO _on_hand FROM public.inventory_stock
   WHERE org_id = _org AND product_id = _product AND warehouse_id = _warehouse
     AND variant_id IS NOT DISTINCT FROM _variant;
  IF _on_hand + _delta < 0 THEN
    SELECT name INTO _wh_name FROM public.warehouses WHERE id = _warehouse;
    RAISE EXCEPTION 'Only % in stock in %', trim_scale(_on_hand), COALESCE(_wh_name,'this warehouse') USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.inventory_movements (org_id, product_id, variant_id, warehouse_id, movement_type, quantity, notes, created_by)
  VALUES (_org, _product, _variant, _warehouse, 'adjustment', _delta, COALESCE(_reason || COALESCE(': ' || _notes,''), _notes), _user)
  RETURNING id INTO _movement_id;

  INSERT INTO public.inventory_adjustments (org_id, warehouse_id, product_id, variant_id, reason, notes, quantity_delta, movement_id, created_by)
  VALUES (_org, _warehouse, _product, _variant, _reason, _notes, _delta, _movement_id, _user)
  RETURNING id INTO _adj_id;

  INSERT INTO public.inventory_stock (org_id, product_id, variant_id, warehouse_id, quantity)
  VALUES (_org, _product, _variant, _warehouse, _delta)
  ON CONFLICT (org_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), warehouse_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET quantity = public.inventory_stock.quantity + _delta, updated_at = now();

  RETURN _adj_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_custom_record_field(_id uuid, _key text, _value jsonb)
 RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path TO 'public'
AS $$
  UPDATE public.custom_records
     SET data = COALESCE(data,'{}'::jsonb) || jsonb_build_object(_key, _value), updated_at = now()
   WHERE id = _id;
$$;
GRANT EXECUTE ON FUNCTION public.set_custom_record_field(uuid, text, jsonb) TO authenticated;

ALTER TABLE public.organization_subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;