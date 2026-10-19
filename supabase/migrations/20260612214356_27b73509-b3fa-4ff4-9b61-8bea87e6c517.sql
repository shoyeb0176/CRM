
-- Recreate AI agent policies scoped to authenticated only
DROP POLICY IF EXISTS "Actions read by org" ON public.ai_agent_actions;
CREATE POLICY "Actions read by org" ON public.ai_agent_actions FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "Actions update by approver roles" ON public.ai_agent_actions;
CREATE POLICY "Actions update by approver roles" ON public.ai_agent_actions FOR UPDATE TO authenticated USING (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role,'manager'::app_role])) WITH CHECK (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role,'manager'::app_role]));

DROP POLICY IF EXISTS "Approvals read by org" ON public.ai_agent_approvals;
CREATE POLICY "Approvals read by org" ON public.ai_agent_approvals FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "Approvals review by manager+" ON public.ai_agent_approvals;
CREATE POLICY "Approvals review by manager+" ON public.ai_agent_approvals FOR UPDATE TO authenticated USING (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role,'manager'::app_role])) WITH CHECK (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role,'manager'::app_role]));

DROP POLICY IF EXISTS "Audit read by org members" ON public.ai_agent_audit_logs;
CREATE POLICY "Audit read by org members" ON public.ai_agent_audit_logs FOR SELECT TO authenticated USING (is_org_member(org_id));

DROP POLICY IF EXISTS "Connections read by org" ON public.ai_agent_external_connections;
CREATE POLICY "Connections read by org" ON public.ai_agent_external_connections FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "Connections write by admins" ON public.ai_agent_external_connections;
CREATE POLICY "Connections write by admins" ON public.ai_agent_external_connections FOR ALL TO authenticated USING (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role])) WITH CHECK (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role]));

DROP POLICY IF EXISTS "Knowledge read by org" ON public.ai_agent_knowledge_sources;
CREATE POLICY "Knowledge read by org" ON public.ai_agent_knowledge_sources FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "Knowledge write by admins" ON public.ai_agent_knowledge_sources;
CREATE POLICY "Knowledge write by admins" ON public.ai_agent_knowledge_sources FOR ALL TO authenticated USING (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role])) WITH CHECK (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role]));

DROP POLICY IF EXISTS "Memory read by org" ON public.ai_agent_memory;
CREATE POLICY "Memory read by org" ON public.ai_agent_memory FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "Memory write by admins" ON public.ai_agent_memory;
CREATE POLICY "Memory write by admins" ON public.ai_agent_memory FOR ALL TO authenticated USING (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role])) WITH CHECK (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role]));

DROP POLICY IF EXISTS "Messages read by org" ON public.ai_agent_messages;
CREATE POLICY "Messages read by org" ON public.ai_agent_messages FOR SELECT TO authenticated USING (is_org_member(org_id));

DROP POLICY IF EXISTS "Agent perms read by org" ON public.ai_agent_permissions;
CREATE POLICY "Agent perms read by org" ON public.ai_agent_permissions FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "Agent perms write by admins" ON public.ai_agent_permissions;
CREATE POLICY "Agent perms write by admins" ON public.ai_agent_permissions FOR ALL TO authenticated USING (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role])) WITH CHECK (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role]));

DROP POLICY IF EXISTS "Runs delete by admins" ON public.ai_agent_runs;
CREATE POLICY "Runs delete by admins" ON public.ai_agent_runs FOR DELETE TO authenticated USING (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role]));
DROP POLICY IF EXISTS "Runs read by org" ON public.ai_agent_runs;
CREATE POLICY "Runs read by org" ON public.ai_agent_runs FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "Runs update by org admins or owner" ON public.ai_agent_runs;
CREATE POLICY "Runs update by org admins or owner" ON public.ai_agent_runs FOR UPDATE TO authenticated USING (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role,'manager'::app_role]) OR triggered_by_user_id = auth.uid()) WITH CHECK (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role,'manager'::app_role]) OR triggered_by_user_id = auth.uid());

DROP POLICY IF EXISTS "Creds read by admins" ON public.ai_agent_tool_credentials;
CREATE POLICY "Creds read by admins" ON public.ai_agent_tool_credentials FOR SELECT TO authenticated USING (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role]));
DROP POLICY IF EXISTS "Creds write by admins" ON public.ai_agent_tool_credentials;
CREATE POLICY "Creds write by admins" ON public.ai_agent_tool_credentials FOR ALL TO authenticated USING (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role])) WITH CHECK (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role]));

DROP POLICY IF EXISTS "Tools read by org" ON public.ai_agent_tools;
CREATE POLICY "Tools read by org" ON public.ai_agent_tools FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "Tools write by admins" ON public.ai_agent_tools;
CREATE POLICY "Tools write by admins" ON public.ai_agent_tools FOR ALL TO authenticated USING (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role])) WITH CHECK (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role]));

DROP POLICY IF EXISTS "Triggers read by org" ON public.ai_agent_triggers;
CREATE POLICY "Triggers read by org" ON public.ai_agent_triggers FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "Triggers write by admins" ON public.ai_agent_triggers;
CREATE POLICY "Triggers write by admins" ON public.ai_agent_triggers FOR ALL TO authenticated USING (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role])) WITH CHECK (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role]));

DROP POLICY IF EXISTS "Webhooks read by org" ON public.ai_agent_webhooks;
CREATE POLICY "Webhooks read by org" ON public.ai_agent_webhooks FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "Webhooks write by admins" ON public.ai_agent_webhooks;
CREATE POLICY "Webhooks write by admins" ON public.ai_agent_webhooks FOR ALL TO authenticated USING (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role])) WITH CHECK (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role]));

DROP POLICY IF EXISTS "Agents deletable by org admins" ON public.ai_agents;
CREATE POLICY "Agents deletable by org admins" ON public.ai_agents FOR DELETE TO authenticated USING (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role]));
DROP POLICY IF EXISTS "Agents readable by org members" ON public.ai_agents;
CREATE POLICY "Agents readable by org members" ON public.ai_agents FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "Agents updatable by org admins" ON public.ai_agents;
CREATE POLICY "Agents updatable by org admins" ON public.ai_agents FOR UPDATE TO authenticated USING (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role])) WITH CHECK (has_org_role(org_id, ARRAY['org_owner'::app_role,'org_admin'::app_role]));
