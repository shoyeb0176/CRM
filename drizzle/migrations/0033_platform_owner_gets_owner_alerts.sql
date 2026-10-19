-- The platform owner's own workspace (Platform) has them as role 'platform_owner', not 'org_owner',
-- so alerts meant for owners and admins (low stock, overdue invoices, stale deals, payments, leave,
-- support tickets, new members) never reached them. Treat platform_owner like org_owner here.
CREATE OR REPLACE FUNCTION public.notify_recipients(_org uuid, _roles public.app_role[])
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT user_id), '{}') FROM public.memberships
  WHERE org_id = _org AND status = 'active'
    AND role = ANY(_roles || ARRAY['platform_owner', 'org_owner', 'org_admin']::public.app_role[]);
$$;
REVOKE EXECUTE ON FUNCTION public.notify_recipients(uuid, public.app_role[]) FROM PUBLIC, anon, authenticated;
