-- Self-check for the products-with-stock view (0044). Run on a TEST database after `bun run db:migrate`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/selftest-products-stock.sql
-- One transaction, rolled back. Prints "products stock selftest: ok" or raises.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.act_as(_u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', _u, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', _u::text, true);
$$;

DO $$
DECLARE
  _own uuid := gen_random_uuid(); _other uuid := gen_random_uuid();
  _org uuid; _org2 uuid; _w1 uuid; _w2 uuid; _low uuid; _out uuid; _untracked uuid; _ok uuid; _r record; _n int;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
    (_own, 'owner@ps.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_other, 'other@ps.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('PS', 'ps-' || left(_own::text, 8), _own) RETURNING id INTO _org;
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('PS2', 'ps2-' || left(_other::text, 8), _other) RETURNING id INTO _org2;
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES
    (_org, _own, 'org_owner', 'active'), (_org2, _other, 'org_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';

  INSERT INTO public.warehouses (org_id, name) VALUES (_org, 'Main') RETURNING id INTO _w1;
  INSERT INTO public.warehouses (org_id, name) VALUES (_org, 'Back') RETURNING id INTO _w2;
  INSERT INTO public.products (org_id, name, track_inventory, low_stock_threshold) VALUES (_org, 'Low', true, 5) RETURNING id INTO _low;
  INSERT INTO public.products (org_id, name, track_inventory) VALUES (_org, 'Out', true) RETURNING id INTO _out;
  INSERT INTO public.products (org_id, name, track_inventory) VALUES (_org, 'Service', false) RETURNING id INTO _untracked;
  INSERT INTO public.products (org_id, name, track_inventory, low_stock_threshold) VALUES (_org, 'Plenty', true, 5) RETURNING id INTO _ok;
  INSERT INTO public.inventory_stock (org_id, product_id, warehouse_id, quantity) VALUES
    (_org, _low, _w1, 3), (_org, _ok, _w1, 6), (_org, _ok, _w2, 4);

  SET LOCAL ROLE authenticated;

  PERFORM pg_temp.act_as(_own);
  FOR _r IN SELECT id, on_hand, stock_status FROM public.products_with_stock WHERE org_id = _org LOOP
    IF (_r.id = _low AND (_r.on_hand, _r.stock_status) <> (3::numeric, 'low'))
    OR (_r.id = _out AND (_r.on_hand, _r.stock_status) <> (0::numeric, 'out'))
    OR (_r.id = _untracked AND _r.stock_status <> 'untracked')
    OR (_r.id = _ok AND (_r.on_hand, _r.stock_status) <> (10::numeric, 'ok')) THEN
      RAISE EXCEPTION 'wrong stock for %: % %', _r.id, _r.on_hand, _r.stock_status;
    END IF;
  END LOOP;
  SELECT count(*) INTO _n FROM public.products_with_stock WHERE org_id = _org AND stock_status = 'low';
  IF _n <> 1 THEN RAISE EXCEPTION 'low filter returned %', _n; END IF;

  -- Another workspace sees none of it.
  PERFORM pg_temp.act_as(_other);
  SELECT count(*) INTO _n FROM public.products_with_stock WHERE org_id = _org;
  IF _n <> 0 THEN RAISE EXCEPTION 'another workspace saw % products', _n; END IF;

  RAISE NOTICE 'products stock selftest: ok';
END $$;

ROLLBACK;
