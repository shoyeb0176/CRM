-- Bug reports and tickets from workspace users to the people who run Inuberry. A report can carry
-- a screenshot (private bucket "feedback", in the reporter's own folder). Reporters see their own
-- reports and the replies meant for them; platform owners and platform reviewers see everything.
-- Reviewers are a separate list (not a membership role), so a developer can triage reports without
-- getting billing, plans or impersonation. Safe to run more than once.

-- 1. Who reviews reports.
CREATE TABLE IF NOT EXISTS public.platform_reviewers (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_reviewers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_reviewers FROM anon, authenticated;
GRANT SELECT ON public.platform_reviewers TO authenticated;
GRANT ALL ON public.platform_reviewers TO service_role;

CREATE OR REPLACE FUNCTION public.is_platform_reviewer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_owner()
      OR EXISTS (SELECT 1 FROM public.platform_reviewers WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_platform_reviewer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_reviewer() TO authenticated;

DROP POLICY IF EXISTS platform_reviewers_read ON public.platform_reviewers;
CREATE POLICY platform_reviewers_read ON public.platform_reviewers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_owner());

-- Owners add a reviewer by email, or remove one.
CREATE OR REPLACE FUNCTION public.add_platform_reviewer(_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'Only platform owners can add reviewers' USING ERRCODE = '42501'; END IF;
  SELECT id INTO _id FROM auth.users WHERE lower(email) = lower(trim(_email));
  IF _id IS NULL THEN RAISE EXCEPTION 'No Inuberry account uses that email. Ask them to sign up first.' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.platform_reviewers (user_id, added_by) VALUES (_id, auth.uid()) ON CONFLICT (user_id) DO NOTHING;
  RETURN _id;
END $$;
CREATE OR REPLACE FUNCTION public.remove_platform_reviewer(_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'Only platform owners can remove reviewers' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.platform_reviewers WHERE user_id = _user;
END $$;
-- Reviewers with their email and name, for the owner's list.
CREATE OR REPLACE FUNCTION public.list_platform_reviewers()
RETURNS TABLE (user_id uuid, email text, full_name text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.user_id, u.email::text, p.full_name, r.created_at
  FROM public.platform_reviewers r JOIN auth.users u ON u.id = r.user_id LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE public.is_platform_owner() ORDER BY r.created_at;
$$;
REVOKE ALL ON FUNCTION public.add_platform_reviewer(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_platform_reviewer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_platform_reviewers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_platform_reviewer(text), public.remove_platform_reviewer(uuid), public.list_platform_reviewers() TO authenticated;

-- 2. Reports and their conversation.
CREATE SEQUENCE IF NOT EXISTS public.platform_ticket_seq;
CREATE TABLE IF NOT EXISTS public.platform_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number   text NOT NULL UNIQUE DEFAULT ('FB-' || lpad(nextval('public.platform_ticket_seq')::text, 5, '0')),
  org_id          uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_by      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  kind            text NOT NULL DEFAULT 'bug' CHECK (kind IN ('bug', 'issue', 'idea', 'question')),
  title           text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  description     text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 10000),
  page_url        text CHECK (length(page_url) <= 2000),
  app_version     text CHECK (length(app_version) <= 40),
  user_agent      text CHECK (length(user_agent) <= 500),
  viewport        text CHECK (length(viewport) <= 40),
  screenshot_path text CHECK (screenshot_path IS NULL OR screenshot_path LIKE (created_by::text || '/%')),
  status          text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'in_progress', 'fixed', 'wont_fix', 'closed')),
  priority        text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assignee_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_tickets_status_idx ON public.platform_tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_tickets_creator_idx ON public.platform_tickets (created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_ticket_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES public.platform_tickets(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 10000),
  is_internal boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_ticket_messages_ticket_idx ON public.platform_ticket_messages (ticket_id, created_at);

ALTER TABLE public.platform_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_ticket_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_tickets, public.platform_ticket_messages FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.platform_tickets TO authenticated;
GRANT SELECT, INSERT ON public.platform_ticket_messages TO authenticated;
GRANT USAGE ON SEQUENCE public.platform_ticket_seq TO authenticated;
GRANT ALL ON public.platform_tickets, public.platform_ticket_messages TO service_role;

DROP POLICY IF EXISTS platform_tickets_read ON public.platform_tickets;
CREATE POLICY platform_tickets_read ON public.platform_tickets FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_platform_reviewer());
DROP POLICY IF EXISTS platform_tickets_create ON public.platform_tickets;
CREATE POLICY platform_tickets_create ON public.platform_tickets FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND status = 'new' AND assignee_id IS NULL
              AND (org_id IS NULL OR public.is_org_member(org_id)));
DROP POLICY IF EXISTS platform_tickets_triage ON public.platform_tickets;
CREATE POLICY platform_tickets_triage ON public.platform_tickets FOR UPDATE TO authenticated
  USING (public.is_platform_reviewer()) WITH CHECK (public.is_platform_reviewer());

DROP POLICY IF EXISTS platform_ticket_messages_read ON public.platform_ticket_messages;
CREATE POLICY platform_ticket_messages_read ON public.platform_ticket_messages FOR SELECT TO authenticated
  USING (public.is_platform_reviewer()
         OR (NOT is_internal AND EXISTS (SELECT 1 FROM public.platform_tickets t WHERE t.id = ticket_id AND t.created_by = auth.uid())));
DROP POLICY IF EXISTS platform_ticket_messages_write ON public.platform_ticket_messages;
CREATE POLICY platform_ticket_messages_write ON public.platform_ticket_messages FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND (
    public.is_platform_reviewer()
    OR (NOT is_internal AND EXISTS (SELECT 1 FROM public.platform_tickets t WHERE t.id = ticket_id AND t.created_by = auth.uid()))));

CREATE OR REPLACE FUNCTION public.trg_platform_ticket_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IN ('fixed', 'wont_fix', 'closed') AND OLD.status NOT IN ('fixed', 'wont_fix', 'closed') THEN NEW.resolved_at := now(); END IF;
  IF NEW.status NOT IN ('fixed', 'wont_fix', 'closed') THEN NEW.resolved_at := NULL; END IF;
  -- The report itself stays as written; reviewers change only its handling.
  NEW.created_by := OLD.created_by; NEW.title := OLD.title; NEW.description := OLD.description;
  NEW.screenshot_path := OLD.screenshot_path; NEW.page_url := OLD.page_url; NEW.org_id := OLD.org_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS platform_ticket_touch ON public.platform_tickets;
CREATE TRIGGER platform_ticket_touch BEFORE UPDATE ON public.platform_tickets
  FOR EACH ROW EXECUTE FUNCTION public.trg_platform_ticket_touch();

-- 3. Screenshots: private bucket, each user writes only into their own folder.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('feedback', 'feedback', false, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS feedback_upload_own ON storage.objects;
CREATE POLICY feedback_upload_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'feedback' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS feedback_read ON storage.objects;
CREATE POLICY feedback_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'feedback' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_platform_reviewer()));

