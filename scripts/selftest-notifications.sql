-- Self-check for notifications (0030). Run on a TEST database after `bun run db:migrate`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/selftest-notifications.sql
-- Everything runs in one transaction and is rolled back. Prints "notifications selftest: ok" or raises.
BEGIN;

DO $$
DECLARE
  _owner uuid := gen_random_uuid();
  _staff uuid := gen_random_uuid();
  _org uuid;
  _proj uuid;
  _n int;
  _rule uuid;
  _res jsonb;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
    (_owner, 'owner@notif.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_staff, 'staff@notif.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('Notif Test', 'notif-' || left(_owner::text, 8), _owner)
  RETURNING id INTO _org;
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_org, _owner, 'org_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'org_owner', status = 'active';

  -- New companies get the four standard rules.
  SELECT count(*) INTO _n FROM public.automation_rules WHERE org_id = _org;
  IF _n <> 4 THEN RAISE EXCEPTION 'expected 4 seeded rules, got %', _n; END IF;

  -- The owner is the one acting from here on.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);

  -- Member joined: the owner invites; the invite is accepted server-side (no signed-in user).
  -- The owner hears about it; the new member doesn't get their own alert.
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_org, _staff, 'staff', 'invited');
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE public.memberships SET status = 'active' WHERE org_id = _org AND user_id = _staff;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  SELECT count(*) INTO _n FROM public.notification_events WHERE org_id = _org AND user_id = _owner AND entity_type = 'membership';
  IF _n <> 1 THEN RAISE EXCEPTION 'member joined: owner got % alerts', _n; END IF;
  SELECT count(*) INTO _n FROM public.notification_events WHERE org_id = _org AND user_id = _staff;
  IF _n <> 0 THEN RAISE EXCEPTION 'member joined: new member got % alerts', _n; END IF;

  -- Task assigned to staff: staff is told; assigning yourself a task tells nobody.
  INSERT INTO public.projects (org_id, name) VALUES (_org, 'P') RETURNING id INTO _proj;
  INSERT INTO public.project_tasks (org_id, project_id, title, assignee_id, due_date)
  VALUES (_org, _proj, 'Late task', _staff, current_date - 1);
  INSERT INTO public.project_tasks (org_id, project_id, title, assignee_id) VALUES (_org, _proj, 'Mine', _owner);
  SELECT count(*) INTO _n FROM public.notification_events WHERE org_id = _org AND user_id = _staff AND title LIKE 'Task assigned%';
  IF _n <> 1 THEN RAISE EXCEPTION 'task assigned: staff got % alerts', _n; END IF;
  SELECT count(*) INTO _n FROM public.notification_events WHERE org_id = _org AND user_id = _owner AND title LIKE 'Task assigned%';
  IF _n <> 0 THEN RAISE EXCEPTION 'task assigned: self-assignment alerted % times', _n; END IF;

  -- Overdue task rule: the assignee is alerted once, even if the rule runs twice.
  SELECT id INTO _rule FROM public.automation_rules WHERE org_id = _org AND trigger = 'task_overdue';
  _res := public.run_automation_rule(_rule);
  IF _res->>'status' <> 'success' THEN RAISE EXCEPTION 'task rule failed: %', _res->>'log'; END IF;
  PERFORM public.run_automation_rule(_rule);
  SELECT count(*) INTO _n FROM public.notification_events WHERE org_id = _org AND user_id = _staff AND title LIKE 'Task overdue%';
  IF _n <> 1 THEN RAISE EXCEPTION 'task overdue: staff got % alerts', _n; END IF;

  -- Low stock (inventory managers + owners/admins): the owner sees it even though they ran the rule.
  INSERT INTO public.products (org_id, name, low_stock_threshold, track_inventory) VALUES (_org, 'Widget', 5, true);
  INSERT INTO public.warehouses (org_id, name) VALUES (_org, 'Main');
  INSERT INTO public.inventory_stock (org_id, product_id, warehouse_id, quantity)
  SELECT _org, p.id, w.id, 2 FROM public.products p, public.warehouses w
  WHERE p.org_id = _org AND p.name = 'Widget' AND w.org_id = _org AND w.name = 'Main';
  SELECT id INTO _rule FROM public.automation_rules WHERE org_id = _org AND trigger = 'low_stock';
  _res := public.run_automation_rule(_rule);
  IF _res->>'status' <> 'success' THEN RAISE EXCEPTION 'low stock rule failed: %', _res->>'log'; END IF;
  SELECT count(*) INTO _n FROM public.notification_events WHERE org_id = _org AND user_id = _owner AND title = 'Low stock: Widget';
  IF _n <> 1 THEN RAISE EXCEPTION 'low stock: owner got % alerts', _n; END IF;
  SELECT count(*) INTO _n FROM public.notification_events WHERE org_id = _org AND user_id = _staff AND title = 'Low stock: Widget';
  IF _n <> 0 THEN RAISE EXCEPTION 'low stock: plain staff got % alerts', _n; END IF;

  -- (0032) Out of stock alerts even without a threshold, like the dashboard tile.
  IF to_regprocedure('public.run_automation_rule(uuid)') IS NOT NULL
     AND pg_get_functiondef('public.run_automation_rule(uuid)'::regprocedure) LIKE '%Out of stock%' THEN
    INSERT INTO public.products (org_id, name, track_inventory) VALUES (_org, 'Gadget', true);
    PERFORM public.run_automation_rule(_rule);
    SELECT count(*) INTO _n FROM public.notification_events WHERE org_id = _org AND user_id = _owner AND title = 'Out of stock: Gadget';
    IF _n <> 1 THEN RAISE EXCEPTION 'out of stock: owner got % alerts', _n; END IF;
  END IF;

  -- (0033) The platform owner's own workspace: owner alerts reach role platform_owner too.
  IF pg_get_functiondef('public.notify_recipients(uuid, public.app_role[])'::regprocedure) LIKE '%platform_owner%' THEN
    UPDATE public.memberships SET role = 'platform_owner' WHERE org_id = _org AND user_id = _owner;
    IF NOT _owner = ANY(public.notify_recipients(_org, '{inventory_manager}')) THEN
      RAISE EXCEPTION 'platform owner is not an alert recipient in their own workspace';
    END IF;
    UPDATE public.memberships SET role = 'org_owner' WHERE org_id = _org AND user_id = _owner;
  END IF;

  -- (0034) The platform owner counts as owner in their own workspace for every role check.
  IF pg_get_functiondef('public.has_org_role(uuid, public.app_role[])'::regprocedure) LIKE '%platform_owner%' THEN
    UPDATE public.memberships SET role = 'platform_owner' WHERE org_id = _org AND user_id = _owner;
    IF NOT public.has_org_role(_org, '{org_owner,org_admin,accountant}') THEN
      RAISE EXCEPTION 'platform owner is locked out of owner checks in their own workspace';
    END IF;
    IF public.has_org_role(_org, '{accountant}') THEN
      RAISE EXCEPTION 'platform owner matched a role list without org_owner';
    END IF;
    UPDATE public.memberships SET role = 'org_owner' WHERE org_id = _org AND user_id = _owner;
  END IF;

  -- The remaining rules run cleanly on this data.
  FOR _rule IN SELECT id FROM public.automation_rules WHERE org_id = _org AND trigger IN ('invoice_overdue', 'deal_stale') LOOP
    _res := public.run_automation_rule(_rule);
    IF _res->>'status' <> 'success' THEN RAISE EXCEPTION 'rule failed: %', _res->>'log'; END IF;
  END LOOP;

  PERFORM set_config('notiftest.org', _org::text, true);
  PERFORM set_config('notiftest.staff', _staff::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _staff::text, true);
