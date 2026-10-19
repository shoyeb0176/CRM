// Printable pay slips for a pay run: one page per employee, or just one with ?employee=<id>.
// Reads go through row-level security, so only owners, admins and HR managers see anything.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, fmtMoney } from "@/lib/hr/use-hr";
import type { PayRunLine } from "@/lib/payroll/runs";

export const Route = createFileRoute("/print/payslips/$runId")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ employee: typeof s.employee === "string" ? s.employee : undefined }),
  head: () => ({ meta: [{ title: "Pay slips — Inuberry" }] }),
  component: PaySlips,
});

type Line = PayRunLine & { employee: { first_name: string; last_name: string; preferred_name: string | null; employee_number: string | null } | null };

function PaySlips() {
  const { runId } = Route.useParams();
  const { employee } = Route.useSearch();
  const q = useQuery({
    queryKey: ["payslips", runId, employee],
    queryFn: async () => {
      const { data: run, error } = await supabase.from("pay_runs").select("*").eq("id", runId).maybeSingle();
      if (error) throw error;
      if (!run) return null;
      let lq = supabase.from("pay_run_lines").select("*, employee:employees(first_name, last_name, preferred_name, employee_number)").eq("pay_run_id", runId);
      if (employee) lq = lq.eq("employee_id", employee);
      const [lines, org] = await Promise.all([
        lq, supabase.from("organizations").select("name, address, logo_url").eq("id", run.org_id).maybeSingle(),
      ]);
      if (lines.error) throw lines.error;
      return { run, lines: (lines.data ?? []) as Line[], org: org.data };
    },
  });

  useEffect(() => {
    if (q.data) document.title = `Pay slips ${q.data.run.pay_date}${q.data.org?.name ? ` — ${q.data.org.name}` : ""}`;
  }, [q.data]);

  if (q.isLoading) return <div className="p-10 text-sm text-neutral-500">Loading…</div>;
  if (q.error) return <div className="p-10 text-sm text-red-600">{(q.error as Error).message}</div>;
  if (!q.data) return <div className="p-10 text-sm text-neutral-600">Pay run not found, or you don't have access to it. Sign in as an owner, admin or HR manager.</div>;

  const { run, lines, org } = q.data;
  const m = (n: number | string) => fmtMoney(Number(n), run.currency);

  return (
    <div className="min-h-screen bg-neutral-100 py-8 text-neutral-900 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 14mm; } @media print { html, body { background: #fff !important; } }`}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end px-4 print:hidden">
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-700">
          <Printer className="size-4" /> Print / Save as PDF
        </button>
      </div>
      {lines.map((l) => {
        const e = l.employee;
        const deductions = [
          ["Federal income tax", l.federal_tax], ["Social Security", l.social_security], ["Medicare", l.medicare],
          ["State income tax", l.state_tax], ["401(k)", l.retirement], ["Health insurance", l.health],
        ].filter(([, v]) => Number(v) > 0) as [string, number][];
        return (
          <article key={l.id} className="mx-auto mb-6 max-w-[210mm] break-after-page bg-white p-10 shadow-sm print:mb-0 print:max-w-none print:p-0 print:shadow-none">
            <header className="flex items-start justify-between gap-6 border-b border-neutral-200 pb-5">
              <div className="text-sm">
                {org?.logo_url && <img src={org.logo_url} alt="" className="mb-2 max-h-12 max-w-[160px] object-contain" />}
                <div className="text-lg font-semibold">{org?.name}</div>
                {org?.address && <div className="whitespace-pre-line text-neutral-600">{org.address}</div>}
              </div>
              <div className="text-right text-sm">
                <div className="text-2xl font-semibold uppercase tracking-wide">Pay slip</div>
                <div className="text-neutral-600">Period {fmtDate(run.period_start)} – {fmtDate(run.period_end)}</div>
                <div className="text-neutral-600">Paid {fmtDate(run.pay_date)}</div>
              </div>
            </header>
            <div className="mt-5 text-sm">
              <div className="font-semibold">{e ? `${e.preferred_name || e.first_name} ${e.last_name}` : "Former employee"}</div>
              {e?.employee_number && <div className="text-neutral-600">Employee no. {e.employee_number}</div>}
            </div>
            <table className="mt-6 w-full text-sm">
              <tbody>
                <tr className="border-b border-neutral-200"><td className="py-2">Gross pay{l.hours != null ? ` (${l.hours} hours)` : ""}</td><td className="py-2 text-right tabular-nums">{m(l.gross)}</td></tr>
                {deductions.map(([label, v]) => (
                  <tr key={label} className="border-b border-neutral-100 text-neutral-700"><td className="py-1.5 pl-4">{label}</td><td className="py-1.5 text-right tabular-nums">−{m(v)}</td></tr>
                ))}
                <tr className="text-base font-semibold"><td className="pt-3">Net pay</td><td className="pt-3 text-right tabular-nums">{m(l.net)}</td></tr>
              </tbody>
            </table>
            <p className="mt-8 text-xs text-neutral-500">
              Your employer also paid {m(Number(l.employer_social_security) + Number(l.employer_medicare) + Number(l.futa))} in
              Social Security, Medicare and federal unemployment tax for this period.
            </p>
          </article>
        );
      })}
    </div>
  );
}
