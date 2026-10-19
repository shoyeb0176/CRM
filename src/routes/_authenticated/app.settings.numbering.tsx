import { createFileRoute } from "@tanstack/react-router";
import { SettingsShell } from "@/components/settings/settings-shell";
import { useAdminContext, logAudit } from "@/lib/settings/use-admin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";

type DocType = Database["public"]["Enums"]["doc_type"];

const DOC_LABELS: Record<DocType, { title: string; defaultPrefix: string; example: string }> = {
  quote:          { title: "Quotes",          defaultPrefix: "QTE-", example: "QTE-000001" },
  sales_order:    { title: "Sales Orders",    defaultPrefix: "SO-",  example: "SO-000001"  },
  invoice:        { title: "Invoices",        defaultPrefix: "INV-", example: "INV-000001" },
  purchase_order: { title: "Purchase Orders", defaultPrefix: "PO-",  example: "PO-000001"  },
  vendor_bill:    { title: "Vendor Bills",    defaultPrefix: "VB-",  example: "VB-000001"  },
  expense:        { title: "Expenses",        defaultPrefix: "EXP-", example: "EXP-000001" },
  journal:        { title: "Journal Entries", defaultPrefix: "JE-",  example: "JE-000001"  },
};

const VISIBLE: DocType[] = ["quote", "sales_order", "invoice", "purchase_order", "vendor_bill"];

export const Route = createFileRoute("/_authenticated/app/settings/numbering")({
  head: () => ({ meta: [{ title: "Numbering — Settings" }] }),
  component: NumberingPage,
});

type Row = { id?: string; doc_type: DocType; prefix: string; padding: number; next_value: number };

function NumberingPage() {
  const { orgId, isAdmin } = useAdminContext();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);

  const seq = useQuery({
    queryKey: ["numbering", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("invoice_number_sequences").select("*").eq("org_id", orgId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!seq.data) return;
    const byType = new Map(seq.data.map((r) => [r.doc_type as DocType, r]));
    setRows(VISIBLE.map((d) => {
      const r = byType.get(d);
      return r
        ? { id: r.id, doc_type: d, prefix: r.prefix, padding: r.padding, next_value: Number(r.next_value) }
        : { doc_type: d, prefix: DOC_LABELS[d].defaultPrefix, padding: 6, next_value: 1 };
    }));
  }, [seq.data]);

  async function save() {
    if (!orgId) return;
    // All document types at once instead of one request after another.
    const results = await Promise.all(rows.map((r) => {
      const payload = { org_id: orgId, doc_type: r.doc_type, prefix: r.prefix, padding: r.padding, next_value: r.next_value };
      return (r.id
        ? supabase.from("invoice_number_sequences").update(payload).eq("id", r.id)
        : supabase.from("invoice_number_sequences").insert(payload)).then(({ error }) => ({ r, error }));
    }));
    const failed = results.find((x) => x.error);
    if (failed) { toast.error(`${failed.r.doc_type}: ${failed.error!.message}`); return; }
    toast.success("Numbering saved");
    logAudit({ orgId, action: "numbering.update", entityType: "invoice_number_sequences", newValues: rows });
    qc.invalidateQueries({ queryKey: ["numbering"] });
  }

  function update(i: number, patch: Partial<Row>) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <SettingsShell title="Numbering" breadcrumb="settings · numbering">
      <div className="mb-6">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Document sequences</div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Configure the prefix, zero-padding and next number for each document type. Existing numbers are not renumbered.
        </p>
      </div>

      <div className="overflow-x-auto border border-border bg-card shadow-sm [&>*]:min-w-[836px]">
        <div className="grid grid-cols-[1.2fr_1fr_120px_140px_1.2fr] gap-4 border-b border-border bg-muted px-4 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <div>Document</div><div>Prefix</div><div>Padding</div><div>Next number</div><div>Preview</div>
        </div>
        {rows.map((r, i) => {
          const preview = r.prefix + String(r.next_value).padStart(r.padding, "0");
          return (
            <div key={r.doc_type} className="grid grid-cols-[1.2fr_1fr_120px_140px_1.2fr] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
              <div className="text-sm font-semibold">{DOC_LABELS[r.doc_type].title}</div>
              <input value={r.prefix} disabled={!isAdmin} onChange={(e) => update(i, { prefix: e.target.value })}
                className="border border-input bg-card shadow-xs px-3 py-1.5 font-mono text-sm uppercase tracking-wider focus:border-foreground focus:outline-none" />
              <input type="number" min={1} max={12} value={r.padding} disabled={!isAdmin}
                onChange={(e) => update(i, { padding: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })}
                className="border border-input bg-card shadow-xs px-3 py-1.5 font-mono text-sm focus:border-foreground focus:outline-none" />
              <input type="number" min={1} value={r.next_value} disabled={!isAdmin}
                onChange={(e) => update(i, { next_value: Math.max(1, Number(e.target.value) || 1) })}
                className="border border-input bg-card shadow-xs px-3 py-1.5 font-mono text-sm focus:border-foreground focus:outline-none" />
              <div className="font-mono text-sm font-semibold tracking-wider">{preview}</div>
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <div className="mt-6 flex justify-end">
          <Button variant="kitSolid" size="kit" onClick={save} className="bg-primary px-5 py-2.5 text-primary-foreground hover:opacity-90">
            <Save className="size-3.5" /> Save numbering
          </Button>
        </div>
      )}
    </SettingsShell>
  );
}
