import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import { useAdminContext } from "@/lib/settings/use-admin";
import { useDatabases, useFields } from "@/lib/databases/use-databases";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FileUp, Upload } from "lucide-react";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { Button } from "@/components/ui/button";
import { ConnectorSource, type LoadedTable } from "@/components/import/connector-source";
import { readNotionZip, type ImportTable } from "@/lib/import/connectors";
import {
  IMPORT_TARGETS,
  coerce,
  downloadCsv,
  guessColumn,
  parseCsv,
  validateRow,
  type ImportField,
} from "@/lib/import/csv";

import { friendlyError } from "@/lib/friendly-error";
import { SectionTitle } from "@/components/ui/section-title";
export const Route = createFileRoute("/_authenticated/app/import")({
  head: () => ({
    meta: [
      { title: "Import data — Inuberry" },
      { name: "description", content: "Bring companies, contacts, leads, products or documents in from a CSV file, a Notion export, or straight from Notion or Airtable." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { target?: string } =>
    typeof s.target === "string" && IMPORT_TARGETS.some((t) => t.key === s.target) ? { target: s.target } : {},
  component: ImportPage,
});

function ImportPage() {
  const { orgId, isAdmin } = useAdminContext();
  const qc = useQueryClient();
  const databases = useDatabases();

  const [via, setVia] = useState<"file" | "notion" | "airtable">("file");
  const [fileName, setFileName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("csv");
  // A Notion export can hold several databases; the one being imported is chosen from these.
  const [zipTables, setZipTables] = useState<ImportTable[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [targetKey, setTargetKey] = useState(Route.useSearch().target ?? "companies");
  const [databaseId, setDatabaseId] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [rowErrors, setRowErrors] = useState<string[]>([]);

  const dbFields = useFields(targetKey === "custom_database" ? databaseId || undefined : undefined);
  const target = IMPORT_TARGETS.find((t) => t.key === targetKey)!;

  const fields: ImportField[] = useMemo(() => {
    if (targetKey !== "custom_database") return target.fields;
    return (dbFields.data ?? []).map((f) => ({
      key: f.key,
      label: f.label,
      type:
        f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : f.field_type === "checkbox" ? "boolean" : "text",
    }));
  }, [targetKey, target, dbFields.data]);

  const history = useQuery({
    queryKey: ["import-runs", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_runs")
        .select("id,target,file_name,total_rows,imported_rows,failed_rows,created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  function showTable(t: LoadedTable) {
    setHeaders(t.headers);
    setRows(t.rows);
    setFileName(t.name);
    setSource(t.source);
    setRowErrors([]);
    setMapping(Object.fromEntries(fields.map((f) => [f.key, guessColumn(t.headers, f)])));
  }

  async function onFile(f: File) {
    setFile(f);
    setZipTables([]);
    try {
      if (/\.zip$/i.test(f.name)) {
        const tables = await readNotionZip(f);
        if (!tables.length) throw new Error("No CSV or Markdown files in this zip. In Notion, export as Markdown & CSV.");
        setZipTables(tables);
        showTable({ ...tables[0], name: `${f.name}: ${tables[0].name}`, source: "notion_export" });
      } else {
        showTable({ ...parseCsv(await f.text()), name: f.name, source: "csv" });
      }
    } catch (e) {
      clearFile();
      toast.error(friendlyError(e, "Couldn't read that file"));
    }
  }

  function clearFile() {
    setFile(null);
    setZipTables([]);
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setRowErrors([]);
  }

  // A new target (or a database's fields arriving) keeps the columns already matched and guesses the rest.
  useEffect(() => {
    if (!headers.length) return;
    setMapping((m) => Object.fromEntries(fields.map((f) => [f.key, m[f.key] ?? guessColumn(headers, f)])));
  }, [fields, headers]);

  function autoMap() {
    setMapping(Object.fromEntries(fields.map((f) => [f.key, guessColumn(headers, f)])));
  }

  async function runImport() {
    if (!orgId || !rows.length) return;
    const required = fields.filter((f) => f.required);
    for (const f of required) {
      if (!mapping[f.key]) {
        toast.error(`Choose which column holds "${f.label}"`);
        return;
      }
    }
    if (targetKey === "custom_database" && !databaseId) {
      toast.error("Choose which database to import into");
      return;
    }

    setRunning(true);
    setRowErrors([]);
    const errors: string[] = [];
    let imported = 0;

    try {
      // 1. Map + validate every row; keep only valid ones.
      const valid: { rowNo: number; record: Record<string, unknown> }[] = [];
      rows.forEach((row, i) => {
        const rowNo = i + 2; // header is row 1
        const record: Record<string, unknown> = {};
        for (const f of fields) {
          const col = mapping[f.key];
          if (!col) continue;
          const idx = headers.indexOf(col);
          if (idx < 0) continue;
          const value = coerce(row[idx] ?? "", f.type);
          if (value !== null) record[f.key] = value;
        }
        const problems = validateRow(record, fields);
        if (problems.length) errors.push(`Row ${rowNo}: ${problems.join(", ")}`);
        else if (Object.keys(record).length) valid.push({ rowNo, record });
        else errors.push(`Row ${rowNo}: empty`);
      });

      // 2. Contacts: link "Company" to an existing company by name (any case), creating missing ones.
      const companyIds = new Map<string, string>();
      if (targetKey === "contacts") {
        const byKey = new Map<string, string>();
        for (const v of valid) {
          const n = String(v.record.company ?? "").trim();
          if (n && !byKey.has(n.toLowerCase())) byKey.set(n.toLowerCase(), n);
        }
        if (byKey.size) {
          for (let from = 0; ; from += 1000) {
            const { data: page } = await supabase.from("companies").select("id,name").eq("org_id", orgId).order("id").range(from, from + 999);
            for (const c of page ?? []) companyIds.set(c.name.trim().toLowerCase(), c.id);
            if (!page || page.length < 1000) break;
          }
          const missing = [...byKey].filter(([k]) => !companyIds.has(k)).map(([, n]) => n);
          if (missing.length) {
            const { data: created, error } = await supabase
              .from("companies").insert(missing.map((name) => ({ org_id: orgId, name }))).select("id,name");
            if (error) errors.push(`Companies: ${error.message}`);
            for (const c of created ?? []) companyIds.set(c.name.trim().toLowerCase(), c.id);
          }
        }
      }

      // 3. Insert in batches.
      for (let i = 0; i < valid.length; i += 100) {
        const batch = valid.slice(i, i + 100);
        const values = batch.map(({ record }) => {
          if (targetKey === "custom_database") return { org_id: orgId, database_id: databaseId, data: record };
          const r: Record<string, unknown> = { ...record, org_id: orgId };
          if (targetKey === "leads") r.source = record.source ?? "import";
          if (targetKey === "knowledge") r.source = source;
          if (targetKey === "contacts") {
            const name = String(record.company ?? "").trim().toLowerCase();
            delete r.company;
            if (name && companyIds.has(name)) r.company_id = companyIds.get(name);
          }
          return r;
        });
        const { error } = await supabase.from(target.table as "companies").insert(values as never);
        if (!error) {
          imported += values.length;
          continue;
        }
        // One bad row fails the whole batch: retry them one by one so only the bad ones are skipped.
        for (let k = 0; k < values.length; k++) {
          const { error: rowErr } = await supabase.from(target.table as "companies").insert(values[k] as never);
          if (rowErr) errors.push(`Row ${batch[k].rowNo}: ${rowErr.message}`);
          else imported++;
        }
      }

      await supabase.from("import_runs").insert({
        org_id: orgId,
        target: targetKey,
        source,
        target_database_id: targetKey === "custom_database" ? databaseId : null,
        file_name: fileName,
        total_rows: rows.length,
        imported_rows: imported,
        failed_rows: rows.length - imported,
        errors: errors.slice(0, 200),
      });

      setRowErrors(errors);
      qc.invalidateQueries();
      if (errors.length) toast.error(`${imported} of ${rows.length} rows imported — ${errors.length} problem${errors.length === 1 ? "" : "s"} listed below`);
      else toast.success(`${imported} rows imported`);
      history.refetch();
    } finally {
      setRunning(false);
    }
  }

  return (
    <AppShell title="Import data" breadcrumb="import">
      <div className="mb-6 border border-border bg-card shadow-sm p-6">
        <div className="mb-3 flex items-center gap-2">
          <FileUp className="size-4" />
          <SectionTitle>1 · Choose a file</SectionTitle>
        </div>
        <div role="tablist" aria-label="Import from" className="mb-4 flex flex-wrap gap-2">
          {([["file", "A file"], ["notion", "Notion"], ["airtable", "Airtable"]] as const).map(([k, label]) => (
            <Button key={k} role="tab" aria-selected={via === k} size="sm" variant={via === k ? "default" : "outline"} onClick={() => setVia(k)}>
              {label}
            </Button>
          ))}
        </div>
        {via === "file" ? (
          <>
            <FileDropzone
              accept=".csv,text/csv,.zip,application/zip"
              onFiles={([f]) => onFile(f)}
              files={file ? [file] : []}
              onRemove={clearFile}
              fileNote={() => `${rows.length} row${rows.length === 1 ? "" : "s"}, ${headers.length} column${headers.length === 1 ? "" : "s"}`}
              hint="A CSV file, or a Notion export (.zip, exported as Markdown & CSV) to bring page text along."
            />
            {zipTables.length > 1 && (
              <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">This export has {zipTables.length} tables. Import:</span>
                <select
                  className="border border-input bg-card shadow-xs px-3 py-2 text-sm"
                  value={fileName}
                  onChange={(e) => {
                    const t = zipTables.find((z) => `${file?.name}: ${z.name}` === e.target.value);
                    if (t) showTable({ ...t, name: e.target.value, source: "notion_export" });
                  }}
                >
                  {zipTables.map((z) => (
                    <option key={z.name} value={`${file?.name}: ${z.name}`}>{z.name} ({z.rows.length} rows)</option>
                  ))}
                </select>
              </label>
            )}
          </>
        ) : orgId ? (
          <>
            <ConnectorSource key={via} provider={via} orgId={orgId} isAdmin={isAdmin} onLoaded={(t) => { setFile(null); setZipTables([]); showTable(t); }} />
            {headers.length > 0 && source === via && (
              <p className="mt-3 text-sm">Loaded <b>{fileName}</b>: {rows.length} rows, {headers.length} columns.</p>
            )}
          </>
        ) : null}
      </div>

      <div className="mb-6 border border-border bg-card shadow-sm p-6">
        <SectionTitle className="mb-3">2 · Where should it go?</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <select
            className="border border-input bg-card shadow-xs px-3 py-2 text-sm"
            value={targetKey}
            onChange={(e) => setTargetKey(e.target.value)}
          >
            {IMPORT_TARGETS.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          {targetKey === "custom_database" && (
            <select
              className="border border-input bg-card shadow-xs px-3 py-2 text-sm"
              value={databaseId}
              onChange={(e) => setDatabaseId(e.target.value)}
            >
              <option value="">Choose a database…</option>
              {(databases.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
          <Button variant="bare" size="bare" className="border border-border px-3 py-2 text-xs hover:bg-foreground/5" onClick={autoMap} disabled={!headers.length}>
            Match columns automatically
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{target.description}</p>
      </div>

      {headers.length > 0 && fields.length > 0 && (
        <div className="mb-6 border border-border bg-card shadow-sm p-6">
          <SectionTitle className="mb-3">3 · Match the columns</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((f) => (
              <label key={f.key} className="flex items-center gap-3 text-sm">
                <span className="w-36 shrink-0 text-muted-foreground">
                  {f.label}
                  {f.required && <span className="text-destructive"> *</span>}
                </span>
                <select
                  className="flex-1 border border-input bg-card shadow-xs px-2 py-1.5 text-sm"
                  value={mapping[f.key] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
                >
                  <option value="">— skip —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-6 overflow-x-auto border border-border bg-card shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {fields.map((f) => (
                    <th key={f.key} className="p-2 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {fields.map((f) => {
                      const idx = headers.indexOf(mapping[f.key] ?? "");
                      return <td key={f.key} className="p-2">{idx >= 0 ? row[idx] : "—"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button variant="kit" size="kit"
            className="mt-4 flex px-4 py-2"
            onClick={runImport}
            disabled={running}
          >
            <Upload className="size-3" /> {running ? "Importing…" : `Import ${rows.length} rows`}
          </Button>
          {rowErrors.length > 0 && (
            <div role="alert" className="mt-4 border border-destructive/40 bg-destructive/10 p-3 text-xs">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs uppercase tracking-widest text-destructive">
                  {rowErrors.length} row{rowErrors.length === 1 ? "" : "s"} skipped
                </span>
                <Button size="sm" variant="ghost" onClick={() => downloadCsv("import-problems.csv", ["Problem"], rowErrors.map((e) => [e]))}>
                  <Download aria-hidden /> Download the list
                </Button>
              </div>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                {rowErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="border border-border bg-card shadow-sm p-6">
        <SectionTitle className="mb-3">Recent imports</SectionTitle>
        {(history.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Nothing imported yet.</div>
        ) : (
          <div className="space-y-px border border-border bg-border">
            {(history.data ?? []).map((h) => (
              <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 bg-background p-3 text-sm">
                <span>{h.file_name ?? "CSV"} → {h.target}</span>
                <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  {h.imported_rows}/{h.total_rows} rows · {new Date(h.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
