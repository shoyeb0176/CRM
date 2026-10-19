import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Markdown } from "@/components/ai/markdown";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useOrgId } from "@/lib/crm/use-org";
import { aiEntityBrief } from "@/lib/ai/entity-ai.functions";
import { Button } from "@/components/ui/button";

type EntityType = "company" | "contact" | "deal" | "invoice" | "project" | "product";

/** An AI block: an on-demand, grounded briefing rendered inline on an entity page. */
export function AiBlock({
  entityType,
  entityId,
  title = "AI briefing",
  question,
}: {
  entityType: EntityType;
  entityId: string;
  title?: string;
  question?: string;
}) {
  const orgId = useOrgId();
  const brief = useServerFn(aiEntityBrief);
  const [text, setText] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No active organization");
      return await brief({ data: { orgId, entityType, entityId, question } });
    },
    onSuccess: (res) => setText(res.text),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <Sparkles className="size-3 text-primary" /> {title}
        </span>
        <Button variant="kit" size="kit"
          onClick={() => run.mutate()}
          disabled={run.isPending}
          className="flex gap-1 px-2 py-1 hover:bg-accent"
        >
          {run.isPending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          {text ? "Regenerate" : "Generate"}
        </Button>
      </header>
      <div className="px-4 py-3 text-sm">
        {run.isPending && !text && (
          <p className="font-mono text-xs text-muted-foreground">Reading this record and its related data…</p>
        )}
        {!run.isPending && !text && (
          <p className="text-muted-foreground">
            Generate a grounded summary of this record — it only uses data you can already see.
          </p>
        )}
        {text && (
          <Markdown>{text}</Markdown>
        )}
      </div>
    </section>
  );
}
