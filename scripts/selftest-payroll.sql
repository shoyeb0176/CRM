-- Self-check for US pay runs (0040). Run on a TEST database after `bun run db:migrate`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/selftest-payroll.sql
-- One transaction, rolled back. Prints "payroll selftest: ok" or raises.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.act_as(_u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', _u, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', _u::text, true);
$$;

DO $$
DECLARE
  _owner uuid := gen_random_uuid(); _hr uuid := gen_random_uuid(); _staff uuid := gen_random_uuid(); _other uuid := gen_random_uuid();
  _org uuid; _orgB uuid; _emp uuid; _run uuid; _run2 uuid; _je uuid; _pay uuid; _n int; _dr numeric; _cr numeric; _st text;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
    (_owner, 'owner@pay.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_hr, 'hr@pay.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_staff, 'staff@pay.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_other, 'other@pay.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('Pay A', 'pay-a-' || left(_owner::text, 8), _owner) RETURNING id INTO _org;
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('Pay B', 'pay-b-' || left(_other::text, 8), _other) RETURNING id INTO _orgB;
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES
    (_org, _owner, 'org_owner', 'active'), (_org, _hr, 'hr_manager', 'active'), (_org, _staff, 'staff', 'active'), (_orgB, _other, 'org_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';
  PERFORM public.seed_default_coa(_org);
  INSERT INTO public.employees (org_id, first_name, last_name) VALUES (_org, 'Pat', 'Payee') RETURNING id INTO _emp;

  SET LOCAL ROLE authenticated;

  -- HR drafts a run with one balanced line (single, biweekly $2,000; see src/lib/payroll/us.test.ts).
  PERFORM pg_temp.act_as(_hr);
  INSERT INTO public.pay_runs (org_id, period_start, period_end, pay_date) VALUES (_org, '2026-01-01', '2026-01-14', '2026-01-16') RETURNING id INTO _run;
  INSERT INTO public.pay_run_lines (org_id, pay_run_id, employee_id, gross, federal_tax, social_security, medicare, net, employer_social_security, employer_medicare, futa)
  VALUES (_org, _run, _emp, 2000, 156.15, 124, 29, 1690.85, 124, 29, 12);

  -- A line that doesn't add up is refused.
  BEGIN
    UPDATE public.pay_run_lines SET net = 1700 WHERE pay_run_id = _run;
    RAISE EXCEPTION 'unbalanced line accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- The status can't be changed by a direct update.
  BEGIN
    UPDATE public.pay_runs SET status = 'paid' WHERE id = _run;
    RAISE EXCEPTION 'status changed directly';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;

  -- Staff and other workspaces see nothing and can't call the steps.
  PERFORM pg_temp.act_as(_staff);
  SELECT count(*) INTO _n FROM public.pay_runs WHERE org_id = _org;
  IF _n <> 0 THEN RAISE EXCEPTION 'staff can see pay runs'; END IF;
  BEGIN
    PERFORM public.approve_pay_run(_run);
    RAISE EXCEPTION 'staff approved a pay run';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.act_as(_other);
  SELECT count(*) INTO _n FROM public.pay_run_lines WHERE org_id = _org;
  IF _n <> 0 THEN RAISE EXCEPTION 'another workspace can see pay lines'; END IF;

  -- HR approves: a balanced journal; it stays a draft because HR managers can't post journals.
  PERFORM pg_temp.act_as(_hr);
  _je := public.approve_pay_run(_run);
  RESET ROLE;
  SELECT sum(debit), sum(credit) INTO _dr, _cr FROM public.journal_entry_lines WHERE journal_entry_id = _je;
  IF _dr <> 2165 OR _cr <> 2165 THEN RAISE EXCEPTION 'approval journal % / %', _dr, _cr; END IF;
  SELECT l.debit INTO _dr FROM public.journal_entry_lines l JOIN public.chart_of_accounts a ON a.id = l.account_id
   WHERE l.journal_entry_id = _je AND a.name = 'Wages and Salaries';
  IF _dr <> 2000 THEN RAISE EXCEPTION 'wages debit %', _dr; END IF;
  SELECT l.credit INTO _cr FROM public.journal_entry_lines l JOIN public.chart_of_accounts a ON a.id = l.account_id
   WHERE l.journal_entry_id = _je AND a.name = 'Payroll Taxes Payable';
  IF _cr <> 474.15 THEN RAISE EXCEPTION 'taxes payable %', _cr; END IF; -- 309.15 employee + 165 employer
  SELECT status::text INTO _st FROM public.journal_entries WHERE id = _je;
  IF _st <> 'draft' THEN RAISE EXCEPTION 'HR-approved journal is %', _st; END IF;
  SET LOCAL ROLE authenticated;

  -- Approved lines are locked, and a run can't be approved twice.
  UPDATE public.pay_run_lines SET gross = 1, net = 1, federal_tax = 0, social_security = 0, medicare = 0 WHERE pay_run_id = _run;
  SELECT count(*) INTO _n FROM public.pay_run_lines WHERE pay_run_id = _run AND gross = 2000;
  IF _n <> 1 THEN RAISE EXCEPTION 'approved line was changed'; END IF;
  BEGIN
    PERFORM public.approve_pay_run(_run);
    RAISE EXCEPTION 'approved twice';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'approved twice' THEN RAISE; END IF;
  END;

  -- The owner marks it paid: Dr Wages Payable / Cr Cash, posted.
  PERFORM pg_temp.act_as(_owner);
  _pay := public.mark_pay_run_paid(_run, '2026-01-16');
  SELECT status INTO _st FROM public.pay_runs WHERE id = _run;
  IF _st <> 'paid' THEN RAISE EXCEPTION 'run is %', _st; END IF;
  SELECT status::text INTO _st FROM public.journal_entries WHERE id = _pay;
  IF _st <> 'posted' THEN RAISE EXCEPTION 'payment journal is %', _st; END IF;
  SELECT sum(credit) INTO _cr FROM public.journal_entry_lines WHERE journal_entry_id = _pay;
  IF _cr <> 1690.85 THEN RAISE EXCEPTION 'net paid %', _cr; END IF;

  -- An owner's approval posts straight away; an empty run can't be approved.
  INSERT INTO public.pay_runs (org_id, period_start, period_end, pay_date) VALUES (_org, '2026-01-15', '2026-01-28', '2026-01-30') RETURNING id INTO _run2;
  BEGIN
    PERFORM public.approve_pay_run(_run2);
    RAISE EXCEPTION 'empty run approved';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'empty run approved' THEN RAISE; END IF;
  END;
  INSERT INTO public.pay_run_lines (org_id, pay_run_id, employee_id, gross, federal_tax, social_security, medicare, net, employer_social_security, employer_medicare, futa)
  VALUES (_org, _run2, _emp, 2000, 156.15, 124, 29, 1690.85, 124, 29, 12);
  _je := public.approve_pay_run(_run2);
  SELECT status::text INTO _st FROM public.journal_entries WHERE id = _je;
  IF _st <> 'posted' THEN RAISE EXCEPTION 'owner-approved journal is %', _st; END IF;

  -- The accounts were added once, not per run.
  SELECT count(*) INTO _n FROM public.chart_of_accounts WHERE org_id = _org AND name = 'Wages Payable';
  IF _n <> 1 THEN RAISE EXCEPTION '% Wages Payable accounts', _n; END IF;

  RAISE NOTICE 'payroll selftest: ok';
END $$;

ROLLBACK;
