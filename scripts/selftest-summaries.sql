-- Self-check for the dashboard and module totals (0038). Run on a TEST database after `bun run db:migrate`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/selftest-summaries.sql
-- One transaction, rolled back. Prints "summaries selftest: ok" or raises.
BEGIN;

DO $$
DECLARE
  _a uuid := gen_random_uuid();
  _b uuid := gen_random_uuid();
  _orgA uuid; _orgB uuid; _co uuid; _inv uuid; _wh uuid; _prod uuid; _proj uuid;
  _s jsonb; _m jsonb; _expect numeric; _mod text;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
    (_a, 'a@sum.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_b, 'b@sum.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('Sum A', 'sum-a-' || left(_a::text, 8), _a) RETURNING id INTO _orgA;
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('Sum B', 'sum-b-' || left(_b::text, 8), _b) RETURNING id INTO _orgB;
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_orgA, _a, 'org_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'org_owner', status = 'active';
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_orgB, _b, 'org_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'org_owner', status = 'active';

  -- Some business in A, one deal in B.
  INSERT INTO public.companies (org_id, name) VALUES (_orgA, 'Acme') RETURNING id INTO _co;
  INSERT INTO public.deals (org_id, title, amount, status) VALUES (_orgA, 'Big one', 1000, 'open'), (_orgA, 'Small one', 250, 'open');
  INSERT INTO public.deals (org_id, title, amount, status) VALUES (_orgB, 'B deal', 777, 'open');
  INSERT INTO public.invoices (org_id, number, company_id, status, issue_date) VALUES (_orgA, 'SUM-1', _co, 'sent', current_date) RETURNING id INTO _inv;
  INSERT INTO public.expenses (org_id, amount, tax_amount, total, expense_date) VALUES (_orgA, 50, 0, 50, current_date);
  INSERT INTO public.warehouses (org_id, name) VALUES (_orgA, 'Main') RETURNING id INTO _wh;
  INSERT INTO public.products (org_id, name, track_inventory, low_stock_threshold, cost_price) VALUES (_orgA, 'Bolt', true, 5, 2) RETURNING id INTO _prod;
  INSERT INTO public.inventory_stock (org_id, product_id, warehouse_id, quantity) VALUES (_orgA, _prod, _wh, 2);
  INSERT INTO public.projects (org_id, name) VALUES (_orgA, 'P') RETURNING id INTO _proj;
  INSERT INTO public.project_tasks (org_id, project_id, title, due_date, status) VALUES (_orgA, _proj, 'Late', current_date - 3, 'todo');

  -- As A, through row-level security.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _a::text, true);
  SET LOCAL ROLE authenticated;

  _s := public.dashboard_summary(_orgA);
  IF (_s->>'pipelineTotal')::numeric <> 1250 OR (_s->>'openDeals')::int <> 2 THEN RAISE EXCEPTION 'pipeline %', _s; END IF;
  SELECT COALESCE(sum(balance_due), 0) INTO _expect FROM public.invoices WHERE org_id = _orgA AND status IN ('sent', 'partially_paid', 'overdue');
  IF (_s->>'outstanding')::numeric <> _expect THEN RAISE EXCEPTION 'outstanding % <> %', _s->>'outstanding', _expect; END IF;
  IF jsonb_array_length(_s->'cash') <> 6 OR ((_s->'cash'->5)->>'out')::numeric <> 50 THEN RAISE EXCEPTION 'cash %', _s->'cash'; END IF;
  IF (_s->>'low')::int <> 1 OR (_s->>'out')::int <> 0 THEN RAISE EXCEPTION 'stock low=% out=%', _s->>'low', _s->>'out'; END IF;
  IF (_s->>'overdueTasks')::int <> 1 THEN RAISE EXCEPTION 'overdue tasks %', _s->>'overdueTasks'; END IF;

  -- Another workspace's numbers stay hidden.
  _s := public.dashboard_summary(_orgB);
  IF (_s->>'pipelineTotal')::numeric <> 0 THEN RAISE EXCEPTION 'saw workspace B pipeline: %', _s->>'pipelineTotal'; END IF;

  -- Every module summary runs and returns its charts.
  FOREACH _mod IN ARRAY ARRAY['crm', 'sales', 'inventory', 'purchasing', 'projects', 'accounting', 'hr'] LOOP
    _m := public.module_summary(_orgA, _mod);
    IF _m IS NULL OR _m = '{}'::jsonb THEN RAISE EXCEPTION 'module % empty', _mod; END IF;
  END LOOP;
  _m := public.module_summary(_orgA, 'crm');
  IF jsonb_array_length(_m->'wonLost') <> 6 OR ((_m->'stages'->0)->>'count')::int <> 2 THEN RAISE EXCEPTION 'crm %', _m; END IF;
  _m := public.module_summary(_orgA, 'inventory');
  IF ((_m->'byWarehouse'->0)->>'value')::numeric <> 4 THEN RAISE EXCEPTION 'stock value %', _m->'byWarehouse'; END IF;
  IF public.module_summary(_orgA, 'nope') <> '{}'::jsonb THEN RAISE EXCEPTION 'unknown module'; END IF;

  RESET ROLE;
  -- Modules a workspace uses: NULL means all.
  UPDATE public.organizations SET enabled_modules = ARRAY['crm', 'sales'] WHERE id = _orgA;
  IF (SELECT enabled_modules FROM public.organizations WHERE id = _orgA) <> ARRAY['crm', 'sales'] THEN RAISE EXCEPTION 'enabled_modules'; END IF;

  RAISE NOTICE 'summaries selftest: ok';
END $$;

ROLLBACK;
