
-- Enums
CREATE TYPE public.lifecycle_stage AS ENUM ('subscriber','lead','marketing_qualified','sales_qualified','opportunity','customer','evangelist','other');
CREATE TYPE public.lead_status AS ENUM ('new','contacted','qualified','unqualified','converted','lost');
CREATE TYPE public.deal_status AS ENUM ('open','won','lost');
CREATE TYPE public.activity_type AS ENUM ('call','email','meeting','task','follow_up','note');
CREATE TYPE public.crm_entity_type AS ENUM ('contact','company','deal','lead');

-- COMPANIES
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  website text,
  industry text,
  size text,
  phone text,
  address text,
  city text,
  country text,
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX companies_org_idx ON public.companies(org_id);
CREATE INDEX companies_owner_idx ON public.companies(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies_select_org" ON public.companies FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "companies_insert_org" ON public.companies FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "companies_update_org" ON public.companies FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "companies_delete_org" ON public.companies FOR DELETE TO authenticated USING (public.is_org_member(org_id));
CREATE TRIGGER companies_set_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CONTACTS
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  email text,
  phone text,
  job_title text,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lifecycle_stage public.lifecycle_stage NOT NULL DEFAULT 'lead',
  source text,
  notes text,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contacts_org_idx ON public.contacts(org_id);
CREATE INDEX contacts_company_idx ON public.contacts(company_id);
CREATE INDEX contacts_owner_idx ON public.contacts(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_select_org" ON public.contacts FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "contacts_insert_org" ON public.contacts FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "contacts_update_org" ON public.contacts FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "contacts_delete_org" ON public.contacts FOR DELETE TO authenticated USING (public.is_org_member(org_id));
CREATE TRIGGER contacts_set_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- LEADS
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  company_name text,
  job_title text,
  status public.lead_status NOT NULL DEFAULT 'new',
  source text,
  estimated_value numeric(18,2),
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  converted_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  converted_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  converted_deal_id uuid,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_org_idx ON public.leads(org_id);
CREATE INDEX leads_status_idx ON public.leads(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads_select_org" ON public.leads FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "leads_insert_org" ON public.leads FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "leads_update_org" ON public.leads FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "leads_delete_org" ON public.leads FOR DELETE TO authenticated USING (public.is_org_member(org_id));
CREATE TRIGGER leads_set_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- DEAL STAGES
CREATE TABLE public.deal_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  position int NOT NULL DEFAULT 0,
  probability int NOT NULL DEFAULT 0,
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deal_stages_org_idx ON public.deal_stages(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_stages TO authenticated;
GRANT ALL ON public.deal_stages TO service_role;
ALTER TABLE public.deal_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deal_stages_select_org" ON public.deal_stages FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "deal_stages_insert_org" ON public.deal_stages FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "deal_stages_update_org" ON public.deal_stages FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "deal_stages_delete_org" ON public.deal_stages FOR DELETE TO authenticated USING (public.is_org_member(org_id));
CREATE TRIGGER deal_stages_set_updated_at BEFORE UPDATE ON public.deal_stages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- DEALS
CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES public.deal_stages(id) ON DELETE SET NULL,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  expected_close_date date,
  probability int NOT NULL DEFAULT 0,
  status public.deal_status NOT NULL DEFAULT 'open',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  description text,
  position int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deals_org_idx ON public.deals(org_id);
CREATE INDEX deals_stage_idx ON public.deals(stage_id);
CREATE INDEX deals_status_idx ON public.deals(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deals TO authenticated;
GRANT ALL ON public.deals TO service_role;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deals_select_org" ON public.deals FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "deals_insert_org" ON public.deals FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "deals_update_org" ON public.deals FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "deals_delete_org" ON public.deals FOR DELETE TO authenticated USING (public.is_org_member(org_id));
CREATE TRIGGER deals_set_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.leads ADD CONSTRAINT leads_converted_deal_fkey FOREIGN KEY (converted_deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;

-- ACTIVITIES
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type public.activity_type NOT NULL DEFAULT 'task',
  title text NOT NULL,
  description text,
  due_at timestamptz,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type public.crm_entity_type,
  entity_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_org_idx ON public.activities(org_id);
CREATE INDEX activities_entity_idx ON public.activities(entity_type, entity_id);
CREATE INDEX activities_due_idx ON public.activities(due_at);
CREATE INDEX activities_owner_idx ON public.activities(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activities TO authenticated;
GRANT ALL ON public.activities TO service_role;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activities_select_org" ON public.activities FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "activities_insert_org" ON public.activities FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "activities_update_org" ON public.activities FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "activities_delete_org" ON public.activities FOR DELETE TO authenticated USING (public.is_org_member(org_id));
CREATE TRIGGER activities_set_updated_at BEFORE UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- NOTES
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  body text NOT NULL,
  entity_type public.crm_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notes_org_idx ON public.notes(org_id);
CREATE INDEX notes_entity_idx ON public.notes(entity_type, entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes_select_org" ON public.notes FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "notes_insert_org" ON public.notes FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "notes_update_org" ON public.notes FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "notes_delete_org" ON public.notes FOR DELETE TO authenticated USING (public.is_org_member(org_id));
CREATE TRIGGER notes_set_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- TAGS
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#94a3b8',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
CREATE INDEX tags_org_idx ON public.tags(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags_select_org" ON public.tags FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "tags_insert_org" ON public.tags FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "tags_update_org" ON public.tags FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "tags_delete_org" ON public.tags FOR DELETE TO authenticated USING (public.is_org_member(org_id));
CREATE TRIGGER tags_set_updated_at BEFORE UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.contact_tags (
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, tag_id)
);
CREATE INDEX contact_tags_org_idx ON public.contact_tags(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_tags TO authenticated;
GRANT ALL ON public.contact_tags TO service_role;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contact_tags_select_org" ON public.contact_tags FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "contact_tags_insert_org" ON public.contact_tags FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "contact_tags_delete_org" ON public.contact_tags FOR DELETE TO authenticated USING (public.is_org_member(org_id));

CREATE TABLE public.company_tags (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, tag_id)
);
CREATE INDEX company_tags_org_idx ON public.company_tags(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_tags TO authenticated;
GRANT ALL ON public.company_tags TO service_role;
ALTER TABLE public.company_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_tags_select_org" ON public.company_tags FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "company_tags_insert_org" ON public.company_tags FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "company_tags_delete_org" ON public.company_tags FOR DELETE TO authenticated USING (public.is_org_member(org_id));

-- Seed default deal stages helper
CREATE OR REPLACE FUNCTION public.seed_default_deal_stages(_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.deal_stages WHERE org_id = _org) THEN
    INSERT INTO public.deal_stages (org_id, name, position, probability, is_won, is_lost) VALUES
      (_org, 'Discovery',   1, 10,  false, false),
      (_org, 'Qualified',   2, 25,  false, false),
      (_org, 'Proposal',    3, 50,  false, false),
      (_org, 'Negotiation', 4, 75,  false, false),
      (_org, 'Won',         5, 100, true,  false),
      (_org, 'Lost',        6, 0,   false, true);
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.seed_default_deal_stages(uuid) TO authenticated;
