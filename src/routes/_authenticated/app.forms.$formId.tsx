import { AppShell } from "@/components/app/app-shell";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Plus, Trash2 } from "lucide-react";
import { FORM_TARGETS, useForm, useFormMutations, useFormSubmissions, type FormRow } from "@/lib/forms/use-forms";
import type { FormFieldDef, FormFieldType } from "@/lib/forms/forms.functions";
import { useDatabases } from "@/lib/databases/use-databases";
import { Button } from "@/components/ui/button";

import { friendlyError } from "@/lib/friendly-error";
export const Route = createFileRoute("/_authenticated/app/forms/$formId")({
  head: () => ({
    meta: [
      { title: "Edit form — Inuberry" },
      { name: "description", content: "Edit questions, publish your form and review responses." },
      { property: "og:title", content: "Edit form — Inuberry" },
      { property: "og:description", content: "Edit questions, publish and review responses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FormEditorPage,
});

const TYPES: FormFieldType[] = ["text", "long_text", "email", "number", "date", "select", "checkbox"];

function FormEditor() {
  const { formId } = Route.useParams();
  const navigate = useNavigate();
  const { data: form, isLoading } = useForm(formId);
  const { data: submissions } = useFormSubmissions(formId);
  const { data: databases } = useDatabases();
  const { update, remove } = useFormMutations();

  const savingRef = useRef(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState<FormRow["target"]>("lead");
  const [databaseId, setDatabaseId] = useState<string>("");
  const [fields, setFields] = useState<FormFieldDef[]>([]);

  useEffect(() => {
    if (!form) return;
    setName(form.name);
    setDescription(form.description ?? "");
    setTarget(form.target);
    setDatabaseId(form.target_database_id ?? "");
    setFields(form.fields ?? []);
  }, [form]);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!form) return <div className="p-6 text-sm text-muted-foreground">Form not found.</div>;

  const save = async (patch?: Record<string, unknown>, quiet = false) => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
    await update.mutateAsync({
      id: formId,
      patch: {
        name,
        description: description || null,
        target,
        target_database_id: target === "custom_database" && databaseId ? databaseId : null,
        fields,
        ...patch,
      },
    });
    if (!quiet) toast.success("Saved", { id: "save-toast" });
    } catch (e) {
      toast.error(friendlyError(e, "Could not save"), { id: "save-toast" });
    } finally {
      savingRef.current = false;
    }
  };

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/f/${form.slug}` : `/f/${form.slug}`;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-[240px] flex-1 border-b border-border bg-transparent pb-1 font-display text-2xl uppercase tracking-tight outline-none focus:border-primary"
        />
        <label className="flex items-center gap-2 font-mono text-xs uppercase">
          <input type="checkbox" checked={form.is_published} onChange={(e) => void save({ is_published: e.target.checked })} />
          Published
        </label>
        <Button variant="kit" size="kit" onClick={(e) => { e.preventDefault(); void save(); }}
          disabled={update.isPending} className="px-3 py-1.5 hover:border-primary">Save</Button>
        <Button variant="kit" size="kit"
          onClick={async () => {
            await remove.mutateAsync(formId);
            void navigate({ to: "/app/forms" });
          }}
          className="px-3 py-1.5 text-destructive hover:border-destructive"
        >
          Delete
        </Button>
      </div>

      <div className="mb-6 flex items-center gap-2 border border-border p-3 text-xs bg-card shadow-sm">
        <span className="font-mono uppercase text-muted-foreground">Share link</span>
        <span className="truncate">{publicUrl}</span>
        <Button variant="kit" size="kit"
          onClick={() => {
            void navigator.clipboard.writeText(publicUrl);
            toast.success("Link copied");
          }}
          className="ml-auto flex gap-1 px-2 py-1 hover:border-primary"
        >
          <Copy className="size-3" /> Copy
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <section className="border border-border p-4 bg-card shadow-sm">
            <div className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Intro</div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Shown above the questions"
              className="w-full border border-input bg-card shadow-xs px-2 py-1 text-sm"
            />
          </section>

          <section className="border border-border p-4 bg-card shadow-sm">
            <div className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">What happens on submit</div>
            <select value={target} onChange={(e) => setTarget(e.target.value as FormRow["target"])} className="border border-input bg-card shadow-xs px-3 py-2 text-sm">
              {FORM_TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <div className="mt-2 text-xs text-muted-foreground">{FORM_TARGETS.find((t) => t.value === target)?.hint}</div>
            {target === "custom_database" && (
              <select value={databaseId} onChange={(e) => setDatabaseId(e.target.value)} className="mt-3 border border-input bg-card shadow-xs px-3 py-2 text-sm">
                <option value="">Choose a database…</option>
                {(databases ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
          </section>

          <section className="border border-border p-4 bg-card shadow-sm">
            <div className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Questions</div>
            <div className="space-y-2">
              {fields.map((f, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 border border-border p-2 bg-card shadow-sm">
                  <input
                    value={f.label}
                    onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    placeholder="Question"
                    className="min-w-[160px] flex-1 border border-input bg-card shadow-xs px-2 py-1 text-xs"
                  />
                  <select
                    value={f.type}
                    onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, type: e.target.value as FormFieldType } : x)))}
                    className="border border-input bg-card shadow-xs px-2 py-1 text-xs"
                  >
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {f.type === "select" && (
                    <input
                      value={(f.options ?? []).join(", ")}
                      onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : x)))}
                      placeholder="Option A, Option B"
                      className="border border-input bg-card shadow-xs px-2 py-1 text-xs"
                    />
                  )}
                  <label className="flex items-center gap-1 font-mono text-xs uppercase">
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))}
                    />
                    Required
                  </label>
                  <Button variant="bare" size="bare" aria-label="Remove field" onClick={() => setFields(fields.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
              {!fields.length && <div className="text-xs text-muted-foreground">No questions yet.</div>}
            </div>
            <Button variant="kit" size="kit"
              onClick={() =>
                setFields([...fields, { key: `field_${fields.length + 1}`, label: "New question", type: "text", required: false }])
              }
              className="mt-3 flex gap-1 px-2 py-1 hover:border-primary"
            >
              <Plus className="size-3" /> Add question
            </Button>
          </section>
        </div>

        <section className="h-fit border border-border">
          <div className="border-b border-border p-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Responses ({submissions?.length ?? 0})
          </div>
          {!submissions?.length ? (
            <div className="p-4 text-sm text-muted-foreground">No responses yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {submissions.map((s) => (
                <div key={s.id} className="p-3 text-xs">
                  <div className="mb-1 font-mono text-xs uppercase text-muted-foreground">
                    {new Date(s.created_at).toLocaleString()}
                  </div>
                  {Object.entries(s.data).map(([k, v]) => (
                    <div key={k}><span className="text-muted-foreground">{fields.find((f) => f.key === k)?.label ?? k}:</span> {String(v)}</div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function FormEditorPage() {
  return (
    <AppShell title="Form" breadcrumb="forms / form">
      <FormEditor />
    </AppShell>
  );
}
