CREATE TABLE public.knowledge_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  summary text,
  collection text NOT NULL DEFAULT 'General',
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  source text NOT NULL DEFAULT 'manual',
  source_url text,
  is_published boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_docs_org_idx ON public.knowledge_docs(org_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_docs TO authenticated;
GRANT ALL ON public.knowledge_docs TO service_role;
ALTER TABLE public.knowledge_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_docs member read" ON public.knowledge_docs FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "knowledge_docs member write" ON public.knowledge_docs FOR ALL TO authenticated
  USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));

CREATE TABLE public.import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  target text NOT NULL,
  target_database_id uuid REFERENCES public.custom_databases(id) ON DELETE SET NULL,
  file_name text,
  source text NOT NULL DEFAULT 'csv',
  total_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_runs_org_idx ON public.import_runs(org_id, created_at DESC);
GRANT SELECT, INSERT ON public.import_runs TO authenticated;
GRANT ALL ON public.import_runs TO service_role;
ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import_runs member read" ON public.import_runs FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "import_runs member insert" ON public.import_runs FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));

CREATE TRIGGER knowledge_docs_set_updated_at BEFORE UPDATE ON public.knowledge_docs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();