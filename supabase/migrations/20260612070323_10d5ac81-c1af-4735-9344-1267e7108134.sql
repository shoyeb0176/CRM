
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS fiscal_year_start_month smallint NOT NULL DEFAULT 1;

-- audit_logs: add optional old/new values for richer auditing
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS old_values jsonb,
  ADD COLUMN IF NOT EXISTS new_values jsonb;

-- Ensure org owners/admins can UPDATE their organization (in case policy missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='organizations' AND policyname='Org admins can update organization'
  ) THEN
    EXECUTE $p$CREATE POLICY "Org admins can update organization" ON public.organizations
      FOR UPDATE TO authenticated
      USING (public.has_org_role(id, ARRAY['org_owner','org_admin']::public.app_role[]))
      WITH CHECK (public.has_org_role(id, ARRAY['org_owner','org_admin']::public.app_role[]))$p$;
  END IF;
END $$;
