
-- =========================================================================
-- HR & Employee module
-- =========================================================================

CREATE TYPE public.employment_type AS ENUM ('full_time','part_time','contractor','intern');
CREATE TYPE public.employee_status AS ENUM ('active','inactive','terminated','on_leave');
CREATE TYPE public.leave_type AS ENUM ('vacation','sick','unpaid','personal','other');
CREATE TYPE public.leave_status AS ENUM ('pending','approved','rejected','cancelled');
CREATE TYPE public.attendance_source AS ENUM ('manual','clock','import');

-- Sensitive-data role helper
CREATE OR REPLACE FUNCTION public.has_hr_access(_org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_org_role(_org, ARRAY['org_owner','org_admin','hr_manager']::public.app_role[]);
$$;

-- =========================================================================
-- departments
-- =========================================================================
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  manager_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dept_select" ON public.departments FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "dept_write" ON public.departments FOR ALL TO authenticated
  USING (public.has_hr_access(org_id)) WITH CHECK (public.has_hr_access(org_id));
CREATE TRIGGER trg_departments_updated BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- job_titles
-- =========================================================================
CREATE TABLE public.job_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_titles TO authenticated;
GRANT ALL ON public.job_titles TO service_role;
ALTER TABLE public.job_titles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jt_select" ON public.job_titles FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "jt_write" ON public.job_titles FOR ALL TO authenticated
  USING (public.has_hr_access(org_id)) WITH CHECK (public.has_hr_access(org_id));
CREATE TRIGGER trg_job_titles_updated BEFORE UPDATE ON public.job_titles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- employees
-- =========================================================================
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID,  -- optional link to auth user (not FK to auth.users)
  employee_number TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  preferred_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  date_of_birth DATE,
  gender TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  job_title_id UUID REFERENCES public.job_titles(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  employment_type public.employment_type NOT NULL DEFAULT 'full_time',
  status public.employee_status NOT NULL DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relation TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, employee_number)
);
CREATE INDEX idx_employees_org ON public.employees(org_id);
CREATE INDEX idx_employees_dept ON public.employees(department_id);
CREATE INDEX idx_employees_manager ON public.employees(manager_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
-- Members can see basic employee directory info (sensitive fields kept in payroll_profiles)
CREATE POLICY "emp_select_members" ON public.employees FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));
CREATE POLICY "emp_write_hr" ON public.employees FOR ALL TO authenticated
  USING (public.has_hr_access(org_id)) WITH CHECK (public.has_hr_access(org_id));
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add departments.manager_id FK now that employees exists
ALTER TABLE public.departments
  ADD CONSTRAINT departments_manager_fk FOREIGN KEY (manager_id) REFERENCES public.employees(id) ON DELETE SET NULL;

-- =========================================================================
-- employee_documents
-- =========================================================================
CREATE TABLE public.employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  doc_type TEXT,
  file_url TEXT,
  notes TEXT,
  is_sensitive BOOLEAN NOT NULL DEFAULT false,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_documents TO authenticated;
GRANT ALL ON public.employee_documents TO service_role;
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empdoc_select" ON public.employee_documents FOR SELECT TO authenticated
  USING (public.has_hr_access(org_id)
      OR (NOT is_sensitive AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())));
CREATE POLICY "empdoc_write" ON public.employee_documents FOR ALL TO authenticated
  USING (public.has_hr_access(org_id)) WITH CHECK (public.has_hr_access(org_id));
CREATE TRIGGER trg_empdoc_updated BEFORE UPDATE ON public.employee_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- leave_requests
-- =========================================================================
CREATE TABLE public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type public.leave_type NOT NULL DEFAULT 'vacation',
  status public.leave_status NOT NULL DEFAULT 'pending',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days NUMERIC(6,2),
  reason TEXT,
  decision_notes TEXT,
  requested_by UUID,
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_leave_org_status ON public.leave_requests(org_id, status);
CREATE INDEX idx_leave_emp ON public.leave_requests(employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;
GRANT ALL ON public.leave_requests TO service_role;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
-- Members see leave requests within their org (calendar visibility); own requests always
CREATE POLICY "leave_select" ON public.leave_requests FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));
-- HR/manager can write; employees can insert/update their own pending requests
CREATE POLICY "leave_insert_self" ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.has_hr_access(org_id)
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid() AND e.org_id = org_id)
  );
CREATE POLICY "leave_update_hr_or_self_pending" ON public.leave_requests FOR UPDATE TO authenticated
  USING (
    public.has_hr_access(org_id)
    OR (status = 'pending' AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid()))
  )
  WITH CHECK (
    public.has_hr_access(org_id)
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
  );
CREATE POLICY "leave_delete_hr" ON public.leave_requests FOR DELETE TO authenticated
  USING (public.has_hr_access(org_id));
CREATE TRIGGER trg_leave_updated BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- attendance_records
-- =========================================================================
CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  hours_worked NUMERIC(6,2),
  source public.attendance_source NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_att_org_date ON public.attendance_records(org_id, work_date);
CREATE INDEX idx_att_emp_date ON public.attendance_records(employee_id, work_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "att_select" ON public.attendance_records FOR SELECT TO authenticated
  USING (
    public.has_hr_access(org_id)
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
  );
CREATE POLICY "att_write" ON public.attendance_records FOR ALL TO authenticated
  USING (public.has_hr_access(org_id)) WITH CHECK (public.has_hr_access(org_id));
CREATE TRIGGER trg_att_updated BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- payroll_profiles  (sensitive — HR only)
-- =========================================================================
CREATE TABLE public.payroll_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  base_salary NUMERIC(14,2),
  hourly_rate NUMERIC(10,2),
  currency TEXT DEFAULT 'USD',
  pay_frequency TEXT,                          -- weekly, biweekly, monthly, etc.
  tax_id TEXT,
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_routing_number TEXT,
  bank_name TEXT,
  payment_method TEXT,                         -- ach, check, wire, etc.
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_profiles TO authenticated;
GRANT ALL ON public.payroll_profiles TO service_role;
ALTER TABLE public.payroll_profiles ENABLE ROW LEVEL SECURITY;
-- ONLY HR/admin/owner can read or write payroll_profiles
CREATE POLICY "pay_select_hr" ON public.payroll_profiles FOR SELECT TO authenticated
  USING (public.has_hr_access(org_id));
CREATE POLICY "pay_write_hr" ON public.payroll_profiles FOR ALL TO authenticated
  USING (public.has_hr_access(org_id)) WITH CHECK (public.has_hr_access(org_id));
CREATE TRIGGER trg_pay_updated BEFORE UPDATE ON public.payroll_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
