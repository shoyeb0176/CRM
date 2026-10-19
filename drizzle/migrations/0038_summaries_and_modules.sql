-- 0038 (DB-18): totals for the dashboard and module overviews, worked out in the database instead of
-- the browser; the modules a workspace uses; the email check every 5 minutes instead of 2.
--
-- The summary functions are SECURITY INVOKER: they add up only rows the caller can already read
-- (row-level security applies), so they need no access checks of their own.

-- ---------- modules a workspace uses ----------
-- NULL = every module. The sidebar, search and dashboard hide the others; pages stay reachable.
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS enabled_modules text[];

-- ---------- dashboard ----------
CREATE OR REPLACE FUNCTION public.dashboard_summary(_org uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH months AS (
    SELECT generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') AS m
  ), stock AS (
    SELECT p.id, p.low_stock_threshold, COALESCE(sum(s.quantity), 0) AS qty
      FROM products p LEFT JOIN inventory_stock s ON s.product_id = p.id AND s.org_id = _org
     WHERE p.org_id = _org AND NOT p.archived AND p.track_inventory
     GROUP BY p.id, p.low_stock_threshold
  )
  SELECT jsonb_build_object(
    'cash', (SELECT jsonb_agg(jsonb_build_object(
        'month', to_char(m, 'YYYY-MM'),
        'in',  COALESCE((SELECT sum(amount) FROM payments WHERE org_id = _org AND date_trunc('month', payment_date) = m), 0),
        'out', COALESCE((SELECT sum(total) FROM expenses WHERE org_id = _org AND date_trunc('month', expense_date) = m), 0)
      ) ORDER BY m) FROM months),
    'pipeline', (SELECT COALESCE(jsonb_agg(jsonb_build_object('stage', name, 'value', v) ORDER BY pos), '[]'::jsonb) FROM (
        SELECT COALESCE(ds.name, 'No stage') AS name, COALESCE(min(ds.position), 999) AS pos, sum(COALESCE(d.amount, 0)) AS v
          FROM deals d LEFT JOIN deal_stages ds ON ds.id = d.stage_id
         WHERE d.org_id = _org AND d.status = 'open' GROUP BY 1) x),
    'pipelineTotal', (SELECT COALESCE(sum(amount), 0) FROM deals WHERE org_id = _org AND status = 'open'),
    'openDeals', (SELECT count(*) FROM deals WHERE org_id = _org AND status = 'open'),
    'byStatus', (SELECT COALESCE(jsonb_object_agg(status, t), '{}'::jsonb) FROM (
        SELECT status, sum(total) AS t FROM invoices WHERE org_id = _org AND status <> 'void' GROUP BY status) x),
    'topCustomers', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'value', paid) ORDER BY paid DESC), '[]'::jsonb) FROM (
        SELECT c.name, sum(i.total - i.balance_due) AS paid FROM invoices i JOIN companies c ON c.id = i.company_id
         WHERE i.org_id = _org AND i.status <> 'void' GROUP BY c.name HAVING sum(i.total - i.balance_due) > 0
         ORDER BY 2 DESC LIMIT 5) x),
    'outstanding', (SELECT COALESCE(sum(balance_due), 0) FROM invoices WHERE org_id = _org AND status IN ('sent', 'partially_paid', 'overdue')),
    'overdue', (SELECT count(*) FROM invoices WHERE org_id = _org AND status = 'overdue'),
    'low', (SELECT count(*) FROM stock WHERE qty > 0 AND low_stock_threshold IS NOT NULL AND qty <= low_stock_threshold),
    'out', (SELECT count(*) FROM stock WHERE qty <= 0),
    'overdueTasks', (SELECT count(*) FROM project_tasks WHERE org_id = _org AND due_date < current_date AND status NOT IN ('done', 'cancelled'))
  );
$$;

