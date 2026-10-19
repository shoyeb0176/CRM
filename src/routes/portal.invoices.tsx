import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell, PortalCard, EmptyState } from "@/components/portal/portal-shell";
import { usePortalIdentity, fmtMoney, fmtDate } from "@/lib/portal/use-portal";

export const Route = createFileRoute("/portal/invoices")({
  ssr: false,
  head: () => ({ meta: [{ title: "Invoices — Customer Portal" }] }),
  component: PortalInvoices,
});

function PortalInvoices() {
  const id = usePortalIdentity().data;
  const q = useQuery({
    enabled: !!id?.company_id,
    queryKey: ["portal-invoices", id?.org_id, id?.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id,number,status,issue_date,due_date,total,amount_paid,balance_due,currency")
        .eq("org_id", id!.org_id).eq("company_id", id!.company_id!)
        .order("issue_date", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <PortalShell title="Invoices" breadcrumb="Portal / Invoices">
      <PortalCard title="Your invoices">
        {q.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
         !q.data?.length ? <EmptyState compact title="No invoices yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-3">Number</th>
                  <th className="py-2 pr-3">Issue</th>
                  <th className="py-2 pr-3">Due</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3 text-right">Balance</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map(i => (
                  <tr key={i.id} className="border-b border-border/50">
                    <td className="py-3 pr-3 font-medium">{i.number ?? "—"}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{fmtDate(i.issue_date)}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{fmtDate(i.due_date)}</td>
                    <td className="py-3 pr-3 uppercase text-xs text-muted-foreground">{i.status}</td>
                    <td className="py-3 pr-3 text-right font-mono">{fmtMoney(i.total, i.currency ?? "USD")}</td>
                    <td className="py-3 pr-3 text-right font-mono">{fmtMoney(i.balance_due, i.currency ?? "USD")}</td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <a
                          href={`/print/invoice/${i.id}`} target="_blank" rel="noopener"
                          className="border border-border px-2 py-1 font-mono text-xs uppercase tracking-wider hover:bg-accent"
                        >PDF</a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PortalCard>
    </PortalShell>
  );
}
