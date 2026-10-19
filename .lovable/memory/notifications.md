---
name: Notifications
description: How in-app notifications are created and who sees them (migrations 0030 / DB-10, 0032 / DB-12, 0033 / DB-13)
type: feature
---
- Table `notification_events`: ONE ROW PER RECIPIENT (`user_id` always set). Users read only their own rows (RLS `user_id = auth.uid()`), and mark them read/dismissed themselves. Never insert rows with `user_id` NULL or `audience_role` — they are invisible.
- Nobody inserts directly (the INSERT policy was dropped). Use the SECURITY DEFINER functions:
  - `notify(org, user_ids[], title, body, severity, module, link, entity_type, entity_id, rule)` — events (rule NULL) skip the person who caused them; rule alerts dedupe per person/rule/record until dismissed.
  - `notify_recipients(org, roles[])` — members with those roles plus owners and admins (`org_owner`, `org_admin`, and `platform_owner` — the platform owner's role in their own Platform workspace, 0033 / DB-13).
  - `notify_org(org, title, …)` — everyone in the company; callable by owner/admin/manager/staff and server code. App code calls it through `src/lib/notify-org.ts` (forms, workflow "notify" steps, agent invoice reminders).
- Alert rules (`automation_rules`, four per company, seeded on org insert): invoice_overdue, low_stock (tracked, non-archived products that are out of stock or at/below threshold — same as the dashboard tile), deal_stale, task_overdue. `run_automation_rule(id)` runs one ("Run now" in Settings › Automations); pg_cron `automation-rules-daily` runs `run_all_automation_rules()` at 06:00 UTC.
- Event triggers: task assigned, task comment, payment received, leave requested/decided, AI agent action pending approval, new support ticket / customer reply (links to /app/support/<id>, 0031), member joined.
- The bell (`src/components/app/notifications-bell.tsx`) and /app/notifications open `link` when clicked.
- Self-check on a test DB: `psql -f scripts/selftest-notifications.sql`.

## v2 (0037 / DB-17, v1.4.0)
- `notification_events.kind` (e.g. `ai.approval`, `security.app_connected`, `billing.payment_failed`) drives the icon, the person's settings and email. The catalogue with labels, groups and icons is `src/lib/notifications/kinds.ts`; keep it in step with `notification_email_default()` / `notification_locked()` in SQL.
- A BEFORE INSERT trigger (`trg_notification_defaults`) fills `kind`, turns list links into deep links (`?deal=`, `?task=`, `?request=`, `?action=`), drops rows the person muted (`notification_preferences`), and sets `email_due`. Security (`security.*`) and support access (`access.*`) can't be muted.
- `notify()` takes `_kind`, `_include_actor` (true when the person should hear about their own action, e.g. an AI app's request) and `_action` (button label). Server-only events use `notifyUsers()` in `src/lib/notifications/notify.server.ts` (Stripe webhook, update available).
- Pages a notification opens must accept the id: `validateSearch: focusSearch("action")` and `useScrollToFocus()` from `src/lib/use-focus-row.ts`; `DataTable` takes `focusId`.
- Email: rows with `email_due` are claimed with `claim_notification_emails()` and sent by `dispatchNotificationEmails()` (platform SMTP `PLATFORM_SMTP_*`, else the workspace mailbox). Triggered by pg_cron + pg_net (`kick_notification_dispatch`, every 2 min → `/api/public/notifications/dispatch` with the secret from `notification_dispatch_secret()`), by the bell while someone is online, and right after an MCP approval request.
- Daily `run_notification_reminders()`: plans ending (14/7/1 days) and ended, personal keys expiring, approvals waiting more than a day.
- Self-check: `scripts/selftest-notifications-v2.sql`.
