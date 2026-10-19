
-- =========================================================================
-- ENUMS
-- =========================================================================
CREATE TYPE public.app_role AS ENUM (
  'platform_owner',
  'org_owner',
  'org_admin',
  'manager',
  'staff',
  'accountant',
  'sales_rep',
  'inventory_manager',
  'hr_manager',
  'read_only'
);

CREATE TYPE public.membership_status AS ENUM ('active', 'invited', 'suspended');

-- =========================================================================
-- SHARED: updated_at trigger
-- =========================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =========================================================================
-- PROFILES
-- =========================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  locale TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own_or_org" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- ORGANIZATIONS
-- =========================================================================
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  default_currency TEXT NOT NULL DEFAULT 'USD',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX organizations_slug_idx ON public.organizations(slug);

GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER organizations_set_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- MEMBERSHIPS
-- =========================================================================
CREATE TABLE public.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'staff',
  status public.membership_status NOT NULL DEFAULT 'active',
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX memberships_user_idx ON public.memberships(user_id);
CREATE INDEX memberships_org_idx ON public.memberships(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER memberships_set_updated_at BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- SECURITY DEFINER HELPERS (recursion-safe)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_org_member(_org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE org_id = _org AND user_id = auth.uid() AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org UUID, _roles public.app_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE org_id = _org AND user_id = auth.uid()
      AND status = 'active' AND role = ANY(_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = auth.uid() AND role = 'platform_owner' AND status = 'active'
  );
$$;

-- =========================================================================
-- ORG + MEMBERSHIP POLICIES (using helpers)
-- =========================================================================
CREATE POLICY "organizations_select_member" ON public.organizations
  FOR SELECT TO authenticated USING (public.is_org_member(id));
CREATE POLICY "organizations_insert_any_authenticated" ON public.organizations
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "organizations_update_owner_admin" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.has_org_role(id, ARRAY['org_owner','org_admin']::public.app_role[]))
  WITH CHECK (public.has_org_role(id, ARRAY['org_owner','org_admin']::public.app_role[]));

CREATE POLICY "memberships_select_same_org" ON public.memberships
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
-- Allow the creator of a brand-new org to insert their own owner membership
CREATE POLICY "memberships_insert_self_or_admin" ON public.memberships
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    OR public.has_org_role(org_id, ARRAY['org_owner','org_admin']::public.app_role[])
  );
CREATE POLICY "memberships_update_admin_not_self_role" ON public.memberships
  FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin']::public.app_role[]))
  WITH CHECK (
    public.has_org_role(org_id, ARRAY['org_owner','org_admin']::public.app_role[])
    AND user_id <> auth.uid()
  );
CREATE POLICY "memberships_delete_admin" ON public.memberships
  FOR DELETE TO authenticated USING (
    public.has_org_role(org_id, ARRAY['org_owner','org_admin']::public.app_role[])
    AND user_id <> auth.uid()
  );

-- =========================================================================
-- USER PREFERENCES
-- =========================================================================
CREATE TABLE public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prefs_select_own" ON public.user_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "prefs_insert_own" ON public.user_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "prefs_update_own" ON public.user_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER prefs_set_updated_at BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- AUDIT LOGS
-- =========================================================================
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  diff JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_org_idx ON public.audit_logs(org_id, created_at DESC);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_select_org_admin" ON public.audit_logs
  FOR SELECT TO authenticated USING (
    public.has_org_role(org_id, ARRAY['org_owner','org_admin']::public.app_role[])
  );
CREATE POLICY "audit_insert_member" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (
    public.is_org_member(org_id) AND (user_id = auth.uid() OR user_id IS NULL)
  );
-- No UPDATE / DELETE policies = append-only.
