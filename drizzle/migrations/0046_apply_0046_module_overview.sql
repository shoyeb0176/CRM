-- One call per module overview page. module_overview returns what module_summary already returns
-- (the charts) plus `kpis` (the numbers on the cards) and the short "recent" lists, all worked out
-- in the database. The pages used to make 3 to 7 calls each, and some (Sales, Accounting) downloaded
-- every quote, invoice or journal line to add them up in the browser.
-- Keys match what the pages read (camelCase). SECURITY INVOKER: row-level security still decides
-- what each person can count. "This month" and "this week" use the database's date (UTC).
-- Safe to run more than once.

CREATE OR REPLACE FUNCTION public.module_overview(_org uuid, _module text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  _month date := date_trunc('month', current_date)::date;
  _extra jsonb := '{}'::jsonb;
BEGIN
  IF _module = 'crm' THEN
    _extra := jsonb_build_object(
      'kpis', jsonb_build_object(
        'contacts', (SELECT count(*) FROM contacts WHERE org_id = _org AND archived = false),
        'companies', (SELECT count(*) FROM companies WHERE org_id = _org AND archived = false),
        'leads', (SELECT count(*) FROM leads WHERE org_id = _org AND status <> 'converted'),
        'openDealsCount', (SELECT count(*) FROM deals WHERE org_id = _org AND status = 'open'),
        'pipeline', (SELECT COALESCE(sum(amount), 0) FROM deals WHERE org_id = _org AND status = 'open'),
        'openActivities', (SELECT count(*) FROM activities WHERE org_id = _org AND completed = false)),
      'recent', (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb) FROM (
          SELECT id, type, title, due_at, completed, entity_type, entity_id, created_at FROM activities
           WHERE org_id = _org ORDER BY created_at DESC LIMIT 8) a));

  ELSIF _module = 'sales' THEN
    _extra := jsonb_build_object('kpis', jsonb_build_object(
      'revenue', (SELECT COALESCE(sum(amount), 0) FROM payments WHERE org_id = _org AND payment_date >= _month),
      'invoicedMonth', (SELECT COALESCE(sum(total), 0) FROM invoices WHERE org_id = _org AND issue_date >= _month),
      'outstanding', (SELECT COALESCE(sum(balance_due), 0) FROM invoices WHERE org_id = _org AND status NOT IN ('paid', 'void', 'draft')),
      'overdue', (SELECT count(*) FROM invoices WHERE org_id = _org AND status = 'overdue'),
      'openQuotes', (SELECT count(*) FROM quotes WHERE org_id = _org AND status IN ('draft', 'sent')),
      'openOrders', (SELECT count(*) FROM sales_orders WHERE org_id = _org AND status IN ('draft', 'confirmed'))));

  ELSIF _module = 'purchasing' THEN
    _extra := jsonb_build_object(
      'kpis', jsonb_build_object(
        'openPOCount', (SELECT count(*) FROM purchase_orders WHERE org_id = _org AND status IN ('draft', 'sent', 'approved', 'partially_received')),
        'openPOValue', (SELECT COALESCE(sum(total), 0) FROM purchase_orders WHERE org_id = _org AND status IN ('draft', 'sent', 'approved', 'partially_received')),
        'billsOpenCount', (SELECT count(*) FROM vendor_bills WHERE org_id = _org AND status IN ('approved', 'partially_paid', 'overdue', 'draft')),
        'billsOpenValue', (SELECT COALESCE(sum(balance_due), 0) FROM vendor_bills WHERE org_id = _org AND status IN ('approved', 'partially_paid', 'overdue', 'draft')),
        'overdueCount', (SELECT count(*) FROM vendor_bills WHERE org_id = _org AND status = 'overdue'),
        'monthlyExpenses', (SELECT COALESCE(sum(total), 0) FROM expenses WHERE org_id = _org AND expense_date >= _month)),
      'recent', jsonb_build_object(
        'pos', (SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) FROM (
            SELECT jsonb_build_object('id', po.id, 'po_number', po.po_number, 'total', po.total, 'status', po.status,
                     'created_at', po.created_at, 'suppliers', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('name', s.name) END) AS x
              FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
             WHERE po.org_id = _org ORDER BY po.created_at DESC LIMIT 5) r),
        'bills', (SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) FROM (
            SELECT jsonb_build_object('id', b.id, 'bill_number', b.bill_number, 'total', b.total, 'status', b.status,
                     'created_at', b.created_at, 'suppliers', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('name', s.name) END) AS x
              FROM vendor_bills b LEFT JOIN suppliers s ON s.id = b.supplier_id
             WHERE b.org_id = _org ORDER BY b.created_at DESC LIMIT 5) r)));

  ELSIF _module = 'projects' THEN
    _extra := jsonb_build_object('kpis', jsonb_build_object(
      'activeCount', (SELECT count(*) FROM projects WHERE org_id = _org AND status = 'active' AND archived = false),
      'overdueTasks', (SELECT count(*) FROM project_tasks WHERE org_id = _org AND due_date < current_date AND status NOT IN ('done', 'cancelled')),
      -- The week starts on Sunday, as the page did.
      'hoursWeek', (SELECT COALESCE(sum(hours), 0) FROM timesheets WHERE org_id = _org
                     AND entry_date >= current_date - extract(dow FROM current_date)::int),
      'nearing', (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.due_date), '[]'::jsonb) FROM (
          SELECT id, name, due_date, status FROM projects
           WHERE org_id = _org AND archived = false AND status IN ('active', 'planned')
             AND due_date IS NOT NULL AND due_date <= current_date + 7) p)));

  ELSIF _module = 'accounting' THEN
    _extra := (SELECT jsonb_build_object('kpis', jsonb_build_object(
        'revenue', rev, 'expense', exp, 'net', rev - exp, 'asset', ast, 'liability', lia, 'equity', eqt,
        'draftCount', (SELECT count(*) FROM journal_entries WHERE org_id = _org AND status = 'draft'),
        'recent', (SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC), '[]'::jsonb) FROM (
            SELECT id, entry_number, entry_date, memo, status, total_debit, source, created_at FROM journal_entries
             WHERE org_id = _org ORDER BY created_at DESC LIMIT 8) e)))
      FROM (
        SELECT COALESCE(sum(CASE WHEN a.account_type = 'revenue' THEN l.credit - l.debit END), 0) AS rev,
               COALESCE(sum(CASE WHEN a.account_type IN ('expense', 'cogs') THEN l.debit - l.credit END), 0) AS exp,
               COALESCE(sum(CASE WHEN a.account_type = 'asset' THEN l.debit - l.credit END), 0) AS ast,
               COALESCE(sum(CASE WHEN a.account_type = 'liability' THEN l.credit - l.debit END), 0) AS lia,
               COALESCE(sum(CASE WHEN a.account_type = 'equity' THEN l.credit - l.debit END), 0) AS eqt
          FROM journal_entry_lines l
          JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted'
          JOIN chart_of_accounts a ON a.id = l.account_id
         WHERE l.org_id = _org) t);

  ELSIF _module = 'hr' THEN
    _extra := jsonb_build_object('kpis', jsonb_build_object(
      'active', (SELECT count(*) FROM employees WHERE org_id = _org AND status = 'active'),
      'pendingLeave', (SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) FROM (
          SELECT jsonb_build_object('id', r.id, 'leave_type', r.leave_type, 'start_date', r.start_date, 'end_date', r.end_date,
                   'employee_id', r.employee_id, 'created_at', r.created_at,
                   'employees', jsonb_build_object('first_name', e.first_name, 'last_name', e.last_name, 'preferred_name', e.preferred_name)) AS x
            FROM leave_requests r LEFT JOIN employees e ON e.id = r.employee_id
           WHERE r.org_id = _org AND r.status = 'pending' ORDER BY r.created_at DESC LIMIT 10) q),
      -- Work anniversaries in the next 30 days (not the first year).
      'anniversaries', (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.next_anniversary), '[]'::jsonb) FROM (
          SELECT id, first_name, last_name, preferred_name, start_date, next_anniversary FROM (
             SELECT e.*, CASE WHEN ann < current_date THEN (ann + interval '1 year')::date ELSE ann END AS next_anniversary
              FROM (SELECT id, first_name, last_name, preferred_name, start_date,
                           (start_date + make_interval(years => (extract(year FROM current_date) - extract(year FROM start_date))::int))::date AS ann
                      FROM employees WHERE org_id = _org AND start_date IS NOT NULL) e) n
           WHERE next_anniversary <= current_date + 30 AND extract(year FROM start_date) < extract(year FROM current_date)
           ORDER BY next_anniversary LIMIT 5) a),
      'recentLeave', (SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) FROM (
          SELECT jsonb_build_object('id', r.id, 'status', r.status, 'leave_type', r.leave_type, 'start_date', r.start_date,
                   'end_date', r.end_date, 'created_at', r.created_at,
                   'employees', jsonb_build_object('first_name', e.first_name, 'last_name', e.last_name, 'preferred_name', e.preferred_name)) AS x
            FROM leave_requests r LEFT JOIN employees e ON e.id = r.employee_id
           WHERE r.org_id = _org ORDER BY r.created_at DESC LIMIT 5) q),
      'recentAtt', (SELECT COALESCE(jsonb_agg(x ORDER BY x->>'work_date' DESC), '[]'::jsonb) FROM (
          SELECT jsonb_build_object('id', a.id, 'work_date', a.work_date, 'hours_worked', a.hours_worked,
                   'employees', jsonb_build_object('first_name', e.first_name, 'last_name', e.last_name, 'preferred_name', e.preferred_name)) AS x
            FROM attendance_records a LEFT JOIN employees e ON e.id = a.employee_id
           WHERE a.org_id = _org ORDER BY a.work_date DESC LIMIT 5) q)));
  END IF;

  RETURN public.module_summary(_org, _module) || _extra;
