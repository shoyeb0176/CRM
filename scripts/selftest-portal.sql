-- Self-check for customer portal linking (0035). Run on a TEST database after `bun run db:migrate`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/selftest-portal.sql
-- Everything runs in one transaction and is rolled back. Prints "portal selftest: ok" or raises.
BEGIN;
-- Real Supabase has auth.users.email_confirmed_at; the bare postgres test image doesn't.
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

DO $$
DECLARE
  _owner uuid := gen_random_uuid();
  _cust uuid := gen_random_uuid();
  _other uuid := gen_random_uuid();
  _unconf uuid := gen_random_uuid();
  _org uuid;
  _a uuid;
  _b uuid;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at, instance_id, aud, role) VALUES
    (_owner, 'owner@portal.test', now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_cust, 'Cust@Portal.test', now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_other, 'other@portal.test', now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (_unconf, 'invite2@portal.test', NULL, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.organizations (name, slug, created_by) VALUES ('Portal Test', 'portal-' || left(_owner::text, 8), _owner)
  RETURNING id INTO _org;
  INSERT INTO public.memberships (org_id, user_id, role, status) VALUES (_org, _owner, 'org_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'org_owner', status = 'active';
  INSERT INTO public.companies (org_id, name) VALUES (_org, 'Customer A') RETURNING id INTO _a;
  INSERT INTO public.companies (org_id, name) VALUES (_org, 'Customer B') RETURNING id INTO _b;
  INSERT INTO public.invoices (org_id, number, company_id) VALUES (_org, 'PT-A-1', _a), (_org, 'PT-B-1', _b);
  -- Invites as the admin page makes them: lower-case email, no user yet.
  INSERT INTO public.customer_portal_users (org_id, company_id, email, status) VALUES
    (_org, _a, 'cust@portal.test', 'invited'),
    (_org, _a, 'invite2@portal.test', 'invited');
  PERFORM set_config('portaltest.org', _org::text, true);
  PERFORM set_config('portaltest.cust', _cust::text, true);
  PERFORM set_config('portaltest.other', _other::text, true);
  PERFORM set_config('portaltest.unconf', _unconf::text, true);
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  _org uuid := current_setting('portaltest.org')::uuid;
  _n int;
BEGIN
  -- Someone else can't claim an invite that isn't addressed to them.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('portaltest.other'), 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', current_setting('portaltest.other'), true);
  IF public.claim_portal_invites() <> 0 THEN RAISE EXCEPTION 'another user claimed an invite'; END IF;

  -- An unconfirmed email can't claim its invite yet.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('portaltest.unconf'), 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', current_setting('portaltest.unconf'), true);
  IF public.claim_portal_invites() <> 0 THEN RAISE EXCEPTION 'unconfirmed email claimed an invite'; END IF;

  -- The invited customer: nothing visible before linking, linked by the claim (email case ignored),
  -- then sees only their own company's invoice.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('portaltest.cust'), 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', current_setting('portaltest.cust'), true);
  SELECT count(*) INTO _n FROM public.invoices WHERE org_id = _org;
  IF _n <> 0 THEN RAISE EXCEPTION 'unlinked customer sees % invoices', _n; END IF;
  _n := public.claim_portal_invites();
  IF _n <> 1 THEN RAISE EXCEPTION 'claim linked % invites, expected 1', _n; END IF;
  SELECT count(*) INTO _n FROM public.customer_portal_users WHERE org_id = _org AND status = 'active' AND last_login_at IS NOT NULL;
  IF _n <> 1 THEN RAISE EXCEPTION 'customer does not see their active row (got %)', _n; END IF;
  SELECT count(*) INTO _n FROM public.invoices WHERE org_id = _org AND number = 'PT-A-1';
  IF _n <> 1 THEN RAISE EXCEPTION 'customer cannot see their own invoice'; END IF;
  SELECT count(*) INTO _n FROM public.invoices WHERE org_id = _org AND number = 'PT-B-1';
  IF _n <> 0 THEN RAISE EXCEPTION 'customer can see another company''s invoice'; END IF;
  IF public.claim_portal_invites() <> 0 THEN RAISE EXCEPTION 'second claim linked more rows'; END IF;
  RAISE NOTICE 'portal selftest: ok';
END $$;

ROLLBACK;
