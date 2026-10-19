-- Self-check for notifications v2 (0037). Run on a TEST database after `bun run db:migrate`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/selftest-notifications-v2.sql
-- One transaction, rolled back. Prints "notifications v2 selftest: ok" or raises.
BEGIN;

DO $$
DECLARE
  _owner uuid := gen_random_uuid();
  _staff uuid := gen_random_uuid();
  _org uuid;
  _id uuid;
  _n int;
  _link text;
  _kind text;
  _due boolean;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
    (_owner, 'owner@nv2.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_staff, 'staff@nv2.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('NV2 Co', 'nv2-' || left(_owner::text, 8), _owner) RETURNING id INTO _org;
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_org, _owner, 'org_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'org_owner', status = 'active';
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_org, _staff, 'staff', 'active');

  -- Welcome: once, to the creator, opening the getting-started card.
  SELECT count(*), max(link) INTO _n, _link FROM public.notification_events WHERE org_id = _org AND user_id = _owner AND kind = 'system.welcome';
  IF _n <> 1 OR _link <> '/app?welcome=1' THEN RAISE EXCEPTION 'welcome: % rows, link %', _n, _link; END IF;

  -- Staff acts from here (as an AI app user through MCP: no conversation).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _staff::text, true);

  -- AI app request waiting for approval: the requester hears about it (own action included),
  -- deep link to that request, Review button, email due.
  INSERT INTO public.ai_proposed_actions (org_id, user_id, action_key, title, payload, status)
  VALUES (_org, _staff, 'create_lead', 'Create lead: Ken', '{}'::jsonb, 'pending') RETURNING id INTO _id;
  SELECT count(*), max(link), max(kind), bool_and(email_due) INTO _n, _link, _kind, _due
    FROM public.notification_events WHERE user_id = _staff AND entity_id = _id;
  IF _n <> 1 OR _link <> '/app/ai/approvals?action=' || _id OR _kind <> 'ai.approval' OR NOT _due THEN
    RAISE EXCEPTION 'ai approval: n=% link=% kind=% email=%', _n, _link, _kind, _due;
  END IF;
  -- A chat proposal (has a conversation) doesn't notify: the card is in the chat.
  INSERT INTO public.ai_proposed_actions (org_id, user_id, conversation_id, action_key, title, payload, status)
  VALUES (_org, _staff, gen_random_uuid(), 'create_lead', 'Chat lead', '{}'::jsonb, 'pending');
  SELECT count(*) INTO _n FROM public.notification_events WHERE title LIKE '%Chat lead%';
  IF _n <> 0 THEN RAISE EXCEPTION 'chat proposal notified % times', _n; END IF;

  -- The owner approves: the requester gets the result, linked to the new record.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  UPDATE public.ai_proposed_actions SET status = 'executed', result = '{"link": "/app/crm/leads"}', decided_by = _owner WHERE id = _id;
  SELECT max(link) INTO _link FROM public.notification_events WHERE user_id = _staff AND kind = 'ai.approval_result';
  IF _link IS DISTINCT FROM '/app/crm/leads' THEN RAISE EXCEPTION 'ai result link %', _link; END IF;

  -- AI app connected / disconnected: the user and the owners are told (security kind, email due).
  INSERT INTO public.mcp_connections (user_id, client_id, client_name, org_id) VALUES (_staff, 'client-1', 'Claude Code', _org) RETURNING id INTO _id;
  SELECT count(*) INTO _n FROM public.notification_events WHERE kind = 'security.app_connected' AND entity_id = _id AND email_due;
  IF _n <> 2 THEN RAISE EXCEPTION 'app connected: % rows', _n; END IF;
  UPDATE public.mcp_connections SET revoked_at = now() WHERE id = _id;
  SELECT count(*) INTO _n FROM public.notification_events WHERE kind = 'security.app_disconnected' AND entity_id = _id;
  IF _n <> 2 THEN RAISE EXCEPTION 'app disconnected: % rows', _n; END IF;

  -- Personal key made by the server (no signed-in user): its owner is told.
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO public.personal_api_keys (user_id, org_id, name, prefix, key_hash, expires_at)
  VALUES (_staff, _org, 'CI', 'inbp_abc', md5(random()::text), now() + interval '3 days') RETURNING id INTO _id;
  SELECT count(*) INTO _n FROM public.notification_events WHERE user_id = _staff AND kind = 'security.key' AND entity_id = _id;
  IF _n <> 1 THEN RAISE EXCEPTION 'personal key: % rows', _n; END IF;

  -- Daily reminders: the key expires within 7 days; run twice, remind once.
  PERFORM public.run_notification_reminders();
  PERFORM public.run_notification_reminders();
  SELECT count(*) INTO _n FROM public.notification_events WHERE kind = 'security.key_expiring' AND entity_id = _id;
  IF _n <> 1 THEN RAISE EXCEPTION 'key expiring: % rows', _n; END IF;

  -- Generic links point at the record (old callers that pass a list link).
  PERFORM public.notify(_org, ARRAY[_owner], 'Deal', NULL, 'info', 'crm', '/app/crm/deals', 'deal', _id);
  SELECT link INTO _link FROM public.notification_events WHERE user_id = _owner AND title = 'Deal';
  IF _link <> '/app/crm/deals?deal=' || _id THEN RAISE EXCEPTION 'deal link %', _link; END IF;

  -- Muting a kind: no row. Security kinds can't be muted.
  INSERT INTO public.notification_preferences (user_id, kind, in_app) VALUES (_owner, 'crm.deal', false), (_owner, 'security.key', false);
  PERFORM public.notify(_org, ARRAY[_owner], 'Deal 2', NULL, 'info', 'crm', '/app/crm/deals', 'deal', _id);
  SELECT count(*) INTO _n FROM public.notification_events WHERE user_id = _owner AND title = 'Deal 2';
  IF _n <> 0 THEN RAISE EXCEPTION 'muted kind still delivered'; END IF;
  PERFORM public.notify(_org, ARRAY[_owner], 'Key', NULL, 'info', 'security', NULL, 'personal_key', _id, NULL, 'security.key');
  SELECT count(*) INTO _n FROM public.notification_events WHERE user_id = _owner AND title = 'Key';
  IF _n <> 1 THEN RAISE EXCEPTION 'security kind was muted'; END IF;

  -- Role change: the member is told.
  UPDATE public.memberships SET role = 'manager' WHERE org_id = _org AND user_id = _staff;
  SELECT count(*) INTO _n FROM public.notification_events WHERE user_id = _staff AND kind = 'team.role';
  IF _n <> 1 THEN RAISE EXCEPTION 'role change: % rows', _n; END IF;

  -- Support access request: the owners are told, can't be muted.
  INSERT INTO public.impersonation_requests (org_id, requested_by, reason) VALUES (_org, _staff, 'Fix an invoice') RETURNING id INTO _id;
  SELECT count(*) INTO _n FROM public.notification_events WHERE kind = 'access.request' AND entity_id = _id;
  IF _n < 1 THEN RAISE EXCEPTION 'support access request not notified'; END IF;

  -- Email queue: due rows are claimed once.
  SELECT count(*) INTO _n FROM public.claim_notification_emails(_org, 100);
  IF _n < 3 THEN RAISE EXCEPTION 'claimed only % emails', _n; END IF;
  SELECT count(*) INTO _n FROM public.claim_notification_emails(_org, 100);
  IF _n <> 0 THEN RAISE EXCEPTION 'claimed % emails twice', _n; END IF;

  -- Row security: staff can read only their own rows and can't insert any.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _staff::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.notification_events WHERE user_id <> _staff;
  IF _n <> 0 THEN RAISE EXCEPTION 'staff can read % rows of others', _n; END IF;
  SELECT count(*) INTO _n FROM public.notification_preferences WHERE user_id <> _staff;
  IF _n <> 0 THEN RAISE EXCEPTION 'staff can read others'' preferences'; END IF;
  BEGIN
    INSERT INTO public.notification_events (org_id, user_id, title, severity) VALUES (_org, _owner, 'fake', 'info');
    RAISE EXCEPTION 'staff inserted a notification';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  RAISE NOTICE 'notifications v2 selftest: ok';
END $$;

ROLLBACK;
