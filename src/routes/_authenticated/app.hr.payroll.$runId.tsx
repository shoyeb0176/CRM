import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Check, Printer, RefreshCw, Trash2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { HrShell } from "@/components/hr/hr-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { StatusBadge } from "@/components/crm/status-badge";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDelete } from "@/components/crm/confirm-delete";
import { fmtDate, fmtMoney, useHrAccess, useOrgId } from "@/lib/hr/use-hr";
import { RUN_STATUS, employeeTaxes, employerTaxes, type PayRun, type PayRunLine } from "@/lib/payroll/runs";
import { useServerFn } from "@tanstack/react-start";
import { recalcPayRunLines } from "@/lib/payroll/payroll.functions";

export const Route = createFileRoute("/_authenticated/app/hr/payroll/$runId")({
  head: () => ({ meta: [{ title: "Pay run — HR" }] }),
  component: PayRunPage,
});

type Line = PayRunLine & { employee: { first_name: string; last_name: string; preferred_name: string | null } | null };

function PayRunPage() {
  const { runId } = Route.useParams();
  const orgId = useOrgId();
  const hr = useHrAccess();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["pay-run", runId], enabled: hr,
    queryFn: async () => {
      const [run, lines] = await Promise.all([
        supabase.from("pay_runs").select("*").eq("id", runId).maybeSingle(),
        supabase.from("pay_run_lines").select("*, employee:employees(first_name, last_name, preferred_name)").eq("pay_run_id", runId),
      ]);
      if (run.error) throw run.error;
      if (lines.error) throw lines.error;
      const sorted = ((lines.data ?? []) as Line[]).sort((a, b) => name(a).localeCompare(name(b)));
      return { run: run.data as PayRun | null, lines: sorted };
    },
  });
  const run = q.data?.run;
  const draft = run?.status === "draft";

  // Lines are recalculated on the server from each employee's profile and pay so far this year.
  const recalc = useServerFn(recalcPayRunLines);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["pay-run", runId] }); qc.invalidateQueries({ queryKey: ["pay-runs"] }); };

  const update = useMutation({
    mutationFn: async ({ line, change }: { line: Line; change: { hours?: number; gross?: number } }) => {
      await recalc({ data: { orgId: orgId!, runId, lineId: line.id, change } });
    },
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  const recalcAll = useMutation({
    mutationFn: async () => { await recalc({ data: { orgId: orgId!, runId } }); },
    onSuccess: () => { toast.success("Recalculated from the latest payroll details"); refresh(); },
    onError: (e) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc("approve_pay_run", { _id: runId }); if (error) throw error; },
    onSuccess: () => { toast.success("Approved and recorded in Accounting"); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const paid = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc("mark_pay_run_paid", { _id: runId }); if (error) throw error; },
    onSuccess: () => { toast.success("Marked paid"); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("pay_runs").delete().eq("id", runId); if (error) throw error; },
    onSuccess: () => { toast.success("Draft deleted"); qc.invalidateQueries({ queryKey: ["pay-runs"] }); navigate({ to: "/app/hr/payroll" }); },
    onError: (e) => toast.error(e.message),
  });

  if (!hr) return <HrShell title="Pay run" breadcrumb="HR / Payroll"><EmptyState title="HR only" description="Pay runs are visible to owners, admins and HR managers." /></HrShell>;
  if (q.isLoading) return <HrShell title="Pay run" breadcrumb="HR / Payroll"><div className="text-sm text-muted-foreground">Loading…</div></HrShell>;
  if (!run) return <HrShell title="Pay run" breadcrumb="HR / Payroll"><EmptyState title="Pay run not found" description="It may have been deleted." /></HrShell>;

  const lines = q.data!.lines;
  const ccy = run.currency;
  const total = (f: (l: Line) => number) => lines.reduce((s, l) => s + f(l), 0);
  const money = (n: number) => fmtMoney(n, ccy);
  const status = RUN_STATUS[run.status];

  return (
    <HrShell
      title={`Pay run ${fmtDate(run.period_start)} – ${fmtDate(run.period_end)}`}
      breadcrumb="HR / Payroll"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild><Link to="/app/hr/payroll"><ArrowLeft className="mr-1 size-3.5" /> All runs</Link></Button>
          <Button size="sm" variant="outline" asChild>
            <a href={`/print/payslips/${run.id}`} target="_blank" rel="noreferrer"><Printer className="mr-1 size-3.5" /> Pay slips</a>
          </Button>
          {draft && <Button size="sm" variant="outline" onClick={() => recalcAll.mutate()} disabled={recalcAll.isPending}><RefreshCw className="mr-1 size-3.5" /> Recalculate</Button>}
          {draft && (
            <ConfirmDelete title="Delete this draft?" description="The pay run and its lines are removed. Nothing was recorded in Accounting yet."
              confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate()}
              trigger={<Button size="sm" variant="outline"><Trash2 className="mr-1 size-3.5" /> Delete</Button>} />
          )}
          {draft && (
            <ConfirmDelete destructive={false} title="Approve this pay run?" description={`Locks the lines and records ${money(total((l) => Number(l.gross)))} of wages and the taxes owed in Accounting.`}
              confirmLabel="Approve" onConfirm={() => approve.mutate()}
              trigger={<Button size="sm" disabled={approve.isPending || !lines.length}><Check className="mr-1 size-3.5" /> Approve</Button>} />
          )}
          {run.status === "approved" && (
            <ConfirmDelete destructive={false} title="Mark as paid?" description={`Records ${money(total((l) => Number(l.net)))} of net pay leaving your cash account. Only do this once the money has actually been sent.`}
              confirmLabel="Mark paid" onConfirm={() => paid.mutate()}
              trigger={<Button size="sm" disabled={paid.isPending}><Wallet className="mr-1 size-3.5" /> Mark paid</Button>} />
          )}
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <StatusBadge tone={status?.tone}>{status?.label ?? run.status}</StatusBadge>
        <span>Pay date {fmtDate(run.pay_date)}</span>
        {run.journal_entry_id && <Link className="text-primary hover:underline" to="/app/accounting/journal/$entryId" params={{ entryId: run.journal_entry_id }}>Payroll journal entry</Link>}
        {run.payment_entry_id && <Link className="text-primary hover:underline" to="/app/accounting/journal/$entryId" params={{ entryId: run.payment_entry_id }}>Payment journal entry</Link>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiTile label="Gross pay" value={money(total((l) => Number(l.gross)))} />
        <KpiTile label="Employee taxes" value={money(total(employeeTaxes))} />
        <KpiTile label="Deductions" value={money(total((l) => Number(l.retirement) + Number(l.health)))} hint="401(k) and health" />
        <KpiTile label="Net pay" value={money(total((l) => Number(l.net)))} />
        <KpiTile className="col-span-2 lg:col-span-1" label="Employer taxes" value={money(total(employerTaxes))} hint="Social Security, Medicare, FUTA" />
      </div>

      {draft && <p className="mb-3 text-sm text-muted-foreground">Change hours or gross pay and press Enter; taxes are worked out again. Salaried staff have no hours.</p>}
      <DataTable<Line>
        data={lines}
        empty={<EmptyState title="No lines" description="No active employee had payroll details when this run was drafted." />}
        columns={[
          { key: "who", header: "Employee", cell: (l) => <Link className="hover:underline" to="/app/hr/employees/$employeeId" params={{ employeeId: l.employee_id }}>{name(l)}</Link> },
          { key: "hours", header: "Hours", className: "w-24", cell: (l) => draft && l.hours != null
            ? <NumberCell value={Number(l.hours)} label={`Hours for ${name(l)}`} onSave={(hours) => update.mutate({ line: l, change: { hours } })} />
            : <span className="tabular-nums">{l.hours ?? "—"}</span> },
          { key: "gross", header: "Gross", className: "w-36 text-right", cell: (l) => draft
            ? <NumberCell value={Number(l.gross)} label={`Gross pay for ${name(l)}`} onSave={(gross) => update.mutate({ line: l, change: { gross } })} />
            : <span className="tabular-nums">{money(Number(l.gross))}</span> },
          { key: "fed", header: "Federal", className: "text-right tabular-nums", cell: (l) => money(Number(l.federal_tax)) },
          { key: "fica", header: "SS + Medicare", className: "text-right tabular-nums", cell: (l) => money(Number(l.social_security) + Number(l.medicare)) },
          { key: "state", header: "State", className: "text-right tabular-nums", cell: (l) => money(Number(l.state_tax)) },
          { key: "ded", header: "Deductions", className: "text-right tabular-nums", cell: (l) => money(Number(l.retirement) + Number(l.health)) },
          { key: "net", header: "Net pay", className: "text-right font-semibold tabular-nums", cell: (l) => money(Number(l.net)) },
          { key: "slip", header: "", className: "text-right", cell: (l) => (
            <a className="text-xs text-primary hover:underline" href={`/print/payslips/${run.id}?employee=${l.employee_id}`} target="_blank" rel="noreferrer">Slip</a>
          ) },
        ]}
      />
      <p className="mt-4 text-xs text-muted-foreground">
        Federal withholding uses the IRS Publication 15-T 2026 percentage method for 2020-or-later W-4s. Check every run before
        you approve it. Inuberry doesn't file 941 or W-2 forms, pay tax deposits or send direct deposits.
      </p>
    </HrShell>
  );
}

function name(l: Line) {
  const e = l.employee;
  return e ? `${e.preferred_name || e.first_name} ${e.last_name}` : "Former employee";
}

function NumberCell({ value, label, onSave }: { value: number; label: string; onSave: (n: number) => void }) {
  const save = (el: HTMLInputElement) => {
    const n = Number(el.value);
    if (el.value === "" || !Number.isFinite(n) || n < 0) { el.value = String(value); return; }
    if (n !== value) onSave(n);
  };
  return (
    <Input key={value} type="number" min={0} step="0.01" defaultValue={value} aria-label={label}
      className="h-8 min-w-28 text-right tabular-nums"
      onKeyDown={(e) => { if (e.key === "Enter") save(e.currentTarget); }}
      onBlur={(e) => save(e.currentTarget)} />
  );
}
