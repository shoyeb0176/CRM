
-- ============ ENUMS ============
CREATE TYPE public.product_type AS ENUM ('physical','service','digital','bundle');
CREATE TYPE public.inv_movement_type AS ENUM ('receipt','sale','transfer_in','transfer_out','adjustment','return','consumption');

-- ============ PRODUCT CATEGORIES ============
CREATE TABLE public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT,
  color TEXT,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cat_select" ON public.product_categories FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "cat_insert" ON public.product_categories FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "cat_update" ON public.product_categories FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "cat_delete" ON public.product_categories FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','inventory_manager']::app_role[]));
CREATE TRIGGER set_updated_at_product_categories BEFORE UPDATE ON public.product_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_product_categories_org ON public.product_categories(org_id);

-- ============ SUPPLIERS ============
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  tax_id TEXT,
  payment_terms TEXT,
  currency TEXT DEFAULT 'USD',
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  country TEXT,
  notes TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sup_select" ON public.suppliers FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "sup_insert" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','inventory_manager','manager']::app_role[]));
CREATE POLICY "sup_update" ON public.suppliers FOR UPDATE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','inventory_manager','manager']::app_role[])) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "sup_delete" ON public.suppliers FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','inventory_manager']::app_role[]));
CREATE TRIGGER set_updated_at_suppliers BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_suppliers_org ON public.suppliers(org_id);

-- ============ PRODUCTS ============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  sku TEXT,
  barcode TEXT,
  name TEXT NOT NULL,
  description TEXT,
  product_type public.product_type NOT NULL DEFAULT 'physical',
  unit_of_measure TEXT NOT NULL DEFAULT 'unit',
  cost_price NUMERIC(14,4) NOT NULL DEFAULT 0,
  sale_price NUMERIC(14,4) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  tax_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  taxable BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  archived BOOLEAN NOT NULL DEFAULT false,
  track_inventory BOOLEAN NOT NULL DEFAULT true,
  low_stock_threshold NUMERIC(14,4),
  weight NUMERIC(14,4),
  image_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, sku)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prod_select" ON public.products FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "prod_insert" ON public.products FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "prod_update" ON public.products FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "prod_delete" ON public.products FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','inventory_manager']::app_role[]));
CREATE TRIGGER set_updated_at_products BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_products_org ON public.products(org_id);
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_supplier ON public.products(supplier_id);
CREATE INDEX idx_products_barcode ON public.products(org_id, barcode);

-- ============ PRODUCT VARIANTS ============
CREATE TABLE public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku TEXT,
  barcode TEXT,
  name TEXT NOT NULL,
  option_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost_price NUMERIC(14,4),
  sale_price NUMERIC(14,4),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pv_select" ON public.product_variants FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "pv_insert" ON public.product_variants FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "pv_update" ON public.product_variants FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "pv_delete" ON public.product_variants FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','inventory_manager']::app_role[]));
CREATE TRIGGER set_updated_at_pv BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_pv_product ON public.product_variants(product_id);

-- ============ WAREHOUSES ============
CREATE TABLE public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  country TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wh_select" ON public.warehouses FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "wh_insert" ON public.warehouses FOR INSERT TO authenticated WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','inventory_manager','manager']::app_role[]));
CREATE POLICY "wh_update" ON public.warehouses FOR UPDATE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','inventory_manager','manager']::app_role[])) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "wh_delete" ON public.warehouses FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','inventory_manager']::app_role[]));
CREATE TRIGGER set_updated_at_wh BEFORE UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_wh_org ON public.warehouses(org_id);

-- ============ INVENTORY LOCATIONS ============
CREATE TABLE public.inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_locations TO authenticated;
GRANT ALL ON public.inventory_locations TO service_role;
ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "il_select" ON public.inventory_locations FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "il_insert" ON public.inventory_locations FOR INSERT TO authenticated WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','inventory_manager','manager']::app_role[]));
CREATE POLICY "il_update" ON public.inventory_locations FOR UPDATE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','inventory_manager','manager']::app_role[])) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "il_delete" ON public.inventory_locations FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','inventory_manager']::app_role[]));
CREATE TRIGGER set_updated_at_il BEFORE UPDATE ON public.inventory_locations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_il_wh ON public.inventory_locations(warehouse_id);

-- ============ INVENTORY STOCK ============
CREATE TABLE public.inventory_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  quantity NUMERIC(16,4) NOT NULL DEFAULT 0,
  reserved NUMERIC(16,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_stock TO authenticated;
GRANT ALL ON public.inventory_stock TO service_role;
ALTER TABLE public.inventory_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ist_select" ON public.inventory_stock FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "ist_insert" ON public.inventory_stock FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "ist_update" ON public.inventory_stock FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "ist_delete" ON public.inventory_stock FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','inventory_manager']::app_role[]));
CREATE TRIGGER set_updated_at_ist BEFORE UPDATE ON public.inventory_stock FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE UNIQUE INDEX uq_inventory_stock ON public.inventory_stock(org_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), warehouse_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX idx_ist_product ON public.inventory_stock(product_id);
CREATE INDEX idx_ist_wh ON public.inventory_stock(warehouse_id);

-- ============ INVENTORY MOVEMENTS ============
CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  movement_type public.inv_movement_type NOT NULL,
  quantity NUMERIC(16,4) NOT NULL,
  unit_cost NUMERIC(14,4),
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_select" ON public.inventory_movements FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "im_insert" ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "im_delete" ON public.inventory_movements FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','inventory_manager']::app_role[]));
CREATE INDEX idx_im_product ON public.inventory_movements(product_id);
CREATE INDEX idx_im_org_created ON public.inventory_movements(org_id, created_at DESC);

-- ============ INVENTORY ADJUSTMENTS ============
CREATE TABLE public.inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  quantity_delta NUMERIC(16,4) NOT NULL,
  movement_id UUID REFERENCES public.inventory_movements(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_adjustments TO authenticated;
GRANT ALL ON public.inventory_adjustments TO service_role;
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "iadj_select" ON public.inventory_adjustments FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "iadj_insert" ON public.inventory_adjustments FOR INSERT TO authenticated WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','inventory_manager','manager']::app_role[]));
CREATE INDEX idx_iadj_org_created ON public.inventory_adjustments(org_id, created_at DESC);

-- ============ APPLY ADJUSTMENT FUNCTION ============
CREATE OR REPLACE FUNCTION public.apply_inventory_adjustment(
  _org UUID,
  _warehouse UUID,
  _product UUID,
  _variant UUID,
  _delta NUMERIC,
  _reason TEXT,
  _notes TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user UUID := auth.uid();
  _movement_id UUID;
  _adj_id UUID;
  _mtype public.inv_movement_type;
BEGIN
  IF NOT public.has_org_role(_org, ARRAY['org_owner','org_admin','inventory_manager','manager']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized to adjust inventory';
  END IF;

  _mtype := 'adjustment';

  INSERT INTO public.inventory_movements (org_id, product_id, variant_id, warehouse_id, movement_type, quantity, notes, created_by)
  VALUES (_org, _product, _variant, _warehouse, _mtype, _delta, COALESCE(_reason || COALESCE(': ' || _notes,''), _notes), _user)
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
$$;

-- ============ SEED DEFAULT WAREHOUSE ============
CREATE OR REPLACE FUNCTION public.seed_default_warehouse(_org UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE org_id = _org) THEN
    INSERT INTO public.warehouses (org_id, name, code, is_default, is_active)
    VALUES (_org, 'Main Warehouse', 'MAIN', true, true);
  END IF;
END;
$$;
