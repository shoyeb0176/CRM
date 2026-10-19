import { createFileRoute, Link } from "@tanstack/react-router";
import { Stat } from "@/components/ui/kpi-tile";
import { PlatformShell } from "@/components/platform/platform-shell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getOrgDetail, suspendOrg, reactivateOrg, deleteOrg,
  requestImpersonation, changeOrgPlan, detachCustomOffering,
} from "@/lib/platform/platform.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, PauseOctagon, Play, Trash2, Eye, Beaker } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/platform/organizations/$orgId")({
  head: () => ({ meta: [{ title: "Organization — Platform" }] }),
  component: OrgDetailPage,
});

function OrgDetailPage() {
  const { orgId } = Route.useParams();
  const qc = useQueryClient();
  const detailFn = useServerFn(getOrgDetail);
  const detail = useQuery({ queryKey: ["platform-org", orgId], queryFn: () => detailFn({ data: { orgId } }) });
  const plans = useQuery({
    queryKey: ["platform-plan-choices"],
    // Pricing-page plans first, then prepaid packages; old per-seat plans aren't offered.
    queryFn: async () => ((await supabase.from("subscription_plans").select("id, name, code, price_monthly, plan_kind, sort_order")
      .neq("plan_kind", "legacy").order("sort_order")).data ?? []) as { id: string; name: string; code: string; plan_kind: string }[],
  });

  const suspendM = useMutation({
    mutationFn: useServerFn(suspendOrg),
    onSuccess: () => { toast.success("Organization suspended"); qc.invalidateQueries({ queryKey: ["platform-org", orgId] }); },
    onError: (e) => toast.error(String(e)),
  });
  const reactivateM = useMutation({
    mutationFn: useServerFn(reactivateOrg),
    onSuccess: () => { toast.success("Reactivated"); qc.invalidateQueries({ queryKey: ["platform-org", orgId] }); },
    onError: (e) => toast.error(String(e)),
  });
  const deleteM = useMutation({
    mutationFn: useServerFn(deleteOrg),
    onSuccess: () => { toast.success("Deleted"); window.location.href = "/app/platform/organizations"; },
    onError: (e) => toast.error(String(e)),
  });
  const impM = useMutation({
    mutationFn: useServerFn(requestImpersonation),
    onSuccess: () => toast.success("Impersonation requested — org admin must approve"),
    onError: (e) => toast.error(String(e)),
  });
  const planM = useMutation({
    mutationFn: useServerFn(changeOrgPlan),
    onSuccess: () => { toast.success("Plan updated"); qc.invalidateQueries({ queryKey: ["platform-org", orgId] }); },
    onError: (e) => toast.error(String(e)),
  });
  const detachM = useMutation({
    mutationFn: useServerFn(detachCustomOffering),
    onSuccess: () => { toast.success("Custom offering detached"); qc.invalidateQueries({ queryKey: ["platform-org", orgId] }); },
    onError: (e) => toast.error(String(e)),
  });

  const [reason, setReason] = useState("");
  const [impReason, setImpReason] = useState("");
  const [impMinutes, setImpMinutes] = useState(60);
  const [confirmSlug, setConfirmSlug] = useState("");

  const d = detail.data as any;
  const org = d?.org;
  const sub = d?.subscription;
  const stats = d?.stats ?? {};

  return (
    <PlatformShell title={org?.name ?? "Organization"} breadcrumb="platform · org">
      <Link to="/app/platform/organizations" className="mb-4 inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Organizations
      </Link>

      {detail.isLoading && <div className="font-mono text-xs text-muted-foreground">Loading…</div>}

      {org && (
        <div className="space-y-6">
          {/* Header */}
          <div className="border border-border bg-card shadow-sm p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl uppercase tracking-tight">{org.name}</h1>
                <div className="mt-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  {org.slug} · {org.default_currency} · created {new Date(org.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {d.demo && (
                  <span className="inline-flex items-center gap-1 border border-border px-2 py-1 font-mono text-xs uppercase tracking-wider">
                    <Beaker className="size-3" /> demo
                  </span>
                )}
                {d.isSuspended ? (
                  <span className="border border-destructive px-2 py-1 font-mono text-xs uppercase tracking-wider text-destructive">Suspended</span>
                ) : (
                  <span className="border border-border px-2 py-1 font-mono text-xs uppercase tracking-wider">{org.status}</span>
                )}
              </div>
            </div>
          </div>

          {/* Metadata stats */}
          <div>
            <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Metadata only — record contents are not shown. Request impersonation to view records.
            </div>
            <div className="grid grid-cols-2 gap-px border border-border bg-border md:grid-cols-4">
              <Stat inGrid label="Active users" value={stats.members_active ?? "—"} />
              <Stat inGrid label="Employees" value={stats.employees ?? "—"} />
              <Stat inGrid label="Companies" value={stats.companies ?? "—"} />
              <Stat inGrid label="Contacts" value={stats.contacts ?? "—"} />
              <Stat inGrid label="Deals" value={stats.deals ?? "—"} />
              <Stat inGrid label="Invoices" value={stats.invoices ?? "—"} />
              <Stat inGrid label="Products" value={stats.products ?? "—"} />
              <Stat inGrid label="Agents / runs 30d" value={`${stats.agents ?? 0} / ${stats.agent_runs_30d ?? 0}`} />
            </div>
          </div>

          {/* Subscription */}
          <div className="border border-border bg-card shadow-sm p-6">
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Subscription</div>
            {sub ? (
              <div className="mt-2 space-y-3">
                <div className="text-sm">
                  Plan <b>{sub.plan?.name ?? "—"}</b> · cycle <b>{sub.billing_cycle}</b> · status <b>{sub.status}</b>
                  {sub.trial_ends_at && <> · trial ends {new Date(sub.trial_ends_at).toLocaleDateString()}</>}
                  {sub.current_period_end && <> · ends {new Date(sub.current_period_end).toLocaleDateString()}</>}
                </div>
                {sub.offering && (
                  <div className="border border-border bg-muted/40 p-3 text-xs">
                    Custom offering <b>{sub.offering.name}</b> attached.
                    <Button size="sm" variant="outline" className="ml-2 h-6 text-xs"
                      onClick={() => detachM.mutate({ data: { orgId, offeringId: sub.offering.id } })}>
                      Detach
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap items-end gap-2">
                  <label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Change plan
                    <select id="plan-select" key={`${sub.plan_id}-${plans.data?.length ?? 0}`} defaultValue={sub.plan_id} className="mt-1 block border border-input bg-card shadow-xs px-2 py-1 text-sm">
                      {(plans.data ?? []).map((p) => (<option key={p.id} value={p.id}>{p.name}{p.plan_kind === "tier" ? "" : " (prepaid)"}</option>))}
                    </select>
                  </label>
                  <select id="cycle-select" defaultValue="yearly" className="border border-input bg-card shadow-xs px-2 py-1 text-sm">
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                  <label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Ends on (empty = month to month, or the package's term)
                    <input id="period-end" type="date" className="mt-1 block border border-input bg-card shadow-xs px-2 py-1 text-sm" />
                  </label>
                  <Button
                    size="sm"
                    onClick={() => {
                      const planId = (document.getElementById("plan-select") as HTMLSelectElement)?.value;
                      const cycle = (document.getElementById("cycle-select") as HTMLSelectElement)?.value as "monthly" | "yearly";
                      const end = (document.getElementById("period-end") as HTMLInputElement)?.value;
                      if (planId) planM.mutate({ data: { orgId, planId, billingCycle: cycle, periodEnd: end ? new Date(`${end}T23:59:59`).toISOString() : undefined } });
                    }}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-muted-foreground">No subscription attached.</div>
            )}
          </div>

          {/* Support impersonation */}
          <div className="border border-border bg-card shadow-sm p-6">
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Request support access</div>
            <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
              An admin at this organization must approve. Every action you take during the session is logged and visible to their admins.
            </p>
            <div className="mt-3 space-y-2">
              <textarea
                value={impReason}
                onChange={(e) => setImpReason(e.target.value)}
                placeholder="Reason (visible to the customer)"
                rows={2}
                className="w-full border border-input bg-card shadow-xs p-2 text-sm"
              />
              <div className="flex items-center gap-2">
                <label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Duration (min)
                  <input type="number" min={15} max={240} value={impMinutes} onChange={(e) => setImpMinutes(Number(e.target.value))} className="ml-2 w-20 border border-input bg-card shadow-xs px-2 py-1 text-sm" />
                </label>
                <Button
                  size="sm"
                  disabled={impM.isPending || impReason.trim().length < 10}
                  onClick={() => impM.mutate({ data: { orgId, reason: impReason, durationMinutes: impMinutes } })}
                >
                  <Eye className="mr-1 size-3" /> Request access
                </Button>
              </div>
            </div>
          </div>

          {/* Suspend / reactivate */}
          <div className="border border-border bg-card shadow-sm p-6">
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Access</div>
            {d.isSuspended ? (
              <div className="mt-3">
                <Button size="sm" onClick={() => reactivateM.mutate({ data: { orgId } })}>
                  <Play className="mr-1 size-3" /> Reactivate
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2">
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="flex-1 border border-input bg-card shadow-xs px-2 py-1 text-sm" />
                <Button size="sm" variant="destructive" disabled={reason.trim().length < 3} onClick={() => suspendM.mutate({ data: { orgId, reason } })}>
                  <PauseOctagon className="mr-1 size-3" /> Suspend
                </Button>
              </div>
            )}
          </div>

          {/* Danger zone */}
          <div className="border border-destructive/60 bg-background p-6">
            <div className="font-mono text-xs uppercase tracking-widest text-destructive">Danger zone</div>
            <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
              Deletion is permanent and cascades all tenant data. Type the slug <b className="font-mono">{org.slug}</b> to confirm.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} placeholder={org.slug} className="flex-1 border border-input bg-card shadow-xs px-2 py-1 text-sm" />
              <Button
                size="sm"
                variant="destructive"
                disabled={confirmSlug !== org.slug || deleteM.isPending}
                onClick={() => deleteM.mutate({ data: { orgId, confirmSlug } })}
              >
                <Trash2 className="mr-1 size-3" /> Delete forever
              </Button>
            </div>
          </div>
        </div>
      )}
    </PlatformShell>
  );
}

