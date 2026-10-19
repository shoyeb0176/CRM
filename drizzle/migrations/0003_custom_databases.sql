CREATE TABLE public.custom_databases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  icon text,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  database_id uuid REFERENCES public.custom_databases(id) ON DELETE CASCADE,
  entity_type text,
  key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.custom_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  database_id uuid NOT NULL REFERENCES public.custom_databases(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.database_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  database_id uuid NOT NULL REFERENCES public.custom_databases(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Table',
  view_type text NOT NULL DEFAULT 'table',
  group_by text,
  sort_field text,
  sort_dir text NOT NULL DEFAULT 'asc',
  filters jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_custom_databases_org ON public.custom_databases(org_id);
CREATE INDEX idx_custom_fields_db ON public.custom_fields(database_id, sort_order);
CREATE INDEX idx_custom_fields_entity ON public.custom_fields(org_id, entity_type);
CREATE INDEX idx_custom_records_db ON public.custom_records(database_id, sort_order);
CREATE INDEX idx_database_views_db ON public.database_views(database_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_databases TO authenticated;
GRANT ALL ON public.custom_databases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_fields TO authenticated;
GRANT ALL ON public.custom_fields TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_records TO authenticated;
GRANT ALL ON public.custom_records TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.database_views TO authenticated;
GRANT ALL ON public.database_views TO service_role;

ALTER TABLE public.custom_databases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.database_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read custom databases" ON public.custom_databases FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "Members write custom databases" ON public.custom_databases FOR ALL TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "Members read custom fields" ON public.custom_fields FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "Members write custom fields" ON public.custom_fields FOR ALL TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "Members read custom records" ON public.custom_records FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "Members write custom records" ON public.custom_records FOR ALL TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "Members read database views" ON public.database_views FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "Members write database views" ON public.database_views FOR ALL TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));

CREATE TRIGGER set_custom_databases_updated_at BEFORE UPDATE ON public.custom_databases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_custom_fields_updated_at BEFORE UPDATE ON public.custom_fields FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_custom_records_updated_at BEFORE UPDATE ON public.custom_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_database_views_updated_at BEFORE UPDATE ON public.database_views FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();