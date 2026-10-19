import { createFileRoute, Link } from "@tanstack/react-router";
import { ReportsShell, ReportCard } from "@/components/reports/reports-shell";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/reports/accounting")({
  head: () => ({ meta: [{ title: "Accounting reports — Inuberry" }] }),
  component: AccountingReportsPage,
});

const LINKS = [
  { to: "/app/accounting/pnl", title: "Profit and Loss", blurb: "Revenue, cost of goods sold, expenses, gross profit and net income for a date range." },
  { to: "/app/accounting/trial", title: "Trial Balance", blurb: "Account totals showing posted debits and credits to verify the ledger balances." },
  { to: "/app/accounting/ledger", title: "General Ledger", blurb: "Transaction history per account with a running balance." },
  { to: "/app/accounting/balance", title: "Balance Sheet", blurb: "Assets, liabilities and equity snapshot with the accounting-equation check." },
];

function AccountingReportsPage() {
  return (
    <ReportsShell title="Accounting reports" breadcrumb="reports / accounting">
      <p className="mb-6 text-sm text-muted-foreground">
        Financial reports are powered by the posted journal entries in the accounting module. Open any report below.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="group block">
            <ReportCard title={l.title} action={<ArrowRight className="size-4 text-muted-foreground group-hover:text-foreground" />}>
              <p className="text-sm text-muted-foreground">{l.blurb}</p>
            </ReportCard>
          </Link>
        ))}
      </div>
    </ReportsShell>
  );
}
