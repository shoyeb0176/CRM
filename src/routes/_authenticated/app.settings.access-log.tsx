import { createFileRoute } from "@tanstack/react-router";
import { SettingsShell } from "@/components/settings/settings-shell";
import { useAdminContext } from "@/lib/settings/use-admin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { respondImpersonation, endImpersonation } from "@/lib/platform/platform.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

import { SectionTitle } from "@/components/ui/section-title";
export const Route = createFileRoute("/_authenticated/app/settings/access-log")({
  head: () => ({ meta: [{ title: "Support access — Settings" }] }),
  component: AccessLogPage,
});

function AccessLogPage() {
  const { orgId, isAdmin: canApprove } = useAdminContext();
  const qc = useQueryClient();

  const requests = useQuery({
    queryKey: ["org-impersonation", orgId],
    enabled: !!orgId,
    queryFn: async () =>
      (await supabase
        .from("impersonation_requests")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(200)
      ).data ?? [],
  });

  const events = useQuery({
    queryKey: ["org-impersonation-events", orgId],
    enabled: !!orgId,
    queryFn: async () =>
      (await supabase
        .from("impersonation_events")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(300)
      ).data ?? [],
  });

  const respondM = useMutation({
    mutationFn: useServerFn(respondImpersonation),
    onSuccess: () => {
      toast.success("Done: the request is updated below.");
      qc.invalidateQueries({ queryKey: ["org-impersonation", orgId] });
      qc.invalidateQueries({ queryKey: ["org-impersonation-events", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const endM = useMutation({
    mutationFn: useServerFn(endImpersonation),
    onSuccess: () => {
      toast.success("Session revoked");
      qc.invalidateQueries({ queryKey: ["org-impersonation", orgId] });
      qc.invalidateQueries({ queryKey: ["org-impersonation-events", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SettingsShell title="Support access" breadcrumb="settings · support access">
      <div className="mb-6 flex items-start gap-3 border border-border bg-card shadow-sm p-4">
        <ShieldCheck className="mt-0.5 size-4 text-primary" />
        <div>
          <div className="font-semibold">Your data is private.</div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Inuberry platform staff cannot access this workspace unless a workspace admin approves an
            impersonation request below. All actions taken during a session are recorded here.
          </p>
        </div>
      </div>

      <section className="mb-8">
        <SectionTitle className="mb-2">Requests</SectionTitle>
        <div className="overflow-x-auto border border-border bg-card shadow-sm [&>*]:min-w-[584px]">
          {requests.data?.length === 0 && <div className="p-6 font-mono text-xs text-muted-foreground">No support-access requests.</div>}
          {(requests.data ?? []).map((r) => {
            const expired = !!r.expires_at && new Date(r.expires_at) <= new Date() && (r.status === "pending" || r.status === "approved");
            const pending = r.status === "pending" && !expired;
            const status = expired ? "expired" : r.status;
            return (
              <div key={r.id} className="grid grid-cols-[minmax(10rem,1fr)_140px_220px] items-start gap-4 border-b border-border p-4 last:border-b-0">
                <div>
                  <div className="text-sm">{r.reason}</div>
                  <div className="mt-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Requested {new Date(r.created_at).toLocaleString()}
                    {r.expires_at && <> · expires {new Date(r.expires_at).toLocaleString()}</>}
                  </div>
                </div>
                <div>
                  <span className={`px-2 py-0.5 font-mono text-xs uppercase tracking-wider ${
                    pending ? "border border-border" :
                    status === "approved" ? "bg-primary text-primary-foreground" :
                    "border border-destructive text-destructive"
                  }`}>{status}</span>
                </div>
                <div className="flex gap-2">
                  {pending && canApprove && (
                    <>
                      <Button size="sm" disabled={respondM.isPending} onClick={() => respondM.mutate({ data: { requestId: r.id, approve: true } })}>Approve</Button>
                      <Button size="sm" variant="outline" disabled={respondM.isPending} onClick={() => respondM.mutate({ data: { requestId: r.id, approve: false } })}>Deny</Button>
                    </>
                  )}
                  {status === "approved" && canApprove && (
                    <Button size="sm" variant="destructive" disabled={endM.isPending} onClick={() => endM.mutate({ data: { requestId: r.id } })}>Revoke</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle className="mb-2">Session activity</SectionTitle>
        <div className="overflow-x-auto border border-border bg-card shadow-sm [&>*]:min-w-[544px]">
          {events.data?.length === 0 && <div className="p-6 font-mono text-xs text-muted-foreground">No recorded activity.</div>}
          {(events.data ?? []).map((e) => (
            <div key={e.id} className="grid grid-cols-[160px_160px_1fr] items-start gap-4 border-b border-border p-3 last:border-b-0">
              <div className="font-mono text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
              <div className="font-mono text-xs">{e.event_type}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {e.route ?? e.table_name ?? ""}{e.details ? " · " + JSON.stringify(e.details).slice(0, 200) : ""}
              </div>
            </div>
          ))}
        </div>
      </section>
    </SettingsShell>
  );
}
