
-- ============== Enums ==============
DO $$ BEGIN CREATE TYPE public.ai_message_role AS ENUM ('system','user','assistant','tool'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.ai_action_status AS ENUM ('pending','completed','failed','dismissed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.automation_trigger AS ENUM ('invoice_overdue','low_stock','deal_stale','task_overdue','custom'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.automation_run_status AS ENUM ('pending','success','error','skipped'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.notification_severity AS ENUM ('info','success','warning','error'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============== ai_conversations ==============
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  capability TEXT,
  module TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aic_org_user ON public.ai_conversations(org_id, user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_aic_updated BEFORE UPDATE ON public.ai_conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== ai_messages ==============
CREATE TABLE IF NOT EXISTS public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role public.ai_message_role NOT NULL,
  content TEXT NOT NULL,
  tokens INT,
  model TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aim_conversation ON public.ai_messages(conversation_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

-- ============== ai_actions ==============
CREATE TABLE IF NOT EXISTS public.ai_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  module TEXT NOT NULL,
  capability TEXT,
  prompt TEXT,
  output TEXT,
  entity_type TEXT,
  entity_id UUID,
  action_status public.ai_action_status NOT NULL DEFAULT 'completed',
  model TEXT,
  tokens INT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aia_org_created ON public.ai_actions(org_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_actions TO authenticated;
GRANT ALL ON public.ai_actions TO service_role;
ALTER TABLE public.ai_actions ENABLE ROW LEVEL SECURITY;

-- ============== automation_rules ==============
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger public.automation_trigger NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,
  last_run_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ar_org ON public.automation_rules(org_id, is_active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_rules TO authenticated;
GRANT ALL ON public.automation_rules TO service_role;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_ar_updated BEFORE UPDATE ON public.automation_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== automation_runs ==============
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  status public.automation_run_status NOT NULL DEFAULT 'pending',
  matches INT NOT NULL DEFAULT 0,
  notifications_created INT NOT NULL DEFAULT 0,
  tasks_created INT NOT NULL DEFAULT 0,
  log TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_arun_rule ON public.automation_runs(rule_id, started_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_runs TO authenticated;
GRANT ALL ON public.automation_runs TO service_role;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

-- ============== notification_events ==============
CREATE TABLE IF NOT EXISTS public.notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  audience_role public.app_role,
  title TEXT NOT NULL,
  body TEXT,
  severity public.notification_severity NOT NULL DEFAULT 'info',
  module TEXT,
  entity_type TEXT,
  entity_id UUID,
  link TEXT,
  rule_id UUID REFERENCES public.automation_rules(id) ON DELETE SET NULL,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ne_user ON public.notification_events(user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ne_org ON public.notification_events(org_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_events TO authenticated;
GRANT ALL ON public.notification_events TO service_role;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

-- ============== RLS Policies ==============
-- ai_conversations: only owner sees their own
CREATE POLICY "Users see own conversations" ON public.ai_conversations FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(org_id));
CREATE POLICY "Users insert own conversations" ON public.ai_conversations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));
CREATE POLICY "Users update own conversations" ON public.ai_conversations FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own conversations" ON public.ai_conversations FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ai_messages: read/write via conversation ownership
CREATE POLICY "Users see messages in own conversations" ON public.ai_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "Users insert messages in own conversations" ON public.ai_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));

-- ai_actions: owner + org admins read; owner inserts
CREATE POLICY "User sees own ai actions" ON public.ai_actions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_org_role(org_id, ARRAY['org_owner','org_admin']::app_role[]));
CREATE POLICY "User inserts ai actions" ON public.ai_actions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));

-- automation_rules: org members read; admins/managers write
CREATE POLICY "Members read automation rules" ON public.automation_rules FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));
CREATE POLICY "Admins manage automation rules" ON public.automation_rules FOR ALL TO authenticated
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager']::app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager']::app_role[]));

-- automation_runs: org members read
CREATE POLICY "Members read automation runs" ON public.automation_runs FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));
CREATE POLICY "Admins write automation runs" ON public.automation_runs FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager']::app_role[]));

-- notification_events
CREATE POLICY "User reads own notifications" ON public.notification_events FOR SELECT TO authenticated
  USING (
    public.is_org_member(org_id) AND (
      user_id IS NULL
      OR user_id = auth.uid()
      OR (audience_role IS NOT NULL AND public.has_org_role(org_id, ARRAY[audience_role]::app_role[]))
    )
  );
CREATE POLICY "User updates own notifications" ON public.notification_events FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Org staff create notifications" ON public.notification_events FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager','staff']::app_role[]));

-- ============== Seed default automation rules per org ==============
INSERT INTO public.automation_rules (org_id, name, description, trigger, config, is_system)
SELECT o.id, 'Invoice overdue alert', 'Notify when an invoice passes its due date with a balance.', 'invoice_overdue',
       jsonb_build_object('grace_days', 0), true
FROM public.organizations o
WHERE NOT EXISTS (SELECT 1 FROM public.automation_rules r WHERE r.org_id = o.id AND r.trigger = 'invoice_overdue');

INSERT INTO public.automation_rules (org_id, name, description, trigger, config, is_system)
SELECT o.id, 'Low stock alert', 'Notify when inventory falls at or below the low-stock threshold.', 'low_stock',
       '{}'::jsonb, true
FROM public.organizations o
WHERE NOT EXISTS (SELECT 1 FROM public.automation_rules r WHERE r.org_id = o.id AND r.trigger = 'low_stock');

INSERT INTO public.automation_rules (org_id, name, description, trigger, config, is_system)
SELECT o.id, 'Stale deal follow-up', 'Notify deal owners when no activity logged for N days.', 'deal_stale',
       jsonb_build_object('days', 14), true
FROM public.organizations o
WHERE NOT EXISTS (SELECT 1 FROM public.automation_rules r WHERE r.org_id = o.id AND r.trigger = 'deal_stale');

INSERT INTO public.automation_rules (org_id, name, description, trigger, config, is_system)
SELECT o.id, 'Overdue task notification', 'Notify assignees when a task passes its due date.', 'task_overdue',
       '{}'::jsonb, true
FROM public.organizations o
WHERE NOT EXISTS (SELECT 1 FROM public.automation_rules r WHERE r.org_id = o.id AND r.trigger = 'task_overdue');
