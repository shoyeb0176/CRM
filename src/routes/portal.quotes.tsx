import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell, PortalCard, EmptyState } from "@/components/portal/portal-shell";
import { usePortalIdentity, fmtMoney, fmtDate } from "@/lib/portal/use-portal";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/portal/quotes")({
  ssr: false,
  head: () => ({ meta: [{ title: "Quotes — Customer Portal" }] }),
  component: PortalQuotes,
});

function PortalQuotes() {
  const id = usePortalIdentity().data;
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const list = useQuery({
    enabled: !!id?.company_id,
    queryKey: ["portal-quotes", id?.org_id, id?.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("quotes")
        .select("id,number,status,total,currency,issue_date,expiry_date,notes")
        .eq("org_id", id!.org_id).eq("company_id", id!.company_id!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const actions = useQuery({
    enabled: !!selected,
    queryKey: ["portal-quote-actions", selected],
    queryFn: async () => {
      const { data } = await supabase
        .from("quote_customer_actions")
        .select("id,action,comment,created_at")
        .eq("quote_id", selected!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const submit = useMutation({
    mutationFn: async (action: "accept" | "reject" | "comment") => {
      if (!id || !selected) throw new Error("no selection");
      if (action === "comment" && !comment.trim()) throw new Error("Add a comment");
      const { error } = await supabase.from("quote_customer_actions").insert({
        org_id: id.org_id,
        quote_id: selected,
        portal_user_id: id.portal_user_id,
        action,
        comment: comment.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: (_v, action) => {
      toast.success(action === "accept" ? "Quote accepted" : action === "reject" ? "Quote rejected" : "Comment sent");
      setComment("");
      qc.invalidateQueries({ queryKey: ["portal-quote-actions", selected] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const current = list.data?.find(q => q.id === selected);

  return (
    <PortalShell title="Quotes" breadcrumb="Portal / Quotes">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        <PortalCard title="Your quotes">
          {list.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
           !list.data?.length ? <EmptyState compact title="No quotes yet" /> : (
            <div className="divide-y divide-border">
              {list.data.map(q => (
                <Button variant="bare" size="bare"
                  key={q.id} onClick={() => setSelected(q.id)}
                  className={`flex w-full items-center justify-between py-3 text-left text-sm hover:bg-accent/30 ${selected === q.id ? "bg-accent/40" : ""}`}
                >
                  <div className="px-2">
                    <div className="font-medium">{q.number ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(q.issue_date)} · expires {fmtDate(q.expiry_date)}</div>
                  </div>
                  <div className="px-2 text-right">
                    <div className="font-mono">{fmtMoney(q.total, q.currency ?? "USD")}</div>
                    <div className="text-xs uppercase text-muted-foreground">{q.status}</div>
                  </div>
                </Button>
              ))}
            </div>
          )}
        </PortalCard>

        <PortalCard title="Quote detail">
          {!current ? (
            <div className="text-sm text-muted-foreground">Select a quote to review.</div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="font-mono text-xs uppercase text-muted-foreground">{current.number}</div>
                <div className="font-display text-2xl">{fmtMoney(current.total, current.currency ?? "USD")}</div>
                <div className="mt-1 text-xs uppercase text-muted-foreground">{current.status}</div>
                <a href={`/print/quote/${current.id}`} target="_blank" rel="noopener"
                  className="mt-2 inline-block border border-border px-2 py-1 font-mono text-xs uppercase tracking-wider hover:bg-accent">PDF</a>
              </div>
              {current.notes && (
                <div className="border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{current.notes}</div>
              )}
              <div className="flex gap-2">
                <Button variant="kitSolid" size="kit"
                  onClick={() => submit.mutate("accept")} disabled={submit.isPending}
                  className="flex-1 px-3 py-2 tracking-wider"
                >Accept</Button>
                <Button variant="kit" size="kit"
                  onClick={() => submit.mutate("reject")} disabled={submit.isPending}
                  className="flex-1 px-3 py-2 hover:bg-accent tracking-wider"
                >Reject</Button>
              </div>
              <div>
                <label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Comment</label>
                <textarea
                  rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
                  className="mt-1 w-full border border-input bg-card shadow-xs px-3 py-2 text-sm"
                  placeholder="Question or note about this quote…"
                />
                <Button variant="kit" size="kit"
                  onClick={() => submit.mutate("comment")} disabled={submit.isPending}
                  className="mt-2 px-3 py-1 hover:bg-accent tracking-wider"
                >Send comment</Button>
              </div>
              <div className="border-t border-border pt-3">
                <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">History</div>
                {!actions.data?.length ? <div className="text-xs text-muted-foreground">No activity yet.</div> : (
                  <div className="space-y-2">
                    {actions.data.map(a => (
                      <div key={a.id} className="border border-border p-2 text-xs bg-card shadow-sm">
                        <div className="flex justify-between">
                          <span className="font-mono uppercase">{a.action}</span>
                          <span className="text-muted-foreground">{fmtDate(a.created_at)}</span>
                        </div>
                        {a.comment && <div className="mt-1 whitespace-pre-wrap">{a.comment}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </PortalCard>
      </div>
    </PortalShell>
  );
}
