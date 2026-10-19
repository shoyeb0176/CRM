-- 0049 (DB-29): onboarding answers, agents that run on a schedule or an event, report fixes, and
-- screenshot file types checked by the database.
--  1. profiles.referral_source and profession, organizations.industry_preset (onboarding); Insights
--     shows how people heard about Inuberry and what they do.
--  2. consume_ai_action / refund_ai_action also accept the server's own key, so a scheduled agent run
--     uses one AI action like a manual run.
--  3. Every 5 minutes the database asks the app to start due agents (/api/public/agents/dispatch),
--     with the same secret as the notification emails, only when an active agent has a schedule or event.
--  4. Reports: owners and reviewers can be assigned by any reviewer; a reporter's reply gets its own
--     notification kind; kind, version, browser and screen of a report can't be edited afterwards.
--  5. The feedback bucket only takes .png, .jpg, .jpeg and .webp uploads (checked by storage policy,
--     since the bucket's own type list can't be set from Lovable).

-- 1. Onboarding answers.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_source text CHECK (char_length(referral_source) <= 140);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profession text CHECK (char_length(profession) <= 40);
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS industry_preset text CHECK (char_length(industry_preset) <= 40);

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
    'heard_about', (SELECT coalesce(jsonb_agg(jsonb_build_object('source', src, 'people', n) ORDER BY n DESC), '[]'::jsonb)
      FROM (SELECT coalesce(split_part(referral_source, ':', 1), 'not said') AS src, count(*) AS n FROM public.profiles GROUP BY 1) x),
    'professions', (SELECT coalesce(jsonb_agg(jsonb_build_object('profession', prof, 'people', n) ORDER BY n DESC), '[]'::jsonb)
      FROM (SELECT coalesce(profession, 'not said') AS prof, count(*) AS n FROM public.profiles GROUP BY 1) x),
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
          'id', u.id, 'email', u.email, 'name', pr.full_name, 'heard_about', pr.referral_source, 'profession', pr.profession,
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
GRANT EXECUTE ON FUNCTION public.platform_insights() TO authenticated;

