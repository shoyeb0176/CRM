-- Probe: checks whether migrations pushed from GitHub get applied. Dropped again in a later migration.
CREATE OR REPLACE FUNCTION public.qa_migration_probe()
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$ SELECT 'applied'::text $$;
REVOKE ALL ON FUNCTION public.qa_migration_probe() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qa_migration_probe() TO authenticated;
