-- File attachments on records (companies, contacts, deals, invoices, bills, projects, employees…)
-- and storage metering for the storage plans.
--
-- Files live in the private Supabase Storage bucket "org-files" at {org_id}/{entity_type}/{entity_id}/{file}.
-- Uploads and downloads go through the server (signed URLs), which checks membership, the plan and
-- the storage quota first. Members can list their workspace's attachments and delete them.
-- Safe to run more than once.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('org-files', 'org-files', false, 52428800)          -- 50 MB per file
ON CONFLICT (id) DO NOTHING;

-- Defence in depth: even without the server, a signed-in user can only reach files in folders of
-- workspaces they belong to. (The server uses signed URLs, which don't depend on these.)
DROP POLICY IF EXISTS org_files_member_read ON storage.objects;
CREATE POLICY org_files_member_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'org-files'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

CREATE TABLE IF NOT EXISTS public.attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type  text NOT NULL CHECK (entity_type IN
                 ('company', 'contact', 'deal', 'lead', 'quote', 'invoice', 'sales_order', 'purchase_order',
                  'vendor_bill', 'expense', 'project', 'task', 'employee', 'supplier', 'product')),
  entity_id    uuid NOT NULL,
  path         text NOT NULL UNIQUE,
  file_name    text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  mime_type    text,
  size_bytes   bigint NOT NULL CHECK (size_bytes >= 0),
  uploaded_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attachments_entity_idx ON public.attachments (org_id, entity_type, entity_id);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attachments FROM anon, authenticated;
GRANT SELECT, DELETE ON public.attachments TO authenticated;   -- rows are added by the server after upload
GRANT ALL ON public.attachments TO service_role;

DROP POLICY IF EXISTS attachments_select ON public.attachments;
CREATE POLICY attachments_select ON public.attachments FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));
DROP POLICY IF EXISTS attachments_delete ON public.attachments;
CREATE POLICY attachments_delete ON public.attachments FOR DELETE TO authenticated
  USING (public.is_org_member(org_id));

-- Bytes stored by a workspace (members and the platform owner only).
CREATE OR REPLACE FUNCTION public.org_storage_used_bytes(_org uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(size_bytes), 0)::bigint
    FROM public.attachments
   WHERE org_id = _org
     AND (public.is_org_member(_org) OR public.is_platform_owner() OR auth.role() = 'service_role');
$$;
GRANT EXECUTE ON FUNCTION public.org_storage_used_bytes(uuid) TO authenticated, service_role;
