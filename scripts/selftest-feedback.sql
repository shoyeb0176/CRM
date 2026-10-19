-- Self-check for bug reports and tickets (0041). Run on a TEST database after `bun run db:migrate`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/selftest-feedback.sql
-- One transaction, rolled back. Prints "feedback selftest: ok" or raises.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.act_as(_u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', _u, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', _u::text, true);
$$;

DO $$
DECLARE
  _rep uuid := gen_random_uuid(); _rev uuid := gen_random_uuid(); _own uuid := gen_random_uuid(); _str uuid := gen_random_uuid();
  _orgA uuid; _orgR uuid; _orgO uuid; _orgS uuid; _t uuid; _n int; _title text;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
    (_rep, 'reporter@fb.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_rev, 'reviewer@fb.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_own, 'owner@fb.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_str, 'stranger@fb.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('FB A', 'fb-a-' || left(_rep::text, 8), _rep) RETURNING id INTO _orgA;
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('FB R', 'fb-r-' || left(_rev::text, 8), _rev) RETURNING id INTO _orgR;
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('FB O', 'fb-o-' || left(_own::text, 8), _own) RETURNING id INTO _orgO;
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('FB S', 'fb-s-' || left(_str::text, 8), _str) RETURNING id INTO _orgS;
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES
    (_orgA, _rep, 'org_owner', 'active'), (_orgR, _rev, 'org_owner', 'active'),
    (_orgO, _own, 'platform_owner', 'active'), (_orgS, _str, 'org_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';

  SET LOCAL ROLE authenticated;

  -- Only a platform owner can add reviewers.
  PERFORM pg_temp.act_as(_rev);
  BEGIN
    PERFORM public.add_platform_reviewer('reviewer@fb.test');
    RAISE EXCEPTION 'non-owner added a reviewer';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.act_as(_own);
  PERFORM public.add_platform_reviewer('REVIEWER@fb.test');
  IF NOT EXISTS (SELECT 1 FROM public.list_platform_reviewers() WHERE email = 'reviewer@fb.test') THEN RAISE EXCEPTION 'reviewer not listed'; END IF;

  -- The reporter files a bug; owners and reviewers hear about it.
  PERFORM pg_temp.act_as(_rep);
  INSERT INTO public.platform_tickets (org_id, kind, title, description, page_url, screenshot_path)
  VALUES (_orgA, 'bug', 'Save button does nothing', 'On the invoice page.', '/app/invoices', _rep::text || '/shot.png') RETURNING id INTO _t;
  BEGIN
    INSERT INTO public.platform_tickets (org_id, title, description, status) VALUES (_orgA, 'x', 'y', 'fixed');
    RAISE EXCEPTION 'reporter set a status';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.platform_tickets (org_id, title, description) VALUES (_orgS, 'x', 'y');
    RAISE EXCEPTION 'reported for a workspace they are not in';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.platform_tickets (org_id, title, description, screenshot_path) VALUES (_orgA, 'x', 'y', _str::text || '/x.png');
    RAISE EXCEPTION 'pointed at someone else''s screenshot';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;

  RESET ROLE;
  SELECT count(*) INTO _n FROM public.notification_events WHERE entity_id = _t AND kind = 'platform.ticket_new' AND user_id IN (_rev, _own);
  IF _n <> 2 THEN RAISE EXCEPTION 'reviewers notified: %', _n; END IF;
  IF EXISTS (SELECT 1 FROM public.notification_events WHERE entity_id = _t AND user_id IN (_rep, _str)) THEN RAISE EXCEPTION 'wrong people notified'; END IF;
  SET LOCAL ROLE authenticated;

  -- A stranger sees nothing and can't write on it.
  PERFORM pg_temp.act_as(_str);
  SELECT count(*) INTO _n FROM public.platform_tickets WHERE id = _t;
  IF _n <> 0 THEN RAISE EXCEPTION 'stranger sees the report'; END IF;
  BEGIN
    INSERT INTO public.platform_ticket_messages (ticket_id, body) VALUES (_t, 'hi');
    RAISE EXCEPTION 'stranger replied';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- The reporter can't change the handling.
  PERFORM pg_temp.act_as(_rep);
  UPDATE public.platform_tickets SET status = 'fixed' WHERE id = _t;
  IF (SELECT status FROM public.platform_tickets WHERE id = _t) <> 'new' THEN RAISE EXCEPTION 'reporter changed the status'; END IF;

  -- A reviewer triages: the report text can't be rewritten; the reporter hears about the status.
  PERFORM pg_temp.act_as(_rev);
  UPDATE public.platform_tickets SET status = 'in_progress', priority = 'high', assignee_id = _rev, title = 'changed' WHERE id = _t;
  SELECT title INTO _title FROM public.platform_tickets WHERE id = _t;
  IF _title <> 'Save button does nothing' THEN RAISE EXCEPTION 'reviewer rewrote the report'; END IF;
  INSERT INTO public.platform_ticket_messages (ticket_id, body, is_internal) VALUES (_t, 'Looks like a missing await.', true);
  INSERT INTO public.platform_ticket_messages (ticket_id, body) VALUES (_t, 'Thanks, we found it. A fix is coming.');

  PERFORM pg_temp.act_as(_rep);
  SELECT count(*) INTO _n FROM public.platform_ticket_messages WHERE ticket_id = _t;
  IF _n <> 1 THEN RAISE EXCEPTION 'reporter sees % messages (internal note leaked?)', _n; END IF;
  INSERT INTO public.platform_ticket_messages (ticket_id, body) VALUES (_t, 'Great, thank you.');
  BEGIN
    INSERT INTO public.platform_ticket_messages (ticket_id, body, is_internal) VALUES (_t, 'sneaky', true);
    RAISE EXCEPTION 'reporter wrote an internal note';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  RESET ROLE;
  SELECT count(*) INTO _n FROM public.notification_events WHERE entity_id = _t AND user_id = _rep AND kind = 'platform.ticket_update';
  IF _n <> 2 THEN RAISE EXCEPTION 'reporter got % updates, expected status + reply', _n; END IF;
  -- The reply goes to the assignee only.
  SELECT count(*) INTO _n FROM public.notification_events WHERE entity_id = _t AND title LIKE 'Reply on%' AND user_id IN (_rev, _own);
  IF _n <> 1 THEN RAISE EXCEPTION 'reply notifications to reviewers: %', _n; END IF;
  IF NOT (SELECT email_due FROM public.notification_events WHERE entity_id = _t AND user_id = _own AND kind = 'platform.ticket_new' LIMIT 1) THEN
    RAISE EXCEPTION 'new reports are not emailed';
  END IF;

  -- Fixed reports get a resolved time.
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.act_as(_own);
  UPDATE public.platform_tickets SET status = 'fixed' WHERE id = _t;
  IF (SELECT resolved_at FROM public.platform_tickets WHERE id = _t) IS NULL THEN RAISE EXCEPTION 'no resolved time'; END IF;

  RAISE NOTICE 'feedback selftest: ok';
END $$;

ROLLBACK;
