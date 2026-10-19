-- Phase 1: model-agnostic AI foundation

DO $$ BEGIN
  CREATE TYPE public.ai_provider_kind AS ENUM (
    'lovable','openai','anthropic','google','azure_openai','openai_compatible'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Per-org provider connections (no secrets stored here)
CREATE TABLE IF NOT EXISTS public.ai_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider public.ai_provider_kind NOT NULL,
  label text NOT NULL,
  base_url text,
  is_enabled boolean NOT NULL DEFAULT true,
  has_key boolean NOT NULL DEFAULT false,
  key_last4 text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_provider_configs_org_idx ON public.ai_provider_configs(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_provider_configs TO authenticated;
GRANT ALL ON public.ai_provider_configs TO service_role;
ALTER TABLE public.ai_provider_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read ai providers" ON public.ai_provider_configs;
CREATE POLICY "members read ai providers" ON public.ai_provider_configs
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
DROP POLICY IF EXISTS "admins write ai providers" ON public.ai_provider_configs;
CREATE POLICY "admins write ai providers" ON public.ai_provider_configs
  FOR ALL TO authenticated
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::public.app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::public.app_role[]));

-- Secrets: never readable by app users. service_role only.
CREATE TABLE IF NOT EXISTS public.ai_provider_secrets (
  provider_config_id uuid PRIMARY KEY REFERENCES public.ai_provider_configs(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.ai_provider_secrets FROM anon, authenticated;
GRANT ALL ON public.ai_provider_secrets TO service_role;
ALTER TABLE public.ai_provider_secrets ENABLE ROW LEVEL SECURITY;
-- intentionally no policies: only service_role (bypasses RLS) may touch this table

-- Purpose -> model routing
CREATE TABLE IF NOT EXISTS public.ai_model_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('assistant','summaries','classification','agents','embeddings')),
  provider_config_id uuid REFERENCES public.ai_provider_configs(id) ON DELETE SET NULL,
  model text NOT NULL,
  max_output_tokens integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, purpose)
);
CREATE INDEX IF NOT EXISTS ai_model_routes_org_idx ON public.ai_model_routes(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_model_routes TO authenticated;
GRANT ALL ON public.ai_model_routes TO service_role;
ALTER TABLE public.ai_model_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read ai routes" ON public.ai_model_routes;
CREATE POLICY "members read ai routes" ON public.ai_model_routes
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
DROP POLICY IF EXISTS "admins write ai routes" ON public.ai_model_routes;
CREATE POLICY "admins write ai routes" ON public.ai_model_routes
  FOR ALL TO authenticated
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::public.app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::public.app_role[]));

-- Org-level AI policy
CREATE TABLE IF NOT EXISTS public.ai_org_policies (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  allow_builtin boolean NOT NULL DEFAULT true,
  default_provider_config_id uuid REFERENCES public.ai_provider_configs(id) ON DELETE SET NULL,
  own_provider_only_modules text[] NOT NULL DEFAULT '{}',
  monthly_budget_usd numeric(12,2),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_org_policies TO authenticated;
GRANT ALL ON public.ai_org_policies TO service_role;
ALTER TABLE public.ai_org_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read ai policy" ON public.ai_org_policies;
CREATE POLICY "members read ai policy" ON public.ai_org_policies
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
DROP POLICY IF EXISTS "admins write ai policy" ON public.ai_org_policies;
CREATE POLICY "admins write ai policy" ON public.ai_org_policies
  FOR ALL TO authenticated
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::public.app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::public.app_role[]));

-- Usage / cost log (append-only for app users)
CREATE TABLE IF NOT EXISTS public.ai_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  purpose text NOT NULL,
  provider public.ai_provider_kind NOT NULL,
  provider_config_id uuid REFERENCES public.ai_provider_configs(id) ON DELETE SET NULL,
  model text NOT NULL,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  cost_usd numeric(12,6),
  duration_ms integer,
  status text NOT NULL DEFAULT 'completed',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_call_logs_org_created_idx ON public.ai_call_logs(org_id, created_at DESC);

GRANT SELECT, INSERT ON public.ai_call_logs TO authenticated;
GRANT ALL ON public.ai_call_logs TO service_role;
ALTER TABLE public.ai_call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read ai logs" ON public.ai_call_logs;
CREATE POLICY "admins read ai logs" ON public.ai_call_logs
  FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::public.app_role[]));
DROP POLICY IF EXISTS "members insert ai logs" ON public.ai_call_logs;
CREATE POLICY "members insert ai logs" ON public.ai_call_logs
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));

DROP TRIGGER IF EXISTS set_updated_at_ai_provider_configs ON public.ai_provider_configs;
CREATE TRIGGER set_updated_at_ai_provider_configs BEFORE UPDATE ON public.ai_provider_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
