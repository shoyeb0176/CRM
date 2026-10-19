-- Notifications that actually reach people (found in the v1.2 review, 9 Oct 2026).
--
-- Before: alerts were only created when someone pressed "Run now" in Settings → Automations;
-- companies created after June had no alert rules at all; role-targeted alerts needed an exact
-- role match (an owner never saw low-stock or stale-deal alerts); shared rows could not be marked
-- read; and nothing told people about events (a task assigned to them, a payment, a leave request).
--
-- Now:
--   * One row per recipient (user_id always set), so read/dismiss is per person.
--     Role-targeted alerts always include owners and admins.
--   * Every company has the four standard rules (and new companies get them).
--   * run_automation_rule() runs a rule; run_all_automation_rules() runs daily via pg_cron.
--   * Event notifications by trigger, so they fire however the record was made (app, AI, API, MCP):
--     task assigned, task comment, payment received, leave requested / decided,
--     AI agent action waiting for approval, new support ticket / customer reply, member joined.
--   * Nobody is notified about their own action.
--   * notify_org() replaces direct inserts of company-wide notices (forms, workflows, agents).
-- Re-runnable.

-- ---------- recipients and delivery ----------
CREATE OR REPLACE FUNCTION public.notify_recipients(_org uuid, _roles public.app_role[])
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT user_id), '{}') FROM public.memberships
  WHERE org_id = _org AND status = 'active'
    AND role = ANY(_roles || ARRAY['org_owner', 'org_admin']::public.app_role[]);
$$;

-- Inserts one notification per active member in _users. Events (_rule NULL) skip the person who
-- caused them. Rule alerts reach everyone in _users, but a person who still has an undismissed
-- alert for the same rule and record isn't alerted again.
CREATE OR REPLACE FUNCTION public.notify(
  _org uuid, _users uuid[], _title text, _body text, _severity public.notification_severity,
  _module text, _link text, _entity_type text DEFAULT NULL, _entity_id uuid DEFAULT NULL, _rule uuid DEFAULT NULL)
RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH ins AS (
    INSERT INTO public.notification_events (org_id, user_id, title, body, severity, module, link, entity_type, entity_id, rule_id)
    SELECT _org, m.user_id, left(_title, 200), left(_body, 500), _severity, _module, _link, _entity_type, _entity_id, _rule
    FROM public.memberships m
    WHERE m.org_id = _org AND m.status = 'active' AND m.user_id = ANY(_users)
      AND (_rule IS NOT NULL OR m.user_id IS DISTINCT FROM auth.uid())
      AND (_rule IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.notification_events e
        WHERE e.user_id = m.user_id AND e.rule_id = _rule AND e.entity_id = _entity_id AND e.dismissed_at IS NULL))
    RETURNING 1)
  SELECT count(*)::int FROM ins;
