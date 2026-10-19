import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FIELD_TYPE_LABELS, useDatabase, useDatabaseMutations, useFields, useRecords, useViews,
  type CustomField, type CustomRecord, type FieldType,
} from "@/lib/databases/use-databases";
import { ArrowLeft, Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/databases/$databaseId")({
  head: () => ({ meta: [{ title: "Database — Inuberry" }] }),
  component: DatabaseDetail,
});

function DatabaseDetail() {
  const { databaseId } = Route.useParams();
  const navigate = useNavigate();
  const db = useDatabase(databaseId);
  const fields = useFields(databaseId);
  const records = useRecords(databaseId);
  const views = useViews(databaseId);
  const m = useDatabaseMutations(databaseId);

  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [showFields, setShowFields] = useState(false);
  const [newField, setNewField] = useState<{ label: string; type: FieldType; options: string }>({
    label: "", type: "text", options: "",
  });

  useEffect(() => {
    if (!activeViewId && views.data?.length) setActiveViewId(views.data[0].id);
  }, [views.data, activeViewId]);

  const activeView = views.data?.find((v) => v.id === activeViewId) ?? views.data?.[0];
  const selectFields = (fields.data ?? []).filter((f) => f.field_type === "select");

  async function addField() {
    if (!newField.label.trim()) return;
    try {
      await m.addField.mutateAsync({
        label: newField.label,
        fieldType: newField.type,
        options: newField.options.split(",").map((s) => s.trim()).filter(Boolean),
        takenKeys: (fields.data ?? []).map((f) => f.key),
        sortOrder: fields.data?.length ?? 0,
      });
      setNewField({ label: "", type: "text", options: "" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function removeDatabase() {
    await m.deleteDatabase.mutateAsync(databaseId);
    toast.success("Database archived");
    navigate({ to: "/app/databases" });
  }

  const loading = db.isLoading || fields.isLoading || records.isLoading;

  return (
    <AppShell title={db.data?.name ?? "Database"} breadcrumb="databases">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link to="/app/databases" className="flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> All databases
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="kit" size="kit"
            onClick={() => setShowFields((v) => !v)}
            className="flex gap-1 px-2 py-1 hover:bg-accent"
          >
            <Settings2 className="size-3" /> Fields
          </Button>
          <Button variant="bare" size="bare" onClick={removeDatabase} className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-destructive">
            Archive
          </Button>
        </div>
      </div>

      {/* VIEW TABS */}
      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-border">
        {(views.data ?? []).map((v) => (
          <Button variant="bare" size="bare"
            key={v.id}
            onClick={() => setActiveViewId(v.id)}
            className={`-mb-px border-b-2 px-3 py-2 font-mono text-xs uppercase tracking-widest ${
              activeView?.id === v.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {v.name}
          </Button>
        ))}
        {selectFields.length > 0 && (
          <Button variant="bare" size="bare"
            onClick={() =>
              m.addView.mutate({
                name: `Board · ${selectFields[0].label}`,
                viewType: "board",
                groupBy: selectFields[0].key,
                sortOrder: views.data?.length ?? 0,
              })
            }
            className="ml-2 flex items-center gap-1 font-mono text-xs uppercase text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3" /> Board view
          </Button>
        )}
      </div>

      {showFields && (
        <div className="mb-6 border border-border bg-card shadow-sm p-4">
          <div className="mb-3 space-y-1">
            {(fields.data ?? []).map((f) => (
              <div key={f.id} className="flex items-center justify-between border-b border-border/60 py-1 text-sm">
                <span>
                  {f.label}{" "}
                  <span className="font-mono text-xs uppercase text-muted-foreground">{FIELD_TYPE_LABELS[f.field_type]}</span>
                </span>
                <Button variant="bare" size="bare" onClick={() => m.deleteField.mutate(f.id)} aria-label={`Delete ${f.label}`} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newField.label}
              onChange={(e) => setNewField({ ...newField, label: e.target.value })}
              placeholder="Field name"
              className="w-40 border border-input bg-card shadow-xs px-2 py-1 text-sm outline-none focus:border-primary"
            />
            <select
              value={newField.type}
              onChange={(e) => setNewField({ ...newField, type: e.target.value as FieldType })}
              className="border border-input bg-card shadow-xs px-2 py-1 text-sm"
            >
              {Object.entries(FIELD_TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            {newField.type === "select" && (
              <input
                value={newField.options}
                onChange={(e) => setNewField({ ...newField, options: e.target.value })}
                placeholder="Options, comma separated"
                className="w-56 border border-input bg-card shadow-xs px-2 py-1 text-sm outline-none focus:border-primary"
              />
            )}
            <Button variant="kit" size="kit" onClick={addField} className="px-2 py-1 hover:bg-accent">
              Add field
            </Button>
          </div>
        </div>
      )}

      {loading && <Skeleton className="h-40 w-full" />}

      {!loading && activeView?.view_type === "board" && activeView.group_by ? (
        <BoardView
          groupBy={activeView.group_by}
          fields={fields.data ?? []}
          records={records.data ?? []}
          onUpdate={(id, key, value) => m.setRecordField.mutate({ id, key, value })}
          onAdd={(value) => m.addRecord.mutate({ [activeView.group_by!]: value })}
        />
      ) : !loading ? (
        <TableView
          fields={fields.data ?? []}
          records={records.data ?? []}
          onUpdate={(id, key, value) => m.setRecordField.mutate({ id, key, value })}
          onDelete={(id) => m.deleteRecord.mutate(id)}
          onAdd={() => m.addRecord.mutate({})}
        />
      ) : null}
    </AppShell>
  );
}

function Cell({
  field, value, onChange,
}: {
  field: CustomField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [local, setLocal] = useState(value == null ? "" : String(value));
  useEffect(() => { setLocal(value == null ? "" : String(value)); }, [value]);

  if (field.field_type === "checkbox") {
    return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (field.field_type === "select") {
    return (
      <select
        value={local}
        onChange={(e) => { setLocal(e.target.value); onChange(e.target.value); }}
        className="w-full border-none bg-transparent text-sm outline-none"
      >
        <option value="">—</option>
        {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  const type = field.field_type === "number" ? "number"
    : field.field_type === "date" ? "date"
    : field.field_type === "email" ? "email"
    : field.field_type === "url" ? "url"
    : "text";
  return (
    <input
      type={type}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== (value == null ? "" : String(value))) onChange(field.field_type === "number" ? (local === "" ? null : Number(local)) : local); }}
      className="w-full border-none bg-transparent text-sm outline-none"
    />
  );
}

function TableView({
  fields, records, onUpdate, onDelete, onAdd,
}: {
  fields: CustomField[];
  records: CustomRecord[];
  onUpdate: (id: string, key: string, value: unknown) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="overflow-x-auto border border-border bg-card shadow-sm">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {fields.map((f) => (
              <th key={f.id} className="px-3 py-2 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {f.label}
              </th>
            ))}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b border-border/60 hover:bg-muted/20">
              {fields.map((f) => (
                <td key={f.id} className="px-3 py-1">
                  <Cell
                    field={f}
                    value={r.data[f.key]}
                    onChange={(v) => onUpdate(r.id, f.key, v)}
                  />
                </td>
              ))}
              <td className="px-2">
                <Button variant="bare" size="bare" onClick={() => onDelete(r.id)} aria-label="Delete row" className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3" />
                </Button>
              </td>
            </tr>
          ))}
          {records.length === 0 && (
            <tr>
              <td colSpan={fields.length + 1} className="px-3 py-6 text-center text-sm text-muted-foreground">
                No rows yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <Button variant="bare" size="bare"
        onClick={onAdd}
        className="flex w-full items-center gap-1 border-t border-border px-3 py-2 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Plus className="size-3" /> New row
      </Button>
    </div>
  );
}

function BoardView({
  groupBy, fields, records, onUpdate, onAdd,
}: {
  groupBy: string;
  fields: CustomField[];
  records: CustomRecord[];
  onUpdate: (id: string, key: string, value: unknown) => void;
  onAdd: (value: string) => void;
}) {
  const groupField = fields.find((f) => f.key === groupBy);
  const titleField = fields[0];
  const columns = useMemo(() => {
    const opts = groupField?.options ?? [];
    const extra = [...new Set(records.map((r) => String(r.data[groupBy] ?? "")))].filter((v) => v && !opts.includes(v));
    return [...opts, ...extra, ""];
  }, [groupField, records, groupBy]);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((col) => {
        const items = records.filter((r) => String(r.data[groupBy] ?? "") === col);
        return (
          <div key={col || "none"} className="w-64 shrink-0 border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{col || "No value"}</span>
              <span className="font-mono text-xs text-muted-foreground">{items.length}</span>
            </div>
            <div className="space-y-2 p-2">
              {items.map((r) => (
                <div key={r.id} className="border border-border bg-card shadow-sm p-2">
                  <div className="text-sm">{String(r.data[titleField?.key ?? "name"] ?? "Untitled")}</div>
                  {groupField && (
                    <select
                      value={String(r.data[groupBy] ?? "")}
                      onChange={(e) => onUpdate(r.id, groupBy, e.target.value)}
                      className="mt-1 w-full border border-input bg-card shadow-xs px-1 py-0.5 font-mono text-xs uppercase"
                    >
                      <option value="">No value</option>
                      {groupField.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                </div>
              ))}
              <Button variant="bare" size="bare"
                onClick={() => onAdd(col)}
                className="flex w-full items-center gap-1 px-1 py-1 font-mono text-xs uppercase text-muted-foreground hover:text-foreground"
              >
                <Plus className="size-3" /> Add
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
