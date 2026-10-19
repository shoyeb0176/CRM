CREATE TABLE public.comm_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'slack',
  name TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_delivery_at TIMESTAMPTZ,
  last_error TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comm_channels TO authenticated;
GRANT ALL ON public.comm_channels TO service_role;
ALTER TABLE public.comm_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage comm channels" ON public.comm_channels
  FOR ALL TO authenticated
  USING (public.has_permission(org_id, 'org.manage'))
  WITH CHECK (public.has_permission(org_id, 'org.manage'));
CREATE POLICY "Members read comm channels" ON public.comm_channels
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));

CREATE TABLE public.comm_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  account_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comm_accounts TO authenticated;
GRANT ALL ON public.comm_accounts TO service_role;
ALTER TABLE public.comm_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own comm accounts" ON public.comm_accounts
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id) AND user_id = auth.uid())
  WITH CHECK (public.is_org_member(org_id) AND user_id = auth.uid());

CREATE TABLE public.comm_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'email',
  direction TEXT NOT NULL DEFAULT 'outbound',
  subject TEXT NOT NULL,
  body TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_minutes INTEGER,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  entity_type TEXT,
  entity_id UUID,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  external_id TEXT,
  account_id UUID REFERENCES public.comm_accounts(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comm_events TO authenticated;
GRANT ALL ON public.comm_events TO service_role;
ALTER TABLE public.comm_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage comm events" ON public.comm_events
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

CREATE INDEX idx_comm_events_entity ON public.comm_events (org_id, entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_comm_events_org_time ON public.comm_events (org_id, occurred_at DESC);
CREATE UNIQUE INDEX idx_comm_events_external ON public.comm_events (org_id, source, external_id) WHERE external_id IS NOT NULL;

CREATE TRIGGER set_comm_channels_updated_at BEFORE UPDATE ON public.comm_channels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_comm_accounts_updated_at BEFORE UPDATE ON public.comm_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_comm_events_updated_at BEFORE UPDATE ON public.comm_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();