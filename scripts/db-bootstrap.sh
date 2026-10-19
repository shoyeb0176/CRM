#!/usr/bin/env bash
# First-run setup for a fresh install, after `bun run db:migrate`.
#
#   DATABASE_URL="postgresql://…" ADMIN_EMAIL="you@company.com" bun run db:bootstrap
#
# Before running: open the app, sign up with ADMIN_EMAIL and confirm the email.
# This makes that account the instance's platform owner (the /app/platform console),
# in a dedicated "Platform" workspace, and checks the plan catalogue exists.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the database connection string}"
: "${ADMIN_EMAIL:?Set ADMIN_EMAIL to the email of the account that should administer this install}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q -v admin_email="$ADMIN_EMAIL" <<'SQL'
SELECT set_config('inuberry.admin_email', :'admin_email', false);

DO $$
DECLARE
  _email text := current_setting('inuberry.admin_email');
  _uid uuid;
  _org uuid;
BEGIN
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = lower(_email);
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'No account for %. Sign up in the app with this email first, then run this again.', _email;
  END IF;

  SELECT id INTO _org FROM public.organizations WHERE slug = 'inuberry-platform';
  IF _org IS NULL THEN
    INSERT INTO public.organizations (name, slug, created_by)
    VALUES ('Platform', 'inuberry-platform', _uid)
    RETURNING id INTO _org;
  END IF;

  INSERT INTO public.memberships (org_id, user_id, role, status)
  VALUES (_org, _uid, 'platform_owner', 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'platform_owner', status = 'active';

  IF NOT EXISTS (SELECT 1 FROM public.subscription_plans) THEN
    RAISE WARNING 'No subscription plans found: did db:migrate finish?';
  END IF;

  RAISE NOTICE 'Done: % is now the platform owner.', _email;
END $$;
SQL