-- 2. AI actions for scheduled agent runs (the server's own key has no signed-in user).
CREATE OR REPLACE FUNCTION public.consume_ai_action(_org uuid, _kind text, _byo boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _limit int; _used int; _id bigint; _start timestamptz := date_trunc('month', now()); _admins uuid[];
BEGIN
  IF NOT (coalesce(public.is_org_member(_org), false) OR coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role') THEN RAISE EXCEPTION 'Not a member of this workspace' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_usage:' || _org::text, 0));
  _limit := (public.org_limits(_org) ->> 'ai_actions_month')::int;
  SELECT count(*) INTO _used FROM public.ai_usage_events WHERE org_id = _org AND NOT byo AND created_at >= _start;
  IF NOT _byo AND _limit IS NOT NULL AND _used >= _limit THEN
    RETURN jsonb_build_object('ok', false, 'used', _used, 'limit', _limit, 'resets_on', to_char(_start + interval '1 month', 'YYYY-MM-DD'));
  END IF;
  INSERT INTO public.ai_usage_events (org_id, user_id, kind, byo) VALUES (_org, auth.uid(), _kind, _byo) RETURNING id INTO _id;
  IF NOT _byo THEN _used := _used + 1; END IF;
  IF NOT _byo AND _limit IS NOT NULL AND _limit > 0 AND _used = ceil(_limit * 0.8)::int
     AND NOT public.notified_recently('billing.ai_usage_high', _org, 25) THEN
    _admins := public.notify_recipients(_org, ARRAY[]::public.app_role[]);
    PERFORM public.notify(_org, _admins, format('%s of %s AI actions used this month', _used, _limit),
      'Upgrade in Settings › Billing, or connect your own AI key in Settings › AI, so the assistant keeps working.',
      'warning', 'billing', '/app/settings/billing', 'organization', _org, NULL, 'billing.ai_usage_high', true, 'See plans');
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', _id, 'used', _used, 'limit', _limit, 'resets_on', to_char(_start + interval '1 month', 'YYYY-MM-DD'));
END $$;
REVOKE ALL ON FUNCTION public.consume_ai_action(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_action(uuid, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refund_ai_action(_id bigint)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.ai_usage_events
  WHERE id = _id AND created_at > now() - interval '10 minutes'
    AND (user_id = auth.uid() OR (coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role' AND user_id IS NULL));
$$;
REVOKE ALL ON FUNCTION public.refund_ai_action(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_ai_action(bigint) TO authenticated, service_role;

-- 3. Start due agents every 5 minutes (the app works out which, see agent-dispatch.server.ts).
CREATE OR REPLACE FUNCTION public.kick_agent_dispatch()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE d record;
BEGIN
  SELECT site_url, secret INTO d FROM private.notification_dispatch WHERE id = 1;
  IF d.site_url IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.ai_agent_triggers t JOIN public.ai_agents a ON a.id = t.agent_id
    WHERE t.is_enabled AND t.trigger_type IN ('scheduled', 'event_based') AND a.status = 'active') THEN
    RETURN;
  END IF;
  PERFORM net.http_post(url := d.site_url || '/api/public/agents/dispatch',
    headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', d.secret),
    body := '{}'::jsonb);
END $$;
REVOKE EXECUTE ON FUNCTION public.kick_agent_dispatch() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  PERFORM cron.schedule('agent-dispatch', '*/5 * * * *', 'SELECT public.kick_agent_dispatch()');
EXCEPTION WHEN undefined_function OR invalid_schema_name OR undefined_table THEN
  RAISE NOTICE 'pg_cron is not available here; scheduled agents will not start on their own.';
END $$;

-- 4. Reports.
CREATE OR REPLACE FUNCTION public.list_platform_assignees()
RETURNS TABLE (user_id uuid, email text, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT r.user_id, u.email::text, p.full_name
  FROM (SELECT user_id FROM public.memberships WHERE role = 'platform_owner' AND status = 'active'
        UNION SELECT user_id FROM public.platform_reviewers) r
  JOIN auth.users u ON u.id = r.user_id LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE public.is_platform_reviewer();
$$;
REVOKE ALL ON FUNCTION public.list_platform_assignees() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_platform_assignees() TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_platform_ticket_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IN ('fixed', 'wont_fix', 'closed') AND OLD.status NOT IN ('fixed', 'wont_fix', 'closed') THEN NEW.resolved_at := now(); END IF;
  IF NEW.status NOT IN ('fixed', 'wont_fix', 'closed') THEN NEW.resolved_at := NULL; END IF;
  -- The report itself stays as written; reviewers change only its handling.
  NEW.created_by := OLD.created_by; NEW.title := OLD.title; NEW.description := OLD.description;
  NEW.screenshot_path := OLD.screenshot_path; NEW.page_url := OLD.page_url; NEW.org_id := OLD.org_id;
  NEW.kind := OLD.kind; NEW.app_version := OLD.app_version; NEW.user_agent := OLD.user_agent;
  NEW.viewport := OLD.viewport; NEW.ticket_number := OLD.ticket_number;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_platform_message_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.platform_tickets%ROWTYPE;
BEGIN
  SELECT * INTO _t FROM public.platform_tickets WHERE id = NEW.ticket_id;
  IF NEW.author_id = _t.created_by THEN
    -- The reporter wrote back: tell the assignee, or every reviewer if nobody has it yet.
    PERFORM public.notify_platform_reviewers(format('Reply on %s', _t.ticket_number), left(NEW.body, 300),
      '/app/platform/feedback/' || _t.id, _t.id, 'platform.ticket_reply', _t.assignee_id);
  ELSIF NOT NEW.is_internal THEN
    PERFORM public.notify_ticket_reporter(_t, format('Reply on %s', _t.ticket_number), left(NEW.body, 300));
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.notification_email_default(_kind text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _kind LIKE 'security.%' OR _kind LIKE 'access.%'
      OR _kind IN ('ai.approval', 'ai.approval_reminder', 'billing.payment_failed', 'billing.plan_ending',
                   'billing.plan_ended', 'system.update', 'agents.run_failed',
                   'platform.ticket_new', 'platform.ticket_reply', 'platform.ticket_update');
$$;

-- 5. Screenshots: images only, checked on upload.
DROP POLICY IF EXISTS feedback_upload_own ON storage.objects;
CREATE POLICY feedback_upload_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'feedback' AND (storage.foldername(name))[1] = auth.uid()::text
              AND lower(storage.extension(name)) IN ('png', 'jpg', 'jpeg', 'webp'));
