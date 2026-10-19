CREATE POLICY organizations_select_creator ON public.organizations
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());