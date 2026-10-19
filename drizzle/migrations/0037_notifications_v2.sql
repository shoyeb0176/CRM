-- Notifications v2 (v1.4, 11 Oct 2026): every event a person should know about, each opening the
-- right page, with per-person settings and email for the important ones.
--
--   * notification_events.kind: a stable type ("ai.approval", "security.app_connected", ...).
--     A BEFORE INSERT trigger fills it for every insert path (notify, notify_org, old callers),
--     points generic links at the exact record (?deal=, ?task=, ?request=, ?action=),
--     drops the row when the person muted that kind, and marks it for email when wanted.
--   * notification_preferences: per person and kind, in app on/off and email on/off.
--     Security and support-access notices can't be muted.
--   * notify() gains _kind, _include_actor (so someone hears about their own AI app's request)
--     and _action (the button label, e.g. "Review").
--   * New events: AI approvals from AI apps (MCP) and their results, AI apps connected or
--     disconnected, personal and API keys, support-access requests, portal sign-ins, quote
--     responses from the portal, invoices paid in full, role changes, welcome for a new workspace.
--   * Daily reminders: plan ending or ended, personal keys expiring, approvals waiting 24 h+.
--   * Email queue: rows with email_due are sent by the app (/api/public/notifications/dispatch),
--     called by pg_cron + pg_net every 2 minutes when pg_net is available.
--   * Realtime: notification_events joins the supabase_realtime publication.
-- Re-runnable.

-- ---------- columns ----------
ALTER TABLE public.notification_events
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS action_label text,
  ADD COLUMN IF NOT EXISTS email_due boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_ne_email_due ON public.notification_events (created_at) WHERE email_due AND email_sent_at IS NULL;

UPDATE public.notification_events e SET kind = CASE
    WHEN e.rule_id IS NOT NULL THEN 'alert.' || COALESCE((SELECT r.trigger::text FROM public.automation_rules r WHERE r.id = e.rule_id), 'rule')
    ELSE COALESCE(e.module, 'system') || '.' || COALESCE(e.entity_type, 'event') END
WHERE e.kind IS NULL;

-- ---------- preferences ----------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  in_app boolean NOT NULL DEFAULT true,
  email boolean,               -- NULL = the default for this kind
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own notification preferences" ON public.notification_preferences;
CREATE POLICY "Own notification preferences" ON public.notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE ALL ON public.notification_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

-- Kinds that send an email unless the person turned it off.
CREATE OR REPLACE FUNCTION public.notification_email_default(_kind text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _kind LIKE 'security.%' OR _kind LIKE 'access.%'
      OR _kind IN ('ai.approval', 'ai.approval_reminder', 'billing.payment_failed', 'billing.plan_ending',
                   'billing.plan_ended', 'system.update', 'agents.run_failed');
$$;
-- Security and support-access notices always arrive (in app and by email).
CREATE OR REPLACE FUNCTION public.notification_locked(_kind text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT _kind LIKE 'security.%' OR _kind LIKE 'access.%'; $$;

-- ---------- one place for type, deep link, muting and email ----------
CREATE OR REPLACE FUNCTION public.trg_notification_defaults() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; _param text;
BEGIN
  IF NEW.kind IS NULL THEN
    NEW.kind := CASE
      WHEN NEW.rule_id IS NOT NULL THEN 'alert.' || COALESCE((SELECT r.trigger::text FROM public.automation_rules r WHERE r.id = NEW.rule_id), 'rule')
      ELSE COALESCE(NEW.module, 'system') || '.' || COALESCE(NEW.entity_type, 'event') END;
  END IF;

  -- Point list links at the exact record.
  _param := CASE NEW.entity_type WHEN 'deal' THEN 'deal' WHEN 'task' THEN 'task' WHEN 'leave_request' THEN 'request'
                                 WHEN 'agent_action' THEN 'action' WHEN 'ai_action' THEN 'action' END;
  IF _param IS NOT NULL AND NEW.entity_id IS NOT NULL AND NEW.link IS NOT NULL AND position('?' IN NEW.link) = 0 THEN
    NEW.link := NEW.link || '?' || _param || '=' || NEW.entity_id;
  END IF;
  IF NEW.action_label IS NULL AND NEW.link IS NOT NULL THEN
    NEW.action_label := CASE WHEN NEW.entity_type IN ('agent_action', 'ai_action') THEN 'Review' ELSE 'Open' END;
  END IF;

  SELECT in_app, email INTO p FROM public.notification_preferences WHERE user_id = NEW.user_id AND kind = NEW.kind;
  IF NOT public.notification_locked(NEW.kind) AND p.in_app IS FALSE THEN
    RETURN NULL;   -- muted: no row
  END IF;
  NEW.email_due := public.notification_locked(NEW.kind) OR COALESCE(p.email, public.notification_email_default(NEW.kind));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notification_defaults ON public.notification_events;
CREATE TRIGGER notification_defaults BEFORE INSERT ON public.notification_events
  FOR EACH ROW EXECUTE FUNCTION public.trg_notification_defaults();

-- ---------- notify(): kind, own-request option, button label ----------
DROP FUNCTION IF EXISTS public.notify(uuid, uuid[], text, text, public.notification_severity, text, text, text, uuid, uuid);
CREATE OR REPLACE FUNCTION public.notify(
  _org uuid, _users uuid[], _title text, _body text, _severity public.notification_severity,
  _module text, _link text, _entity_type text DEFAULT NULL, _entity_id uuid DEFAULT NULL, _rule uuid DEFAULT NULL,
  _kind text DEFAULT NULL, _include_actor boolean DEFAULT false, _action text DEFAULT NULL)
RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH ins AS (
    INSERT INTO public.notification_events (org_id, user_id, title, body, severity, module, link, entity_type, entity_id, rule_id, kind, action_label)
    SELECT _org, m.user_id, left(_title, 200), left(_body, 500), _severity, _module, _link, _entity_type, _entity_id, _rule, _kind, _action
    FROM (SELECT DISTINCT user_id FROM public.memberships
          WHERE org_id = _org AND status = 'active' AND user_id = ANY(_users)) m
    WHERE (_rule IS NOT NULL OR _include_actor OR m.user_id IS DISTINCT FROM auth.uid())
      AND (_rule IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.notification_events e
        WHERE e.user_id = m.user_id AND e.rule_id = _rule AND e.entity_id = _entity_id AND e.dismissed_at IS NULL))
    RETURNING 1)
  SELECT count(*)::int FROM ins;
$$;
REVOKE EXECUTE ON FUNCTION public.notify(uuid, uuid[], text, text, public.notification_severity, text, text, text, uuid, uuid, text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify(uuid, uuid[], text, text, public.notification_severity, text, text, text, uuid, uuid, text, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_recipients(uuid, public.app_role[]) TO service_role;

-- A reminder of the same kind for the same record at most once per _days (daily jobs).
CREATE OR REPLACE FUNCTION public.notified_recently(_kind text, _entity uuid, _days int)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.notification_events
                 WHERE kind = _kind AND entity_id = _entity AND created_at > now() - make_interval(days => _days));
$$;
REVOKE EXECUTE ON FUNCTION public.notified_recently(text, uuid, int) FROM PUBLIC, anon, authenticated;

-- ---------- AI assistant / AI app approvals ----------
-- Chat proposals show their own card in the chat, so only requests from outside the app (AI apps
-- through MCP, which have no conversation) notify on arrival. Results reach the requester when
-- someone else decided.
CREATE OR REPLACE FUNCTION public.trg_notify_ai_action() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _mode text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending' AND NEW.conversation_id IS NULL THEN
      SELECT mode INTO _mode FROM public.ai_action_policies WHERE org_id = NEW.org_id AND action_key = NEW.action_key;
      IF COALESCE(_mode, 'confirm') <> 'autonomous' THEN
        PERFORM public.notify(NEW.org_id, ARRAY[NEW.user_id], format('Approval needed: %s', NEW.title),
          'An AI app asked for this change. Nothing happens until you approve it.',
          'warning', 'ai', '/app/ai/approvals', 'ai_action', NEW.id, NULL, 'ai.approval', true, 'Review');
      END IF;
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('executed', 'rejected', 'failed') THEN
    PERFORM public.notify(NEW.org_id, ARRAY[NEW.user_id],
      CASE NEW.status WHEN 'executed' THEN format('Done: %s', NEW.title)
                      WHEN 'rejected' THEN format('Rejected: %s', NEW.title)
                      ELSE format('Failed: %s', NEW.title) END,
      CASE NEW.status WHEN 'failed' THEN left(COALESCE(NEW.error, 'Something went wrong.'), 300) END,
      CASE NEW.status WHEN 'executed' THEN 'success' WHEN 'rejected' THEN 'info' ELSE 'error' END::public.notification_severity,
      'ai', CASE WHEN NEW.status = 'executed' AND NEW.result->>'link' IS NOT NULL THEN NEW.result->>'link'
                 ELSE '/app/ai/approvals?action=' || NEW.id END,
      'ai_result', NEW.id, NULL, 'ai.approval_result', false, 'Open');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_ai_action ON public.ai_proposed_actions;
CREATE TRIGGER notify_ai_action AFTER INSERT OR UPDATE OF status ON public.ai_proposed_actions
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_ai_action();

-- ---------- AI apps (MCP) ----------
CREATE OR REPLACE FUNCTION public.trg_notify_mcp_connection() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _app text := COALESCE(NULLIF(NEW.client_name, ''), 'An AI app');
        _ws text;
BEGIN
  SELECT name INTO _ws FROM public.organizations WHERE id = NEW.org_id;
  IF TG_OP = 'INSERT' OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL) OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    IF NEW.revoked_at IS NULL THEN
      PERFORM public.notify(NEW.org_id, public.notify_recipients(NEW.org_id, '{}') || NEW.user_id,
        format('%s connected to %s', _app, _ws),
        'It can read what its user can see here and propose changes for approval. Disconnect it in Settings › Developer.',
        'info', 'security', '/app/settings/developer', 'mcp_connection', NEW.id, NULL, 'security.app_connected', true, 'View apps');
    END IF;
  ELSIF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
    PERFORM public.notify(NEW.org_id, public.notify_recipients(NEW.org_id, '{}') || NEW.user_id,
      format('%s was disconnected from %s', _app, _ws), 'It can no longer read or change anything here.',
      'info', 'security', '/app/settings/developer', 'mcp_connection', NEW.id, NULL, 'security.app_disconnected', true, 'View apps');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_mcp_connection ON public.mcp_connections;
CREATE TRIGGER notify_mcp_connection AFTER INSERT OR UPDATE OF revoked_at, org_id ON public.mcp_connections
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_mcp_connection();

-- ---------- keys ----------
CREATE OR REPLACE FUNCTION public.trg_notify_personal_key() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify(NEW.org_id, ARRAY[NEW.user_id], format('New personal developer key: %s', NEW.name),
      format('Starts with %s. If you didn''t create it, revoke it now.', NEW.prefix),
      'info', 'security', '/app/settings/developer', 'personal_key', NEW.id, NULL, 'security.key', true, 'View keys');
  ELSIF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
    PERFORM public.notify(NEW.org_id, ARRAY[NEW.user_id], format('Personal developer key revoked: %s', NEW.name),
      'Apps and scripts using it stop working.', 'info', 'security', '/app/settings/developer', 'personal_key', NEW.id,
      NULL, 'security.key', true, 'View keys');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_personal_key ON public.personal_api_keys;
CREATE TRIGGER notify_personal_key AFTER INSERT OR UPDATE OF revoked_at ON public.personal_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_personal_key();

CREATE OR REPLACE FUNCTION public.trg_notify_api_key() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify(NEW.org_id, public.notify_recipients(NEW.org_id, '{}') || NEW.created_by,
      format('New API key: %s', NEW.name), format('Access: %s.', array_to_string(NEW.scopes, ', ')),
      'info', 'security', '/app/settings/developer', 'api_key', NEW.id, NULL, 'security.key', true, 'View keys');
  ELSIF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
    PERFORM public.notify(NEW.org_id, public.notify_recipients(NEW.org_id, '{}') || NEW.created_by,
      format('API key revoked: %s', NEW.name), NULL, 'info', 'security', '/app/settings/developer', 'api_key', NEW.id,
      NULL, 'security.key', true, 'View keys');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_api_key ON public.api_keys;
CREATE TRIGGER notify_api_key AFTER INSERT OR UPDATE OF revoked_at ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_api_key();

-- ---------- support access (impersonation) ----------
CREATE OR REPLACE FUNCTION public.trg_notify_support_access() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ws text; _platform uuid;
BEGIN
  SELECT name INTO _ws FROM public.organizations WHERE id = NEW.org_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify(NEW.org_id, public.notify_recipients(NEW.org_id, '{}'),
      'Inuberry support asks to access your workspace', left(NEW.reason, 300),
      'warning', 'access', '/app/settings/access-log', 'support_access', NEW.id, NULL, 'access.request', false, 'Review');
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'denied') THEN
    SELECT org_id INTO _platform FROM public.memberships
      WHERE user_id = NEW.requested_by AND role = 'platform_owner' AND status = 'active' LIMIT 1;
    IF _platform IS NOT NULL THEN
      PERFORM public.notify(_platform, ARRAY[NEW.requested_by], format('Support access %s: %s', NEW.status, _ws), NULL,
        CASE WHEN NEW.status = 'approved' THEN 'success' ELSE 'info' END::public.notification_severity,
        'access', '/app/platform/impersonation', 'support_access', NEW.id, NULL, 'access.decision', true, 'Open');
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'ended' THEN
    PERFORM public.notify(NEW.org_id, public.notify_recipients(NEW.org_id, '{}'),
      'Inuberry support access ended', 'Support can no longer open your workspace.',
      'info', 'access', '/app/settings/access-log', 'support_access', NEW.id, NULL, 'access.ended', true, 'Open');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_support_access ON public.impersonation_requests;
CREATE TRIGGER notify_support_access AFTER INSERT OR UPDATE OF status ON public.impersonation_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_support_access();

-- ---------- customer portal ----------
CREATE OR REPLACE FUNCTION public.trg_notify_portal_joined() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _co text;
BEGIN
  IF OLD.user_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT name INTO _co FROM public.companies WHERE id = NEW.company_id;
    PERFORM public.notify(NEW.org_id, public.notify_recipients(NEW.org_id, '{manager}') || NEW.created_by,
      format('%s signed in to the customer portal', COALESCE(NULLIF(NEW.full_name, ''), NEW.email)),
      CASE WHEN _co IS NOT NULL THEN format('Customer: %s.', _co) END,
      'success', 'portal', '/app/settings/portal-users', 'portal_user', NEW.id, NULL, 'portal.joined');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_portal_joined ON public.customer_portal_users;
CREATE TRIGGER notify_portal_joined AFTER UPDATE OF user_id ON public.customer_portal_users
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_portal_joined();

CREATE OR REPLACE FUNCTION public.trg_notify_quote_response() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q record;
BEGIN
  SELECT qt.number, qt.owner_id, c.name AS company INTO q
    FROM public.quotes qt LEFT JOIN public.companies c ON c.id = qt.company_id WHERE qt.id = NEW.quote_id;
  PERFORM public.notify(NEW.org_id, public.notify_recipients(NEW.org_id, '{manager,sales_rep}') || q.owner_id,
    format('%s %s quote %s', COALESCE(q.company, 'A customer'),
      CASE NEW.action::text WHEN 'accepted' THEN 'accepted' WHEN 'rejected' THEN 'rejected' ELSE 'commented on' END, q.number),
    left(NEW.comment, 300),
    CASE WHEN NEW.action::text = 'accepted' THEN 'success' WHEN NEW.action::text = 'rejected' THEN 'warning' ELSE 'info' END::public.notification_severity,
    'sales', '/app/sales/quotes/' || NEW.quote_id, 'quote', NEW.quote_id, NULL, 'sales.quote_response');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_quote_response ON public.quote_customer_actions;
CREATE TRIGGER notify_quote_response AFTER INSERT ON public.quote_customer_actions
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_quote_response();

-- ---------- invoices paid in full ----------
CREATE OR REPLACE FUNCTION public.trg_notify_invoice_paid() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    PERFORM public.notify(NEW.org_id, public.notify_recipients(NEW.org_id, '{accountant}') || NEW.owner_id,
      format('Invoice %s is paid in full', NEW.number), format('%s %s.', NEW.total, NEW.currency),
      'success', 'invoices', '/app/invoices/' || NEW.id, 'invoice', NEW.id, NULL, 'invoices.paid');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_invoice_paid ON public.invoices;
CREATE TRIGGER notify_invoice_paid AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_invoice_paid();

-- ---------- team: role changes, welcome ----------
CREATE OR REPLACE FUNCTION public.trg_notify_membership_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ws text; _creator uuid;
BEGIN
  SELECT name, created_by INTO _ws, _creator FROM public.organizations WHERE id = NEW.org_id;
  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role AND NEW.status = 'active' THEN
    PERFORM public.notify(NEW.org_id, ARRAY[NEW.user_id], format('Your role in %s is now %s', _ws, replace(initcap(replace(NEW.role::text, '_', ' ')), 'Org ', '')),
      'What you can see and change has been updated.', 'info', 'team', '/app/settings/roles', 'membership', NEW.id, NULL, 'team.role');
  END IF;
  -- Welcome the person who created the workspace, once, when their owner membership becomes active.
  IF NEW.status = 'active' AND NEW.user_id = _creator AND NEW.role IN ('org_owner', 'platform_owner')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active')
     AND NOT EXISTS (SELECT 1 FROM public.notification_events WHERE org_id = NEW.org_id AND kind = 'system.welcome') THEN
    PERFORM public.notify(NEW.org_id, ARRAY[NEW.user_id], format('Welcome to %s', _ws),
      'Four steps to get going: company details, a teammate, your first customer, and your AI app.',
      'success', 'system', '/app?welcome=1', 'organization', NEW.org_id, NULL, 'system.welcome', true, 'Get started');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_membership_change ON public.memberships;
CREATE TRIGGER notify_membership_change AFTER INSERT OR UPDATE OF role, status ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_membership_change();

-- ---------- daily reminders ----------
CREATE OR REPLACE FUNCTION public.run_notification_reminders()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE x record; _n int := 0; _days int;
BEGIN
  -- Plan or free period ending in 14, 7 or 1 days; ended.
  FOR x IN SELECT s.id, s.org_id, s.status, COALESCE(s.current_period_end, s.trial_ends_at) AS ends, p.name AS plan
           FROM public.organization_subscriptions s LEFT JOIN public.subscription_plans p ON p.id = s.plan_id
           WHERE COALESCE(s.current_period_end, s.trial_ends_at) IS NOT NULL LOOP
    _days := (x.ends::date - current_date);
    IF x.status IN ('active', 'trialing') AND _days IN (14, 7, 1) AND NOT public.notified_recently('billing.plan_ending', x.id, 2) THEN
      _n := _n + public.notify(x.org_id, public.notify_recipients(x.org_id, '{}'),
        format('Your %s plan ends in %s day%s', COALESCE(x.plan, ''), _days, CASE WHEN _days = 1 THEN '' ELSE 's' END),
        format('On %s the workspace becomes read-only until you renew.', x.ends::date),
        'warning', 'billing', '/app/settings/billing', 'subscription', x.id, NULL, 'billing.plan_ending', true, 'Renew');
    ELSIF x.status IN ('expired', 'canceled') AND x.ends::date >= current_date - 1 AND NOT public.notified_recently('billing.plan_ended', x.id, 30) THEN
      _n := _n + public.notify(x.org_id, public.notify_recipients(x.org_id, '{}'),
        'Your plan has ended: the workspace is read-only',
        'You can still see and export everything. Renew to make changes again.',
        'error', 'billing', '/app/settings/billing', 'subscription', x.id, NULL, 'billing.plan_ended', true, 'Renew');
    END IF;
  END LOOP;

  -- Personal developer keys expiring within 7 days.
  FOR x IN SELECT id, org_id, user_id, name, expires_at FROM public.personal_api_keys
           WHERE revoked_at IS NULL AND expires_at BETWEEN now() AND now() + interval '7 days' LOOP
    IF NOT public.notified_recently('security.key_expiring', x.id, 30) THEN
      _n := _n + public.notify(x.org_id, ARRAY[x.user_id], format('Developer key "%s" expires %s', x.name, x.expires_at::date),
        'Make a new one before then so your scripts keep working.', 'warning', 'security', '/app/settings/developer',
        'personal_key', x.id, NULL, 'security.key_expiring', true, 'View keys');
    END IF;
  END LOOP;

  -- Approvals waiting more than a day.
  FOR x IN SELECT id, org_id, user_id, title FROM public.ai_proposed_actions
           WHERE status = 'pending' AND created_at < now() - interval '1 day' AND created_at > now() - interval '14 days' LOOP
    IF NOT public.notified_recently('ai.approval_reminder', x.id, 3) THEN
      _n := _n + public.notify(x.org_id, public.notify_recipients(x.org_id, '{manager}') || x.user_id,
        format('Still waiting for approval: %s', x.title), 'An AI request has been waiting for more than a day.',
        'warning', 'ai', '/app/ai/approvals', 'ai_action', x.id, NULL, 'ai.approval_reminder', true, 'Review');
    END IF;
  END LOOP;
  RETURN _n;
END $$;
REVOKE EXECUTE ON FUNCTION public.run_notification_reminders() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  PERFORM cron.schedule('notification-reminders-daily', '5 6 * * *', 'SELECT public.run_notification_reminders()');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ---------- email queue ----------
-- The app sends rows with email_due (it has the SMTP settings). pg_cron + pg_net call it every
-- 2 minutes; the app saves its own address here the first time it sends.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.notification_dispatch (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  site_url text,
  secret text NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
INSERT INTO private.notification_dispatch (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Server only: the secret the dispatch endpoint expects, after saving the app's address.
CREATE OR REPLACE FUNCTION public.notification_dispatch_secret(_site_url text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE _s text;
BEGIN
  IF _site_url IS NOT NULL THEN UPDATE private.notification_dispatch SET site_url = _site_url WHERE id = 1; END IF;
  SELECT secret INTO _s FROM private.notification_dispatch WHERE id = 1;
  RETURN _s;
END $$;
REVOKE EXECUTE ON FUNCTION public.notification_dispatch_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_dispatch_secret(text) TO service_role;

-- Server only: takes up to _limit due emails (optionally for one workspace) so no two senders send
-- the same one. Each row is tried 3 times at most; the sender clears email_sent_at to retry.
ALTER TABLE public.notification_events ADD COLUMN IF NOT EXISTS email_attempts int NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.claim_notification_emails(_org uuid DEFAULT NULL, _limit int DEFAULT 25)
RETURNS TABLE (id uuid, org_id uuid, org_name text, email text, title text, body text, link text, action_label text, kind text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    SELECT e.id FROM public.notification_events e
    WHERE e.email_due AND e.email_sent_at IS NULL AND e.email_attempts < 3
      AND e.created_at > now() - interval '2 days' AND (_org IS NULL OR e.org_id = _org)
    ORDER BY e.created_at LIMIT _limit FOR UPDATE SKIP LOCKED),
  u AS (
    UPDATE public.notification_events e SET email_sent_at = now(), email_attempts = e.email_attempts + 1
    FROM c WHERE e.id = c.id
    RETURNING e.id, e.org_id, e.user_id, e.title, e.body, e.link, e.action_label, e.kind)
  SELECT u.id, u.org_id, o.name, au.email::text, u.title, u.body, u.link, u.action_label, u.kind
  FROM u JOIN public.organizations o ON o.id = u.org_id JOIN auth.users au ON au.id = u.user_id
  WHERE au.email IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_notification_emails(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_emails(uuid, int) TO service_role;

CREATE OR REPLACE FUNCTION public.kick_notification_dispatch()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE d record;
BEGIN
  SELECT site_url, secret INTO d FROM private.notification_dispatch WHERE id = 1;
  IF d.site_url IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.notification_events WHERE email_due AND email_sent_at IS NULL AND created_at > now() - interval '2 days') THEN
    RETURN;
  END IF;
  PERFORM net.http_post(url := d.site_url || '/api/public/notifications/dispatch',
    headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', d.secret),
    body := '{}'::jsonb);
END $$;
REVOKE EXECUTE ON FUNCTION public.kick_notification_dispatch() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
  PERFORM cron.schedule('notification-email-dispatch', '*/2 * * * *', 'SELECT public.kick_notification_dispatch()');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ---------- realtime ----------
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_events;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ---------- AI agent runs that fail ----------
-- The agent's owner hears about it (the person who started a run sees the error already).
CREATE OR REPLACE FUNCTION public.trg_notify_agent_run_failed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record;
BEGIN
  IF NEW.status = 'failed' AND OLD.status IS DISTINCT FROM 'failed' THEN
    SELECT name, owner_user_id INTO a FROM public.ai_agents WHERE id = NEW.agent_id;
    PERFORM public.notify(NEW.org_id, ARRAY[a.owner_user_id], format('AI agent run failed: %s', COALESCE(a.name, 'agent')),
      left(COALESCE(NEW.error_message, 'No details.'), 300), 'error', 'agents', '/app/agents/' || NEW.agent_id,
      'agent_run', NEW.id, NULL, 'agents.run_failed', false, 'Open agent');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_agent_run_failed ON public.ai_agent_runs;
CREATE TRIGGER notify_agent_run_failed AFTER UPDATE OF status ON public.ai_agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_agent_run_failed();