-- 4. Notifications. Reviewers may not belong to the reporter's workspace, so theirs are filed
-- under a workspace of their own (the bell counts other workspaces too).
CREATE OR REPLACE FUNCTION public.notify_platform_reviewers(_title text, _body text, _link text, _entity uuid, _kind text, _only uuid DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notification_events (org_id, user_id, title, body, severity, module, link, entity_type, entity_id, kind, action_label)
  SELECT (SELECT m.org_id FROM public.memberships m WHERE m.user_id = r.user_id AND m.status = 'active' ORDER BY m.created_at LIMIT 1),
         r.user_id, left(_title, 200), left(_body, 500), 'info'::public.notification_severity, 'platform', _link, 'platform_ticket', _entity, _kind, 'Open'
  FROM (SELECT user_id FROM public.memberships WHERE role = 'platform_owner' AND status = 'active'
        UNION SELECT user_id FROM public.platform_reviewers) r
  WHERE r.user_id IS DISTINCT FROM auth.uid()
    AND (_only IS NULL OR r.user_id = _only)
    AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id = r.user_id AND m.status = 'active');
$$;
REVOKE ALL ON FUNCTION public.notify_platform_reviewers(text, text, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- The reporter, filed under the workspace they reported from (or their first one).
CREATE OR REPLACE FUNCTION public.notify_ticket_reporter(_t public.platform_tickets, _title text, _body text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notification_events (org_id, user_id, title, body, severity, module, link, entity_type, entity_id, kind, action_label)
  SELECT COALESCE(
           (SELECT m.org_id FROM public.memberships m WHERE m.user_id = _t.created_by AND m.org_id = _t.org_id AND m.status = 'active'),
           (SELECT m.org_id FROM public.memberships m WHERE m.user_id = _t.created_by AND m.status = 'active' ORDER BY m.created_at LIMIT 1)),
         _t.created_by, left(_title, 200), left(_body, 500), 'info'::public.notification_severity, 'platform', '/app/feedback?ticket=' || _t.id,
         'platform_ticket', _t.id, 'platform.ticket_update', 'Open'
  WHERE _t.created_by IS DISTINCT FROM auth.uid()
    AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id = _t.created_by AND m.status = 'active');
$$;
REVOKE ALL ON FUNCTION public.notify_ticket_reporter(public.platform_tickets, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_platform_ticket_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _label text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_platform_reviewers(
      format('New %s report: %s', NEW.kind, NEW.title), left(NEW.description, 300),
      '/app/platform/feedback/' || NEW.id, NEW.id, 'platform.ticket_new');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    _label := CASE NEW.status WHEN 'in_review' THEN 'being looked at' WHEN 'in_progress' THEN 'being fixed'
                              WHEN 'fixed' THEN 'fixed' WHEN 'wont_fix' THEN 'closed without a change' WHEN 'closed' THEN 'closed'
                              ELSE 'reopened' END;
    PERFORM public.notify_ticket_reporter(NEW, format('%s is %s', NEW.ticket_number, _label), NEW.title);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS platform_ticket_notify ON public.platform_tickets;
CREATE TRIGGER platform_ticket_notify AFTER INSERT OR UPDATE OF status ON public.platform_tickets
  FOR EACH ROW EXECUTE FUNCTION public.trg_platform_ticket_notify();

CREATE OR REPLACE FUNCTION public.trg_platform_message_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.platform_tickets%ROWTYPE;
BEGIN
  SELECT * INTO _t FROM public.platform_tickets WHERE id = NEW.ticket_id;
  IF NEW.author_id = _t.created_by THEN
    -- The reporter wrote back: tell the assignee, or every reviewer if nobody has it yet.
    PERFORM public.notify_platform_reviewers(format('Reply on %s', _t.ticket_number), left(NEW.body, 300),
      '/app/platform/feedback/' || _t.id, _t.id, 'platform.ticket_new', _t.assignee_id);
  ELSIF NOT NEW.is_internal THEN
    PERFORM public.notify_ticket_reporter(_t, format('Reply on %s', _t.ticket_number), left(NEW.body, 300));
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS platform_message_notify ON public.platform_ticket_messages;
CREATE TRIGGER platform_message_notify AFTER INSERT ON public.platform_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_platform_message_notify();

-- New reports and replies are emailed to reviewers and reporters unless they turn it off.
CREATE OR REPLACE FUNCTION public.notification_email_default(_kind text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _kind LIKE 'security.%' OR _kind LIKE 'access.%'
      OR _kind IN ('ai.approval', 'ai.approval_reminder', 'billing.payment_failed', 'billing.plan_ending',
                   'billing.plan_ended', 'system.update', 'agents.run_failed',
                   'platform.ticket_new', 'platform.ticket_update');
$$;
