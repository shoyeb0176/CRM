import { AppShell } from "@/components/app/app-shell";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Plus } from "lucide-react";
import { FORM_TEMPLATES, useFormMutations, useForms } from "@/lib/forms/use-forms";

import { friendlyError } from "@/lib/friendly-error";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/_authenticated/app/forms/")({
  head: () => ({
    meta: [
      { title: "Forms — Inuberry" },
      { name: "description", content: "Build shareable forms that turn responses into leads or database records." },
      { property: "og:title", content: "Forms — Inuberry" },
      { property: "og:description", content: "Shareable forms that feed straight into your workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FormsPage,
});

function FormsIndex() {
  const navigate = useNavigate();
  const { data: forms, isLoading } = useForms();
  const { create } = useFormMutations();
  const [name, setName] = useState("");

  const start = async (templateId: string) => {
    const tpl = FORM_TEMPLATES.find((t) => t.id === templateId)!;
    try {
      const id = await create.mutateAsync({ name: name.trim() || tpl.label, target: tpl.target, fields: tpl.fields });
      setName("");
      void navigate({ to: "/app/forms/$formId", params: { formId: id } });
    } catch (e) {
      toast.error(friendlyError(e, "Could not create form"));
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
        <ClipboardList className="size-4" /> Forms
      </div>
      <h1 className="mb-6 font-display text-3xl uppercase tracking-tight">Forms</h1>

      <section className="mb-8 border border-border p-4 bg-card shadow-sm">
        <div className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">New form</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Form name (optional)"
          className="mb-3 w-full max-w-md border border-input bg-card shadow-xs px-3 py-2 text-sm"
        />
        <div className="grid gap-3 md:grid-cols-3">
          {FORM_TEMPLATES.map((t) => (
            <Button variant="bare" size="bare"
              key={t.id}
              onClick={() => void start(t.id)}
              disabled={create.isPending}
              className="border border-border p-3 text-left transition-colors hover:border-primary disabled:opacity-50"
            >
              <div className="flex items-center gap-2 text-sm font-medium"><Plus className="size-3" /> {t.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t.description}</div>
            </Button>
          ))}
        </div>
      </section>

      <section className="border border-border">
        <div className="border-b border-border p-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">Your forms</div>
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : !forms?.length ? (
          <div className="p-6 text-sm text-muted-foreground">No forms yet. Pick a starting point above.</div>
        ) : (
          <div className="divide-y divide-border">
            {forms.map((f) => (
              <Link key={f.id} to="/app/forms/$formId" params={{ formId: f.id }} className="block p-4 hover:bg-muted/40">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{f.name}</span>
                  {f.is_published ? (
                    <span className="bg-primary/10 px-1.5 py-0.5 font-mono text-xs uppercase text-primary">Live</span>
                  ) : (
                    <span className="bg-muted px-1.5 py-0.5 font-mono text-xs uppercase text-muted-foreground">Draft</span>
                  )}
                </div>
                <div className="mt-1 font-mono text-xs uppercase text-muted-foreground">
                  /f/{f.slug} · {f.fields?.length ?? 0} question(s)
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FormsPage() {
  return (
    <AppShell title="Forms" breadcrumb="forms">
      <FormsIndex />
    </AppShell>
  );
}
