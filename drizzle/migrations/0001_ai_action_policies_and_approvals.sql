CREATE TABLE public.ai_action_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action_key text NOT NULL,
  mode text NOT NULL DEFAULT 'confirm' CHECK (mode IN ('read_only','draft','confirm','autonomous')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, action_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_action_policies TO authenticated;
GRANT ALL ON public.ai_action_policies TO service_role;
ALTER TABLE public.ai_action_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read action policies" ON public.ai_action_policies
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "Admins manage action policies" ON public.ai_action_policies
  FOR ALL TO authenticated
  USING (public.has_permission(_key => 'settings.manage', _org => org_id))
  WITH CHECK (public.has_permission(_key => 'settings.manage', _org => org_id));

CREATE TABLE public.ai_proposed_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  conversation_id uuid,
  action_key text NOT NULL,
  title text NOT NULL,
  summary text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  entity_type text,
  entity_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','executed','failed')),
  result jsonb,
  error text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_proposed_actions_org_status_idx ON public.ai_proposed_actions (org_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.ai_proposed_actions TO authenticated;
GRANT ALL ON public.ai_proposed_actions TO service_role;
ALTER TABLE public.ai_proposed_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read proposed actions" ON public.ai_proposed_actions
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "Members create proposed actions" ON public.ai_proposed_actions
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id) AND user_id = auth.uid());
CREATE POLICY "Members update proposed actions" ON public.ai_proposed_actions
  FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));