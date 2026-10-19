-- When a workspace's plan has ended, writes must fail with a clear message.
-- 0026's restrictive UPDATE/DELETE policies filtered rows out instead, so an edit or delete
-- "succeeded" on zero rows and the app reported success (found in the live test, 8 Oct 2026).
--
-- Now:
--   * plan_lock_guard() trigger on every table that has plan_lock_insert: refuses INSERT, UPDATE
--     and DELETE by signed-in users (role "authenticated") when org_has_module(org_id, <module>)
--     is false, with a readable message. Server code (service_role) and SECURITY DEFINER
--     functions run as other roles and are not affected, as with RLS.
--   * plan_lock_insert stays as is; plan_lock_update keeps its WITH CHECK but no longer hides rows;
--     plan_lock_delete is dropped (a USING filter can only hide rows, never raise).
-- Re-runnable.

CREATE OR REPLACE FUNCTION public.plan_lock_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _org uuid;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  _org := CASE WHEN TG_OP = 'DELETE' THEN OLD.org_id ELSE NEW.org_id END;
  IF NOT public.org_has_module(_org, TG_ARGV[0]) THEN
    RAISE EXCEPTION 'Your plan has ended, so this workspace is read-only. Renew in Settings → Billing to make changes.'
      USING ERRCODE = 'P0001', HINT = 'plan_locked';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DO $$
DECLARE
  r record;
  _m text;
BEGIN
  FOR r IN
    SELECT tablename, with_check FROM pg_policies
     WHERE schemaname = 'public' AND policyname = 'plan_lock_insert'
  LOOP
    _m := substring(r.with_check from '''([a-z_]+)''');
    CONTINUE WHEN _m IS NULL;
    EXECUTE format('DROP TRIGGER IF EXISTS plan_lock ON public.%I', r.tablename);
    EXECUTE format('CREATE TRIGGER plan_lock BEFORE INSERT OR UPDATE OR DELETE ON public.%I
                      FOR EACH ROW EXECUTE FUNCTION public.plan_lock_guard(%L)', r.tablename, _m);
    EXECUTE format('DROP POLICY IF EXISTS plan_lock_update ON public.%I', r.tablename);
    EXECUTE format('CREATE POLICY plan_lock_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
                      USING (true) WITH CHECK (public.org_has_module(org_id, %L))', r.tablename, _m);
    EXECUTE format('DROP POLICY IF EXISTS plan_lock_delete ON public.%I', r.tablename);
  END LOOP;
END $$;