END $$;

-- As the staff member: only their own alerts are visible, they can mark them read,
-- and they can't create notifications directly.
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  _org uuid := current_setting('notiftest.org')::uuid;
  _staff uuid := current_setting('notiftest.staff')::uuid;
  _n int;
  _ok boolean;
BEGIN
  SELECT count(*) INTO _n FROM public.notification_events WHERE org_id = _org AND user_id IS DISTINCT FROM _staff;
  IF _n <> 0 THEN RAISE EXCEPTION 'staff can see % notifications that are not theirs', _n; END IF;
  SELECT count(*) INTO _n FROM public.notification_events WHERE org_id = _org;
  IF _n <> 2 THEN RAISE EXCEPTION 'staff should see 2 alerts, sees %', _n; END IF;
  UPDATE public.notification_events SET read_at = now() WHERE org_id = _org;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 2 THEN RAISE EXCEPTION 'mark read changed % rows', _n; END IF;
  BEGIN
    INSERT INTO public.notification_events (org_id, user_id, title) VALUES (_org, _staff, 'Fake');
    _ok := true;
  EXCEPTION WHEN others THEN _ok := false; END;
  IF _ok THEN RAISE EXCEPTION 'staff could insert a notification directly'; END IF;

  -- Company-wide notice (workflow step): one copy each, including the sender.
  _n := public.notify_org(_org, 'Workflow notice', NULL, 'info', 'crm', '/app/crm/leads');
  IF _n <> 2 THEN RAISE EXCEPTION 'notify_org reached % people, expected 2', _n; END IF;
  SELECT count(*) INTO _n FROM public.notification_events WHERE org_id = _org AND title = 'Workflow notice';
  IF _n <> 1 THEN RAISE EXCEPTION 'staff sees % copies of the notice', _n; END IF;
  RAISE NOTICE 'notifications selftest: ok';
END $$;

ROLLBACK;
