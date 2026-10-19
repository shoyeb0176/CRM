import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import { useAdminContext } from "@/lib/settings/use-admin";
import { useKnowledgeDoc, useKnowledgeMutations } from "@/lib/knowledge/use-knowledge";
import { summariseKnowledgeDoc } from "@/lib/knowledge/knowledge.functions";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Save, Sparkles, Trash2 } from "lucide-react";

import { friendlyError } from "@/lib/friendly-error";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/_authenticated/app/knowledge/$docId")({
  head: () => ({
    meta: [
      { title: "Document — Knowledge" },
      { name: "description", content: "Edit a knowledge base document." },
    ],
  }),
  component: DocPage,
});

function DocPage() {
  const { docId } = Route.useParams();
  const { orgId } = useAdminContext();
  const navigate = useNavigate();
  const doc = useKnowledgeDoc(docId);
  const { update, remove } = useKnowledgeMutations(orgId ?? undefined);
  const summarise = useServerFn(summariseKnowledgeDoc);

  const [title, setTitle] = useState("");
  const [collection, setCollection] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!doc.data) return;
    setTitle(doc.data.title);
    setCollection(doc.data.collection);
    setContent(doc.data.content ?? "");
  }, [doc.data]);

  if (doc.isLoading) return <AppShell title="Knowledge" breadcrumb="knowledge"><div className="p-6 text-sm text-muted-foreground">Loading…</div></AppShell>;
  if (!doc.data) return <AppShell title="Knowledge" breadcrumb="knowledge"><div className="p-6 text-sm text-muted-foreground">This document no longer exists.</div></AppShell>;

  return (
    <AppShell title={doc.data.title} breadcrumb="knowledge / document">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link to="/app/knowledge" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> All documents
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={doc.data.is_published}
              onChange={(e) => update.mutate({ id: docId, is_published: e.target.checked })}
            />
            Published
          </label>
          <Button variant="bare" size="bare"
            className="flex items-center gap-1 border border-border px-3 py-1.5 text-xs hover:bg-foreground/5 disabled:opacity-50"
            disabled={busy || !orgId}
            onClick={async () => {
              if (!orgId) return;
              setBusy(true);
              try {
                await summarise({ data: { orgId, docId } });
                await doc.refetch();
                toast.success("Summary written");
              } catch (e) {
                toast.error(friendlyError(e, "Could not summarise"));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Sparkles className="size-3" /> Summarise
          </Button>
          <Button variant="bare" size="bare"
            className="flex items-center gap-1 border border-border px-3 py-1.5 text-xs hover:bg-foreground/5"
            onClick={async () => {
              await update.mutateAsync({ id: docId, title, collection, content });
              toast.success("Saved");
            }}
          >
            <Save className="size-3" /> Save
          </Button>
          <Button variant="bare" size="bare" aria-label="Delete document"
            className="border border-border p-1.5 text-destructive hover:bg-destructive/10"
            onClick={async () => {
              await remove.mutateAsync(docId);
              navigate({ to: "/app/knowledge" });
            }}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      {doc.data.summary && (
        <div className="mb-4 border border-border bg-muted/20 p-4 text-sm">
          <div className="mb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">Summary</div>
          {doc.data.summary}
        </div>
      )}

      <div className="space-y-3 border border-border bg-card shadow-sm p-6">
        <input
          className="w-full border border-input bg-card shadow-xs px-3 py-2 text-lg font-semibold"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
        />
        <input
          className="w-full border border-input bg-card shadow-xs px-3 py-2 text-sm"
          value={collection}
          onChange={(e) => setCollection(e.target.value)}
          placeholder="Collection"
        />
        <textarea
          className="min-h-[50vh] w-full border border-input bg-card shadow-xs px-3 py-2 font-mono text-sm"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write the document…"
        />
      </div>
    </AppShell>
  );
}
