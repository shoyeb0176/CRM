import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { AiBlock } from "@/components/ai/ai-block";
import {
  useBlockMutations, useBlocks, usePage, useWorkspaceMutations,
  type BlockRow,
} from "@/lib/workspace/use-workspace";
import { BLOCK_LABELS, type BlockType } from "@/lib/workspace/templates";
import { ArrowLeft, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/workspace/$pageId")({
  head: () => ({ meta: [{ title: "Page — Inuberry" }] }),
  component: PageEditor,
});

/** Count of blocks with unsaved edits — drives the browser-close warning. */
let pendingSaves = 0;

const ADDABLE: BlockType[] = ["text", "heading", "todo", "divider", "ai"];

function PageEditor() {
  const { pageId } = Route.useParams();
  const navigate = useNavigate();
  const page = usePage(pageId);
  const blocks = useBlocks(pageId);
  const { updatePage } = useWorkspaceMutations();
  const { addBlock, updateBlock, deleteBlock, reorder } = useBlockMutations(pageId);

  const [title, setTitle] = useState("");
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingSaves > 0) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
  useEffect(() => { if (page.data) setTitle(page.data.title); }, [page.data?.id, page.data?.title]);

  async function saveTitle() {
    if (!page.data || title.trim() === page.data.title) return;
    try {
      await updatePage.mutateAsync({ id: page.data.id, title: title.trim() || "Untitled" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const list = [...(blocks.data ?? [])];
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    await reorder.mutateAsync(list);
  }

  async function archive() {
    if (!page.data) return;
    await updatePage.mutateAsync({ id: page.data.id, archived: true });
    toast.success("Page archived");
    navigate({ to: "/app/workspace" });
  }

  return (
    <AppShell title={page.data?.title ?? "Page"} breadcrumb="workspace / page">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <Link to="/app/workspace" className="flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3" /> All pages
          </Link>
          <Button variant="bare" size="bare" onClick={archive} className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-destructive">
            Archive page
          </Button>
        </div>

        {page.isLoading ? (
          <Skeleton className="h-10 w-2/3" />
        ) : (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            className="w-full border-none bg-transparent font-display text-3xl uppercase tracking-tight outline-none"
          />
        )}

        <div className="mt-6 space-y-2">
          {blocks.isLoading && <Skeleton className="h-24 w-full" />}
          {(blocks.data ?? []).map((b, i) => (
            <BlockEditor
              key={b.id}
              block={b}
              autoFocus={i === focusIndex}
              entityType={page.data?.entity_type ?? null}
              entityId={page.data?.entity_id ?? null}
              onChange={(content) => updateBlock.mutate({ id: b.id, content })}
              onDelete={() => deleteBlock.mutate(b.id)}
              onMoveUp={() => move(i, -1)}
              onMoveDown={() => move(i, 1)}
            />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Add block</span>
          {ADDABLE.map((t) => (
            <Button variant="kit" size="kit"
              key={t}
              onClick={() => {
                setFocusIndex(blocks.data?.length ?? 0);
                addBlock.mutate({ type: t, sortOrder: blocks.data?.length ?? 0 });
              }}
              className="flex gap-1 px-2 py-1 hover:bg-accent"
            >
              <Plus className="size-3" /> {BLOCK_LABELS[t]}
            </Button>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function BlockEditor({
  block, autoFocus, entityType, entityId, onChange, onDelete, onMoveUp, onMoveDown,
}: {
  block: BlockRow;
  autoFocus?: boolean;
  entityType: string | null;
  entityId: string | null;
  onChange: (content: BlockRow["content"]) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [text, setText] = useState(block.content.text ?? "");
  useEffect(() => { setText(block.content.text ?? ""); }, [block.id]);

  const latest = useRef({ text, content: block.content, onChange });
  latest.current = { text, content: block.content, onChange };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedText = useRef(block.content.text ?? "");

  const commit = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; pendingSaves = Math.max(0, pendingSaves - 1); }
    const { text: t, content, onChange: save } = latest.current;
    if (savedText.current !== t) { savedText.current = t; save({ ...content, text: t }); }
  };

  const edit = (v: string) => {
    setText(v);
    if (!timer.current) pendingSaves += 1; else clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      pendingSaves = Math.max(0, pendingSaves - 1);
      const { text: t, content, onChange: save } = latest.current;
      if (savedText.current !== t) { savedText.current = t; save({ ...content, text: t }); }
    }, 800);
  };

  // Flush any pending edit when the block unmounts (route change, delete, page leave).
  useEffect(() => () => commit(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="group relative flex gap-2">
      <div className="flex w-6 shrink-0 flex-col items-center gap-1 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
        <Button variant="bare" size="bare" onClick={onMoveUp} aria-label="Move up" className="text-muted-foreground hover:text-foreground"><ChevronUp className="size-3" /></Button>
        <Button variant="bare" size="bare" onClick={onMoveDown} aria-label="Move down" className="text-muted-foreground hover:text-foreground"><ChevronDown className="size-3" /></Button>
        <Button variant="bare" size="bare" onClick={onDelete} aria-label="Delete block" className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3" /></Button>
      </div>

      <div className="min-w-0 flex-1">
        {block.type === "divider" && <hr className="my-4 border-border" />}

        {block.type === "heading" && (
          <input
            value={text}
            onChange={(e) => edit(e.target.value)}
            onBlur={commit}
            placeholder="Heading"
            autoFocus={autoFocus}
            className={`w-full border-none bg-transparent uppercase tracking-tight outline-none ${
              (block.content.level ?? 1) === 1 ? "font-display text-xl" : "font-heading text-base"
            }`}
          />
        )}

        {block.type === "text" && (
          <textarea
            value={text}
            onChange={(e) => edit(e.target.value)}
            onBlur={commit}
            rows={Math.max(2, text.split("\n").length)}
            placeholder="Write something…"
            autoFocus={autoFocus}
            className="w-full resize-none border-none bg-transparent text-sm leading-relaxed outline-none"
          />
        )}

        {block.type === "todo" && (
          <label className="flex items-start gap-2 py-1">
            <input
              type="checkbox"
              checked={!!block.content.checked}
              onChange={(e) => onChange({ ...block.content, text, checked: e.target.checked })}
              className="mt-1"
            />
            <input
              value={text}
              onChange={(e) => edit(e.target.value)}
              onBlur={commit}
              placeholder="To-do"
              autoFocus={autoFocus}
              className={`w-full border-none bg-transparent text-sm outline-none ${
                block.content.checked ? "text-muted-foreground line-through" : ""
              }`}
            />
          </label>
        )}

        {block.type === "ai" && (
          entityType && entityId ? (
            <AiBlock
              entityType={entityType as "company" | "contact" | "deal" | "invoice" | "project" | "product"}
              entityId={entityId}
              question={block.content.question}
            />
          ) : (
            <div className="border border-dashed border-border p-4 text-sm text-muted-foreground">
              This AI block needs a linked record. Open a customer, project or invoice page and use its AI briefing there.
            </div>
          )
        )}
      </div>
    </div>
  );
}
