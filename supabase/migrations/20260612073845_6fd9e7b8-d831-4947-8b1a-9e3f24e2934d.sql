
-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.ai_agent_status AS ENUM ('draft','active','paused','archived');
CREATE TYPE public.ai_agent_run_status AS ENUM ('queued','running','waiting_for_approval','completed','failed','cancelled');
CREATE TYPE public.ai_agent_trigger_kind AS ENUM ('manual','scheduled','webhook','event_based','system');
CREATE TYPE public.ai_agent_message_role AS ENUM ('system','user','assistant','tool','approval','error');
CREATE TYPE public.ai_agent_action_status AS ENUM ('proposed','pending_approval','approved','rejected','executed','failed','cancelled');
CREATE TYPE public.ai_agent_approval_status AS ENUM ('pending','approved','rejected');
CREATE TYPE public.ai_agent_tool_type AS ENUM (
  'internal_erp_action','external_api','webhook','email','database_query',
  'file_reader','report_generator','notification','http_request',
  'custom_function','mcp_server_placeholder'
);
CREATE TYPE public.ai_agent_knowledge_source_type AS ENUM (
  'erp_module','uploaded_file_placeholder','website_url_placeholder','external_api',
  'customer_records','product_catalog','invoice_history','project_data','support_tickets'
);
CREATE TYPE public.ai_agent_memory_visibility AS ENUM ('agent_private','organization_shared','user_specific');
CREATE TYPE public.ai_agent_audit_event AS ENUM (
  'agent_created','agent_updated','agent_deleted','agent_activated','agent_paused',
  'tool_added','tool_removed','permission_changed','run_started','run_completed','run_failed',
  'action_proposed','action_approved','action_rejected','action_executed',
  'credential_updated','webhook_received'
);

-- ============================================================
-- PLAN GATING
-- ============================================================
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS ai_agent_limit INT;
UPDATE public.subscription_plans SET ai_agent_limit = 1    WHERE lower(name) = 'starter';
UPDATE public.subscription_plans SET ai_agent_limit = 3    WHERE lower(name) = 'growth';
UPDATE public.subscription_plans SET ai_agent_limit = 10   WHERE lower(name) = 'business';
UPDATE public.subscription_plans SET ai_agent_limit = NULL WHERE lower(name) = 'enterprise';

-- ============================================================
-- TABLE: ai_agents
-- ============================================================
CREATE TABLE public.ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  agent_type TEXT NOT NULL DEFAULT 'custom',
  status public.ai_agent_status NOT NULL DEFAULT 'draft',
  avatar_url TEXT,
  system_prompt TEXT,
  model_provider TEXT NOT NULL DEFAULT 'lovable_ai',
  model_name TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.3 CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens INT NOT NULL DEFAULT 2048 CHECK (max_tokens > 0),
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  memory_enabled BOOLEAN NOT NULL DEFAULT false,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agents TO authenticated;
GRANT ALL ON public.ai_agents TO service_role;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ai_agents_org ON public.ai_agents(org_id);
CREATE INDEX idx_ai_agents_status ON public.ai_agents(org_id, status);

