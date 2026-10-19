---
name: Billing plans and the read-only lock
description: Packages instead of per-user plans, the free first year, and how an ended plan makes a workspace read-only (migrations 0026, 0029)
type: feature
---
- Plans (`subscription_plans`, Platform › Plans): every plan has every module; plans differ by users, months and storage. `free_10x12` (Free first year, 10 users, 12 months) is given to every new company by `ensure_org_subscription()`. `package_10x12` (Team package) and `storage_yearly` are off sale until active + public + priced. Old per-user plans (starter/growth/business/scale/enterprise) are `legacy`, kept for existing subscribers. Placeholder pricing basis: $9/user/month or $90/user/year (Team package set to $900, off sale).
- Landing page and /pricing read the plans on sale from the DB (`src/lib/billing/public-plans.ts`) and always show Self-host (free) and Enterprise (custom, contact us).
- `org_is_active(org)`: status active/trialing/past_due AND `current_period_end` in the future. `org_has_module(org, module)` builds on it.
- Read-only lock: `plan_lock_guard()` trigger (`plan_lock`) on every table with a `plan_lock_insert` policy raises "Your plan has ended…" for INSERT/UPDATE/DELETE by role `authenticated` when the org has no access. Service-role and SECURITY DEFINER code is not blocked, so server code that writes with the service role must check `org_is_active` itself — the public REST API returns 402 for writes (`src/lib/api/rest.server.ts`). Reads always work.
- Self-check on a test DB: `psql -f scripts/selftest-plan-lock.sql`.
- Stripe: `STRIPE_SECRET_KEY` (direct) with webhook secret pending; live keys and the dashboard are with a teammate.
