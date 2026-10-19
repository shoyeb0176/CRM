import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/crm/status-badge";
import { useOrgId } from "@/lib/crm/use-org";
import { useOrgMembers, memberLabel } from "@/lib/projects/use-org-members";
import { useCurrentUser } from "@/lib/use-current-user";
import { friendlyError } from "@/lib/friendly-error";
import type { Database } from "@/integrations/supabase/types";
import { STATUSES, PRIORITIES, STATUS_TONE, PRIORITY_TONE, label } from "./app.support.index";

import { SectionTitle } from "@/components/ui/section-title";
type TicketUpdate = Database["public"]["Tables"]["support_tickets"]["Update"];

export const Route = createFileRoute("/_authenticated/app/support/$ticketId")({
  head: () => ({ meta: [{ title: "Ticket — Inuberry" }] }),
  component: TicketDetail,
});

function TicketDetail() {
  const { ticketId } = useParams({ from: "/_authenticated/app/support/$ticketId" });
  const orgId = useOrgId();
  const me = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const members = useOrgMembers(orgId);
  const memberMap = useMemo(() => new Map((members.data ?? []).map((m) => [m.user_id, m])), [members.data]);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);

  const ticket = useQuery({
    queryKey: ["support-ticket", ticketId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("support_tickets")
        .select("*, companies(id, name), contacts(id, first_name, last_name, email)")
        .eq("id", ticketId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const messages = useQuery({
    queryKey: ["support-ticket-messages", ticketId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("support_ticket_messages")
        .select("id, body, is_internal, author_user_id, author_portal_user_id, created_at")
        .eq("ticket_id", ticketId).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const update = useMutation({
    mutationFn: async (patch: TicketUpdate) => {
      const now = new Date().toISOString();
      if (patch.status === "resolved") patch.resolved_at = now;
      if (patch.status === "closed") patch.closed_at = now;
      const { error } = await supabase.from("support_tickets").update(patch).eq("id", ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!reply.trim()) throw new Error("Write a message first");
      const { error } = await supabase.from("support_ticket_messages").insert({
        org_id: orgId!, ticket_id: ticketId, author_user_id: me?.id ?? null, body: reply.trim(), is_internal: internal,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(internal ? "Internal note added" : "Reply sent");
      setReply(""); setInternal(false);
      qc.invalidateQueries({ queryKey: ["support-ticket-messages", ticketId] });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  if (ticket.isLoading) return <AppShell title="Ticket"><Skeleton className="h-64 w-full" /></AppShell>;
  if (!ticket.data) {
    return (
      <AppShell title="Not found">
        <div className="border border-dashed border-border p-12 text-center text-muted-foreground">
          Ticket not found. <Link to="/app/support" className="text-primary">Back →</Link>
        </div>
      </AppShell>
    );
  }
  const t = ticket.data;
  const number = t.ticket_number ?? `#${t.id.slice(0, 8)}`;
  const contact = t.contacts ? [t.contacts.first_name, t.contacts.last_name].filter(Boolean).join(" ") || t.contacts.email : null;
  const sel = "h-9 w-full border border-input bg-card px-2 text-sm shadow-xs";

  return (
    <AppShell title={t.subject} breadcrumb={`support / ${number}`}>
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/support" })}>
          <ArrowLeft className="mr-1 size-4" /> All tickets
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="border border-border bg-card shadow-sm p-6">
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {number} · opened {new Date(t.created_at).toLocaleString()}
            </div>
            <h1 className="mt-1 font-heading text-xl">{t.subject}</h1>
            <div className="mt-2 flex gap-2">
              <StatusBadge tone={STATUS_TONE[t.status]}>{label(t.status)}</StatusBadge>
              <StatusBadge tone={PRIORITY_TONE[t.priority]}>{t.priority}</StatusBadge>
            </div>
            {t.description && <p className="mt-4 whitespace-pre-wrap text-sm">{t.description}</p>}
          </div>

          <section>
            <SectionTitle className="mb-3 border-b border-border pb-2">Conversation</SectionTitle>
            {messages.isLoading ? <Skeleton className="h-32" /> : !messages.data?.length ? (
              <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No replies yet.</div>
            ) : (
              <ul className="space-y-2">
                {messages.data.map((m) => {
                  const who = m.author_portal_user_id ? (contact ?? "Customer") : memberLabel(memberMap.get(m.author_user_id ?? ""));
                  return (
                    <li key={m.id} className={`border p-3 ${
                      m.is_internal ? "border-warning/40 bg-warning/5" :
                      m.author_portal_user_id ? "mr-8 border-border bg-card" : "ml-8 border-primary/30 bg-primary/5"}`}>
                      <div className="mb-1 flex justify-between gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                        <span>{who}{m.author_portal_user_id ? " · customer" : ""}{m.is_internal ? " · internal note" : ""}</span>
                        <span>{new Date(m.created_at).toLocaleString()}</span>
                      </div>
                      <div className="whitespace-pre-wrap text-sm">{m.body}</div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-4 border border-border bg-card shadow-sm p-4">
              <Textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)}
                placeholder={internal ? "Internal note (only your team sees this)…" : "Reply to the customer…"} />
              <div className="mt-3 flex items-center gap-3">
                <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                  Internal note
                </label>
                <Button size="sm" className="ml-auto" onClick={() => send.mutate()} disabled={send.isPending || !reply.trim()}>
                  {internal ? "Add note" : "Send reply"}
                </Button>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="space-y-4 border border-border bg-card shadow-sm p-5">
            <Field label="Status">
              <select className={sel} value={t.status} disabled={update.isPending}
                onChange={(e) => update.mutate({ status: e.target.value as TicketUpdate["status"] })}>
                {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select className={sel} value={t.priority} disabled={update.isPending}
                onChange={(e) => update.mutate({ priority: e.target.value as TicketUpdate["priority"] })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Assignee">
              <select className={sel} value={t.assignee_id ?? ""} disabled={update.isPending}
                onChange={(e) => update.mutate({ assignee_id: e.target.value || null })}>
                <option value="">Unassigned</option>
                {(members.data ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{memberLabel(m)}</option>)}
              </select>
            </Field>
          </div>
          <div className="space-y-3 border border-border bg-card shadow-sm p-5 text-sm">
            <Field label="Company">
              {t.companies ? (
                <Link to="/app/crm/companies/$companyId" params={{ companyId: t.companies.id }} className="text-primary hover:underline">
                  {t.companies.name}
                </Link>
              ) : "—"}
            </Field>
            <Field label="Contact">
              {t.contacts ? (
                <Link to="/app/crm/contacts/$contactId" params={{ contactId: t.contacts.id }} className="text-primary hover:underline">
                  {contact}
                </Link>
              ) : "—"}
            </Field>
            {t.resolved_at && <Field label="Resolved">{new Date(t.resolved_at).toLocaleString()}</Field>}
            {t.closed_at && <Field label="Closed">{new Date(t.closed_at).toLocaleString()}</Field>}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
