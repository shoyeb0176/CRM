// Notification types (notification_events.kind, migration 0037). The bell, the notifications page
// and Settings › Notifications all read this list. Email defaults mirror
// public.notification_email_default(); "locked" kinds can't be turned off (security, support access).
import {
  AlarmClock, AlertTriangle, BadgeCheck, Bell, Bot, Briefcase, CalendarDays, CheckCircle2, CreditCard, FileText,
  KeyRound, LifeBuoy, Link2, Link2Off, type LucideIcon, Package, PartyPopper, Receipt, ShieldAlert, Sparkles,
  TrendingUp, UserCog, UserPlus, Users, Download, Bug,
} from "lucide-react";

export type NotificationGroup = "approvals" | "money" | "sales" | "work" | "team" | "security" | "system";

export const GROUP_LABELS: Record<NotificationGroup, string> = {
  approvals: "AI approvals",
  money: "Money & billing",
  sales: "Sales & customers",
  work: "Tasks, stock & HR",
  team: "Team",
  security: "Security & access",
  system: "System",
};

type KindInfo = { label: string; group: NotificationGroup; icon: LucideIcon; email: boolean; locked?: boolean };

export const KINDS: Record<string, KindInfo> = {
  "ai.approval": { label: "An AI app asks for approval", group: "approvals", icon: Sparkles, email: true },
  "ai.approval_reminder": { label: "Approval still waiting after a day", group: "approvals", icon: AlarmClock, email: true },
  "ai.approval_result": { label: "Your AI request was approved, rejected or failed", group: "approvals", icon: BadgeCheck, email: false },
  "ai.agent_action": { label: "An AI agent asks for approval", group: "approvals", icon: Bot, email: false },
  "agents.message": { label: "A message from an AI agent", group: "work", icon: Bot, email: false },
  "agents.run_failed": { label: "An AI agent run failed", group: "approvals", icon: AlertTriangle, email: true },

  "invoices.invoice": { label: "Payment received", group: "money", icon: Receipt, email: false },
  "invoices.paid": { label: "Invoice paid in full", group: "money", icon: CheckCircle2, email: false },
  "alert.invoice_overdue": { label: "Invoice overdue", group: "money", icon: Receipt, email: false },
  "billing.payment": { label: "Plan payment received", group: "money", icon: CreditCard, email: false },
  "billing.payment_failed": { label: "Plan payment failed", group: "money", icon: CreditCard, email: true },
  "billing.plan_ending": { label: "Plan ending soon", group: "money", icon: CalendarDays, email: true },
  "billing.plan_ended": { label: "Plan ended (read-only)", group: "money", icon: CalendarDays, email: true },
  "billing.ai_usage_high": { label: "Most of this month's AI actions are used", group: "money", icon: Sparkles, email: false },

  "sales.quote_response": { label: "A customer answered a quote", group: "sales", icon: FileText, email: false },
  "alert.deal_stale": { label: "Deal needs follow-up", group: "sales", icon: TrendingUp, email: false },
  "crm.lead": { label: "New lead from the website", group: "sales", icon: UserPlus, email: false },
  "forms.form": { label: "New form submission", group: "sales", icon: FileText, email: false },
  "support.support_ticket": { label: "Support tickets and replies", group: "sales", icon: LifeBuoy, email: false },
  "portal.joined": { label: "A customer signed in to the portal", group: "sales", icon: Users, email: false },

  "projects.task": { label: "Tasks assigned to you and comments", group: "work", icon: Briefcase, email: false },
  "alert.task_overdue": { label: "Task overdue", group: "work", icon: AlarmClock, email: false },
  "alert.low_stock": { label: "Low or out of stock", group: "work", icon: Package, email: false },
  "hr.leave_request": { label: "Leave requests and decisions", group: "work", icon: CalendarDays, email: false },

  "settings.membership": { label: "Someone joined the workspace", group: "team", icon: UserPlus, email: false },
  "team.role": { label: "Your role changed", group: "team", icon: UserCog, email: false },

  "security.app_connected": { label: "An AI app connected", group: "security", icon: Link2, email: true, locked: true },
  "security.app_disconnected": { label: "An AI app was disconnected", group: "security", icon: Link2Off, email: true, locked: true },
  "security.key": { label: "Developer and API keys created or revoked", group: "security", icon: KeyRound, email: true, locked: true },
  "security.key_expiring": { label: "Developer key expiring", group: "security", icon: KeyRound, email: true, locked: true },
  "access.request": { label: "Inuberry support asks for access", group: "security", icon: ShieldAlert, email: true, locked: true },
  "access.decision": { label: "Support access approved or denied", group: "security", icon: ShieldAlert, email: true, locked: true },
  "access.ended": { label: "Support access ended", group: "security", icon: ShieldAlert, email: true, locked: true },

  "system.welcome": { label: "Welcome and getting started", group: "system", icon: PartyPopper, email: false },
  "system.update": { label: "A new Inuberry version is available", group: "system", icon: Download, email: true },
  "platform.ticket_new": { label: "A new problem report (reviewers)", group: "system", icon: Bug, email: true },
  "platform.ticket_reply": { label: "A reporter replied on a report (reviewers)", group: "system", icon: Bug, email: true },
  "platform.ticket_update": { label: "An answer or update on your report", group: "system", icon: Bug, email: true },
};

export function kindInfo(kind: string | null | undefined): KindInfo {
  return (kind && KINDS[kind]) || { label: kind ?? "Notification", group: "system", icon: Bell, email: false };
}

/** Kinds that pop up as a toast when they arrive. */
export const URGENT_KINDS = new Set(["ai.approval", "billing.payment_failed", "billing.plan_ended", "access.request", "agents.run_failed"]);

/** "/app/ai/approvals?action=1#x" → router target. */
export function linkTarget(link: string) {
  const u = new URL(link, "http://x");
  const search = Object.fromEntries(u.searchParams.entries());
  return { to: u.pathname, search: Object.keys(search).length ? search : undefined, hash: u.hash ? u.hash.slice(1) : undefined };
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "12 Oct". */
export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return "yesterday";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
