-- DB-1 security fixes found in QA (2026-09-28).
-- 1) memberships_insert_self_or_admin let ANY signed-in user insert a membership for
--    themselves (any role, e.g. org_owner) into ANY organization. Self-insert is now
--    only allowed for the creator of a brand-new organization with no members yet.
CREATE OR REPLACE FUNCTION public.can_self_join_org(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = _org AND o.created_by = auth.uid())
     AND NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = _org);
$$;
REVOKE ALL ON FUNCTION public.can_self_join_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_self_join_org(uuid) TO authenticated;

DROP POLICY IF EXISTS "memberships_insert_self_or_admin" ON public.memberships;
CREATE POLICY "memberships_insert_self_or_admin" ON public.memberships
  FOR INSERT TO authenticated WITH CHECK (
    (user_id = auth.uid() AND public.can_self_join_org(org_id))
    OR public.has_org_role(org_id, ARRAY['org_owner','org_admin']::public.app_role[])
  );

-- 2) "Org admins update subscription" let an owner/admin set their own plan and status
--    (e.g. Business / active) without paying. All legitimate writes go through the
--    service role (webhook, startBusinessTrial, checkout) or platform owners.
DROP POLICY IF EXISTS "Org admins update subscription" ON public.organization_subscriptions;

-- 3) Remove the migration-channel probe from 0018.
DROP FUNCTION IF EXISTS public.qa_migration_probe();