-- ============================================================
-- HELPER FUNCTIONS (defined after ai_agents exists)
-- ============================================================
CREATE OR REPLACE FUNCTION public.org_within_agent_limit(_org UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _limit INT; _count INT;
BEGIN
  SELECT p.ai_agent_limit INTO _limit
    FROM public.organization_subscriptions s
    JOIN public.subscription_plans p ON p.id = s.plan_id
   WHERE s.org_id = _org;
  IF _limit IS NULL THEN RETURN true; END IF;
  SELECT count(*) INTO _count FROM public.ai_agents
   WHERE org_id = _org AND status <> 'archived';
  RETURN _count < _limit;
END; $$;

CREATE OR REPLACE FUNCTION public.has_agent_permission(_agent_id UUID, _module TEXT, _action TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _org UUID; _ok BOOLEAN;
BEGIN
  SELECT org_id INTO _org FROM public.ai_agents WHERE id = _agent_id;
  IF _org IS NULL THEN RETURN false; END IF;
  IF NOT public.is_org_member(_org) THEN RETURN false; END IF;
  SELECT CASE _action
    WHEN 'read'   THEN COALESCE(can_read, false)
    WHEN 'create' THEN COALESCE(can_create, false)
    WHEN 'update' THEN COALESCE(can_update, false)
    WHEN 'delete' THEN COALESCE(can_delete, false)
    WHEN 'execute' THEN COALESCE(can_execute_action, false)
    ELSE false END
    INTO _ok
  FROM public.ai_agent_permissions
  WHERE agent_id = _agent_id AND module_key = _module
  LIMIT 1;
  RETURN COALESCE(_ok, false);
END; $$;

CREATE OR REPLACE FUNCTION public.can_run_agent(_agent_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _org UUID; _st public.ai_agent_status;
BEGIN
  SELECT org_id, status INTO _org, _st FROM public.ai_agents WHERE id = _agent_id;
  IF _org IS NULL THEN RETURN false; END IF;
  IF _st NOT IN ('active','draft') THEN RETURN false; END IF;
  RETURN public.has_org_role(_org, ARRAY['org_owner','org_admin','manager','sales_rep','accountant','hr_manager','inventory_manager']::app_role[]);
END; $$;

-- ai_agents policies
CREATE POLICY "Agents readable by org members" ON public.ai_agents FOR SELECT
  USING (public.is_org_member(org_id));
CREATE POLICY "Agents manageable by org admins" ON public.ai_agents FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]) AND public.org_within_agent_limit(org_id));
CREATE POLICY "Agents updatable by org admins" ON public.ai_agents FOR UPDATE
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));
CREATE POLICY "Agents deletable by org admins" ON public.ai_agents FOR DELETE
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));

CREATE TRIGGER trg_ai_agents_updated BEFORE UPDATE ON public.ai_agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TABLE: ai_agent_permissions
-- ============================================================
CREATE TABLE public.ai_agent_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  can_read BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_update BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  can_execute_action BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, module_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_permissions TO authenticated;
GRANT ALL ON public.ai_agent_permissions TO service_role;
ALTER TABLE public.ai_agent_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agent perms read by org" ON public.ai_agent_permissions FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Agent perms write by admins" ON public.ai_agent_permissions FOR ALL
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));

-- ============================================================
-- TABLE: ai_agent_tools
-- ============================================================
CREATE TABLE public.ai_agent_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  tool_type public.ai_agent_tool_type NOT NULL,
  description TEXT,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_tools TO authenticated;
GRANT ALL ON public.ai_agent_tools TO service_role;
ALTER TABLE public.ai_agent_tools ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ai_agent_tools_agent ON public.ai_agent_tools(agent_id);
CREATE POLICY "Tools read by org" ON public.ai_agent_tools FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Tools write by admins" ON public.ai_agent_tools FOR ALL
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));
CREATE TRIGGER trg_ai_agent_tools_updated BEFORE UPDATE ON public.ai_agent_tools
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TABLE: ai_agent_tool_credentials (no raw secrets)
-- ============================================================
CREATE TABLE public.ai_agent_tool_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES public.ai_agent_tools(id) ON DELETE CASCADE,
  credential_name TEXT NOT NULL,
  encrypted_secret_reference TEXT NOT NULL, -- e.g. "secret://OPENAI_API_KEY"
  provider TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_tool_credentials TO authenticated;
