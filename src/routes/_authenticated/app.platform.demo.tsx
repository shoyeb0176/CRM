import { createFileRoute } from "@tanstack/react-router";
import { PlatformShell } from "@/components/platform/platform-shell";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createDemoOrg, deleteOrg } from "@/lib/platform/platform.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { Beaker, Trash2, Plus, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/platform/demo")({
  head: () => ({ meta: [{ title: "Demo orgs — Platform" }] }),
  component: DemoPage,
});

type Mode = "seed_only" | "invite" | "temp_password";
type UserRole = "org_admin" | "manager" | "sales_rep" | "accountant" | "hr_manager" | "inventory_manager" | "staff" | "read_only";

interface DemoUser {
  mode: Mode;
  email?: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
}

function DemoPage() {
  const qc = useQueryClient();
  const createM = useMutation({
    mutationFn: useServerFn(createDemoOrg),
    onSuccess: (r: any) => {
      toast.success(`Demo org created · ${r.credentials?.length ?? 0} users`);
      qc.invalidateQueries({ queryKey: ["demo-orgs"] });
    },
    onError: (e) => toast.error(String(e)),
  });
  const deleteM = useMutation({
    mutationFn: useServerFn(deleteOrg),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["demo-orgs"] }); },
    onError: (e) => toast.error(String(e)),
  });

  const list = useQuery({
    queryKey: ["demo-orgs"],
    queryFn: async () =>
      (await supabase
        .from("demo_orgs")
        .select("*, org:org_id(id, name, slug, created_at)")
        .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const plans = useQuery({
    queryKey: ["plans-min"],
    queryFn: async () => (await supabase.from("subscription_plans").select("id, name").order("price_monthly")).data ?? [],
  });

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [seedDepth, setSeedDepth] = useState<"none" | "basic" | "rich">("rich");
  const [expires, setExpires] = useState<number | "">(14);
  const [planId, setPlanId] = useState("");
  const [users, setUsers] = useState<DemoUser[]>([
    { mode: "temp_password", role: "org_admin" },
    { mode: "seed_only", role: "manager" },
    { mode: "seed_only", role: "sales_rep" },
  ]);

  function updateUser(i: number, patch: Partial<DemoUser>) {
    setUsers((p) => p.map((u, k) => (k === i ? { ...u, ...patch } : u)));
  }

  function submit() {
    if (!name || !slug) { toast.error("Name and slug required"); return; }
    createM.mutate({
      data: {
        name, slug, seedDepth,
        expiresInDays: expires === "" ? null : Number(expires),
        planId: planId || undefined,
        users: users.map((u) => ({
          mode: u.mode,
          email: u.email || undefined,
          firstName: u.firstName || undefined,
          lastName: u.lastName || undefined,
          role: u.role,
        })),
      },
    });
  }

  return (
    <PlatformShell title="Demo orgs" breadcrumb="platform · demo">
      <div className="grid gap-6 lg:grid-cols-[480px_1fr]">
        <div className="border border-border bg-card shadow-sm p-6">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <Beaker className="size-3" /> Provision demo
          </div>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Org name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Demo" className="w-full border border-input bg-card shadow-xs px-2 py-1 text-sm" /></Field>
              <Field label="Slug"><input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="acme-demo" className="w-full border border-input bg-card shadow-xs px-2 py-1 text-sm" /></Field>
            </div>
            <Field label="Seed depth">
              <div className="flex gap-1">
                {(["none", "basic", "rich"] as const).map((m) => (
                  <Button variant="bare" size="bare" key={m} onClick={() => setSeedDepth(m)} className={`flex-1 border px-2 py-1 font-mono text-xs uppercase tracking-wider ${seedDepth === m ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{m}</Button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Expires in (days)"><input type="number" min={1} max={365} value={expires} onChange={(e) => setExpires(e.target.value === "" ? "" : Number(e.target.value))} className="w-full border border-input bg-card shadow-xs px-2 py-1 text-sm" /></Field>
              <Field label="Plan">
                <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="w-full border border-input bg-card shadow-xs px-2 py-1 text-sm">
                  <option value="">Default trial</option>
                  {(plans.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Users ({users.length})</div>
                <Button size="sm" variant="outline" onClick={() => setUsers((p) => [...p, { mode: "seed_only", role: "staff" }])}>
                  <Plus className="mr-1 size-3" /> Add
                </Button>
              </div>
              <div className="space-y-2">
                {users.map((u, i) => (
                  <div key={i} className="border border-border p-2 text-xs bg-card shadow-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <select value={u.mode} onChange={(e) => updateUser(i, { mode: e.target.value as Mode })} className="border border-input bg-card shadow-xs px-1 py-0.5 text-xs">
                        <option value="seed_only">Fake (record only)</option>
                        <option value="temp_password">Temp password</option>
                        <option value="invite">Invite email</option>
                      </select>
                      <select value={u.role} onChange={(e) => updateUser(i, { role: e.target.value as UserRole })} className="border border-input bg-card shadow-xs px-1 py-0.5 text-xs">
                        {["org_admin", "manager", "sales_rep", "accountant", "hr_manager", "inventory_manager", "staff", "read_only"].map(r =>
                          <option key={r} value={r}>{r}</option>)}
                      </select>
                      <Button variant="bare" size="bare" aria-label="Remove user" onClick={() => setUsers((p) => p.filter((_, k) => k !== i))} className="text-muted-foreground hover:text-destructive"><X className="size-3" /></Button>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <input value={u.firstName ?? ""} onChange={(e) => updateUser(i, { firstName: e.target.value })} placeholder="First" className="border border-input bg-card shadow-xs px-1 py-0.5 text-xs" />
                      <input value={u.lastName ?? ""} onChange={(e) => updateUser(i, { lastName: e.target.value })} placeholder="Last" className="border border-input bg-card shadow-xs px-1 py-0.5 text-xs" />
                      <input value={u.email ?? ""} onChange={(e) => updateUser(i, { email: e.target.value })} placeholder={u.mode === "invite" ? "real@email" : "auto"} className="border border-input bg-card shadow-xs px-1 py-0.5 text-xs" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button className="w-full" onClick={submit} disabled={createM.isPending}>
              {createM.isPending ? "Provisioning…" : "Create demo org"}
            </Button>
            {createM.data && (
              <div className="mt-3 border border-border bg-muted/40 p-3 text-xs">
                <div className="mb-1 font-mono text-xs uppercase tracking-widest">Credentials (shown once)</div>
                {(createM.data as any).credentials?.map((u: any) => (
                  <div key={u.email} className="font-mono text-xs">
                    {u.email} · <span className="text-muted-foreground">{u.password ?? u.mode}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto border border-border bg-card shadow-sm [&>*]:min-w-[560px]">
          <div className="grid grid-cols-[minmax(10rem,1fr)_120px_120px_80px] gap-4 border-b border-border bg-muted px-4 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <div>Demo org</div><div>Seed</div><div>Expires</div><div></div>
          </div>
          {list.data?.length === 0 && <div className="p-6 font-mono text-xs text-muted-foreground">No demos yet.</div>}
          {(list.data ?? []).map((d: any) => {
            const exp = d.expires_at ? new Date(d.expires_at) : null;
            const overdue = exp && exp < new Date();
            return (
              <div key={d.org_id} className="grid grid-cols-[minmax(10rem,1fr)_120px_120px_80px] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
                <div>
                  <div className="text-sm font-semibold">{d.org?.name}</div>
                  <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{d.org?.slug}</div>
                </div>
                <div className="font-mono text-xs uppercase tracking-wider">{d.seed_depth}</div>
                <div className={`font-mono text-xs uppercase tracking-wider ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                  {exp ? exp.toLocaleDateString() : "no expiry"}
                </div>
                <div>
                  <Button aria-label="Delete demo workspace" size="sm" variant="outline" onClick={() => {
                    if (confirm(`Delete demo org "${d.org?.name}"?`)) {
                      deleteM.mutate({ data: { orgId: d.org_id, confirmSlug: d.org?.slug } });
                    }
                  }}>
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PlatformShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
