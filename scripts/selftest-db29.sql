-- Self-check for 0049 (DB-29): screenshot types, report assignees and locked fields, AI actions for
-- scheduled agent runs, onboarding answers in Insights. Run on a TEST database after `bun run db:migrate`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/selftest-db29.sql
-- One transaction, rolled back. Prints "db29 selftest: ok" or raises.
BEGIN;

DO $$
DECLARE
  _owner uuid := gen_random_uuid();
  _rev uuid := gen_random_uuid();
  _user uuid := gen_random_uuid();
  _org uuid; _t uuid; _n int; _r jsonb;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
    (_owner, 'owner@d29.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_rev, 'rev@d29.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_user, 'user@d29.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('D29 Co', 'd29-' || left(_user::text, 8), _user) RETURNING id INTO _org;
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_org, _user, 'org_owner', 'active'), (_org, _rev, 'staff', 'active')
  ON CONFLICT (org_id, user_id) DO NOTHING;
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_org, _owner, 'platform_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'platform_owner', status = 'active';
  INSERT INTO public.platform_reviewers (user_id) VALUES (_rev);
  INSERT INTO public.profiles (id, email) VALUES (_user, 'user@d29.test') ON CONFLICT (id) DO NOTHING;
  UPDATE public.profiles SET referral_source = 'other: a podcast', profession = 'retail' WHERE id = _user;

  -- 5. Screenshots: a picture goes in, a PDF doesn't.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _user::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('feedback', _user::text || '/a.PNG', _user);
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('feedback', _user::text || '/a.pdf', _user);
    RAISE EXCEPTION 'a PDF was accepted into the feedback bucket';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- 4. A report's own details stay as sent; a reviewer (not owner) sees owners and reviewers to assign.
  INSERT INTO public.platform_tickets (org_id, created_by, kind, title, description, app_version)
  VALUES (_org, _user, 'bug', 'It broke', 'Steps', '1.21.0') RETURNING id INTO _t;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _rev, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _rev::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.platform_tickets SET kind = 'idea', app_version = '0.0.1', status = 'in_review' WHERE id = _t;
  SELECT count(*) INTO _n FROM public.list_platform_assignees() WHERE user_id IN (_owner, _rev);
  RESET ROLE;
  IF _n <> 2 THEN RAISE EXCEPTION 'reviewer saw % assignees, expected owner and reviewer', _n; END IF;
  IF (SELECT kind || '/' || app_version || '/' || status FROM public.platform_tickets WHERE id = _t) <> 'bug/1.21.0/in_review' THEN
    RAISE EXCEPTION 'report details changed: %', (SELECT kind || '/' || app_version FROM public.platform_tickets WHERE id = _t);
  END IF;
  -- The reporter's reply reaches reviewers as its own kind.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _user::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.platform_ticket_messages (ticket_id, author_id, body) VALUES (_t, _user, 'More detail');
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.notification_events WHERE entity_id = _t AND kind = 'platform.ticket_reply') THEN
    RAISE EXCEPTION 'reporter reply did not notify as platform.ticket_reply';
  END IF;

  -- 2. The server's own key can use an AI action (scheduled agent runs).
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE service_role;
  _r := public.consume_ai_action(_org, 'agent', false);
  RESET ROLE;
  IF NOT (_r->>'ok')::boolean THEN RAISE EXCEPTION 'service role could not use an AI action: %', _r; END IF;

  -- 1. Insights shows the onboarding answers.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  SET LOCAL ROLE authenticated;
  _r := public.platform_insights();
  RESET ROLE;
  IF NOT (_r->'heard_about' @> '[{"source":"other"}]' AND _r->'professions' @> '[{"profession":"retail"}]') THEN
    RAISE EXCEPTION 'insights miss onboarding answers: % %', _r->'heard_about', _r->'professions';
  END IF;

  RAISE NOTICE 'db29 selftest: ok';
END $$;

ROLLBACK;
