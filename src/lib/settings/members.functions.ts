// Member invitations. The invited membership row (status "invited") is the pending
// invite; the email goes out through Supabase Auth and the auth-email webhook
// (src/routes/lovable/email/auth/webhook.ts, invite / magiclink templates).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = ["org_admin", "manager", "sales_rep", "accountant", "inventory_manager", "hr_manager", "staff", "read_only"] as const;

type Result = { ok: true; message: string } | { error: string };

async function assertAdmin(supabase: { rpc: (n: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown }> }, orgId: string) {
  const { data } = await supabase.rpc("has_org_role", { _org: orgId, _roles: ["org_owner", "org_admin"] });
  return data === true;
}

/** True when one more active member fits the plan (a custom offering's limit wins; none = unlimited). */
async function hasFreeSeat(orgId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: offering }, { count }] = await Promise.all([
    supabaseAdmin.rpc("resolve_org_offering", { _org: orgId }),
    supabaseAdmin.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "active"),
  ]);
  const limit = (offering as Array<{ user_limit: number | null }> | null)?.[0]?.user_limit ?? null;
  return limit == null || (count ?? 0) < limit;
}

/** Sends the auth email: an invite (creates the account) or a login link for existing users. */
async function sendInviteEmail(email: string, redirectTo: string, existing: boolean): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (existing) {
    const { error } = await supabaseAdmin.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
    return error?.message ?? null;
  }
  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo });
  return error?.message ?? null;
}

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    orgId: z.string().uuid(),
    email: z.string().trim().toLowerCase().email().max(254),
    role: z.enum(ROLES),
    origin: z.string().url(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<Result> => {
    if (!(await assertAdmin(context.supabase as never, data.orgId))) return { error: "Only owners and admins can invite members." };
    if (!(await hasFreeSeat(data.orgId))) return { error: "Your plan has no free seats. Upgrade in Billing to invite more members." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin.from("profiles").select("id").ilike("email", data.email.replace(/[%_\\]/g, "\\$&")).maybeSingle();

    let userId = profile?.id as string | undefined;
    const redirectTo = `${data.origin}/reset-password`;
    if (userId) {
      const { data: existing } = await supabaseAdmin.from("memberships").select("status").eq("org_id", data.orgId).eq("user_id", userId).maybeSingle();
      if (existing) return { error: existing.status === "invited" ? "This person is already invited. Use Resend instead." : "This person is already a member." };
    } else {
      const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, { redirectTo });
      if (error || !invited?.user) return { error: error?.message ?? "Couldn't send the invitation." };
      userId = invited.user.id;
    }

    const { error: mErr } = await supabaseAdmin.from("memberships").insert({
      org_id: data.orgId, user_id: userId, role: data.role, status: "invited", invited_by: context.userId,
    });
    if (mErr) return { error: mErr.message };

    if (profile?.id) {
      const err = await sendInviteEmail(data.email, `${data.origin}/app`, true);
      if (err) return { ok: true, message: `Invited. They already have an account and will get access when they next sign in (email not sent: ${err}).` };
      return { ok: true, message: "Invited. They already have an account; we emailed them a sign-in link." };
    }
    return { ok: true, message: `Invitation sent to ${data.email}.` };
  });

export const resendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ membershipId: z.string().uuid(), origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }): Promise<Result> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await supabaseAdmin.from("memberships").select("org_id,user_id,status").eq("id", data.membershipId).maybeSingle();
    if (!m || m.status !== "invited") return { error: "This invitation no longer exists." };
    if (!(await assertAdmin(context.supabase as never, m.org_id))) return { error: "Only owners and admins can resend invitations." };
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
    const email = u?.user?.email;
    if (!email) return { error: "No email address on this invitation." };
    const confirmed = !!u.user?.email_confirmed_at || !!u.user?.last_sign_in_at;
    const err = await sendInviteEmail(email, confirmed ? `${data.origin}/app` : `${data.origin}/reset-password`, confirmed);
    return err ? { error: err } : { ok: true, message: `Invitation re-sent to ${email}.` };
  });

/** Emails of pending invitees (their profiles aren't readable by the org until they join). */
export const listInviteEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<Record<string, string>> => {
    if (!(await assertAdmin(context.supabase as never, data.orgId))) return {};
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("memberships").select("user_id").eq("org_id", data.orgId).eq("status", "invited");
    const ids = (rows ?? []).map((r) => r.user_id);
    if (!ids.length) return {};
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id,email").in("id", ids);
    return Object.fromEntries((profiles ?? []).filter((p) => p.email).map((p) => [p.id, p.email as string]));
  });

/** Activates the caller's pending invitations (called after sign-in). */
export const acceptPendingInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ accepted: string[]; full: string[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pending } = await supabaseAdmin.from("memberships").select("id,org_id").eq("user_id", context.userId).eq("status", "invited");
    const accepted: string[] = [];
    const full: string[] = [];
    for (const m of pending ?? []) {
      if (!(await hasFreeSeat(m.org_id))) { full.push(m.org_id); continue; }
      const { error } = await supabaseAdmin.from("memberships").update({ status: "active" }).eq("id", m.id).eq("status", "invited");
      if (!error) accepted.push(m.org_id);
    }
    return { accepted, full };
  });
