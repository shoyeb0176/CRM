import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SalesShell, fmtMoney } from "@/components/sales/sales-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { useOrgId } from "@/lib/crm/use-org";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/sales/payments")({
  head: () => ({ meta: [{ title: "Payments — Sales" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const orgId = useOrgId();
  const payments = useQuery({
    queryKey: ["payments", orgId], enabled: !!orgId,
    queryFn: async () => ((await supabase.from("payments")
      .select("id, amount, currency, payment_date, reference, invoices:invoice_id(id, number, contact_id, company_id, companies:company_id(name)), payment_methods:payment_method_id(name)")
      .eq("org_id", orgId!).order("payment_date", { ascending: false }).limit(500)).data ?? []),
  });

  return (
    <SalesShell title="Payments" breadcrumb="sales / payments">
      <DataTable
        loading={payments.isLoading}
        data={payments.data}
        columns={[
          { key: "date", header: "Date", cell: (p) => <span className="font-mono text-xs">{new Date(p.payment_date).toLocaleDateString()}</span> },
          { key: "invoice", header: "Invoice", cell: (p) => p.invoices
            ? <Link to="/app/invoices/$invoiceId" params={{ invoiceId: p.invoices.id }} className="font-mono text-xs text-primary hover:underline">{p.invoices.number}</Link>
            : <span className="text-muted-foreground">—</span> },
          { key: "customer", header: "Customer", cell: (p) => p.invoices?.companies?.name ?? <span className="text-muted-foreground">—</span> },
          { key: "method", header: "Method", cell: (p) => p.payment_methods?.name ?? <span className="text-muted-foreground">—</span> },
          { key: "ref", header: "Ref", cell: (p) => <span className="font-mono text-xs">{p.reference ?? "—"}</span> },
          { key: "amount", header: "Amount", cell: (p) => <span className="font-mono">{fmtMoney(p.amount, p.currency)}</span> },
        ]}
        empty={<EmptyState title="No payments yet" description="Record payments from an invoice's detail page." action={<Button asChild variant="outline"><Link to="/app/invoices">Go to invoices</Link></Button>} />}
      />
    </SalesShell>
  );
}
