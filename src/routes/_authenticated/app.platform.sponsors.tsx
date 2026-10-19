import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlatformShell } from "@/components/platform/platform-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/crm/empty-state";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/_authenticated/app/platform/sponsors")({
  head: () => ({ meta: [{ title: "Sponsors — Platform" }] }),
  component: Sponsors,
});

type Offer = { id: string; title: string; body: string; url: string; category: string; is_active: boolean; sort_order: number };
const CATEGORIES = ["tools", "payroll", "banking", "insurance", "payments", "bookkeeping", "hosting", "email", "recruiting", "legal", "marketing", "shipping"];
const table = () => supabase.from("sponsor_offers");

function Sponsors() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState({ title: "", body: "", url: "https://", category: "tools" });
  const list = useQuery({
    queryKey: ["platform-sponsor-offers"],
    queryFn: async () => {
      const { data, error } = await table().select("*").order("sort_order").order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Offer[];
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["platform-sponsor-offers"] }); qc.invalidateQueries({ queryKey: ["sponsor-offers"] }); };
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await table().insert({ ...draft, title: draft.title.trim(), body: draft.body.trim(), sort_order: (list.data?.length ?? 0) });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Offer added"); setDraft({ title: "", body: "", url: "https://", category: "tools" }); refresh(); },
    onError: (e) => toast.error(friendlyError(e, "Couldn't add the offer")),
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Offer> }) => {
      const { error } = await table().update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error(friendlyError(e, "Couldn't save")),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await table().delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Offer removed"); refresh(); },
    onError: (e) => toast.error(friendlyError(e, "Couldn't remove")),
  });

  return (
    <PlatformShell title="Sponsors" breadcrumb="platform / sponsors">
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        Offers shown on the dashboard of workspaces whose plan has sponsor offers switched on (Startup). Up to three
        active offers show, in this order. Only the title, text and link are shown; nothing about a workspace is
        ever sent to a sponsor. Links must start with https://.
      </p>
      <form className="mb-6 grid max-w-3xl gap-2 border border-border bg-card p-4 shadow-sm sm:grid-cols-2"
        onSubmit={(e) => { e.preventDefault(); if (draft.title.trim() && draft.url.startsWith("https://")) add.mutate(); else toast.error("Add a title and an https:// link."); }}>
        <Input value={draft.title} maxLength={80} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title (e.g. 3 months free payroll)" aria-label="Title" required />
        <Input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://partner.example.com/offer" aria-label="Link" required />
        <Input value={draft.body} maxLength={200} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="One line about the offer" aria-label="Text" className="sm:col-span-2" />
        <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} aria-label="Category"
          className="border border-input bg-card px-3 py-2 text-sm shadow-xs">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <Button type="submit" disabled={add.isPending}><Plus className="mr-1 size-3.5" /> Add offer</Button>
      </form>
      {list.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : list.error ? (
        <EmptyState title="Sponsor offers aren't set up yet" description="Apply database update DB-27, then come back here." />
      ) : !list.data?.length ? (
        <EmptyState title="No offers yet" description="Add a partner offer above. Startup workspaces see up to three on their dashboard." />
      ) : (
        <ul className="grid max-w-3xl gap-px border border-border bg-border">
          {list.data.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 bg-card px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{o.title} <span className="font-mono text-xs uppercase text-muted-foreground">· {o.category}</span></div>
                <div className="truncate text-xs text-muted-foreground">{o.body || "—"} · {o.url}</div>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={o.is_active} onChange={(e) => update.mutate({ id: o.id, patch: { is_active: e.target.checked } })} />
                Shown
              </label>
              <Button size="sm" variant="outline" onClick={() => remove.mutate(o.id)} aria-label={`Remove ${o.title}`}><Trash2 className="size-3.5" /></Button>
            </li>
          ))}
        </ul>
      )}
    </PlatformShell>
  );
}
