import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/crm/status-badge";
import { ConfirmDelete } from "@/components/crm/confirm-delete";
import { ActivityDrawer } from "@/components/crm/activity-drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgId } from "@/lib/crm/use-org";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Mail, Phone, Building2, Calendar, MessageSquare, Briefcase,
  Trash2, Plus, CheckCircle2,
} from "lucide-react";
import { AiBlock } from "@/components/ai/ai-block";
import { CommsTimeline } from "@/components/comms/comms-timeline";
import { useAiEntity } from "@/lib/ai/entity-context";
import { ContactDrawer } from "@/components/crm/contact-drawer";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";

export const Route = createFileRoute("/_authenticated/app/crm/contacts/$contactId")({
  head: () => ({ meta: [{ title: "Contact — CRM" }] }),
  component: ContactDetail,
});

function ContactDetail() {
  const { contactId } = Route.useParams();
  const orgId = useOrgId();
  useAiEntity({ type: "contact", id: contactId, label: contactId });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const companiesMin = useQuery({
    queryKey: ["companies-min", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name").eq("org_id", orgId!).eq("archived", false).order("name");
      if (error) throw error; return data ?? [];
    },
  });
  const [noteText, setNoteText] = useState("");
  const [activityDrawer, setActivityDrawer] = useState(false);

  const contact = useQuery({
    queryKey: ["contact", contactId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts").select("*, companies:company_id(id, name)")
        .eq("id", contactId).single();
      if (error) throw error;
      return data;
    },
  });

  const deals = useQuery({
    queryKey: ["contact-deals", contactId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from("deals").select("id, title, amount, currency, status, stage_id")
        .eq("contact_id", contactId).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const activities = useQuery({
    queryKey: ["entity-activities", "contact", contactId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from("activities").select("*")
        .eq("entity_type", "contact").eq("entity_id", contactId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const notes = useQuery({
    queryKey: ["entity-notes", "contact", contactId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from("notes").select("*")
        .eq("entity_type", "contact").eq("entity_id", contactId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await getSessionUser();
      const { error } = await supabase.from("notes").insert({
        org_id: orgId!, entity_type: "contact", entity_id: contactId,
        body: noteText, author_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNoteText("");
      qc.invalidateQueries({ queryKey: ["entity-notes", "contact", contactId] });
      toast.success("Note added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contacts").update({ archived: true }).eq("id", contactId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Contact archived"); navigate({ to: "/app/crm/contacts" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const c = contact.data;
  const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Unnamed" : "";

  // Build timeline
  const timeline = [
    ...(notes.data ?? []).map((n) => ({ kind: "note" as const, at: n.created_at, item: n })),
    ...(activities.data ?? []).map((a) => ({ kind: "activity" as const, at: a.created_at, item: a })),
    ...(deals.data ?? []).map((d) => ({ kind: "deal" as const, at: d.id, item: d })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

  return (
    <AppShell title={name || "Contact"} breadcrumb="crm / contacts">
      <div className="mb-4"><AiBlock entityType="contact" entityId={contactId} /></div>
      <div className="mb-6"><CommsTimeline orgId={orgId} entityType="contact" entityId={contactId} /></div>
      <Link to="/app/crm/contacts" className="mb-4 inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Back to contacts
      </Link>

      {contact.isLoading ? <Skeleton className="h-40 w-full" /> : !c ? (
        <div className="border border-border bg-card shadow-sm p-8 text-center text-muted-foreground">Contact not found.</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          {/* Left column: details */}
          <aside className="space-y-4">
            <div className="border border-border bg-card shadow-sm p-5">
              <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{c.lifecycle_stage.replaceAll("_"," ")}</div>
              <h2 className="mt-1 font-display text-2xl">{name}</h2>
              {c.job_title && <div className="mt-1 text-sm text-muted-foreground">{c.job_title}</div>}
              <div className="mt-4 space-y-2 text-sm">
                {c.email && <Row icon={Mail}><a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a></Row>}
                {c.phone && <Row icon={Phone}>{c.phone}</Row>}
                {c.companies && (
                  <Row icon={Building2}>
                    <Link to="/app/crm/companies/$companyId" params={{ companyId: c.companies.id }} className="hover:underline">
                      {c.companies.name}
                    </Link>
                  </Row>
                )}
                <Row icon={Calendar}>
                  <span className="font-mono text-xs text-muted-foreground">Added {new Date(c.created_at).toLocaleDateString()}</span>
                </Row>
              </div>
              {c.notes && <p className="mt-4 whitespace-pre-wrap border-t border-border pt-3 text-sm text-muted-foreground">{c.notes}</p>}
            </div>

            <div className="border border-border bg-card shadow-sm p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Deals</h3>
                <span className="font-mono text-xs">{deals.data?.length ?? 0}</span>
              </div>
              {!deals.data || deals.data.length === 0 ? (
                <div className="text-xs text-muted-foreground">No deals linked.</div>
              ) : (
                <ul className="space-y-2">
                  {deals.data.map((d) => (
                    <li key={d.id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{d.title}</span>
                      <span className="font-mono text-xs">{Number(d.amount).toLocaleString()} {d.currency}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button variant="outline" className="w-full" onClick={() => setEditOpen(true)}>Edit contact</Button>
            <Button variant="outline" className="w-full" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="mr-2 size-4" /> Archive contact
            </Button>
          </aside>

          {/* Right column: timeline */}
          <main className="space-y-6">
            <section className="border border-border bg-card shadow-sm p-5">
              <h3 className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">Add note</h3>
              <Textarea rows={3} value={noteText} onChange={(e)=>setNoteText(e.target.value)} placeholder="Capture context, summaries, decisions…" maxLength={5000} />
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setActivityDrawer(true)}>
                  <Plus className="mr-1 size-4" /> Log activity
                </Button>
                <Button size="sm" disabled={!noteText.trim() || addNote.isPending} onClick={() => addNote.mutate()}>
                  {addNote.isPending ? "Saving…" : "Add note"}
                </Button>
              </div>
            </section>

            <section>
              <h3 className="mb-3 border-b border-border pb-2 font-heading text-lg uppercase">Timeline</h3>
              {timeline.length === 0 ? (
                <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Notes, activities and deals will appear here.
                </div>
              ) : (
                <ul className="space-y-3">
                  {timeline.map((row, idx) => (
                    <li key={idx} className="flex gap-3 border border-border bg-card p-4">
                      <div className="mt-0.5">
                        {row.kind === "note" && <MessageSquare className="size-4 text-muted-foreground" />}
                        {row.kind === "activity" && <CheckCircle2 className={`size-4 ${row.item.completed ? "text-success" : "text-muted-foreground"}`} />}
                        {row.kind === "deal" && <Briefcase className="size-4 text-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        {row.kind === "note" && (
                          <>
                            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Note · {new Date(row.item.created_at).toLocaleString()}</div>
                            <p className="mt-1 whitespace-pre-wrap text-sm">{row.item.body}</p>
                          </>
                        )}
                        {row.kind === "activity" && (
                          <>
                            <div className="flex items-center justify-between">
                              <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{row.item.type} · {new Date(row.item.created_at).toLocaleString()}</div>
                              <StatusBadge tone={row.item.completed ? "success" : "info"}>{row.item.completed ? "Done" : "Open"}</StatusBadge>
                            </div>
                            <div className="mt-1 text-sm font-medium">{row.item.title}</div>
                            {row.item.description && <p className="mt-1 text-sm text-muted-foreground">{row.item.description}</p>}
                          </>
                        )}
                        {row.kind === "deal" && (
                          <>
                            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Deal</div>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-sm font-medium">{row.item.title}</span>
                              <span className="font-mono text-xs">{Number(row.item.amount).toLocaleString()} {row.item.currency}</span>
                            </div>
                          </>
                        )}
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
        title="Archive contact?" description="The contact will be hidden from lists. You can restore it from the Archived filter on Contacts." confirmLabel="Archive"
        onConfirm={() => del.mutate()} loading={del.isPending}
      />

      <ActivityDrawer
        open={activityDrawer}
        onOpenChange={setActivityDrawer}
        activity={null}
        defaultEntity={{ entity_type: "contact", entity_id: contactId }}
        onSaved={() => qc.invalidateQueries({ queryKey: ["entity-activities", "contact", contactId] })}
      />
      {contact.data && (
        <ContactDrawer key={contact.data.id + String(editOpen)} open={editOpen} onOpenChange={setEditOpen}
          contact={contact.data ?? null} companies={companiesMin.data ?? []}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["contact", contactId] }); qc.invalidateQueries({ queryKey: ["contacts"] }); }} />
      )}
      <AttachmentsPanel orgId={orgId} entityType="contact" entityId={contactId} className="mt-6 border border-border bg-background" />
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
