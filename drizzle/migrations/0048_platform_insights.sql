-- 0048 (DB-28): Platform › Insights. One call returns what the platform owner needs to see how
-- Inuberry is used: signups and active people per week, every user with their email and workspaces,
-- each workspace's plan and last activity, and how much each module was used in the last 30 days.
-- SECURITY DEFINER so it can read auth.users; refuses anyone who isn't a platform owner.

CREATE OR REPLACE FUNCTION public.platform_insights()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _out jsonb;
BEGIN
  IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  WITH weeks AS (
    SELECT generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') AS wk
  ),
  ws AS (
    SELECT o.id, o.name, o.created_at, o.employee_band, o.revenue_band,
           p.name AS plan, s.status AS plan_status,
           (SELECT count(*) FROM public.memberships m WHERE m.org_id = o.id AND m.status = 'active') AS members,
           (SELECT max(u.last_sign_in_at) FROM public.memberships m JOIN auth.users u ON u.id = m.user_id
             WHERE m.org_id = o.id AND m.status = 'active') AS last_active
    FROM public.organizations o
    LEFT JOIN public.organization_subscriptions s ON s.org_id = o.id
    LEFT JOIN public.subscription_plans p ON p.id = s.plan_id
  )
  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'users',          (SELECT count(*) FROM auth.users),
      'active_7d',      (SELECT count(*) FROM auth.users WHERE last_sign_in_at > now() - interval '7 days'),
      'active_30d',     (SELECT count(*) FROM auth.users WHERE last_sign_in_at > now() - interval '30 days'),
      'signups_30d',    (SELECT count(*) FROM auth.users WHERE created_at > now() - interval '30 days'),
      'workspaces',     (SELECT count(*) FROM public.organizations),
      'workspaces_active_30d', (SELECT count(*) FROM ws WHERE last_active > now() - interval '30 days')
    ),
    'weeks', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'week', to_char(w.wk, 'YYYY-MM-DD'),
        'signups', (SELECT count(*) FROM auth.users u WHERE u.created_at >= w.wk AND u.created_at < w.wk + interval '1 week'),
        'workspaces', (SELECT count(*) FROM public.organizations o WHERE o.created_at >= w.wk AND o.created_at < w.wk + interval '1 week')
      ) ORDER BY w.wk), '[]'::jsonb) FROM weeks w),
    'plans', (SELECT coalesce(jsonb_agg(jsonb_build_object('plan', coalesce(plan, 'None'), 'workspaces', n) ORDER BY n DESC), '[]'::jsonb)
      FROM (SELECT plan, count(*) AS n FROM ws GROUP BY plan) x),
    'modules_30d', jsonb_build_object(
      'crm',        (SELECT count(*) FROM public.activities WHERE created_at > now() - interval '30 days')
                  + (SELECT count(*) FROM public.deals WHERE created_at > now() - interval '30 days'),
      'sales',      (SELECT count(*) FROM public.quotes WHERE created_at > now() - interval '30 days'),
      'invoices',   (SELECT count(*) FROM public.invoices WHERE created_at > now() - interval '30 days'),
      'inventory',  (SELECT count(*) FROM public.products WHERE created_at > now() - interval '30 days'),
      'purchasing', (SELECT count(*) FROM public.purchase_orders WHERE created_at > now() - interval '30 days')
                  + (SELECT count(*) FROM public.expenses WHERE created_at > now() - interval '30 days'),
      'projects',   (SELECT count(*) FROM public.projects WHERE created_at > now() - interval '30 days'),
      'hr',         (SELECT count(*) FROM public.employees WHERE created_at > now() - interval '30 days'),
      'ai',         (SELECT count(*) FROM public.ai_call_logs WHERE created_at > now() - interval '30 days')
    ),
    'workspaces', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'plan', plan, 'plan_status', plan_status, 'members', members,
        'created_at', created_at, 'last_active', last_active,
        'employee_band', employee_band, 'revenue_band', revenue_band
      ) ORDER BY last_active DESC NULLS LAST), '[]'::jsonb) FROM ws),
    'users', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'last_sign_in_at' DESC NULLS LAST), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'id', u.id, 'email', u.email, 'name', pr.full_name,
          'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
          'confirmed', u.email_confirmed_at IS NOT NULL,
          'workspaces', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', o.name, 'role', m.role)), '[]'::jsonb)
                         FROM public.memberships m JOIN public.organizations o ON o.id = m.org_id
                         WHERE m.user_id = u.id AND m.status = 'active')
        ) AS x
        FROM auth.users u LEFT JOIN public.profiles pr ON pr.id = u.id
        ORDER BY u.last_sign_in_at DESC NULLS LAST
        LIMIT 5000) t)
  ) INTO _out;
  RETURN _out;
END; $$;
REVOKE ALL ON FUNCTION public.platform_insights() FROM public;
GRANT EXECUTE ON FUNCTION public.platform_insights() TO authenticated;
