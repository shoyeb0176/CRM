import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Markdown } from "@/components/ai/markdown";
import { AppShell } from "@/components/app/app-shell";
import { useAdminContext } from "@/lib/settings/use-admin";
import { DOC_TEMPLATES, useKnowledgeDocs, useKnowledgeMutations } from "@/lib/knowledge/use-knowledge";
import { askKnowledge } from "@/lib/knowledge/knowledge.functions";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, Search, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

import { friendlyError } from "@/lib/friendly-error";
import { SectionTitle } from "@/components/ui/section-title";
export const Route = createFileRoute("/_authenticated/app/knowledge/")({
  head: () => ({
    meta: [
      { title: "Knowledge — Inuberry" },
      { name: "description", content: "Your team's documents, with answers grounded in them." },
      { property: "og:title", content: "Knowledge base" },
      { property: "og:description", content: "Company documents with AI answers grounded in your own content." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KnowledgeIndex,
});

function KnowledgeIndex() {
  const { orgId } = useAdminContext();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState(DOC_TEMPLATES[0]!.key);
  const docs = useKnowledgeDocs(orgId ?? undefined, search);
  const { create } = useKnowledgeMutations(orgId ?? undefined);

  const ask = useServerFn(askKnowledge);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ answer: string; sources: Array<{ id: string; title: string }> } | null>(null);
  const [asking, setAsking] = useState(false);

  async function onAsk() {
    if (!orgId || question.trim().length < 3) return;
    setAsking(true);
    setAnswer(null);
    try {
      setAnswer(await ask({ data: { orgId, question: question.trim() } }));
    } catch (e) {
      toast.error(friendlyError(e, "Could not answer that"));
    } finally {
      setAsking(false);
    }
  }

  async function onCreate() {
    if (!orgId || !title.trim()) return;
    const t = DOC_TEMPLATES.find((x) => x.key === template)!;
    const id = await create.mutateAsync({ title: title.trim(), collection: t.collection, content: t.content });
    navigate({ to: "/app/knowledge/$docId", params: { docId: id } });
  }

  return (
    <AppShell title="Knowledge" breadcrumb="knowledge">
      <div className="mb-8 border border-border bg-card shadow-sm p-6">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="size-4" />
          <SectionTitle>Ask your documents</SectionTitle>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="min-w-64 flex-1 border border-input bg-card shadow-xs px-3 py-2 text-sm"
            placeholder="What is our refund policy?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAsk()}
          />
          <Button variant="kit" size="kit"
            className="px-4 py-2"
            onClick={onAsk}
            disabled={asking || question.trim().length < 3}
          >
            {asking ? "Thinking…" : "Ask"}
          </Button>
        </div>
        {answer && (
          <div className="mt-4 border border-border bg-muted/20 p-4">
            <Markdown>{answer.answer}</Markdown>
            {answer.sources.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {answer.sources.map((s, i) => (
                  <Link
                    key={s.id}
                    to="/app/knowledge/$docId"
                    params={{ docId: s.id }}
                    className="border border-border px-2 py-1 font-mono text-xs uppercase tracking-widest hover:bg-foreground/5"
                  >
                    [{i + 1}] {s.title}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mb-8 border border-border bg-card shadow-sm p-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <SectionTitle>New document</SectionTitle>
          <Link to="/app/import" className="flex items-center gap-1 border border-border px-3 py-1.5 text-xs hover:bg-foreground/5">
            <Upload className="size-3" /> Import from a file
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="border border-input bg-card shadow-xs px-3 py-2 text-sm"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            {DOC_TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          <input
            className="min-w-56 flex-1 border border-input bg-card shadow-xs px-3 py-2 text-sm"
            placeholder="Document title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button variant="kit" size="kit"
            className="px-4 py-2"
            onClick={onCreate}
            disabled={!title.trim() || create.isPending}
          >
            Create
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {DOC_TEMPLATES.find((t) => t.key === template)?.description}
        </p>
      </div>

      <div className="mb-4 flex items-center gap-2 border border-border bg-background px-3 py-2">
        <Search className="size-4 text-muted-foreground" />
        <input
          className="flex-1 bg-transparent text-sm outline-none"
          placeholder="Search documents"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-px border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
        {(docs.data ?? []).length === 0 && (
          <div className="bg-background p-6 text-sm text-muted-foreground">{search.trim() ? `No documents match '${search.trim()}'` : "No documents yet."}</div>
        )}
        {(docs.data ?? []).map((d) => (
          <Link
            key={d.id}
            to="/app/knowledge/$docId"
            params={{ docId: d.id }}
            className="group flex flex-col gap-2 bg-background p-6 transition-colors hover:bg-foreground/5"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{d.collection}</span>
              <BookOpen className="size-4 text-muted-foreground" />
            </div>
            <div className="font-semibold">{d.title}</div>
            <div className="line-clamp-3 text-sm text-muted-foreground">{d.summary ?? "No summary yet."}</div>
            <div className="mt-auto font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {d.is_published ? "Published" : "Draft"} · {new Date(d.updated_at).toLocaleDateString()}
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
