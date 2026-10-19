# Project Memory

## Core
Inuberry ERP — multi-tenant SaaS ERP on Lovable Cloud (Supabase). Org = tenant; users belong to many orgs via memberships.
Design: "Architectural grid" — paper bg (oklch ~0.972), dark forest-green fg (~0.235), orange primary (~0.685 0.18 50), sharp corners (radius 0). Full kit: `docs/design/inuberry-design-kit.webp`, summarised in memory `design-system.md` — follow it for every UI change.
Fonts: Anton (display), Inter (sans), JetBrains Mono (mono). Loaded via Google Fonts <link> in __root.tsx — never @import font URLs in styles.css.
RBAC enum app_role: platform_owner, org_owner, org_admin, manager, staff, accountant, sales_rep, inventory_manager, hr_manager, read_only. NEVER add a role column to profiles — use memberships table.
RLS helpers: is_org_member(org), has_org_role(org, role[]), is_platform_owner(). SECURITY DEFINER, EXECUTE granted only to authenticated. A platform owner can SELECT every organization and membership, so "my memberships" queries must filter by user_id explicitly. has_org_role counts a platform_owner membership as org_owner — but only in the workspace where they hold it (0034 / DB-14); browser code that compares membership.role directly to "org_owner" must apply the same rule. The platform owner's own workspace (slug inuberry-platform) holds them as role platform_owner: has_org_role counts it as org_owner there (0034 / DB-14), and in the browser `useOrgRole()` / `useAdminContext()` do the same — use those, never compare `membership.role` to "org_owner" directly.
Every business table must carry org_id + RLS using helpers + GRANTs to authenticated/service_role.
Auth: email + Google (managed by Lovable). Use `lovable.auth.signInWithOAuth("google", ...)`, never raw supabase OAuth for Google.
Route convention: dot-separated filenames under src/routes/. Authenticated subtree under src/routes/_authenticated/ (ssr:false gate). App shell at /app, modules at /app/<slug>.

