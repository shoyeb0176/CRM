import { createFileRoute } from "@tanstack/react-router";
import { SettingsShell } from "@/components/settings/settings-shell";
import { ConfirmDelete } from "@/components/crm/confirm-delete";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAdminContext, ROLE_LABELS, logAudit } from "@/lib/settings/use-admin";
import { toast } from "sonner";
import { useState } from "react";
import { Mail, Trash2, UserPlus, Send, AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useOrgSubscription } from "@/lib/billing/use-subscription";
import { syncSubscriptionSeats } from "@/lib/billing/billing.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { inviteMember, listInviteEmails, resendInvite } from "@/lib/settings/members.functions";
import { Button } from "@/components/ui/button";

type Role = Database["public"]["Enums"]["app_role"];

const ASSIGNABLE_ROLES: Role[] = [
  "org_admin", "manager", "sales_rep", "accountant",
  "inventory_manager", "hr_manager", "staff", "read_only",
];

export const Route = createFileRoute("/_authenticated/app/settings/members")({
  head: () => ({ meta: [{ title: "Members — Settings" }] }),
  component: MembersPage,
});

function MembersPage() {
  const { orgId, membership, isAdmin } = useAdminContext();
  const myUserId = membership?.user_id;
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const sub = useOrgSubscription();

  const members = useQuery({
    queryKey: ["members", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("memberships")
        .select("id, user_id, role, status, created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ids = (rows ?? []).map((r) => r.user_id);
      const { data: profiles, error: pErr } = ids.length
        ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
        : { data: [], error: null };
      if (pErr) throw pErr;
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      const inviteEmails = (rows ?? []).some((r) => r.status === "invited" && !byId.get(r.user_id)?.email)
        ? await listInviteEmails({ data: { orgId: orgId! } }).catch(() => ({} as Record<string, string>))
        : {};
      return (rows ?? []).map((r) => ({
        ...r,
        full_name: byId.get(r.user_id)?.full_name ?? null,
        email: byId.get(r.user_id)?.email ?? inviteEmails[r.user_id] ?? null,
      }));
    },
  });

  const activeCount = members.data?.filter((m) => m.status === "active").length ?? 0;
  const seatLimit = sub.data?.plan?.user_limit ?? null;
  const seatsFull = seatLimit !== null && activeCount >= seatLimit;

  async function syncSeats() {
    if (!orgId) return;
    try {
      await syncSubscriptionSeats({ data: { orgId, environment: getStripeEnvironment() } });
    } catch {
      /* seat sync is best-effort; billing page shows the truth */
    }
  }

  async function changeRole(id: string, oldRole: Role, newRole: Role) {
    const { error } = await supabase.from("memberships").update({ role: newRole }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Role updated");
    logAudit({ orgId: orgId!, action: "membership.role.update", entityType: "membership", entityId: id, oldValues: { role: oldRole }, newValues: { role: newRole } });
    qc.invalidateQueries({ queryKey: ["members"] });
  }

  async function changeStatus(id: string, status: "active" | "suspended") {
    if (status === "active" && seatsFull) {
      toast.error(`Your plan allows ${seatLimit} active members. Upgrade in Billing to add more.`);
      return;
    }
    const { error } = await supabase.from("memberships").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Member ${status}`);
    logAudit({ orgId: orgId!, action: "membership.status.update", entityType: "membership", entityId: id, newValues: { status } });
    qc.invalidateQueries({ queryKey: ["members"] });
    qc.invalidateQueries({ queryKey: ["usage-limits"] });
    await syncSeats();
  }

  async function removeMember(id: string) {
    const { error } = await supabase.from("memberships").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Member removed");
    logAudit({ orgId: orgId!, action: "membership.delete", entityType: "membership", entityId: id });
    qc.invalidateQueries({ queryKey: ["members"] });
    qc.invalidateQueries({ queryKey: ["usage-limits"] });
    await syncSeats();
  }

  return (
    <SettingsShell title="Members" breadcrumb="settings · members">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Access control</div>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Invite teammates, assign their role and manage status inside{" "}
            <span className="font-semibold text-foreground">{membership?.organizations.name}</span>.
          </p>
        </div>
        {isAdmin && (
          <Button variant="kitSolid" size="kit"
            onClick={() => {
              if (seatsFull) {
                toast.error(`Your plan allows ${seatLimit} active members. Upgrade in Billing to add more.`);
                return;
              }
              setInviteOpen(true);
            }}
            className="bg-primary px-4 py-2 text-primary-foreground hover:opacity-90"
          >
            <UserPlus className="size-3.5" /> Invite member
          </Button>
        )}
      </div>

      {seatsFull && (
        <div className="mb-4 flex flex-wrap items-center gap-3 border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 text-destructive" />
          <span>
            You are using all {activeCount} of {seatLimit} seats on the {sub.data?.plan?.name ?? "current"} plan.
          </span>
          <Link to="/app/settings/billing" className="font-mono text-xs uppercase tracking-widest text-primary hover:underline">
            View billing
          </Link>
        </div>
      )}


      <div className="overflow-x-auto border border-border bg-card shadow-sm [&>*]:min-w-[816px]">
        <div className="grid grid-cols-[minmax(10rem,1fr)_220px_140px_140px_60px] items-center gap-4 border-b border-border bg-muted px-4 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <div>Member</div><div>Role</div><div>Status</div><div>Joined</div><div></div>
        </div>
        {members.isLoading && <div className="p-6 font-mono text-xs text-muted-foreground">Loading…</div>}
        {members.isError && (
          <div className="p-6 text-sm text-destructive">
            Could not load members: {members.error instanceof Error ? members.error.message : "unknown error"}.{" "}
            <Button variant="bare" size="bare" onClick={() => members.refetch()} className="underline">Try again</Button>
          </div>
        )}
        {!members.isError && members.data?.length === 0 && <div className="p-6 font-mono text-xs text-muted-foreground">No members yet.</div>}
        {members.data?.map((m) => {
          const isSelf = m.user_id === myUserId;
          const name = m.full_name ?? m.email ?? "Unnamed member";
          const canEdit = isAdmin && !isSelf && m.role !== "org_owner" && m.role !== "platform_owner";
          return (
            <div key={m.id} className="grid grid-cols-[minmax(10rem,1fr)_220px_140px_140px_60px] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {name}
                  {isSelf && <span className="ml-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">you</span>}
                </div>
                {m.email && m.full_name && <div className="truncate font-mono text-xs text-muted-foreground">{m.email}</div>}
              </div>
              <div>
                {canEdit ? (
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.id, m.role as Role, e.target.value as Role)}
                    className="border border-input bg-card shadow-xs px-2 py-1 font-mono text-xs uppercase tracking-wider focus:border-foreground focus:outline-none"
                  >
                    {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                ) : (
                  <span className="font-mono text-xs uppercase tracking-wider">{ROLE_LABELS[m.role] ?? m.role}</span>
                )}
              </div>
              <div>
                {canEdit && m.status !== "invited" ? (
                  <select
                    value={m.status === "active" ? "active" : "suspended"}
                    onChange={(e) => changeStatus(m.id, e.target.value as "active" | "suspended")}
                    className="border border-input bg-card shadow-xs px-2 py-1 font-mono text-xs uppercase tracking-wider focus:border-foreground focus:outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                ) : (
                  <span className="border border-border bg-background px-2 py-0.5 font-mono text-xs uppercase tracking-wider">{m.status}</span>
                )}
              </div>
              <div className="font-mono text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</div>
              <div className="flex items-center justify-end gap-2">
                {m.status === "invited" && (
                  <Button variant="bare" size="bare" title="Resend invitation" onClick={async () => {
                    const r = await resendInvite({ data: { membershipId: m.id, origin: window.location.origin } }).catch((e: Error) => ({ error: e.message }));
                    if ("error" in r) toast.error(r.error); else toast.success(r.message);
                  }} className="text-muted-foreground hover:text-foreground">
                    <Send className="size-3.5" />
                  </Button>
                )}
                {canEdit && (
                  <ConfirmDelete
                    title={m.status === "invited" ? `Revoke the invitation for ${name}?` : `Remove ${name} from this organization?`}
                    description={m.status === "invited" ? "They won't get access to this workspace, even if they use the link." : "They lose access to this workspace immediately."}
                    confirmLabel={m.status === "invited" ? "Revoke" : "Remove"}
                    trigger={<Button variant="bare" size="bare" title={m.status === "invited" ? "Revoke invitation" : "Remove"} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></Button>}
                    onConfirm={() => removeMember(m.id)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {inviteOpen && orgId && <InviteDrawer orgId={orgId} onClose={() => setInviteOpen(false)} onInvited={() => {
        qc.invalidateQueries({ queryKey: ["members"] });
        logAudit({ orgId, action: "membership.invite", entityType: "membership", entityId: orgId });
      }} />}
    </SettingsShell>
  );
}

function InviteDrawer({ orgId, onClose, onInvited }: { orgId: string; onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error("Enter a valid email address");
    setSending(true);
    const r = await inviteMember({ data: { orgId, email: email.trim(), role: role, origin: window.location.origin } })
      .catch((e: Error) => ({ error: e.message }));
    setSending(false);
    if ("error" in r) return toast.error(r.error);
    toast.success(r.message);
    onInvited();
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-foreground/40 p-4 md:items-center md:justify-center" onClick={onClose}>
      <div className="w-full max-w-md border border-border bg-card shadow-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-2">
          <Mail className="size-4" />
          <div className="font-semibold uppercase tracking-tight">Invite member</div>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          We'll email them a link to join. They appear here as invited until they accept.
        </p>
        <label className="mb-3 block">
          <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-muted-foreground">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" className="w-full border border-input bg-card shadow-xs px-3 py-2 text-sm focus:border-foreground focus:outline-none" />
        </label>
        <label className="mb-5 block">
          <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-muted-foreground">Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="w-full border border-input bg-card shadow-xs px-3 py-2 font-mono text-xs uppercase tracking-wider focus:border-foreground focus:outline-none">
            {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="kit" size="kit" onClick={onClose} className="px-4 py-2 hover:bg-muted">Cancel</Button>
          <Button variant="kitSolid" size="kit" onClick={send} disabled={sending} className="bg-primary px-4 py-2 text-primary-foreground hover:opacity-90">{sending ? "Sending…" : "Send invite"}</Button>
        </div>
      </div>
    </div>
  );
}
