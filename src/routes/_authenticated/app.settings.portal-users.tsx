import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SettingsShell, SettingsField, SettingsInput } from "@/components/settings/settings-shell";
import { useOrgId } from "@/lib/crm/use-org";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/settings/portal-users")({
  head: () => ({ meta: [{ title: "Portal users — Settings" }] }),
  component: PortalUsersPage,
});

function PortalUsersPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyId, setCompanyId] = useState("");

  const companies = useQuery({
    enabled: !!orgId,
    queryKey: ["companies-min", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id,name").eq("org_id", orgId!).eq("archived", false).order("name");
      return data ?? [];
    },
  });

  const users = useQuery({
    enabled: !!orgId,
    queryKey: ["portal-users-admin", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("customer_portal_users")
        .select("id,email,full_name,status,last_login_at,is_primary,company_id,companies:company_id(name)")
        .eq("org_id", orgId!).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("no org");
      if (!email.trim()) throw new Error("Email required");
      if (!companyId) throw new Error("Company required");
      const { error } = await supabase.from("customer_portal_users").insert({
        org_id: orgId,
        email: email.trim().toLowerCase(),
        full_name: fullName.trim() || null,
        company_id: companyId,
        status: "invited",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // No email is sent: share the sign-up link with the customer yourself.
      const link = `${window.location.origin}/portal/auth`;
      navigator.clipboard?.writeText(link).catch(() => {});
      toast.success(`Portal user added. Sign-up link copied: ${link} (send it to them; they sign up with this email).`);
      setEmail(""); setFullName(""); setCompanyId("");
      qc.invalidateQueries({ queryKey: ["portal-users-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "suspended" }) => {
      const { error } = await supabase.from("customer_portal_users").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-users-admin"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customer_portal_users").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["portal-users-admin"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SettingsShell title="Portal users" breadcrumb="settings / portal users">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section className="border border-border p-5 bg-card shadow-sm">
          <h2 className="mb-4 font-heading text-lg uppercase">Add a portal user</h2>
          <div className="space-y-3">
            <SettingsField label="Email">
              <SettingsInput type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="customer@example.com" />
            </SettingsField>
            <SettingsField label="Full name (optional)">
              <SettingsInput value={fullName} onChange={e => setFullName(e.target.value)} />
            </SettingsField>
            <SettingsField label="Customer company">
              <select value={companyId} onChange={e => setCompanyId(e.target.value)}
                className="border border-input bg-card shadow-xs px-3 py-2 text-sm">
                <option value="">Select company…</option>
                {companies.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </SettingsField>
            <Button variant="kitSolid" size="kit" onClick={() => invite.mutate()} disabled={invite.isPending}
              className="px-4 py-2 tracking-wider">
              Add portal user
            </Button>
            <p className="text-xs text-muted-foreground">
              No email is sent. Send the customer the link <span className="font-mono">/portal/auth</span> (copied when you add them); they sign up there with this email and their account links automatically.
            </p>
          </div>
        </section>

        <section className="border border-border">
          <div className="border-b border-border p-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Customers ({users.data?.length ?? 0})
          </div>
          {users.isLoading ? <div className="p-4 text-sm text-muted-foreground">Loading…</div> :
           !users.data?.length ? <div className="p-4 text-sm text-muted-foreground">No portal users yet.</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left font-mono text-xs uppercase text-muted-foreground">
                    <th className="p-3">Email</th>
                    <th className="p-3">Company</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Last login</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data.map(u => (
                    <tr key={u.id} className="border-b border-border/50">
                      <td className="p-3">
                        <div className="font-medium">{u.email}</div>
                        {u.full_name && <div className="text-xs text-muted-foreground">{u.full_name}</div>}
                      </td>
                      <td className="p-3 text-muted-foreground">{(u.companies as { name: string } | null)?.name ?? "—"}</td>
                      <td className="p-3 uppercase text-xs">{u.status}</td>
                      <td className="p-3 text-xs text-muted-foreground">{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "—"}</td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          {u.status === "active" ? (
                            <Button variant="kit" size="kit" onClick={() => setStatus.mutate({ id: u.id, status: "suspended" })}
                              className="px-2 py-1 hover:bg-accent">Suspend</Button>
                          ) : (
                            <Button variant="kit" size="kit" onClick={() => setStatus.mutate({ id: u.id, status: "active" })}
                              className="px-2 py-1 hover:bg-accent">Activate</Button>
                          )}
                          <Button variant="kit" size="kit" onClick={() => { if (confirm("Remove portal user?")) remove.mutate(u.id); }}
                            className="border-destructive/40 px-2 py-1 text-destructive hover:bg-destructive/10">Remove</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </SettingsShell>
  );
}
