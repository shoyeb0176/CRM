// Emails for important notifications (rows with email_due, migration 0037).
// Sender: the platform mailbox (PLATFORM_SMTP_* settings) if set, else the workspace's own mailbox
// (Settings › Email), else nothing is sent and the notice stays in the app only.
import type { SmtpConfig } from "@/lib/email/smtp.server";

type Claimed = {
  id: string; org_id: string; org_name: string; email: string; title: string;
  body: string | null; link: string | null; action_label: string | null; kind: string | null;
};
type Sender = { smtp: SmtpConfig; fromEmail: string; fromName: string | null };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** The platform mailbox, when the install has one. */
export function platformSender(): Sender | null {
  const host = process.env.PLATFORM_SMTP_HOST;
  const user = process.env.PLATFORM_SMTP_USER;
  const pass = process.env.PLATFORM_SMTP_PASS;
  const from = process.env.PLATFORM_SMTP_FROM || user;
  if (!host || !user || !pass || !from) return null;
  const port = Number(process.env.PLATFORM_SMTP_PORT || 587);
  return {
    smtp: { host, port, security: port === 465 ? "ssl" : "starttls", username: user, password: pass },
    fromEmail: from,
    fromName: process.env.PLATFORM_SMTP_FROM_NAME || "Inuberry",
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderNotificationEmail(n: Pick<Claimed, "org_name" | "title" | "body" | "link" | "action_label">, siteUrl: string) {
  const url = new URL(n.link || "/app/inbox?tab=notifications", siteUrl).href;
  const settings = new URL("/app/settings/notifications", siteUrl).href;
  const button = n.action_label || "Open in Inuberry";
  const html = `<!doctype html><html><body style="margin:0;background:#F1F8F1;font-family:Inter,Arial,sans-serif;color:#0C231A">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #D5E3D5">
<tr><td style="padding:20px 24px;border-bottom:1px solid #D5E3D5;font:12px 'JetBrains Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:#4A5D52">Inuberry · ${esc(n.org_name)}</td></tr>
<tr><td style="padding:24px">
<div style="font-size:18px;font-weight:600;line-height:1.35">${esc(n.title)}</div>
${n.body ? `<p style="font-size:14px;line-height:1.55;color:#33463B;margin:10px 0 0">${esc(n.body)}</p>` : ""}
<a href="${esc(url)}" style="display:inline-block;margin-top:20px;background:#EE7104;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px">${esc(button)}</a>
</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #D5E3D5;font-size:12px;color:#4A5D52">You get this email because of your notification settings. <a href="${esc(settings)}" style="color:#0C231A">Change them</a>.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${n.title}\n\n${n.body ? n.body + "\n\n" : ""}${button}: ${url}\n\nChange your notification emails: ${settings}\n`;
  return { subject: n.title, html, text };
}

/**
 * Sends due notification emails (all workspaces, or one). Safe to call often and from several
 * places at once: rows are claimed in the database before sending. A failed send is retried
 * later, three times at most.
 */
export async function dispatchNotificationEmails(siteUrl: string, orgId?: string) {
  const db = await admin();
  const { data, error } = await db.rpc("claim_notification_emails" as never, { _org: orgId ?? null, _limit: 25 } as never);
  if (error) return { sent: 0, failed: 0, error: error.message };
  const rows = (data as unknown as Claimed[] | null) ?? [];
  if (!rows.length) return { sent: 0, failed: 0 };

  const { sendSmtpEmail } = await import("@/lib/email/smtp.server");
  const { loadOrgMailbox } = await import("@/lib/settings/mail.functions");
  const platform = platformSender();
  const orgSenders = new Map<string, Sender | null>();
  let sent = 0, failed = 0;

  for (const n of rows) {
    let sender = platform;
    if (!sender) {
      if (!orgSenders.has(n.org_id)) orgSenders.set(n.org_id, await loadOrgMailbox(n.org_id).catch(() => null));
      sender = orgSenders.get(n.org_id) ?? null;
    }
    if (!sender) continue; // no mailbox anywhere: in-app only (stays marked, not retried)
    try {
      const m = renderNotificationEmail(n, siteUrl);
      await sendSmtpEmail(sender.smtp, { fromEmail: sender.fromEmail, fromName: sender.fromName, to: n.email, ...m });
      sent++;
    } catch (e) {
      failed++;
      console.error("[notification email]", e instanceof Error ? e.message : e);
      await db.from("notification_events").update({ email_sent_at: null }).eq("id", n.id);
    }
  }
  return { sent, failed };
}

/** Where emailed links point: SITE_URL, else the request's own origin. */
export function siteUrlFrom(request?: Request) {
  return (process.env.SITE_URL || (request ? new URL(request.url).origin : "https://crm.inuberry.com")).replace(/\/+$/, "");
}
