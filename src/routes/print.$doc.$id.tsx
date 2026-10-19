// Print view for quotes and invoices. "Download PDF" opens this page and the browser's
// print dialog saves it as a PDF. Reads go through RLS, so org members and the customer's
// portal users see the same document and nobody else sees anything.
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney } from "@/components/sales/sales-shell";
import { fmtDate } from "@/lib/portal/use-portal";
import { Printer } from "lucide-react";
import { useEffect } from "react";

type Doc = "quote" | "invoice";

export const Route = createFileRoute("/print/$doc/$id")({
  ssr: false,
  beforeLoad: ({ params }) => {
    if (params.doc !== "quote" && params.doc !== "invoice") throw notFound();
  },
  head: () => ({ meta: [{ title: "Print — Inuberry" }] }),
  component: PrintDoc,
});

type Line = { id: string; description: string; quantity: number; unit_price: number; discount_pct: number; tax_rate: number; line_total: number };

function PrintDoc() {
  const { doc, id } = Route.useParams() as { doc: Doc; id: string };
  const q = useQuery({
    queryKey: ["print", doc, id],
    queryFn: async () => {
      const table = doc === "quote" ? "quotes" : "invoices";
      const { data: d, error } = await supabase
        .from(table)
        .select("*, contacts:contact_id(first_name, last_name, email), companies:company_id(name, address, city, country)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!d) return null;
      const [{ data: lines }, { data: org }] = await Promise.all([
        doc === "quote"
          ? supabase.from("quote_items").select("*").eq("quote_id", id).order("position")
          : supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position"),
        supabase.from("organizations").select("name, logo_url, address, email, phone, website, tax_id").eq("id", d.org_id).maybeSingle(),
      ]);
      return { d: d as Record<string, any>, lines: (lines ?? []) as Line[], org };
    },
  });

  // The browser uses the page title as the PDF file name.
  const number = q.data?.d.number as string | undefined;
  const orgName = q.data?.org?.name;
  useEffect(() => {
    if (number) document.title = [number, orgName].filter(Boolean).join(" — ");
  }, [number, orgName]);

  if (q.isLoading) return <div className="p-10 text-sm text-neutral-500">Loading…</div>;
  if (q.error) return <div className="p-10 text-sm text-red-600">{(q.error as Error).message}</div>;
  if (!q.data) return <div className="p-10 text-sm text-neutral-600">Document not found, or you don't have access to it. Sign in and try again.</div>;

  const { d, lines, org } = q.data;
  const ccy = d.currency ?? "USD";
  const title = doc === "quote" ? "Quote" : "Invoice";
  const contact = d.contacts ? [d.contacts.first_name, d.contacts.last_name].filter(Boolean).join(" ") : "";
  const company = d.companies;

  return (
    <div className="min-h-screen bg-neutral-100 py-8 text-neutral-900 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 14mm; } @media print { html, body { background: #fff !important; } }`}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 px-4 print:hidden">
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-700">
          <Printer className="size-4" /> Print / Save as PDF
        </button>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white p-10 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-neutral-200 pb-6">
          <div className="space-y-1 text-sm">
            {org?.logo_url && <img src={org.logo_url} alt="" className="mb-2 max-h-14 max-w-[180px] object-contain" />}
            <div className="text-lg font-semibold">{org?.name}</div>
            {org?.address && <div className="whitespace-pre-line text-neutral-600">{org.address}</div>}
            <div className="text-neutral-600">{[org?.email, org?.phone, org?.website].filter(Boolean).join(" · ")}</div>
            {org?.tax_id && <div className="text-neutral-600">Tax ID {org.tax_id}</div>}
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold uppercase tracking-wide">{title}</div>
            <div className="mt-1 font-mono text-sm">{d.number}</div>
            {(d.status === "draft" || d.status === "void") && (
              <div className="mt-2 inline-block border border-neutral-400 px-2 py-0.5 text-xs uppercase tracking-widest text-neutral-600">{d.status}</div>
            )}
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 py-6 text-sm">
          <div>
            <div className="mb-1 text-xs uppercase tracking-widest text-neutral-500">{doc === "quote" ? "Prepared for" : "Bill to"}</div>
            {company?.name && <div className="font-medium">{company.name}</div>}
            {contact && <div>{contact}</div>}
            {d.contacts?.email && <div className="text-neutral-600">{d.contacts.email}</div>}
            {company?.address && <div className="whitespace-pre-line text-neutral-600">{company.address}</div>}
            {(company?.city || company?.country) && <div className="text-neutral-600">{[company.city, company.country].filter(Boolean).join(", ")}</div>}
            {!company?.name && !contact && <div className="text-neutral-500">—</div>}
          </div>
          <dl className="grid grid-cols-[auto_auto] justify-end gap-x-6 gap-y-1">
            <dt className="text-neutral-500">Issue date</dt><dd className="text-right">{fmtDate(d.issue_date)}</dd>
            {doc === "quote"
              ? <><dt className="text-neutral-500">Valid until</dt><dd className="text-right">{fmtDate(d.expiry_date)}</dd></>
              : <><dt className="text-neutral-500">Due date</dt><dd className="text-right">{fmtDate(d.due_date)}</dd></>}
            {doc === "invoice" && <><dt className="text-neutral-500">Balance due</dt><dd className="text-right font-semibold">{fmtMoney(d.balance_due, ccy)}</dd></>}
          </dl>
        </section>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-neutral-300 text-left text-xs uppercase tracking-widest text-neutral-500">
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 pr-2 text-right">Unit price</th>
              <th className="py-2 pr-2 text-right">Disc.</th>
              <th className="py-2 pr-2 text-right">Tax</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-neutral-500">No line items</td></tr>}
            {lines.map((l) => (
              <tr key={l.id} className="break-inside-avoid border-b border-neutral-100 align-top">
                <td className="py-2 pr-2 whitespace-pre-line">{l.description}</td>
                <td className="py-2 pr-2 text-right font-mono">{Number(l.quantity)}</td>
                <td className="py-2 pr-2 text-right font-mono">{fmtMoney(l.unit_price, ccy)}</td>
                <td className="py-2 pr-2 text-right font-mono">{Number(l.discount_pct) ? `${Number(l.discount_pct)}%` : "—"}</td>
                <td className="py-2 pr-2 text-right font-mono">{Number(l.tax_rate) ? `${Number(l.tax_rate)}%` : "—"}</td>
                <td className="py-2 text-right font-mono">{fmtMoney(l.line_total, ccy)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-4 ml-auto w-64 space-y-1 text-sm break-inside-avoid">
          <Total label="Subtotal" v={fmtMoney(d.subtotal, ccy)} />
          {Number(d.discount_total) > 0 && <Total label="Discount" v={`− ${fmtMoney(d.discount_total, ccy)}`} />}
          <Total label="Tax" v={fmtMoney(d.tax_total, ccy)} />
          <Total label="Total" v={fmtMoney(d.total, ccy)} bold />
          {doc === "invoice" && <>
            <Total label="Paid" v={fmtMoney(d.amount_paid, ccy)} />
            <Total label="Balance due" v={fmtMoney(d.balance_due, ccy)} bold />
          </>}
        </section>

        {(d.notes || d.terms) && (
          <footer className="mt-8 space-y-4 border-t border-neutral-200 pt-4 text-sm break-inside-avoid">
            {d.notes && <div><div className="mb-1 text-xs uppercase tracking-widest text-neutral-500">Notes</div><p className="whitespace-pre-line">{d.notes}</p></div>}
            {d.terms && <div><div className="mb-1 text-xs uppercase tracking-widest text-neutral-500">Terms</div><p className="whitespace-pre-line">{d.terms}</p></div>}
          </footer>
        )}
      </article>
    </div>
  );
}

function Total({ label, v, bold }: { label: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? "border-t border-neutral-300 pt-1 font-semibold" : ""}`}>
      <span className="text-neutral-500">{label}</span><span className="font-mono">{v}</span>
    </div>
  );
}
