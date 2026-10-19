
-- Projects & Tasks module

CREATE TYPE public.project_status AS ENUM ('planned','active','on_hold','completed','cancelled');
CREATE TYPE public.task_status AS ENUM ('todo','in_progress','review','done','blocked','cancelled');
CREATE TYPE public.task_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE public.milestone_status AS ENUM ('pending','in_progress','completed','missed');
CREATE TYPE public.timesheet_status AS ENUM ('draft','submitted','approved','rejected');

-- PROJECTS
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  description TEXT,
  status public.project_status NOT NULL DEFAULT 'planned',
  customer_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  customer_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  start_date DATE,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  budget NUMERIC(14,2),
  currency TEXT DEFAULT 'USD',
  color TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX projects_org_idx ON public.projects(org_id);
CREATE INDEX projects_status_idx ON public.projects(org_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read projects" ON public.projects FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "members insert projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "members update projects" ON public.projects FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "admins delete projects" ON public.projects FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager']::app_role[]));
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PROJECT MEMBERS
CREATE TABLE public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);
CREATE INDEX project_members_project_idx ON public.project_members(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read pm" ON public.project_members FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "members write pm" ON public.project_members FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "members update pm" ON public.project_members FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "members delete pm" ON public.project_members FOR DELETE TO authenticated USING (public.is_org_member(org_id));

-- MILESTONES
CREATE TABLE public.milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  status public.milestone_status NOT NULL DEFAULT 'pending',
  position INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX milestones_project_idx ON public.milestones(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.milestones TO authenticated;
GRANT ALL ON public.milestones TO service_role;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ms read" ON public.milestones FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "ms write" ON public.milestones FOR ALL TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE TRIGGER trg_milestones_updated BEFORE UPDATE ON public.milestones FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PROJECT TASKS
CREATE TABLE public.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES public.milestones(id) ON DELETE SET NULL,
  parent_task_id UUID REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status public.task_status NOT NULL DEFAULT 'todo',
  priority public.task_priority NOT NULL DEFAULT 'medium',
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  start_date DATE,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  estimated_hours NUMERIC(8,2),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tasks_project_idx ON public.project_tasks(project_id);
CREATE INDEX tasks_assignee_idx ON public.project_tasks(assignee_id);
CREATE INDEX tasks_status_idx ON public.project_tasks(org_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_tasks TO authenticated;
GRANT ALL ON public.project_tasks TO service_role;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "t read" ON public.project_tasks FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "t write" ON public.project_tasks FOR ALL TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.project_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- TASK COMMENTS
CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX task_comments_task_idx ON public.task_comments(task_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT ALL ON public.task_comments TO service_role;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tc read" ON public.task_comments FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "tc insert" ON public.task_comments FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id) AND author_id = auth.uid());
CREATE POLICY "tc update" ON public.task_comments FOR UPDATE TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "tc delete" ON public.task_comments FOR DELETE TO authenticated USING (author_id = auth.uid() OR public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager']::app_role[]));
CREATE TRIGGER trg_task_comments_updated BEFORE UPDATE ON public.task_comments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- TASK CHECKLISTS
CREATE TABLE public.task_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  position INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX task_cl_task_idx ON public.task_checklists(task_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_checklists TO authenticated;
GRANT ALL ON public.task_checklists TO service_role;
ALTER TABLE public.task_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cl read" ON public.task_checklists FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "cl write" ON public.task_checklists FOR ALL TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE TRIGGER trg_task_checklists_updated BEFORE UPDATE ON public.task_checklists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- TIMESHEETS
CREATE TABLE public.timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.project_tasks(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  hours NUMERIC(6,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  billable BOOLEAN NOT NULL DEFAULT true,
  hourly_rate NUMERIC(10,2),
  notes TEXT,
  status public.timesheet_status NOT NULL DEFAULT 'draft',
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ts_user_date_idx ON public.timesheets(user_id, entry_date);
CREATE INDEX ts_project_idx ON public.timesheets(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timesheets TO authenticated;
GRANT ALL ON public.timesheets TO service_role;
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ts read" ON public.timesheets FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "ts insert own" ON public.timesheets FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id) AND user_id = auth.uid());
CREATE POLICY "ts update own or mgr" ON public.timesheets FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager']::app_role[])) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "ts delete own or mgr" ON public.timesheets FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_org_role(org_id, ARRAY['org_owner','org_admin','manager']::app_role[]));
CREATE TRIGGER trg_timesheets_updated BEFORE UPDATE ON public.timesheets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
