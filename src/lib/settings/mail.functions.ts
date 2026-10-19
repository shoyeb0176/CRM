// Company mailbox (SMTP) settings: Settings → Email.
// Owners and admins manage it. The password is encrypted before storage and never returned.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_ROLES = ["org_owner", "org_admin"];

async function assertOrgAdmin(supabase: any, orgId: string) {
  const { data } = await supabase.rpc("has_org_role", { _org: orgId, _roles: ADMIN_ROLES });
  if (data !== true) throw new Error("Only workspace owners and admins can change the mailbox.");
}

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type MailSettingsView = {
  host: string; port: number; security: "ssl" | "starttls"; username: string;
  from_name: string | null; from_email: string; reply_to: string | null;
  verified_at: string | null; last_error: string | null; updated_at: string;
};

/** The org's mailbox as the server will use it, with the password decrypted. Server-side only. */
export async function loadOrgMailbox(orgId: string) {
  const { data } = await (await admin()).from("org_mail_settings").select("*").eq("org_id", orgId).maybeSingle();
  if (!data) return null;
  const { decryptSecret } = await import("@/lib/crypto.server");
  return {
    smtp: { host: data.host, port: data.port, security: data.security, username: data.username, password: await decryptSecret(data.password_enc) },
    fromName: data.from_name as string | null,
    fromEmail: data.from_email as string,
    replyTo: data.reply_to as string | null,
  };
}

async function recordResult(orgId: string, error: string | null) {
  await (await admin()).from("org_mail_settings")
    .update(error ? { last_error: error } : { verified_at: new Date().toISOString(), last_error: null })
    .eq("org_id", orgId);
}

export const getMailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<MailSettingsView | null> => {
    await assertOrgAdmin(context.supabase, data.orgId);
    const { data: row } = await context.supabase.from("org_mail_settings")
      .select("host,port,security,username,from_name,from_email,reply_to,verified_at,last_error,updated_at")
      .eq("org_id", data.orgId).maybeSingle();
    return (row as MailSettingsView | null) ?? null;
  });

const email = z.string().trim().toLowerCase().email().max(254);

export const saveMailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    orgId: z.string().uuid(),
    host: z.string().trim().min(3).max(253).regex(/^[a-z0-9.-]+$/i, "Host must be a server name like smtp.gmail.com"),
    port: z.coerce.number().int().min(1).max(65535),
    security: z.enum(["ssl", "starttls"]),
    username: z.string().trim().min(1).max(320),
    // Empty = keep the saved password.
    password: z.string().max(1000).optional(),
    fromName: z.string().trim().max(120).optional(),
    fromEmail: email,
    replyTo: email.optional().or(z.literal("")),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.orgId);
    const db = await admin();
    const { data: existing } = await db.from("org_mail_settings").select("password_enc").eq("org_id", data.orgId).maybeSingle();
    if (!existing && !data.password) throw new Error("Enter the mailbox password.");

    const { encryptSecret } = await import("@/lib/crypto.server");
    const row = {
      org_id: data.orgId,
      host: data.host.toLowerCase(),
      port: data.port,
      security: data.security,
      username: data.username,
      password_enc: data.password ? await encryptSecret(data.password) : existing!.password_enc,
      from_name: data.fromName || null,
      from_email: data.fromEmail,
      reply_to: data.replyTo || null,
      verified_at: null,
      last_error: null,
      updated_by: context.userId,
    };
    const { error } = await db.from("org_mail_settings").upsert(row, { onConflict: "org_id" });
    if (error) throw new Error(error.message);
    await db.from("audit_logs").insert({
      org_id: data.orgId, user_id: context.userId, action: "mail_settings.saved",
      entity_type: "org_mail_settings", entity_id: data.orgId, diff: { host: row.host, port: row.port, from_email: row.from_email },
    });
    return { ok: true as const };
  });

export const deleteMailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.orgId);
    const db = await admin();
    await db.from("org_mail_settings").delete().eq("org_id", data.orgId);
    await db.from("audit_logs").insert({
      org_id: data.orgId, user_id: context.userId, action: "mail_settings.removed",
      entity_type: "org_mail_settings", entity_id: data.orgId,
    });
    return { ok: true as const };
  });

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ orgId: z.string().uuid(), to: email }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    await assertOrgAdmin(context.supabase, data.orgId);
    const box = await loadOrgMailbox(data.orgId);
    if (!box) return { error: "Save the mailbox settings first." };
    const { sendSmtpEmail, smtpErrorMessage } = await import("@/lib/email/smtp.server");
    try {
      await sendSmtpEmail(box.smtp, {
        fromName: box.fromName, fromEmail: box.fromEmail, to: data.to, replyTo: box.replyTo,
        subject: "Inuberry test email",
        text: "Your mailbox is connected. Quotes and invoices emailed from Inuberry will be sent from this address.",
        html: "<p>Your mailbox is connected.</p><p>Quotes and invoices emailed from Inuberry will be sent from this address.</p>",
      });
      await recordResult(data.orgId, null);
      return { ok: true };
    } catch (e) {
      console.error("[sendTestEmail]", e);
      const msg = smtpErrorMessage(e);
      await recordResult(data.orgId, msg);
      return { error: msg };
    }
  });
