import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { CrmShell } from "@/components/crm/crm-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { StatusBadge, type BadgeTone } from "@/components/crm/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { useOrgId } from "@/lib/crm/use-org";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LayoutGrid, List, Plus } from "lucide-react";
import { z } from "zod";
import { focusSearch, useOpenOnNew } from "@/lib/use-focus-row";
import type { Database } from "@/integrations/supabase/types";

type Deal = Database["public"]["Tables"]["deals"]["Row"];
type Stage = Database["public"]["Tables"]["deal_stages"]["Row"];
type Status = Database["public"]["Enums"]["deal_status"];

const STATUS_TONE: Record<Status, BadgeTone> = { open: "info", won: "success", lost: "danger" };

const schema = z.object({
  title: z.string().trim().min(1, "Required").max(160),
  amount: z.coerce.number().min(0),
  currency: z.string().trim().length(3).default("USD"),
  stage_id: z.string().uuid().nullable().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  expected_close_date: z.string().optional().or(z.literal("")),
  probability: z.coerce.number().min(0).max(100),
  status: z.enum(["open","won","lost"]),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
});

export const Route = createFileRoute("/_authenticated/app/crm/deals")({
  head: () => ({ meta: [{ title: "Deals — CRM" }] }),
  validateSearch: focusSearch("deal"),
  component: DealsPage,
});

