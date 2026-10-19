-- Self-check for the staff support inbox (0031). Run on a TEST database after `bun run db:migrate`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/selftest-support.sql
-- Everything runs in one transaction and is rolled back. Prints "support selftest: ok" or raises.
BEGIN;

DO $$
DECLARE
  _owner uuid := gen_random_uuid();
  _staff uuid := gen_random_uuid();
  _org uuid;
  _company uuid;
  _portal uuid;
  _ticket uuid;
  _n int;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
    (_owner, 'owner@support.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_staff, 'staff@support.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('Support Test', 'support-' || left(_owner::text, 8), _owner)
  RETURNING id INTO _org;
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_org, _owner, 'org_owner', 'active'), (_org, _staff, 'staff', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';
  INSERT INTO public.companies (org_id, name) VALUES (_org, 'Customer Co') RETURNING id INTO _company;
  INSERT INTO public.customer_portal_users (org_id, company_id, email, status) VALUES (_org, _company, 'c@support.test', 'active')
  RETURNING id INTO _portal;

  -- A customer files a ticket: the owner's alert opens the inbox, not the company page.
  INSERT INTO public.support_tickets (org_id, company_id, subject, created_by_portal_user_id, portal_user_id)
  VALUES (_org, _company, 'Printer on fire', _portal, _portal) RETURNING id INTO _ticket;
  SELECT count(*) INTO _n FROM public.notification_events
  WHERE org_id = _org AND user_id = _owner AND link = '/app/support/' || _ticket;
  IF _n <> 1 THEN RAISE EXCEPTION 'new ticket: owner got % alerts linking to the inbox', _n; END IF;

  -- The customer replies: alert links to the ticket, and the ticket moves to the top (updated_at bumped).
  ALTER TABLE public.support_tickets DISABLE TRIGGER trg_st_updated;
  UPDATE public.support_tickets SET updated_at = '2000-01-01' WHERE id = _ticket;
  ALTER TABLE public.support_tickets ENABLE TRIGGER trg_st_updated;
  INSERT INTO public.support_ticket_messages (org_id, ticket_id, author_portal_user_id, body) VALUES (_org, _ticket, _portal, 'Still burning');
  SELECT count(*) INTO _n FROM public.notification_events
  WHERE org_id = _org AND user_id = _owner AND title LIKE 'Customer replied%' AND link = '/app/support/' || _ticket;
  IF _n <> 1 THEN RAISE EXCEPTION 'customer reply: owner got % alerts linking to the inbox', _n; END IF;
  IF (SELECT updated_at FROM public.support_tickets WHERE id = _ticket) < '2001-01-01' THEN
    RAISE EXCEPTION 'customer reply did not bump the ticket''s updated_at';
  END IF;

  PERFORM set_config('supporttest.org', _org::text, true);
  PERFORM set_config('supporttest.ticket', _ticket::text, true);
  PERFORM set_config('supporttest.staff', _staff::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _staff::text, true);
END $$;

-- As a plain staff member (the inbox's permissions): read the ticket and thread,
-- reply, add an internal note, and change status / priority / assignee.
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  _org uuid := current_setting('supporttest.org')::uuid;
  _ticket uuid := current_setting('supporttest.ticket')::uuid;
  _staff uuid := current_setting('supporttest.staff')::uuid;
  _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.support_tickets WHERE org_id = _org;
  IF _n <> 1 THEN RAISE EXCEPTION 'staff sees % tickets, expected 1', _n; END IF;
  INSERT INTO public.support_ticket_messages (org_id, ticket_id, author_user_id, body, is_internal) VALUES
    (_org, _ticket, _staff, 'On it', false), (_org, _ticket, _staff, 'Call the fire brigade', true);
  SELECT count(*) INTO _n FROM public.support_ticket_messages WHERE ticket_id = _ticket;
  IF _n <> 3 THEN RAISE EXCEPTION 'staff sees % messages, expected 3', _n; END IF;
  UPDATE public.support_tickets SET status = 'resolved', resolved_at = now(), priority = 'urgent', assignee_id = _staff WHERE id = _ticket;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 1 THEN RAISE EXCEPTION 'staff ticket update changed % rows', _n; END IF;
  RAISE NOTICE 'support selftest: ok';
END $$;

ROLLBACK;
