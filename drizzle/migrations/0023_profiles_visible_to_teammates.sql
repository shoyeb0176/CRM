-- Members can see the name/email of people in their workspaces (member lists, owner and
-- assignee pickers, audit log). Profiles were readable only by their owner.
CREATE OR REPLACE FUNCTION public.shares_org_with(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships me
    JOIN public.memberships them ON them.org_id = me.org_id
    WHERE me.user_id = auth.uid() AND me.status = 'active' AND them.user_id = _user
  ); $$;
REVOKE ALL ON FUNCTION public.shares_org_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shares_org_with(uuid) TO authenticated;

DROP POLICY IF EXISTS "profiles_select_teammates" ON public.profiles;
CREATE POLICY "profiles_select_teammates" ON public.profiles
  FOR SELECT TO authenticated USING (public.shares_org_with(id));