-- ---------- one module's overview charts ----------
CREATE OR REPLACE FUNCTION public.module_summary(_org uuid, _module text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  _months timestamptz[] := ARRAY(SELECT generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month'));
BEGIN
  IF _module = 'crm' THEN
    RETURN jsonb_build_object(
      'stages', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', name, 'count', n, 'value', v) ORDER BY pos), '[]'::jsonb) FROM (
          SELECT COALESCE(ds.name, 'No stage') AS name, COALESCE(min(ds.position), 999) AS pos, count(*) AS n, sum(COALESCE(d.amount, 0)) AS v
            FROM deals d LEFT JOIN deal_stages ds ON ds.id = d.stage_id WHERE d.org_id = _org AND d.status = 'open' GROUP BY 1) x),
      'leadSources', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', src, 'value', n) ORDER BY n DESC), '[]'::jsonb) FROM (
          SELECT COALESCE(NULLIF(source, ''), 'Unknown') AS src, count(*) AS n FROM leads
           WHERE org_id = _org AND status NOT IN ('converted', 'lost', 'unqualified') GROUP BY 1 ORDER BY 2 DESC LIMIT 6) x),
      'wonLost', (SELECT jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
          'won', (SELECT count(*) FROM deals WHERE org_id = _org AND status = 'won' AND date_trunc('month', updated_at) = m),
          'lost', (SELECT count(*) FROM deals WHERE org_id = _org AND status = 'lost' AND date_trunc('month', updated_at) = m)) ORDER BY m)
        FROM unnest(_months) AS m));
  ELSIF _module = 'sales' THEN
    RETURN jsonb_build_object(
      'quotes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', status, 'count', n, 'value', t)), '[]'::jsonb) FROM (
          SELECT status::text, count(*) AS n, sum(total) AS t FROM quotes WHERE org_id = _org GROUP BY status) x),
      'revenue', (SELECT jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
          'invoiced', COALESCE((SELECT sum(total) FROM invoices WHERE org_id = _org AND status NOT IN ('draft', 'void') AND date_trunc('month', issue_date) = m), 0),
          'paid', COALESCE((SELECT sum(amount) FROM payments WHERE org_id = _org AND date_trunc('month', payment_date) = m), 0)) ORDER BY m)
        FROM unnest(_months) AS m));
  ELSIF _module = 'inventory' THEN
    RETURN jsonb_build_object(
      'byWarehouse', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', name, 'value', v) ORDER BY v DESC), '[]'::jsonb) FROM (
          SELECT w.name, sum(s.quantity * COALESCE(p.cost_price, 0)) AS v FROM inventory_stock s
            JOIN warehouses w ON w.id = s.warehouse_id JOIN products p ON p.id = s.product_id
           WHERE s.org_id = _org GROUP BY w.name) x),
      'movements', (SELECT jsonb_agg(jsonb_build_object('week', to_char(wk, 'YYYY-MM-DD'),
          'in', COALESCE((SELECT sum(quantity) FROM inventory_movements WHERE org_id = _org AND quantity > 0 AND date_trunc('week', created_at) = wk), 0),
          'out', COALESCE((SELECT -sum(quantity) FROM inventory_movements WHERE org_id = _org AND quantity < 0 AND date_trunc('week', created_at) = wk), 0)) ORDER BY wk)
        FROM generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') AS wk));
  ELSIF _module = 'purchasing' THEN
    RETURN jsonb_build_object(
      'topSuppliers', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', name, 'value', t) ORDER BY t DESC), '[]'::jsonb) FROM (
          SELECT s.name, sum(po.total) AS t FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
           WHERE po.org_id = _org AND po.status <> 'cancelled' GROUP BY s.name ORDER BY 2 DESC LIMIT 5) x),
      'spend', (SELECT jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
          'orders', COALESCE((SELECT sum(total) FROM purchase_orders WHERE org_id = _org AND status NOT IN ('draft', 'cancelled') AND date_trunc('month', order_date) = m), 0),
          'expenses', COALESCE((SELECT sum(total) FROM expenses WHERE org_id = _org AND date_trunc('month', expense_date) = m), 0)) ORDER BY m)
        FROM unnest(_months) AS m));
  ELSIF _module = 'projects' THEN
    RETURN jsonb_build_object(
      'tasks', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', status, 'value', n)), '[]'::jsonb) FROM (
          SELECT t.status::text, count(*) AS n FROM project_tasks t WHERE t.org_id = _org AND t.status <> 'cancelled' GROUP BY t.status) x),
      'hours', (SELECT jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
          'hours', COALESCE((SELECT sum(hours) FROM timesheets WHERE org_id = _org AND date_trunc('month', entry_date) = m), 0),
          'billable', COALESCE((SELECT sum(hours) FROM timesheets WHERE org_id = _org AND billable AND date_trunc('month', entry_date) = m), 0)) ORDER BY m)
        FROM unnest(_months) AS m));
  ELSIF _module = 'accounting' THEN
    RETURN jsonb_build_object(
      'pnl', (SELECT jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
          'income', COALESCE((SELECT sum(l.credit - l.debit) FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.journal_entry_id
              JOIN chart_of_accounts a ON a.id = l.account_id
             WHERE l.org_id = _org AND e.status = 'posted' AND a.account_type = 'revenue' AND date_trunc('month', e.entry_date) = m), 0),
          'costs', COALESCE((SELECT sum(l.debit - l.credit) FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.journal_entry_id
              JOIN chart_of_accounts a ON a.id = l.account_id
             WHERE l.org_id = _org AND e.status = 'posted' AND a.account_type IN ('expense', 'cogs') AND date_trunc('month', e.entry_date) = m), 0)) ORDER BY m)
        FROM unnest(_months) AS m));
  ELSIF _module = 'hr' THEN
    RETURN jsonb_build_object(
      'byDepartment', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', name, 'value', n) ORDER BY n DESC), '[]'::jsonb) FROM (
          SELECT COALESCE(d.name, 'No department') AS name, count(*) AS n FROM employees e LEFT JOIN departments d ON d.id = e.department_id
           WHERE e.org_id = _org AND e.status IN ('active', 'on_leave') GROUP BY 1) x),
      'leave', (SELECT jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
          'days', COALESCE((SELECT sum(total_days) FROM leave_requests WHERE org_id = _org AND status = 'approved' AND date_trunc('month', start_date) = m), 0)) ORDER BY m)
        FROM unnest(_months) AS m));
  END IF;
  RETURN '{}'::jsonb;
END $$;

REVOKE EXECUTE ON FUNCTION public.dashboard_summary(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.module_summary(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_summary(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.module_summary(uuid, text) TO authenticated, service_role;

-- ---------- email check every 5 minutes (was 2) ----------
-- The app also sends right away when someone has it open, so this only covers quiet periods.
DO $$ BEGIN
  PERFORM cron.schedule('notification-email-dispatch', '*/5 * * * *', 'SELECT public.kick_notification_dispatch()');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
