-- The platform owner's own workspace (Platform) has them as role 'platform_owner'. Every role check
-- (RLS policies, has_permission, has_hr_access, server functions) goes through has_org_role, which
-- only knew 'org_owner', so Accounting, HR, taxes and other owner-only actions were locked for them.
-- A platform_owner membership now counts as org_owner — only in the workspace where they hold it.
CREATE OR REPLACE FUNCTION public.has_org_role(_org uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE org_id = _org AND user_id = auth.uid() AND status = 'active'
      AND (role = ANY(_roles) OR (role = 'platform_owner' AND 'org_owner' = ANY(_roles)))
  );
$$;