$$;
-- Everyone in the company (workflow "notify" steps, form submissions, agent reminders).
-- Same permission the old direct-insert policy had: owners, admins, managers and staff; server code too.
CREATE OR REPLACE FUNCTION public.notify_org(
  _org uuid, _title text, _body text DEFAULT NULL, _severity public.notification_severity DEFAULT 'info',
  _module text DEFAULT NULL, _link text DEFAULT NULL, _entity_type text DEFAULT NULL, _entity_id uuid DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_org_role(_org, ARRAY['org_owner', 'org_admin', 'manager', 'staff']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.notification_events (org_id, user_id, title, body, severity, module, link, entity_type, entity_id)
  SELECT _org, user_id, left(_title, 200), left(_body, 500), _severity, _module, _link, _entity_type, _entity_id
  FROM public.memberships WHERE org_id = _org AND status = 'active';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_org(uuid, text, text, public.notification_severity, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_org(uuid, text, text, public.notification_severity, text, text, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.notify_recipients(uuid, public.app_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify(uuid, uuid[], text, text, public.notification_severity, text, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------- existing shared rows → one per person; read only your own ----------
INSERT INTO public.notification_events (org_id, user_id, title, body, severity, module, entity_type, entity_id, link, rule_id, read_at, dismissed_at, created_at)
SELECT n.org_id, m.user_id, n.title, n.body, n.severity, n.module, n.entity_type, n.entity_id, n.link, n.rule_id, n.read_at, n.dismissed_at, n.created_at
FROM public.notification_events n
JOIN public.memberships m ON m.org_id = n.org_id AND m.status = 'active'
WHERE (n.user_id IS NULL OR n.audience_role IS NOT NULL)
  AND m.user_id IS DISTINCT FROM n.user_id
  AND (n.audience_role IS NULL OR m.role IN (n.audience_role, 'org_owner', 'org_admin'));
DELETE FROM public.notification_events WHERE user_id IS NULL;
UPDATE public.notification_events SET audience_role = NULL WHERE audience_role IS NOT NULL;

DROP POLICY IF EXISTS "User reads own notifications" ON public.notification_events;
CREATE POLICY "User reads own notifications" ON public.notification_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(org_id));
-- Notifications are created only by the functions below, so nobody can send fake ones.
DROP POLICY IF EXISTS "Org staff create notifications" ON public.notification_events;

-- ---------- standard rules for every company ----------
CREATE OR REPLACE FUNCTION public.seed_automation_rules(_org uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.automation_rules (org_id, name, description, trigger, config, is_system)
  SELECT _org, r.name, r.description, r.trigger::public.automation_trigger, r.config, true
  FROM (VALUES
    ('Invoice overdue alert', 'Notify when an invoice passes its due date with a balance.', 'invoice_overdue', '{"grace_days": 0}'::jsonb),
    ('Low stock alert', 'Notify when inventory falls at or below the low-stock threshold.', 'low_stock', '{}'::jsonb),
    ('Stale deal follow-up', 'Notify deal owners when an open deal has no activity for N days.', 'deal_stale', '{"days": 14}'::jsonb),
    ('Overdue task notification', 'Notify assignees when a task passes its due date.', 'task_overdue', '{}'::jsonb)
  ) AS r(name, description, trigger, config)
  WHERE NOT EXISTS (SELECT 1 FROM public.automation_rules a WHERE a.org_id = _org AND a.trigger = r.trigger::public.automation_trigger);
$$;
REVOKE EXECUTE ON FUNCTION public.seed_automation_rules(uuid) FROM PUBLIC, anon, authenticated;
SELECT public.seed_automation_rules(id) FROM public.organizations;

CREATE OR REPLACE FUNCTION public.trg_org_seed_rules() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.seed_automation_rules(NEW.id); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS org_seed_rules ON public.organizations;
CREATE TRIGGER org_seed_rules AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.trg_org_seed_rules();

-- ---------- running rules ----------
CREATE OR REPLACE FUNCTION public.run_automation_rule(_rule uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.automation_rules;
  _matches int := 0;
  _created int := 0;
  _status public.automation_run_status := 'success';
  _log text;
  x record;
BEGIN
  SELECT * INTO r FROM public.automation_rules WHERE id = _rule;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Rule not found'; END IF;
  -- Signed-in callers must belong to the company; the daily job runs without a user.
  IF auth.uid() IS NOT NULL AND NOT public.is_org_member(r.org_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  BEGIN
    IF r.trigger = 'invoice_overdue' THEN
      FOR x IN SELECT id, number, balance_due, currency, due_date, owner_id FROM public.invoices
               WHERE org_id = r.org_id AND balance_due > 0 AND status IN ('sent', 'partially_paid', 'overdue')
                 AND due_date < current_date - COALESCE((r.config->>'grace_days')::int, 0) LOOP
        _matches := _matches + 1;
        _created := _created + public.notify(r.org_id, array_append(public.notify_recipients(r.org_id, '{accountant}'), x.owner_id),
          format('Invoice %s is overdue', x.number), format('%s %s was due %s.', x.balance_due, x.currency, x.due_date),
          'warning', 'invoices', '/app/invoices/' || x.id, 'invoice', x.id, r.id);
      END LOOP;
    ELSIF r.trigger = 'low_stock' THEN
      FOR x IN SELECT p.id, p.name, p.low_stock_threshold, COALESCE(sum(s.quantity), 0) AS qty
               FROM public.products p LEFT JOIN public.inventory_stock s ON s.product_id = p.id
               WHERE p.org_id = r.org_id AND p.low_stock_threshold > 0
               GROUP BY p.id HAVING COALESCE(sum(s.quantity), 0) <= p.low_stock_threshold LOOP
        _matches := _matches + 1;
        _created := _created + public.notify(r.org_id, public.notify_recipients(r.org_id, '{inventory_manager}'),
          format('Low stock: %s', x.name), format('%s on hand (alert at %s).', x.qty, x.low_stock_threshold),
          'warning', 'inventory', '/app/products/' || x.id, 'product', x.id, r.id);
      END LOOP;
    ELSIF r.trigger = 'deal_stale' THEN
      FOR x IN SELECT id, title, owner_id FROM public.deals
               WHERE org_id = r.org_id AND status = 'open'
                 AND updated_at < now() - make_interval(days => COALESCE((r.config->>'days')::int, 14)) LOOP
        _matches := _matches + 1;
        _created := _created + public.notify(r.org_id, array_append(public.notify_recipients(r.org_id, '{manager}'), x.owner_id),
          format('Deal needs follow-up: %s', x.title), format('No activity for %s+ days.', COALESCE((r.config->>'days')::int, 14)),
          'info', 'crm', '/app/crm/deals', 'deal', x.id, r.id);
      END LOOP;
    ELSIF r.trigger = 'task_overdue' THEN
      FOR x IN SELECT id, title, project_id, due_date, COALESCE(assignee_id, reporter_id) AS who FROM public.project_tasks
               WHERE org_id = r.org_id AND due_date < current_date AND status NOT IN ('done', 'cancelled') LOOP
        _matches := _matches + 1;
        _created := _created + public.notify(r.org_id, ARRAY[x.who],
          format('Task overdue: %s', x.title), format('Was due %s.', x.due_date),
          'warning', 'projects', '/app/projects/' || x.project_id, 'task', x.id, r.id);
      END LOOP;
    END IF;
    _log := format('Scanned %s candidates, created %s notifications.', _matches, _created);
  EXCEPTION WHEN OTHERS THEN
    _status := 'error';
    _log := SQLERRM;
  END;

  INSERT INTO public.automation_runs (org_id, rule_id, status, matches, notifications_created, log, finished_at)
  VALUES (r.org_id, r.id, _status, _matches, _created, _log, now());
  UPDATE public.automation_rules SET last_run_at = now() WHERE id = r.id;
  RETURN jsonb_build_object('matches', _matches, 'created', _created, 'status', _status, 'log', _log);
END $$;
REVOKE EXECUTE ON FUNCTION public.run_automation_rule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_automation_rule(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_all_automation_rules()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _n int := 0;
BEGIN
  FOR _id IN SELECT id FROM public.automation_rules WHERE is_active AND trigger <> 'custom' LOOP
    PERFORM public.run_automation_rule(_id);
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;
REVOKE EXECUTE ON FUNCTION public.run_all_automation_rules() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  PERFORM cron.schedule('automation-rules-daily', '0 6 * * *', 'SELECT public.run_all_automation_rules()');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ---------- event notifications ----------
CREATE OR REPLACE FUNCTION public.trg_notify_task_assigned() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assignee_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id) THEN
    PERFORM public.notify(NEW.org_id, ARRAY[NEW.assignee_id], format('Task assigned to you: %s', NEW.title),
      CASE WHEN NEW.due_date IS NOT NULL THEN format('Due %s.', NEW.due_date) END,
      'info', 'projects', '/app/projects/' || NEW.project_id, 'task', NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_task_assigned ON public.project_tasks;
CREATE TRIGGER notify_task_assigned AFTER INSERT OR UPDATE OF assignee_id ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_task_assigned();

CREATE OR REPLACE FUNCTION public.trg_notify_task_comment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  SELECT title, project_id, assignee_id, reporter_id INTO t FROM public.project_tasks WHERE id = NEW.task_id;
  PERFORM public.notify(NEW.org_id, ARRAY[t.assignee_id, t.reporter_id], format('New comment on: %s', t.title),
    left(NEW.body, 200), 'info', 'projects', '/app/projects/' || t.project_id, 'task', NEW.task_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_task_comment ON public.task_comments;
CREATE TRIGGER notify_task_comment AFTER INSERT ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_task_comment();

CREATE OR REPLACE FUNCTION public.trg_notify_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record;
BEGIN
  SELECT number, owner_id INTO i FROM public.invoices WHERE id = NEW.invoice_id;
  PERFORM public.notify(NEW.org_id, array_append(public.notify_recipients(NEW.org_id, '{accountant}'), i.owner_id),
    format('Payment received: %s', i.number), format('%s %s received.', NEW.amount, NEW.currency),
    'success', 'invoices', '/app/invoices/' || NEW.invoice_id, 'invoice', NEW.invoice_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_payment ON public.payments;
CREATE TRIGGER notify_payment AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_payment();

CREATE OR REPLACE FUNCTION public.trg_notify_leave() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e record;
BEGIN
  SELECT first_name, last_name, user_id INTO e FROM public.employees WHERE id = NEW.employee_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify(NEW.org_id, public.notify_recipients(NEW.org_id, '{hr_manager}'),
      format('Leave request: %s %s', e.first_name, e.last_name),
      format('%s leave, %s to %s.', NEW.leave_type, NEW.start_date, NEW.end_date),
      'info', 'hr', '/app/hr/leave', 'leave_request', NEW.id);
  ELSIF NEW.status IN ('approved', 'rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.notify(NEW.org_id, ARRAY[e.user_id, NEW.requested_by],
      format('Leave %s', NEW.status), format('%s to %s.', NEW.start_date, NEW.end_date),
      CASE WHEN NEW.status = 'approved' THEN 'success' ELSE 'warning' END::public.notification_severity,
      'hr', '/app/hr/leave', 'leave_request', NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_leave ON public.leave_requests;
CREATE TRIGGER notify_leave AFTER INSERT OR UPDATE OF status ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_leave();

CREATE OR REPLACE FUNCTION public.trg_notify_agent_action() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record;
BEGIN
  IF NEW.status = 'pending_approval' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT name, owner_user_id INTO a FROM public.ai_agents WHERE id = NEW.agent_id;
    PERFORM public.notify(NEW.org_id, array_append(public.notify_recipients(NEW.org_id, '{manager}'), a.owner_user_id),
      format('%s needs your approval', COALESCE(a.name, 'An AI agent')), replace(NEW.action_type, '_', ' '),
      'info', 'ai', '/app/agents/approvals', 'agent_action', NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_agent_action ON public.ai_agent_actions;
CREATE TRIGGER notify_agent_action AFTER INSERT OR UPDATE OF status ON public.ai_agent_actions
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_agent_action();

-- ponytail: staff have no ticket inbox yet, so ticket alerts link to the customer's company page.
CREATE OR REPLACE FUNCTION public.trg_notify_ticket() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify(NEW.org_id,
    CASE WHEN NEW.assignee_id IS NOT NULL THEN ARRAY[NEW.assignee_id] ELSE public.notify_recipients(NEW.org_id, '{manager}') END,
    format('New support ticket: %s', NEW.subject), left(NEW.description, 200),
    CASE WHEN NEW.priority::text IN ('high', 'urgent') THEN 'warning' ELSE 'info' END::public.notification_severity,
    'support', CASE WHEN NEW.company_id IS NOT NULL THEN '/app/crm/companies/' || NEW.company_id END, 'support_ticket', NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_ticket ON public.support_tickets;
CREATE TRIGGER notify_ticket AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_ticket();

CREATE OR REPLACE FUNCTION public.trg_notify_ticket_reply() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  IF NEW.author_portal_user_id IS NOT NULL AND NOT NEW.is_internal THEN
    SELECT subject, assignee_id, company_id INTO t FROM public.support_tickets WHERE id = NEW.ticket_id;
    PERFORM public.notify(NEW.org_id,
      CASE WHEN t.assignee_id IS NOT NULL THEN ARRAY[t.assignee_id] ELSE public.notify_recipients(NEW.org_id, '{manager}') END,
      format('Customer replied: %s', t.subject), left(NEW.body, 200), 'info', 'support',
      CASE WHEN t.company_id IS NOT NULL THEN '/app/crm/companies/' || t.company_id END, 'support_ticket', NEW.ticket_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_ticket_reply ON public.support_ticket_messages;
CREATE TRIGGER notify_ticket_reply AFTER INSERT ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_ticket_reply();

CREATE OR REPLACE FUNCTION public.trg_notify_member_joined() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    SELECT full_name, email INTO p FROM public.profiles WHERE id = NEW.user_id;
    PERFORM public.notify(NEW.org_id, array_remove(public.notify_recipients(NEW.org_id, '{}'), NEW.user_id),
      format('%s joined the workspace', COALESCE(NULLIF(p.full_name, ''), p.email, 'A new member')), NULL,
      'info', 'settings', '/app/settings/members', 'membership', NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_member_joined ON public.memberships;
CREATE TRIGGER notify_member_joined AFTER INSERT OR UPDATE OF status ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_member_joined();
