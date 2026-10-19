-- Low-stock alerts match the dashboard's "Low / out of stock" tile (found in the live test, 9 Oct 2026).
-- 0030 only looked at products with a low-stock threshold, so out-of-stock items never alerted.
-- Now: tracked, non-archived products that are out of stock, or at/below their threshold.
-- Only run_automation_rule() changes; everything else is as in 0030. Re-runnable.
CREATE OR REPLACE FUNCTION public.run_automation_rule(_rule uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.automation_rules;
  _matches int := 0;
  _created int := 0;
  _status public.automation_run_status := 'success';
  _log text;
  x record;
BEGIN
  SELECT * INTO r FROM public.automation_rules WHERE id = _rule;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Rule not found'; END IF;
  -- Signed-in callers must belong to the company; the daily job runs without a user.
  IF auth.uid() IS NOT NULL AND NOT public.is_org_member(r.org_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  BEGIN
    IF r.trigger = 'invoice_overdue' THEN
      FOR x IN SELECT id, number, balance_due, currency, due_date, owner_id FROM public.invoices
               WHERE org_id = r.org_id AND balance_due > 0 AND status IN ('sent', 'partially_paid', 'overdue')
                 AND due_date < current_date - COALESCE((r.config->>'grace_days')::int, 0) LOOP
        _matches := _matches + 1;
        _created := _created + public.notify(r.org_id, array_append(public.notify_recipients(r.org_id, '{accountant}'), x.owner_id),
          format('Invoice %s is overdue', x.number), format('%s %s was due %s.', x.balance_due, x.currency, x.due_date),
          'warning', 'invoices', '/app/invoices/' || x.id, 'invoice', x.id, r.id);
      END LOOP;
    ELSIF r.trigger = 'low_stock' THEN
      -- Same rule as the dashboard tile: tracked, not archived; out of stock, or at/below the threshold.
      FOR x IN SELECT p.id, p.name, p.low_stock_threshold, COALESCE(sum(s.quantity), 0) AS qty
               FROM public.products p LEFT JOIN public.inventory_stock s ON s.product_id = p.id
               WHERE p.org_id = r.org_id AND p.track_inventory AND NOT p.archived
               GROUP BY p.id
               HAVING COALESCE(sum(s.quantity), 0) <= 0
                   OR (p.low_stock_threshold > 0 AND COALESCE(sum(s.quantity), 0) <= p.low_stock_threshold) LOOP
        _matches := _matches + 1;
        _created := _created + public.notify(r.org_id, public.notify_recipients(r.org_id, '{inventory_manager}'),
          format(CASE WHEN x.qty <= 0 THEN 'Out of stock: %s' ELSE 'Low stock: %s' END, x.name),
          CASE WHEN x.qty <= 0 THEN 'None on hand.' ELSE format('%s on hand (alert at %s).', x.qty, x.low_stock_threshold) END,
          'warning', 'inventory', '/app/products/' || x.id, 'product', x.id, r.id);
      END LOOP;
    ELSIF r.trigger = 'deal_stale' THEN
      FOR x IN SELECT id, title, owner_id FROM public.deals
               WHERE org_id = r.org_id AND status = 'open'
                 AND updated_at < now() - make_interval(days => COALESCE((r.config->>'days')::int, 14)) LOOP
        _matches := _matches + 1;
        _created := _created + public.notify(r.org_id, array_append(public.notify_recipients(r.org_id, '{manager}'), x.owner_id),
          format('Deal needs follow-up: %s', x.title), format('No activity for %s+ days.', COALESCE((r.config->>'days')::int, 14)),
          'info', 'crm', '/app/crm/deals', 'deal', x.id, r.id);
      END LOOP;
    ELSIF r.trigger = 'task_overdue' THEN
      FOR x IN SELECT id, title, project_id, due_date, COALESCE(assignee_id, reporter_id) AS who FROM public.project_tasks
               WHERE org_id = r.org_id AND due_date < current_date AND status NOT IN ('done', 'cancelled') LOOP
        _matches := _matches + 1;
        _created := _created + public.notify(r.org_id, ARRAY[x.who],
          format('Task overdue: %s', x.title), format('Was due %s.', x.due_date),
          'warning', 'projects', '/app/projects/' || x.project_id, 'task', x.id, r.id);
      END LOOP;
    END IF;
    _log := format('Scanned %s candidates, created %s notifications.', _matches, _created);
  EXCEPTION WHEN OTHERS THEN
    _status := 'error';
    _log := SQLERRM;
  END;

  INSERT INTO public.automation_runs (org_id, rule_id, status, matches, notifications_created, log, finished_at)
  VALUES (r.org_id, r.id, _status, _matches, _created, _log, now());
  UPDATE public.automation_rules SET last_run_at = now() WHERE id = r.id;
  RETURN jsonb_build_object('matches', _matches, 'created', _created, 'status', _status, 'log', _log);
END $$;
REVOKE EXECUTE ON FUNCTION public.run_automation_rule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_automation_rule(uuid) TO authenticated;

