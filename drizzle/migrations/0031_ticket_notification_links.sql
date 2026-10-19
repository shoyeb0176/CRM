-- Ticket notifications open the new staff inbox (/app/support/<id>) instead of the company page,
-- and a new message moves its ticket to the top of the inbox.
-- Needs 0030_notifications.sql applied first (uses public.notify / notify_recipients). Re-runnable.

CREATE OR REPLACE FUNCTION public.trg_notify_ticket() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify(NEW.org_id,
    CASE WHEN NEW.assignee_id IS NOT NULL THEN ARRAY[NEW.assignee_id] ELSE public.notify_recipients(NEW.org_id, '{manager}') END,
    format('New support ticket: %s', NEW.subject), left(NEW.description, 200),
    CASE WHEN NEW.priority::text IN ('high', 'urgent') THEN 'warning' ELSE 'info' END::public.notification_severity,
    'support', '/app/support/' || NEW.id, 'support_ticket', NEW.id);
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
    SELECT subject, assignee_id INTO t FROM public.support_tickets WHERE id = NEW.ticket_id;
    PERFORM public.notify(NEW.org_id,
      CASE WHEN t.assignee_id IS NOT NULL THEN ARRAY[t.assignee_id] ELSE public.notify_recipients(NEW.org_id, '{manager}') END,
      format('Customer replied: %s', t.subject), left(NEW.body, 200), 'info', 'support',
      '/app/support/' || NEW.ticket_id, 'support_ticket', NEW.ticket_id);
  END IF;
  -- Any new message counts as activity, so the inbox (sorted by updated_at) shows it on top.
  UPDATE public.support_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_ticket_reply ON public.support_ticket_messages;
CREATE TRIGGER notify_ticket_reply AFTER INSERT ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_ticket_reply();
