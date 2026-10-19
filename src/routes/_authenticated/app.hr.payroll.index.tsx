import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { HrShell } from "@/components/hr/hr-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { StatusBadge } from "@/components/crm/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDate, fmtMoney, useHrAccess, useOrgId } from "@/lib/hr/use-hr";
import { useOpenOnNew } from "@/lib/use-focus-row";
import { FREQUENCIES, RUN_STATUS as STATUS } from "@/lib/payroll/runs";
import { useServerFn } from "@tanstack/react-start";
import { createPayRun } from "@/lib/payroll/payroll.functions";
import type { PayFrequency } from "@/lib/payroll/us";

export const Route = createFileRoute("/_authenticated/app/hr/payroll/")({
  head: () => ({ meta: [{ title: "Payroll — HR" }] }),
  component: PayrollPage,
});

type RunRow = { id: string; period_start: string; period_end: string; pay_date: string; status: string; currency: string; lines: { gross: number; net: number }[] };

function PayrollPage() {
  const orgId = useOrgId();
  const hr = useHrAccess();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  useOpenOnNew(() => setOpen(true), hr);

  const runs = useQuery({
    queryKey: ["pay-runs", orgId], enabled: !!orgId && hr,
    queryFn: async () => {
      const { data, error } = await supabase.from("pay_runs")
        .select("id, period_start, period_end, pay_date, status, currency, lines:pay_run_lines(gross, net)")
        .eq("org_id", orgId!).order("pay_date", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as RunRow[];
    },
  });

  const sum = (r: RunRow, k: "gross" | "net") => r.lines.reduce((s, l) => s + Number(l[k]), 0);

  return (
    <HrShell title="Payroll" breadcrumb="HR / Payroll"
      actions={hr && <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 size-3.5" /> New pay run</Button>}>
      {!hr ? (
        <EmptyState title="HR only" description="Pay runs are visible to owners, admins and HR managers." />
      ) : (
        <>
          <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
            Work out US pay for a period: federal income tax (IRS 2026 tables), Social Security, Medicare, FUTA and a flat
            state rate. Approving records the cost in Accounting; marking paid records the payment. Inuberry doesn't file
            tax returns (941, W-2), send direct deposits or use state tax tables.
          </p>
          <DataTable<RunRow>
            data={runs.data} loading={runs.isLoading}
            onRowClick={(r) => navigate({ to: "/app/hr/payroll/$runId", params: { runId: r.id } })}
            empty={<EmptyState title="No pay runs yet" description="Add payroll details on each employee's page, then start a pay run."
              action={<Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 size-3.5" /> New pay run</Button>} />}
            columns={[
              { key: "period", header: "Period", cell: (r) => `${fmtDate(r.period_start)} – ${fmtDate(r.period_end)}` },
              { key: "pay", header: "Pay date", cell: (r) => fmtDate(r.pay_date) },
              { key: "people", header: "Employees", cell: (r) => r.lines.length, className: "tabular-nums" },
              { key: "gross", header: "Gross", cell: (r) => fmtMoney(sum(r, "gross"), r.currency), className: "text-right tabular-nums" },
              { key: "net", header: "Net pay", cell: (r) => fmtMoney(sum(r, "net"), r.currency), className: "text-right tabular-nums" },
              { key: "status", header: "Status", cell: (r) => <StatusBadge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label ?? r.status}</StatusBadge> },
            ]}
          />
        </>
      )}
      {orgId && <NewRunDialog orgId={orgId} open={open} onOpenChange={setOpen} onCreated={(id) => navigate({ to: "/app/hr/payroll/$runId", params: { runId: id } })} />}
    </HrShell>
  );
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

function NewRunDialog({ orgId, open, onOpenChange, onCreated }: { orgId: string; open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const [frequency, setFrequency] = useState<PayFrequency>("biweekly");
  const [start, setStart] = useState(() => addDays(iso(new Date()), -13));
  const [end, setEnd] = useState(() => iso(new Date()));
  const [payDate, setPayDate] = useState(() => addDays(iso(new Date()), 2));

  const createRun = useServerFn(createPayRun);
  const create = useMutation({
    mutationFn: async () => {
      // Worked out and saved on the server (lib/payroll/payroll.functions.ts).
      const { id } = await createRun({ data: { orgId, start, end, payDate, frequency } });
      return id;
    },
    onSuccess: (id) => { onOpenChange(false); toast.success("Pay run drafted. Check the lines, then approve."); onCreated(id); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New pay run</DialogTitle>
          <DialogDescription>Every active employee with payroll details gets a line. You can change hours and pay before approving.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">How often</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as PayFrequency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label htmlFor="pr-start" className="text-xs">Period start</Label><Input id="pr-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label htmlFor="pr-end" className="text-xs">Period end</Label><Input id="pr-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <div><Label htmlFor="pr-pay" className="text-xs">Pay date</Label><Input id="pr-pay" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !start || !end || !payDate || end < start}>
            {create.isPending ? "Working it out…" : "Draft pay run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