END $$;
REVOKE ALL ON FUNCTION public.module_overview(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.module_overview(uuid, text) TO authenticated, service_role;

-- The dashboard in one call: dashboard_summary plus the pipeline stages, the three short "recent"
-- lists and the Getting started counts (four more calls each before).
CREATE OR REPLACE FUNCTION public.dashboard_overview(_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN public.dashboard_summary(_org) || jsonb_build_object(
    'stages', public.module_summary(_org, 'crm')->'stages',
    'recentActs', (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb) FROM (
        SELECT id, type, title, completed, created_at FROM activities WHERE org_id = _org ORDER BY created_at DESC LIMIT 5) a),
    'recentPayments', (SELECT COALESCE(jsonb_agg(x ORDER BY x->>'payment_date' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id', p.id, 'amount', p.amount, 'currency', p.currency, 'payment_date', p.payment_date,
                 'invoices', CASE WHEN i.id IS NULL THEN NULL ELSE jsonb_build_object('id', i.id, 'number', i.number,
                   'companies', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('name', c.name) END) END) AS x
          FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id LEFT JOIN companies c ON c.id = i.company_id
         WHERE p.org_id = _org ORDER BY p.payment_date DESC LIMIT 5) r),
    'recentPOs', (SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id', po.id, 'po_number', po.po_number, 'total', po.total, 'status', po.status, 'created_at', po.created_at,
                 'suppliers', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('name', s.name) END) AS x
          FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
         WHERE po.org_id = _org ORDER BY po.created_at DESC LIMIT 5) r),
    'setup', jsonb_build_object(
      'details', (SELECT COALESCE(email, '') <> '' OR COALESCE(address, '') <> '' OR COALESCE(phone, '') <> '' FROM organizations WHERE id = _org),
      'members', (SELECT count(*) FROM memberships WHERE org_id = _org AND status IN ('active', 'invited')),
      'companies', (SELECT count(*) FROM companies WHERE org_id = _org),
      'apps', (SELECT count(*) FROM mcp_connections WHERE org_id = _org AND revoked_at IS NULL)
            + (SELECT count(*) FROM personal_api_keys WHERE org_id = _org AND revoked_at IS NULL)));
END $$;
REVOKE ALL ON FUNCTION public.dashboard_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_overview(uuid) TO authenticated, service_role;