function fmt(n: number, ccy = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: ccy, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function DealsPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);

  const stages = useQuery({
    queryKey: ["deal-stages", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("deal_stages").select("*").eq("org_id", orgId!).order("position");
      if (error) throw error;
      if (!data || data.length === 0) {
        await supabase.rpc("seed_default_deal_stages", { _org: orgId! });
        const r = await supabase.from("deal_stages").select("*").eq("org_id", orgId!).order("position");
        return r.data ?? [];
      }
      return data;
    },
  });

  const deals = useQuery({
    queryKey: ["deals", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("*, contacts:contact_id(id, first_name, last_name), companies:company_id(id, name)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // A notification about a deal opens it here (?deal=<id>).
  const { deal: focusDeal } = Route.useSearch();
  const opened = useRef<string | null>(null);
  useEffect(() => {
    const d = focusDeal && deals.data?.find((x) => x.id === focusDeal);
    if (d && opened.current !== focusDeal) { opened.current = focusDeal!; setEditing(d as Deal); setDrawer(true); }
  }, [focusDeal, deals.data]);

  const filtered = useMemo(() => {
    if (!deals.data) return undefined;
    const s = search.trim().toLowerCase();
    if (!s) return deals.data;
    return deals.data.filter((d) => d.title.toLowerCase().includes(s));
  }, [deals.data, search]);

  const moveStage = useMutation({
    mutationFn: async ({ id, stage_id }: { id: string; stage_id: string }) => {
      const stage = stages.data?.find((s) => s.id === stage_id);
      const update: Partial<Deal> = { stage_id, probability: stage?.probability ?? 0 };
      if (stage?.is_won) update.status = "won";
      else if (stage?.is_lost) update.status = "lost";
      else update.status = "open";
      const { error } = await supabase.from("deals").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deals"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  useOpenOnNew(() => { setEditing(null); setDrawer(true); });
  return (
    <CrmShell
      title="Deals"
      breadcrumb="crm / deals"
      actions={
        <div className="flex items-center gap-2">
          <div className="flex border border-border">
            <Button variant="bare" size="bare" onClick={() => setView("kanban")} className={`p-1.5 ${view === "kanban" ? "bg-foreground text-background" : "text-muted-foreground"}`} aria-label="Kanban">
              <LayoutGrid className="size-4" />
            </Button>
            <Button variant="bare" size="bare" onClick={() => setView("table")} className={`p-1.5 ${view === "table" ? "bg-foreground text-background" : "text-muted-foreground"}`} aria-label="Table">
              <List className="size-4" />
            </Button>
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setDrawer(true); }}>
            <Plus className="mr-1 size-4" /> New deal
          </Button>
        </div>
      }
    >
      <PageToolbar search={search} onSearchChange={setSearch} placeholder="Search deals…" />

      {view === "kanban" ? (
        <KanbanBoard
          stages={stages.data ?? []}
          deals={filtered ?? []}
          loading={stages.isLoading || deals.isLoading}
          onMove={(id, stage_id) => moveStage.mutate({ id, stage_id })}
          onEdit={(d) => { setEditing(d); setDrawer(true); }}
        />
      ) : (
        <DataTable
          loading={deals.isLoading}
          data={filtered}
          onRowClick={(d) => { setEditing(d); setDrawer(true); }}
          columns={[
            { key: "title", header: "Deal", cell: (d) => <span className="font-medium">{d.title}</span> },
            { key: "company", header: "Company", cell: (d) => d.companies?.name ?? <span className="text-muted-foreground">—</span> },
            { key: "stage", header: "Stage", cell: (d) => stages.data?.find((s) => s.id === d.stage_id)?.name ?? <span className="text-muted-foreground">—</span> },
            { key: "amount", header: "Amount", cell: (d) => <span className="font-mono">{fmt(Number(d.amount), d.currency)}</span> },
            { key: "prob", header: "Prob", cell: (d) => <span className="font-mono text-xs">{d.probability}%</span> },
            { key: "close", header: "Close", cell: (d) => d.expected_close_date
              ? <span className="font-mono text-xs">{new Date(d.expected_close_date).toLocaleDateString()}</span>
              : <span className="text-muted-foreground">—</span>
            },
            { key: "status", header: "Status", cell: (d) => <StatusBadge tone={STATUS_TONE[d.status]}>{d.status}</StatusBadge> },
          ]}
          empty={<EmptyState title="No deals yet" description="Track your pipeline from first contact to close." action={
            <Button onClick={() => { setEditing(null); setDrawer(true); }}><Plus className="mr-1 size-4" /> Create deal</Button>
          } />}
        />
      )}

      <DealDrawer
        open={drawer} onOpenChange={(v) => { setDrawer(v); if (!v) setEditing(null); }}
        deal={editing} stages={stages.data ?? []}
        onSaved={() => qc.invalidateQueries({ queryKey: ["deals"] })}
      />
    </CrmShell>
  );
}

function KanbanBoard({
  stages, deals, loading, onMove, onEdit,
}: {
  stages: Stage[]; deals: any[]; loading?: boolean;
  onMove: (id: string, stage_id: string) => void;
  onEdit: (d: Deal) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  if (loading) {
    return <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-64 animate-pulse bg-muted/40" />)}
    </div>;
  }
  if (stages.length === 0) {
    return <EmptyState title="No pipeline stages" description="Default stages will be created automatically." />;
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const colDeals = deals.filter((d) => d.stage_id === stage.id);
        const total = colDeals.reduce((s, d) => s + Number(d.amount ?? 0), 0);
        return (
          <div
            key={stage.id}
            className="min-w-[260px] flex-1 border border-border bg-muted/20"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragId) { onMove(dragId, stage.id); setDragId(null); } }}
          >
            <div className="flex items-center justify-between border-b border-border bg-background px-3 py-2">
              <div>
                <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{stage.name}</div>
                <div className="font-mono text-xs">{colDeals.length} · {fmt(total)}</div>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{stage.probability}%</span>
            </div>
            <div className="space-y-2 p-2 min-h-[200px]">
              {colDeals.map((d) => (
                <div
                  key={d.id}
                  draggable
                  onDragStart={() => setDragId(d.id)}
                  onDragEnd={() => setDragId(null)}
                  onClick={() => onEdit(d)}
                  className="cursor-grab border border-border bg-background p-3 text-sm shadow-sm transition-colors hover:border-primary active:cursor-grabbing"
                >
                  <div className="font-medium truncate">{d.title}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {d.companies?.name ?? d.contacts?.first_name ?? "—"}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-mono text-xs">{fmt(Number(d.amount), d.currency)}</span>
                    {d.expected_close_date && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {new Date(d.expected_close_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {colDeals.length === 0 && (
                <div className="border border-dashed border-border/60 p-4 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground/60">
                  Drop deals here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DealDrawer({
  open, onOpenChange, deal, stages, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  deal: Deal | null; stages: Stage[]; onSaved: () => void;
}) {
  const orgId = useOrgId();
  const [form, setForm] = useState(() => init(deal, stages));
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { setForm(init(deal, stages)); setErrors({}); }, [deal, stages]);

  const contacts = useQuery({
    queryKey: ["contacts-min", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from("contacts").select("id, first_name, last_name").eq("org_id", orgId!).eq("archived", false).order("first_name");
      return data ?? [];
    },
  });
  const companies = useQuery({
    queryKey: ["companies-min", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id, name").eq("org_id", orgId!).eq("archived", false).order("name");
      return data ?? [];
    },
  });

  const m = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) {
        const errs: Record<string, string> = {};
        parsed.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
        setErrors(errs); throw new Error("Validation failed");
      }
      setErrors({});
      const { data: { user } } = await getSessionUser();
      const payload = {
        org_id: orgId!,
        title: form.title,
        amount: Number(form.amount),
        currency: form.currency || "USD",
        stage_id: form.stage_id || null,
        contact_id: form.contact_id || null,
        company_id: form.company_id || null,
        expected_close_date: form.expected_close_date || null,
        probability: Number(form.probability),
        status: form.status,
        description: form.description || null,
      };
      if (deal) {
        const { error } = await supabase.from("deals").update(payload).eq("id", deal.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("deals").insert({ ...payload, created_by: user?.id, owner_id: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(deal ? "Deal updated" : "Deal created"); onSaved(); onOpenChange(false); },
    onError: (e: Error) => { if (e.message !== "Validation failed") toast.error(e.message); },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{deal ? "Edit deal" : "New deal"}</SheetTitle>
          <SheetDescription>Track size, stage, owner and expected close.</SheetDescription>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="mt-6 space-y-4">
          <F label="Title" err={errors.title}><Input value={form.title} onChange={(e)=>setForm({...form, title: e.target.value})} maxLength={160} /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Amount" err={errors.amount}><Input type="number" min={0} step="0.01" value={form.amount} onChange={(e)=>setForm({...form, amount: e.target.value})} /></F>
            <F label="Currency"><Input value={form.currency} onChange={(e)=>setForm({...form, currency: e.target.value.toUpperCase()})} maxLength={3} /></F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Stage">
              <Select value={form.stage_id ?? "none"} onValueChange={(v) => {
                const st = stages.find((s) => s.id === v);
                setForm({ ...form, stage_id: v === "none" ? null : v, probability: st?.probability ?? Number(form.probability) });
              }}>
                <SelectTrigger><SelectValue placeholder="Stage" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
            <F label="Probability %"><Input type="number" min={0} max={100} value={form.probability} onChange={(e)=>setForm({...form, probability: e.target.value})} /></F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Contact">
              <Select value={form.contact_id ?? "none"} onValueChange={(v) => setForm({ ...form, contact_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Contact" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {contacts.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
            <F label="Company">
              <Select value={form.company_id ?? "none"} onValueChange={(v) => setForm({ ...form, company_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Company" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {companies.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Expected close"><Input type="date" value={form.expected_close_date} onChange={(e)=>setForm({...form, expected_close_date: e.target.value})} /></F>
            <F label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">open</SelectItem>
                  <SelectItem value="won">won</SelectItem>
                  <SelectItem value="lost">lost</SelectItem>
                </SelectContent>
              </Select>
            </F>
          </div>
          <F label="Description"><Textarea rows={3} value={form.description} onChange={(e)=>setForm({...form, description: e.target.value})} maxLength={5000} /></F>
          <SheetFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={m.isPending}>Cancel</Button>
            <Button type="submit" disabled={m.isPending}>{m.isPending ? "Saving…" : "Save"}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type DealForm = {
  title: string;
  amount: number | string;
  currency: string;
  stage_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  expected_close_date: string;
  probability: number | string;
  status: Status;
  description: string;
};

function init(d: Deal | null, stages: Stage[]): DealForm {
  return {
    title: d?.title ?? "",
    amount: (d?.amount ?? 0) as number | string,
    currency: d?.currency ?? "USD",
    stage_id: d?.stage_id ?? stages[0]?.id ?? null,
    contact_id: d?.contact_id ?? null,
    company_id: d?.company_id ?? null,
    expected_close_date: d?.expected_close_date ?? "",
    probability: (d?.probability ?? stages[0]?.probability ?? 0) as number | string,
    status: (d?.status ?? "open") as Status,
    description: d?.description ?? "",
  };
}

function F({ label, err, children }: { label: string; err?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
      {children}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
