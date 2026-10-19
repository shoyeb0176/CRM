-- Self-check for 0047: hidden modules, eligibility bands, sponsor offers, inbox approvals and badge
-- counts. Run on a TEST database after `bun run db:migrate`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/selftest-sponsors-approvals.sql
-- One transaction, rolled back. Prints "sponsors approvals selftest: ok" or raises.
BEGIN;

DO $$
DECLARE
  _a uuid := gen_random_uuid();
  _b uuid := gen_random_uuid();
  _orgA uuid; _orgB uuid; _c jsonb; _n int; _ok boolean;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
    (_a, 'a@sp.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_b, 'b@sp.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('Sp A', 'sp-a-' || left(_a::text, 8), _a) RETURNING id INTO _orgA;
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('Sp B', 'sp-b-' || left(_b::text, 8), _b) RETURNING id INTO _orgB;
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_orgA, _a, 'org_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'org_owner', status = 'active';
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_orgB, _b, 'org_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'org_owner', status = 'active';

  -- Eligibility bands accept the listed values only.
  UPDATE public.organizations SET employee_band = '1-15', revenue_band = 'under-100k' WHERE id = _orgA;
  BEGIN
    UPDATE public.organizations SET employee_band = 'lots' WHERE id = _orgA;
    RAISE EXCEPTION 'bad employee band was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Sponsor offers: one active, one paused (made as the database owner, like the platform owner would).
  INSERT INTO public.sponsor_offers (title, body, url) VALUES ('Live offer', 'Text', 'https://example.com/a');
  INSERT INTO public.sponsor_offers (title, url, is_active) VALUES ('Paused offer', 'https://example.com/b', false);
  BEGIN
    INSERT INTO public.sponsor_offers (title, url) VALUES ('Bad link', 'http://example.com');
    RAISE EXCEPTION 'a non-https offer link was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Approvals waiting in A (one from the assistant) and in B.
  INSERT INTO public.ai_proposed_actions (org_id, user_id, action_key, title, payload, status)
  VALUES (_orgA, _a, 'create_lead', 'Lead: Acme', '{}', 'pending'), (_orgB, _b, 'create_lead', 'Lead: B', '{}', 'pending');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', _a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _a::text, true);
  SET LOCAL ROLE authenticated;

  -- A person's own hidden modules.
  INSERT INTO public.user_preferences (user_id, hidden_modules) VALUES (_a, ARRAY['hr'])
  ON CONFLICT (user_id) DO UPDATE SET hidden_modules = ARRAY['hr'];
  IF (SELECT hidden_modules FROM public.user_preferences WHERE user_id = _a) <> ARRAY['hr'] THEN RAISE EXCEPTION 'hidden_modules'; END IF;

  -- Members see active offers only and can't add one.
  SELECT count(*) INTO _n FROM public.sponsor_offers;
  IF _n <> 1 THEN RAISE EXCEPTION 'member saw % offers (expected the 1 active)', _n; END IF;
  _ok := false;
  BEGIN
    INSERT INTO public.sponsor_offers (title, url) VALUES ('Mine', 'https://example.com/c');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'a member added a sponsor offer'; END IF;

  -- One list and one count, own workspace only.
  SELECT count(*) INTO _n FROM public.inbox_approvals WHERE waiting;
  IF _n <> 1 THEN RAISE EXCEPTION 'inbox_approvals saw % waiting', _n; END IF;
  _c := public.attention_counts(_orgA);
  IF (_c->>'approvals')::int <> 1 OR (_c->>'support')::int <> 0 THEN RAISE EXCEPTION 'attention %', _c; END IF;
  _c := public.attention_counts(_orgB);
  IF (_c->>'approvals')::int <> 0 THEN RAISE EXCEPTION 'saw workspace B approvals: %', _c; END IF;

  _c := public.dashboard_overview(_orgA);
  IF (_c->'setup'->>'quotes') IS NULL OR (_c->'setup'->>'payments')::int <> 0 THEN RAISE EXCEPTION 'first-sale counts %', _c->'setup'; END IF;

  RESET ROLE;
  RAISE NOTICE 'sponsors approvals selftest: ok';
END $$;

ROLLBACK;
