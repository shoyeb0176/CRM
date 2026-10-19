import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicForm, submitPublicForm } from "@/lib/forms/forms.functions";
import { Button } from "@/components/ui/button";

import { friendlyError } from "@/lib/friendly-error";
export const Route = createFileRoute("/f/$slug")({
  head: () => ({
    meta: [
      { title: "Form — Inuberry" },
      { name: "description", content: "Fill in this form and the team will get straight back to you." },
      { property: "og:title", content: "Form — Inuberry" },
      { property: "og:description", content: "Fill in this form and the team will get straight back to you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicForm,
});

function PublicForm() {
  const { slug } = Route.useParams();
  const load = useServerFn(getPublicForm);
  const submit = useServerFn(submitPublicForm);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const form = useQuery({
    queryKey: ["public-form", slug],
    queryFn: () => load({ data: { slug } }),
  });

  if (form.isLoading) return <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>;
  if (!form.data) return <div className="p-12 text-center text-sm text-muted-foreground">This form is not available.</div>;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await submit({ data: { slug, values } });
      setDone(res.message);
    } catch (err) {
      setError(friendlyError(err, "Something went wrong."));
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="mb-3 font-display text-3xl uppercase tracking-tight">{form.data.name}</h1>
      {form.data.description && <p className="mb-8 text-muted-foreground">{form.data.description}</p>}

      {done ? (
        <div className="border border-border p-8 text-center bg-card shadow-sm">
          <div className="mb-2 font-mono text-xs uppercase tracking-widest text-primary">Received</div>
          <p className="text-muted-foreground">{done}</p>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
          {form.data.fields.map((f) => (
            <div key={f.key}>
              <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {f.label}{f.required ? " *" : ""}
              </label>
              {f.type === "long_text" ? (
                <textarea
                  rows={4}
                  required={f.required}
                  value={String(values[f.key] ?? "")}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  className="w-full border border-input bg-card shadow-xs px-3 py-2 text-sm"
                />
              ) : f.type === "select" ? (
                <select
                  required={f.required}
                  value={String(values[f.key] ?? "")}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  className="w-full border border-input bg-card shadow-xs px-3 py-2 text-sm"
                >
                  <option value="">Choose…</option>
                  {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={Boolean(values[f.key])}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.checked })}
                />
              ) : (
                <input
                  type={f.type === "email" ? "email" : f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  required={f.required}
                  value={String(values[f.key] ?? "")}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  className="w-full border border-input bg-card shadow-xs px-3 py-2 text-sm"
                />
              )}
            </div>
          ))}
          {error && <div className="text-sm text-destructive">{error}</div>}
          <Button variant="kitSolid" size="kit"
            type="submit"
            disabled={sending}
            className="px-5 py-2"
          >
            {sending ? "Sending…" : "Submit"}
          </Button>
        </form>
      )}
    </main>
  );
}
