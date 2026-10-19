-- Self-check for the module overview pages (0046). Run on a TEST database after `bun run db:migrate`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/selftest-overview.sql
-- One transaction, rolled back. Prints "overview selftest: ok" or raises.
BEGIN;

DO $$
DECLARE
  _a uuid := gen_random_uuid();
  _b uuid := gen_random_uuid();
  _orgA uuid; _orgB uuid; _co uuid; _proj uuid; _emp uuid;
  _m jsonb; _mod text;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
    (_a, 'a@ov.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_b, 'b@ov.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('Ov A', 'ov-a-' || left(_a::text, 8), _a) RETURNING id INTO _orgA;
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('Ov B', 'ov-b-' || left(_b::text, 8), _b) RETURNING id INTO _orgB;
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_orgA, _a, 'org_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'org_owner', status = 'active';
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_orgB, _b, 'org_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'org_owner', status = 'active';

  INSERT INTO public.companies (org_id, name) VALUES (_orgA, 'Acme') RETURNING id INTO _co;
  INSERT INTO public.deals (org_id, title, amount, status) VALUES (_orgA, 'Big one', 1000, 'open'), (_orgA, 'Small one', 250, 'open');
  INSERT INTO public.deals (org_id, title, amount, status) VALUES (_orgB, 'B deal', 777, 'open');
  INSERT INTO public.quotes (org_id, number, status) VALUES (_orgA, 'OV-Q1', 'sent'), (_orgA, 'OV-Q2', 'accepted');
  INSERT INTO public.expenses (org_id, amount, tax_amount, total, expense_date) VALUES (_orgA, 50, 0, 50, current_date);
  INSERT INTO public.projects (org_id, name, status, due_date) VALUES (_orgA, 'Soon', 'active', current_date + 3) RETURNING id INTO _proj;
  INSERT INTO public.project_tasks (org_id, project_id, title, due_date, status) VALUES (_orgA, _proj, 'Late', current_date - 3, 'todo');
  INSERT INTO public.employees (org_id, first_name, last_name, status, start_date)
  VALUES (_orgA, 'Ann', 'Iversary', 'active', (current_date - interval '2 years' + interval '5 days')::date) RETURNING id INTO _emp;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', _a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _a::text, true);
  SET LOCAL ROLE authenticated;

  -- Every module answers with its charts and, except inventory, its card numbers.
  FOREACH _mod IN ARRAY ARRAY['crm', 'sales', 'purchasing', 'projects', 'accounting', 'hr'] LOOP
    _m := public.module_overview(_orgA, _mod);
    IF _m->'kpis' IS NULL THEN RAISE EXCEPTION 'module % has no kpis: %', _mod, _m; END IF;
    IF _m = _m->'kpis' THEN RAISE EXCEPTION 'module % lost its charts', _mod; END IF;
  END LOOP;
  IF public.module_overview(_orgA, 'inventory') <> public.module_summary(_orgA, 'inventory') THEN RAISE EXCEPTION 'inventory changed'; END IF;

  _m := public.module_overview(_orgA, 'crm');
  IF (_m->'kpis'->>'pipeline')::numeric <> 1250 OR (_m->'kpis'->>'openDealsCount')::int <> 2 OR (_m->'kpis'->>'companies')::int <> 1
    THEN RAISE EXCEPTION 'crm kpis %', _m->'kpis'; END IF;
  IF jsonb_typeof(_m->'recent') <> 'array' OR jsonb_typeof(_m->'stages') <> 'array' THEN RAISE EXCEPTION 'crm shape %', _m; END IF;

  _m := public.module_overview(_orgA, 'sales');
  IF (_m->'kpis'->>'openQuotes')::int <> 1 THEN RAISE EXCEPTION 'open quotes %', _m->'kpis'; END IF;

  _m := public.module_overview(_orgA, 'purchasing');
  IF (_m->'kpis'->>'monthlyExpenses')::numeric <> 50 OR jsonb_typeof(_m->'recent'->'pos') <> 'array' THEN RAISE EXCEPTION 'purchasing %', _m; END IF;

  _m := public.module_overview(_orgA, 'projects');
  IF (_m->'kpis'->>'activeCount')::int <> 1 OR (_m->'kpis'->>'overdueTasks')::int <> 1 OR jsonb_array_length(_m->'kpis'->'nearing') <> 1
    THEN RAISE EXCEPTION 'projects %', _m->'kpis'; END IF;

  _m := public.module_overview(_orgA, 'hr');
  IF (_m->'kpis'->>'active')::int <> 1 OR jsonb_array_length(_m->'kpis'->'anniversaries') <> 1 THEN RAISE EXCEPTION 'hr %', _m->'kpis'; END IF;

  _m := public.dashboard_overview(_orgA);
  IF (_m->>'pipelineTotal')::numeric <> 1250 OR jsonb_typeof(_m->'recentPOs') <> 'array' OR (_m->'setup'->>'companies')::int <> 1
     OR jsonb_array_length(_m->'stages') < 1 THEN RAISE EXCEPTION 'dashboard %', _m; END IF;

  -- Another workspace's numbers stay hidden.
  _m := public.module_overview(_orgB, 'crm');
  IF (_m->'kpis'->>'pipeline')::numeric <> 0 THEN RAISE EXCEPTION 'saw workspace B: %', _m->'kpis'; END IF;

  RESET ROLE;
  RAISE NOTICE 'overview selftest: ok';
END $$;

ROLLBACK;
