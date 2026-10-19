// One report: what was sent (screenshot, page, browser) and the conversation about it. Reporters
// see replies meant for them; reviewers also see and write internal notes.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/crm/status-badge";
import { TICKET_STATUS, describeBrowser, kindLabel, screenshotUrl } from "@/lib/feedback/feedback";
import type { Database } from "@/integrations/supabase/types";

export type Ticket = Database["public"]["Tables"]["platform_tickets"]["Row"];
type Message = Database["public"]["Tables"]["platform_ticket_messages"]["Row"];

export function TicketView({ ticket, reviewer }: { ticket: Ticket; reviewer?: boolean }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const status = TICKET_STATUS[ticket.status];

  const shot = useQuery({
    queryKey: ["feedback-shot", ticket.screenshot_path], enabled: !!ticket.screenshot_path,
    queryFn: () => screenshotUrl(ticket.screenshot_path!), staleTime: 5 * 60_000,
  });
  const messages = useQuery({
    queryKey: ["feedback-messages", ticket.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_ticket_messages").select("*").eq("ticket_id", ticket.id).order("created_at");
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });
  // The reporter's view never lists internal notes, even for someone who is also a reviewer.
  const msgs = reviewer ? messages.data : messages.data?.filter((m) => !m.is_internal);
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("platform_ticket_messages").insert({ ticket_id: ticket.id, body: body.trim(), is_internal: reviewer ? internal : false });
      if (error) throw error;
    },
    onSuccess: () => { setBody(""); setInternal(false); qc.invalidateQueries({ queryKey: ["feedback-messages", ticket.id] }); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="font-mono text-xs">{ticket.ticket_number}</span>
        <StatusBadge tone={status?.tone}>{status?.label ?? ticket.status}</StatusBadge>
        <span>{kindLabel(ticket.kind)}</span>
        <span>· {new Date(ticket.created_at).toLocaleString()}</span>
      </div>
      <h2 className="font-heading text-lg">{ticket.title}</h2>
      <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
      {ticket.screenshot_path && (
        shot.data ? (
          <a href={shot.data} target="_blank" rel="noreferrer" className="block border border-border bg-muted" aria-label="Open the screenshot full size">
            <img src={shot.data} alt="Screenshot sent with the report" className="max-h-96 w-full object-contain" />
          </a>
        ) : <div className="h-40 animate-pulse border border-border bg-muted" />
      )}
      <dl className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-[auto_1fr]">
        {ticket.page_url && <><dt>Page</dt><dd className="truncate">{reviewer ? <a className="inline-flex items-center gap-1 text-primary hover:underline" href={ticket.page_url} target="_blank" rel="noreferrer">{ticket.page_url}<ExternalLink className="size-3" /></a> : ticket.page_url}</dd></>}
        {ticket.app_version && <><dt>Version</dt><dd>{ticket.app_version}</dd></>}
        {ticket.user_agent && <><dt>Browser</dt><dd>{describeBrowser(ticket.user_agent)}{ticket.viewport ? `, screen ${ticket.viewport}` : ""}</dd></>}
      </dl>

      <div className="border-t border-border pt-4">
        <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Conversation</div>
        {msgs?.length ? (
          <ul className="grid gap-2">
            {msgs.map((m) => {
              const mine = m.author_id === ticket.created_by;
              return (
                <li key={m.id} className={`border p-3 text-sm ${m.is_internal ? "border-warning/40 bg-warning/5" : mine ? "border-border bg-card" : "border-primary/30 bg-primary/5"}`}>
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                    {m.is_internal && <Lock className="size-3" aria-label="Internal note" />}
                    <span>{mine ? (reviewer ? "Reporter" : "You") : "Inuberry team"}{m.is_internal ? " · internal note" : ""}</span>
                    <span>· {new Date(m.created_at).toLocaleString()}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{reviewer ? "No replies yet." : "No replies yet. You'll get a notification when the team answers."}</p>
        )}
        <form className="mt-3 grid gap-2" onSubmit={(e) => { e.preventDefault(); if (body.trim()) send.mutate(); }}>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={10000}
            placeholder={reviewer ? "Reply to the reporter, or tick 'Internal note'…" : "Add more detail or answer a question…"} aria-label="Your reply" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {reviewer ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="size-4 accent-primary" />
                Internal note (the reporter won't see it)
              </label>
            ) : <span />}
            <Button type="submit" size="sm" disabled={!body.trim() || send.isPending}>{send.isPending ? "Sending…" : internal ? "Add note" : "Send reply"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
