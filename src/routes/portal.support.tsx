import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell, PortalCard, EmptyState } from "@/components/portal/portal-shell";
import { usePortalIdentity, fmtDate } from "@/lib/portal/use-portal";
import { useState } from "react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";

type Priority = Database["public"]["Enums"]["support_ticket_priority"];

export const Route = createFileRoute("/portal/support")({
  ssr: false,
  head: () => ({ meta: [{ title: "Support — Customer Portal" }] }),
  component: PortalSupport,
});

function PortalSupport() {
  const id = usePortalIdentity().data;
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("normal");

  const tickets = useQuery({
    enabled: !!id?.company_id,
    queryKey: ["portal-tickets", id?.org_id, id?.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("support_tickets")
        .select("id,subject,status,priority,created_at,description")
        .eq("org_id", id!.org_id).eq("company_id", id!.company_id!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const messages = useQuery({
    enabled: !!selected,
    queryKey: ["portal-ticket-messages", selected],
    queryFn: async () => {
      const { data } = await supabase
        .from("support_ticket_messages")
        .select("id,body,is_internal,author_user_id,author_portal_user_id,created_at")
        .eq("ticket_id", selected!).order("created_at");
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("no portal");
      if (!newSubject.trim()) throw new Error("Subject required");
      const { data, error } = await supabase.from("support_tickets").insert({
        org_id: id.org_id,
        company_id: id.company_id,
        contact_id: id.contact_id,
        portal_user_id: id.portal_user_id,
        created_by_portal_user_id: id.portal_user_id,
        subject: newSubject.trim(),
        description: newBody.trim() || null,
        priority: newPriority,
        status: "open",
      }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (newId) => {
      toast.success("Ticket created");
      setShowNew(false); setNewSubject(""); setNewBody(""); setNewPriority("normal");
      qc.invalidateQueries({ queryKey: ["portal-tickets"] });
      setSelected(newId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      if (!id || !selected) throw new Error("no selection");
      if (!reply.trim()) throw new Error("Message required");
      const { error } = await supabase.from("support_ticket_messages").insert({
        org_id: id.org_id,
        ticket_id: selected,
        author_portal_user_id: id.portal_user_id,
        body: reply.trim(),
        is_internal: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["portal-ticket-messages", selected] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const current = tickets.data?.find(t => t.id === selected);

  return (
    <PortalShell title="Support" breadcrumb="Portal / Support">
      <div className="mb-4 flex justify-end">
        <Button variant="kitSolid" size="kit"
          onClick={() => setShowNew(v => !v)}
          className="px-3 py-2 tracking-wider"
        >
          {showNew ? "Cancel" : "+ New ticket"}
        </Button>
      </div>

      {showNew && (
        <PortalCard title="Create ticket">
          <div className="space-y-3">
            <input
              placeholder="Subject"
              value={newSubject} onChange={e => setNewSubject(e.target.value)}
              className="w-full border border-input bg-card shadow-xs px-3 py-2 text-sm"
            />
            <textarea
              rows={4} placeholder="Describe the issue…"
              value={newBody} onChange={e => setNewBody(e.target.value)}
              className="w-full border border-input bg-card shadow-xs px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-3">
              <label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Priority</label>
              <select value={newPriority} onChange={e => setNewPriority(e.target.value as Priority)}
                className="border border-input bg-card shadow-xs px-2 py-1 text-sm">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <Button variant="kitSolid" size="kit"
                onClick={() => create.mutate()} disabled={create.isPending}
                className="ml-auto px-3 py-2 tracking-wider"
              >Submit</Button>
            </div>
          </div>
        </PortalCard>
      )}

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
        <PortalCard title="Tickets">
          {tickets.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
           !tickets.data?.length ? <EmptyState compact title="No tickets" description="Create one to start a conversation." /> : (
            <div className="divide-y divide-border">
              {tickets.data.map(t => (
                <Button variant="bare" size="bare" key={t.id} onClick={() => setSelected(t.id)}
                  className={`w-full py-3 text-left hover:bg-accent/30 ${selected === t.id ? "bg-accent/40" : ""}`}>
                  <div className="px-2 font-medium">{t.subject}</div>
                  <div className="px-2 text-xs text-muted-foreground">
                    <span className="uppercase">{t.status}</span> · {t.priority} · {fmtDate(t.created_at)}
                  </div>
                </Button>
              ))}
            </div>
          )}
        </PortalCard>

        <PortalCard title="Conversation">
          {!current ? <div className="text-sm text-muted-foreground">Select a ticket.</div> : (
            <div className="space-y-4">
              <div>
                <div className="font-heading text-lg">{current.subject}</div>
                <div className="mt-1 text-xs uppercase text-muted-foreground">{current.status} · {current.priority}</div>
                {current.description && <p className="mt-2 whitespace-pre-wrap text-sm">{current.description}</p>}
              </div>
              <div className="space-y-2">
                {messages.data?.length ? messages.data.map(m => (
                  <div key={m.id} className={`border p-3 ${m.author_portal_user_id ? "border-primary/30 bg-primary/5 ml-8" : "border-border bg-muted/30 mr-8"}`}>
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>{m.author_portal_user_id ? "You" : "Support"}</span>
                      <span>{fmtDate(m.created_at)}</span>
                    </div>
                    <div className="whitespace-pre-wrap text-sm">{m.body}</div>
                  </div>
                )) : <div className="text-xs text-muted-foreground">No replies yet.</div>}
              </div>
              <div className="border-t border-border pt-3">
                <textarea
                  rows={3} value={reply} onChange={e => setReply(e.target.value)}
                  placeholder="Write a reply…"
                  className="w-full border border-input bg-card shadow-xs px-3 py-2 text-sm"
                />
                <Button variant="kitSolid" size="kit"
                  onClick={() => sendReply.mutate()} disabled={sendReply.isPending}
                  className="mt-2 px-3 py-2 tracking-wider"
                >Send reply</Button>
              </div>
            </div>
          )}
        </PortalCard>
      </div>
    </PortalShell>
  );
}