GRANT ALL ON public.ai_agent_tool_credentials TO service_role;
ALTER TABLE public.ai_agent_tool_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creds read by admins" ON public.ai_agent_tool_credentials FOR SELECT
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));
CREATE POLICY "Creds write by admins" ON public.ai_agent_tool_credentials FOR ALL
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));
CREATE TRIGGER trg_ai_agent_tool_creds_updated BEFORE UPDATE ON public.ai_agent_tool_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TABLE: ai_agent_runs
-- ============================================================
CREATE TABLE public.ai_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  triggered_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_type public.ai_agent_trigger_kind NOT NULL DEFAULT 'manual',
  status public.ai_agent_run_status NOT NULL DEFAULT 'queued',
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_summary TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_runs TO authenticated;
GRANT ALL ON public.ai_agent_runs TO service_role;
ALTER TABLE public.ai_agent_runs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ai_agent_runs_agent ON public.ai_agent_runs(agent_id, created_at DESC);
CREATE INDEX idx_ai_agent_runs_org_status ON public.ai_agent_runs(org_id, status);
CREATE POLICY "Runs read by org" ON public.ai_agent_runs FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Runs insert by org members" ON public.ai_agent_runs FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id) AND public.can_run_agent(agent_id));
CREATE POLICY "Runs update by org admins or owner" ON public.ai_agent_runs FOR UPDATE
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager']::app_role[]) OR triggered_by_user_id = auth.uid())
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager']::app_role[]) OR triggered_by_user_id = auth.uid());
CREATE POLICY "Runs delete by admins" ON public.ai_agent_runs FOR DELETE
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));

-- ============================================================
-- TABLE: ai_agent_messages
-- ============================================================
CREATE TABLE public.ai_agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.ai_agent_runs(id) ON DELETE CASCADE,
  role public.ai_agent_message_role NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_messages TO authenticated;
GRANT ALL ON public.ai_agent_messages TO service_role;
ALTER TABLE public.ai_agent_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ai_agent_messages_run ON public.ai_agent_messages(run_id, created_at);
CREATE POLICY "Messages read by org" ON public.ai_agent_messages FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Messages insert by org" ON public.ai_agent_messages FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id));

-- ============================================================
-- TABLE: ai_agent_actions
-- ============================================================
CREATE TABLE public.ai_agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.ai_agent_runs(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  target_module TEXT,
  target_entity_type TEXT,
  target_entity_id UUID,
  proposed_changes_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.ai_agent_action_status NOT NULL DEFAULT 'proposed',
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_actions TO authenticated;
GRANT ALL ON public.ai_agent_actions TO service_role;
ALTER TABLE public.ai_agent_actions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ai_agent_actions_org_status ON public.ai_agent_actions(org_id, status);
CREATE INDEX idx_ai_agent_actions_run ON public.ai_agent_actions(run_id);
CREATE POLICY "Actions read by org" ON public.ai_agent_actions FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Actions insert by org" ON public.ai_agent_actions FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "Actions update by approver roles" ON public.ai_agent_actions FOR UPDATE
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager']::app_role[]));

-- ============================================================
-- TABLE: ai_agent_approvals
-- ============================================================
CREATE TABLE public.ai_agent_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.ai_agent_runs(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES public.ai_agent_actions(id) ON DELETE CASCADE,
  requested_by_agent BOOLEAN NOT NULL DEFAULT true,
  approval_status public.ai_agent_approval_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_approvals TO authenticated;
GRANT ALL ON public.ai_agent_approvals TO service_role;
ALTER TABLE public.ai_agent_approvals ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ai_agent_approvals_org_status ON public.ai_agent_approvals(org_id, approval_status);
CREATE POLICY "Approvals read by org" ON public.ai_agent_approvals FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Approvals insert by org" ON public.ai_agent_approvals FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "Approvals review by manager+" ON public.ai_agent_approvals FOR UPDATE
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager']::app_role[]));

-- ============================================================
-- TABLE: ai_agent_triggers
-- ============================================================
CREATE TABLE public.ai_agent_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  trigger_name TEXT NOT NULL,
  trigger_type public.ai_agent_trigger_kind NOT NULL,
  trigger_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_triggers TO authenticated;
GRANT ALL ON public.ai_agent_triggers TO service_role;
ALTER TABLE public.ai_agent_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Triggers read by org" ON public.ai_agent_triggers FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Triggers write by admins" ON public.ai_agent_triggers FOR ALL
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));
CREATE TRIGGER trg_ai_agent_triggers_updated BEFORE UPDATE ON public.ai_agent_triggers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TABLE: ai_agent_knowledge_sources
-- ============================================================
CREATE TABLE public.ai_agent_knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  source_type public.ai_agent_knowledge_source_type NOT NULL,
  source_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_knowledge_sources TO authenticated;
