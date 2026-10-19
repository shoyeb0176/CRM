-- Platform owners can read every workspace and its members, so the platform console
-- (Organizations list and each workspace's page) shows all tenants, not only their own.
-- Read-only: changes still go through the audited platform server functions.
DROP POLICY IF EXISTS organizations_select_platform_owner ON public.organizations;
CREATE POLICY organizations_select_platform_owner ON public.organizations
  FOR SELECT TO authenticated USING (public.is_platform_owner());

DROP POLICY IF EXISTS memberships_select_platform_owner ON public.memberships;
CREATE POLICY memberships_select_platform_owner ON public.memberships
  FOR SELECT TO authenticated USING (public.is_platform_owner());