## Memories
- [AI gateway](mem://ai-foundation) — org-scoped model routing, built-in chain OpenAI → OpenRouter → Lovable, usage logging; assistant/agent action proposals with approval
- [MCP server](mem://mcp-server) — /mcp: OAuth sign-in with workspace picker or personal keys, 20 tools incl. inuberry_help; every tool filters by the connection's workspace and checks the role
- [Notifications](mem://notifications) — one row per recipient via notify()/notify_org(); kinds, deep links, per-person settings, email queue (0037)
- [Docs and self-hosted image](mem://docs-and-self-host) — /docs from one content file; Docker image with runtime config, one-click updater, release feed
- [Billing and plan lock](mem://billing-and-plan-lock) — packages, free first year, read-only lock trigger, API 402

## Working rules
- Navigation has one source: `src/components/app/nav.ts` (sidebar, command palette, breadcrumbs). Settings tabs and overview tiles both come from `SETTINGS_SECTIONS` in `src/components/settings/settings-shell.tsx`.
- Database changes are SQL files in drizzle/migrations/00NN_*.sql applied by a short prompt; never edit an applied migration — add a new one. Server functions use `createServerFn().validator()` (react-start 1.168.60 in bun.lock).
- Small headings use the `font-heading` utility (Inter semibold); Anton (`font-display`) only for text-xl and up.
- Customer portal: invited `customer_portal_users` rows (user_id NULL) are linked only by the SECURITY DEFINER RPC `claim_portal_invites()` (0035 / DB-15), called from `usePortalIdentity`; portal users can't update their row themselves. Self-check: `scripts/selftest-portal.sql`.
- Growing admin tables page on the server: `usePaged()` + `ilikeAny()` (`src/lib/use-paged.ts`), `TablePager` (`src/components/ui/table-pager.tsx`), `.select(cols, { count: "exact" }).range(from, to)`.
- The app frame (sidebar, top bar, bell, assistant, search) is `AppFrame`, mounted once in `src/routes/_authenticated/app.tsx`. Pages still wrap themselves in `<AppShell title breadcrumb>`, which only hands the title to the frame; never render AppFrame in a page. The assistant, search box and update pop-up are `React.lazy` and load when first opened.
- Prices live in `src/lib/billing/pricing.ts` (pricing page, landing cards, FAQ). Checkout still uses `subscription_plans` until the new plans are set up for payment.
- Show code or JSON with `CodeBlock` / `JsonBlock` (`src/components/ui/code-block.tsx`), not a raw `<pre>`. highlight.js loads on first use.
- Error toasts go through `friendlyError()` automatically (patched once in `src/components/ui/sonner.tsx`); just call `toast.error(e.message)`.
- Text is 12px (`text-xs`) at the smallest; don't use text-[9px]/[10px]/[11px].
- Inbox (`/app/inbox`, tabs approvals | support | notifications) is the one place for AI approvals (assistant, AI apps and agents), open tickets and notifications. `/app/ai/approvals`, `/app/agents/approvals` and `/app/notifications` only redirect there. What the AI may do alone is in Settings › AI (`AiRulesPanel`).
- Module overviews and the home page take totals from SQL: `dashboard_summary(org)` and `module_summary(org, module)` (0038, SECURITY INVOKER). Add new totals there, not as browser-side sums. Charts: `ModuleCharts` / `chart-kit.tsx`.
- `organizations.enabled_modules` (NULL = all) hides modules from the sidebar, search and dashboard via `moduleShown()` in nav.ts; it doesn't block pages.
- List pages open their blank form on `?new=1` (`useOpenOnNew`); search lists them under Create (`NEW_ACTIONS` in nav.ts). Links with a query string go through `linkTarget()`.
- The line under a module's title comes from `HELP` in nav.ts; module guides live in `src/lib/docs/modules.ts`.
- Number tiles: `KpiTile` / `Stat` (`src/components/ui/kpi-tile.tsx`). Status colours: `success`, `warning`, `info` tokens. `bun run check:design` (also in CI) rejects rounded corners, raw palette colours and text under 12px.
- AI calls: `runAiChat({ tools, onDelta })` sends tools through the provider's native tool calling (OpenAI-style or Anthropic) and streams text through `onDelta` (OpenAI-style providers). Fenced ```action blocks still work as a fallback. Tool results go back with `actionsFrom()` / `assistantTurn()` (tool-loop.server.ts).
- The assistant streams from `POST /api/ai/assistant` (server-sent events, the user's bearer token); `runAssistant()` in ai.functions.ts is shared with the `aiAssistantSend` server function, which the panel falls back to.
- Agents: runs, approvals and audit entries are server functions in `src/lib/agents/agent-actions.functions.ts`; `agent-service.ts` only wraps them. Approving an agent action runs it in the same call.
- Public endpoints call `overLimit(key, max, seconds)` (`src/lib/rate-limit.server.ts`, table `rate_limits`, 0039). It fails open if the counter is unreachable.
- `bun scripts/check-mcp-isolation.ts` (CI) runs every MCP tool against a recording stand-in database and fails if a query isn't filtered by org_id. New MCP tools must pass it.
- Long lists page on the server with `usePaged` + `TablePager` (leads, companies, contacts, invoices); keep search in the query (`ilikeAny`), not in the browser.
- US payroll: `pay_runs` + `pay_run_lines` (0040). Taxes are worked out in the browser by `src/lib/payroll/us.ts` (IRS Pub 15-T 2026 tables, update each January) via `lineFor()` in `src/lib/payroll/runs.ts`; a CHECK makes every line add up. Status changes only through `approve_pay_run()` / `mark_pay_run_paid()`, which write the journal entries. HR roles only (`has_hr_access`).
- Tests: `bun test` (unit tests next to the code as `*.test.ts`, excluded from tsc), `bunx playwright test` (e2e/*.e2e.ts against the Node build; signed-in tests need E2E_EMAIL/E2E_PASSWORD), `bun run test:db` (migrations + every `scripts/selftest-*.sql` on an empty Supabase Postgres). All three run in CI.
- Bug reports to the Inuberry team: `platform_tickets` / `platform_ticket_messages` (0041), screenshots in the private `feedback` bucket under `{user_id}/`. Reviewers = platform owners + `platform_reviewers` rows (`is_platform_reviewer()`); Platform admin pages pass `allowReviewers` to `PlatformShell` to open to reviewers. Open the dialog with `openReportDialog()` (src/lib/feedback/feedback.ts).
- Files: show chosen or uploaded files with `FileCard` (src/components/ui/file-card.tsx); `FileDropzone` takes `files` + `onRemove` to stage files before submit.
- Sidebar: icon-only mode saved in localStorage `inuberry.nav.mini`; hovering the rail opens it over the page. The search box lives in the top bar's right cluster at a fixed width.
- Plans: pricing-page tiers are `subscription_plans` rows with `plan_kind = 'tier'`, `tier_key` and `limits` jsonb (0042). `org_limits(org)` merges custom-offering overrides. Record limits are BEFORE INSERT triggers (`enforce_plan_limit`, HINT `plan_limit`). New workspaces start on `tier_startup`; an ended free year becomes Startup, never read-only.
- AI actions: call `chargeAiAction(supabase, orgId, kind, purpose)` (src/lib/ai/usage.server.ts) once per user-facing AI action before the first model call, and `refund()` if it fails. Own-key calls are recorded, not limited. MCP isn't charged.
- Assistant memory: `runAssistant` sends the newest 10 messages word for word plus `ai_conversations.summary` (folded by a `summaries` call every 10 older messages) and reuses `ai_conversations.snapshot` for 5 minutes (0043). Keep the first system message static (rules, app guide, tools) and put what changes in the second, so provider caching works.
- Imports: CSV, Notion export zips and direct Notion/Airtable all become headers + rows for the same mapping step (src/lib/import/csv.ts, connectors.ts). Tokens live encrypted in `import_connections` (0043, service role only); the browser sees `list_import_connections(org)`. Server calls are in src/lib/import/connectors.functions.ts and fetch one page per call.
- Buttons: use `<Button>`; the design kit's action buttons are `variant="kit"` (bordered) and `variant="kitSolid"` with `size="kit"`. check:design caps the number of raw `<button>` elements and fails if it grows. Native `title` hints show as styled tooltips through `TitleHints` (root); keep using `title` or `aria-label`.
- Bundle: keep zod schemas, server functions and big constants out of route files' top level (they land in the first download); shared drawers live in src/components/<area>/*-drawer.tsx, not in route files.
- Assistant quick commands: src/lib/ai/commands.ts (`/sales`, `/low-stock`…) run a read tool with no model call and no AI action; the docs list comes from the same array. Reasoning effort per purpose: `effortFor()` in gateway.server.ts, overridable with OPENAI_REASONING_EFFORT[_PURPOSE].
- Products list reads `products_with_stock` (0044) and pages in the database; it falls back to `products` if the view is missing.
