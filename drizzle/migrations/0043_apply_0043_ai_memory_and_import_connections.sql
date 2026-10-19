-- 1. Assistant conversations: a running summary of older turns (the latest turns are sent word for
--    word), and the workspace snapshot reused for a few minutes instead of rebuilt every message.
-- 2. Saved import tokens (Notion, Airtable), encrypted by the server; owners and admins only.
-- Safe to run more than once.

ALTER TABLE public.ai_conversations
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS summarized_upto timestamptz,
  ADD COLUMN IF NOT EXISTS snapshot text,
  ADD COLUMN IF NOT EXISTS snapshot_at timestamptz;

CREATE TABLE IF NOT EXISTS public.import_connections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider    text NOT NULL CHECK (provider IN ('notion', 'airtable')),
  label       text,
  -- Encrypted by the server (APP_ENCRYPTION_KEY); never readable from the browser.
  token       text NOT NULL,
  token_last4 text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE (org_id, provider)
);
ALTER TABLE public.import_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_connections FROM anon, authenticated;
GRANT ALL ON public.import_connections TO service_role;
-- The browser can see that a connection exists (not the token) through this view of safe columns.
CREATE OR REPLACE FUNCTION public.list_import_connections(_org uuid)
RETURNS TABLE (provider text, label text, token_last4 text, created_at timestamptz, last_used_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT provider, label, token_last4, created_at, last_used_at FROM public.import_connections
  WHERE org_id = _org AND public.has_org_role(_org, ARRAY['org_owner', 'org_admin']::public.app_role[]);
$$;
REVOKE ALL ON FUNCTION public.list_import_connections(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_import_connections(uuid) TO authenticated;