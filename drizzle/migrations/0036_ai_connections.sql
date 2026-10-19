-- "Connect your AI": outside AI apps (Claude Code, Codex, ChatGPT, Claude.ai, …) reach a workspace
-- through the MCP server at /mcp, either by signing in (OAuth; the user picks the workspace on the
-- consent page, kept per app in mcp_connections) or with a personal developer key (personal_api_keys,
-- stored hashed; the server checks it with the service role).

CREATE TABLE IF NOT EXISTS public.mcp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  client_name text,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (user_id, client_id)
);
ALTER TABLE public.mcp_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mcp_connections_own_read" ON public.mcp_connections
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "mcp_connections_own_insert" ON public.mcp_connections
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));
CREATE POLICY "mcp_connections_own_update" ON public.mcp_connections
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));
REVOKE ALL ON public.mcp_connections FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.mcp_connections TO authenticated;
GRANT ALL ON public.mcp_connections TO service_role;

CREATE TABLE IF NOT EXISTS public.personal_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS personal_api_keys_user_idx ON public.personal_api_keys(user_id, created_at DESC);
ALTER TABLE public.personal_api_keys ENABLE ROW LEVEL SECURITY;
-- Users see and revoke their own keys; the hash is never selected by the app. Keys are created by a
-- server function after it checks membership, so there is no INSERT policy for users.
CREATE POLICY "personal_api_keys_own_read" ON public.personal_api_keys
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "personal_api_keys_own_revoke" ON public.personal_api_keys
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- Supabase grants every table to authenticated by default; take that back so a user can only set
-- revoked_at (never move a key to another workspace).
REVOKE ALL ON public.personal_api_keys FROM anon, authenticated;
GRANT SELECT, UPDATE (revoked_at) ON public.personal_api_keys TO authenticated;
GRANT ALL ON public.personal_api_keys TO service_role;