GRANT ALL ON public.ai_agent_knowledge_sources TO service_role;
ALTER TABLE public.ai_agent_knowledge_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Knowledge read by org" ON public.ai_agent_knowledge_sources FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Knowledge write by admins" ON public.ai_agent_knowledge_sources FOR ALL
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));
CREATE TRIGGER trg_ai_agent_knowledge_updated BEFORE UPDATE ON public.ai_agent_knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TABLE: ai_agent_memory
-- ============================================================
CREATE TABLE public.ai_agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  memory_key TEXT NOT NULL,
  memory_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT,
  visibility public.ai_agent_memory_visibility NOT NULL DEFAULT 'agent_private',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_memory TO authenticated;
GRANT ALL ON public.ai_agent_memory TO service_role;
ALTER TABLE public.ai_agent_memory ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ai_agent_memory_agent_key ON public.ai_agent_memory(agent_id, memory_key);
CREATE POLICY "Memory read by org" ON public.ai_agent_memory FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Memory write by admins" ON public.ai_agent_memory FOR ALL
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));
CREATE TRIGGER trg_ai_agent_memory_updated BEFORE UPDATE ON public.ai_agent_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TABLE: ai_agent_external_connections
-- ============================================================
CREATE TABLE public.ai_agent_external_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  connection_type TEXT NOT NULL DEFAULT 'api',
  status TEXT NOT NULL DEFAULT 'inactive',
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_external_connections TO authenticated;
GRANT ALL ON public.ai_agent_external_connections TO service_role;
ALTER TABLE public.ai_agent_external_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Connections read by org" ON public.ai_agent_external_connections FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Connections write by admins" ON public.ai_agent_external_connections FOR ALL
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));
CREATE TRIGGER trg_ai_agent_connections_updated BEFORE UPDATE ON public.ai_agent_external_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TABLE: ai_agent_webhooks
-- ============================================================
CREATE TABLE public.ai_agent_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  webhook_name TEXT NOT NULL,
  webhook_url_slug TEXT NOT NULL,
  secret_token_reference TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  last_received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, webhook_url_slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_webhooks TO authenticated;
GRANT ALL ON public.ai_agent_webhooks TO service_role;
ALTER TABLE public.ai_agent_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Webhooks read by org" ON public.ai_agent_webhooks FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Webhooks write by admins" ON public.ai_agent_webhooks FOR ALL
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));
CREATE TRIGGER trg_ai_agent_webhooks_updated BEFORE UPDATE ON public.ai_agent_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TABLE: ai_agent_audit_logs (append-only)
-- ============================================================
CREATE TABLE public.ai_agent_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  run_id UUID REFERENCES public.ai_agent_runs(id) ON DELETE SET NULL,
  action_id UUID REFERENCES public.ai_agent_actions(id) ON DELETE SET NULL,
  event_type public.ai_agent_audit_event NOT NULL,
  event_description TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_agent_audit_logs TO authenticated;
GRANT ALL ON public.ai_agent_audit_logs TO service_role;
ALTER TABLE public.ai_agent_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ai_agent_audit_org ON public.ai_agent_audit_logs(org_id, created_at DESC);
CREATE POLICY "Audit read by org members" ON public.ai_agent_audit_logs FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Audit insert by org members" ON public.ai_agent_audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id));
-- No UPDATE or DELETE policies → append-only.
