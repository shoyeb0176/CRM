import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/crm/status-badge";
import { ConfirmDelete } from "@/components/crm/confirm-delete";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgId } from "@/lib/crm/use-org";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Globe, Phone, MapPin, Trash2, User, Briefcase } from "lucide-react";
import { AiBlock } from "@/components/ai/ai-block";
import { CommsTimeline } from "@/components/comms/comms-timeline";
import { useAiEntity } from "@/lib/ai/entity-context";
import { CompanyDrawer } from "@/components/crm/company-drawer";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";

export const Route = createFileRoute("/_authenticated/app/crm/companies/$companyId")({
  head: () => ({ meta: [{ title: "Company — CRM" }] }),
  component: CompanyDetail,
});

function CompanyDetail() {
  const { companyId } = Route.useParams();
  const orgId = useOrgId();
  useAiEntity({ type: "company", id: companyId, label: companyId });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const company = useQuery({
    queryKey: ["company", companyId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", companyId).single();
      if (error) throw error;
      return data;
    },
  });

  const contacts = useQuery({
    queryKey: ["company-contacts", companyId], enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from("contacts").select("id, first_name, last_name, email, job_title")
        .eq("company_id", companyId).eq("archived", false).order("first_name");
      return data ?? [];
    },
  });

  const deals = useQuery({
    queryKey: ["company-deals", companyId], enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from("deals").select("id, title, amount, currency, status")
        .eq("company_id", companyId).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("companies").update({ archived: true }).eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Company archived"); navigate({ to: "/app/crm/companies" }); qc.invalidateQueries({ queryKey: ["companies"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const c = company.data;
  return (
    <AppShell title={c?.name ?? "Company"} breadcrumb="crm / companies">
      <div className="mb-4"><AiBlock entityType="company" entityId={companyId} /></div>
      <div className="mb-6"><CommsTimeline orgId={orgId} entityType="company" entityId={companyId} /></div>
      <Link to="/app/crm/companies" className="mb-4 inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Back to companies
      </Link>
      {company.isLoading ? <Skeleton className="h-40 w-full" /> : !c ? (
        <div className="border border-border bg-card shadow-sm p-8 text-center text-muted-foreground">Company not found.</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <aside className="space-y-4">
            <div className="border border-border bg-card shadow-sm p-5">
              {c.industry && <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{c.industry}</div>}
              <h2 className="mt-1 font-display text-2xl">{c.name}</h2>
              <div className="mt-4 space-y-2 text-sm">
                {c.website && <Row icon={Globe}><a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{c.website}</a></Row>}
                {c.phone && <Row icon={Phone}>{c.phone}</Row>}
                {(c.city || c.country) && <Row icon={MapPin}>{[c.city, c.country].filter(Boolean).join(", ")}</Row>}
                {c.size && <Row icon={User}>{c.size}</Row>}
              </div>
              {c.address && <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-sm text-muted-foreground">{c.address}</p>}
            </div>
            <Button asChild variant="outline" className="w-full"><Link to="/app/customers/$companyId" params={{ companyId: c.id }}>Quotes, orders and invoices</Link></Button>
            <Button variant="outline" className="w-full" onClick={() => setEditOpen(true)}>Edit company</Button>
            <Button variant="outline" className="w-full" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="mr-2 size-4" /> Archive company
            </Button>
          </aside>

          <main className="space-y-6">
            <section className="border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
                <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Contacts</h3>
                <span className="font-mono text-xs">{contacts.data?.length ?? 0}</span>
              </div>
              {!contacts.data || contacts.data.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No contacts linked yet.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {contacts.data.map((p) => (
                    <li key={p.id}>
                      <Link to="/app/crm/contacts/$contactId" params={{ contactId: p.id }} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{[p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "Unnamed"}</div>
                          {p.job_title && <div className="truncate text-xs text-muted-foreground">{p.job_title}</div>}
                        </div>
                        {p.email && <span className="truncate font-mono text-xs text-muted-foreground">{p.email}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
                <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Deals</h3>
                <span className="font-mono text-xs">{deals.data?.length ?? 0}</span>
              </div>
              {!deals.data || deals.data.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No deals yet.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {deals.data.map((d) => (
                    <li key={d.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Briefcase className="size-4 text-muted-foreground" />
                        <span className="truncate text-sm font-medium">{d.title}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs">{Number(d.amount).toLocaleString()} {d.currency}</span>
                        <StatusBadge tone={d.status === "won" ? "success" : d.status === "lost" ? "danger" : "info"}>{d.status}</StatusBadge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </main>
        </div>
      )}

      <ConfirmDelete
        open={confirmOpen} onOpenChange={setConfirmOpen}
        title="Archive company?" description="The company will be hidden from lists. Linked contacts and deals are preserved. You can restore it from the Archived filter on Companies." confirmLabel="Archive"
        onConfirm={() => del.mutate()} loading={del.isPending}
      />
      {company.data && (
        <CompanyDrawer key={company.data.id + String(editOpen)} open={editOpen} onOpenChange={setEditOpen} company={company.data}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["company", companyId] }); qc.invalidateQueries({ queryKey: ["companies"] }); }} />
      )}
      <AttachmentsPanel orgId={orgId} entityType="company" entityId={companyId} className="mt-6 border border-border bg-background" />
    </AppShell>
  );
}

function Row({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 truncate">{children}</div>
    </div>
  );
}
