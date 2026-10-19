// Knowledge base: grounded answers over the workspace's own documents.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AskInput = z.object({
  orgId: z.string().uuid(),
  question: z.string().min(2).max(2000),
});

const SummariseInput = z.object({
  orgId: z.string().uuid(),
  docId: z.string().uuid(),
});

/** Very small keyword retriever: matches on title/content for each meaningful word. */
function keywords(q: string): string[] {
  return Array.from(
    new Set(
      q
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2),
    ),
  ).slice(0, 8);
}

export const askKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => AskInput.parse(d))
  .handler(async ({ data, context }) => {
    const words = keywords(data.question);
    const filter = words.length
      ? words.flatMap((w) => [`title.ilike.%${w}%`, `content.ilike.%${w}%`]).join(",")
      : null;

    let query = context.supabase
      .from("knowledge_docs")
      .select("id,title,collection,content,updated_at")
      .eq("org_id", data.orgId)
      .eq("is_published", true)
      .limit(6);
    if (filter) query = query.or(filter);
    const { data: docs, error } = await query;
    if (error) throw new Error(error.message);

    if (!docs?.length) {
      return {
        answer:
          "I could not find anything in your knowledge base about that yet. Add a document and ask again.",
        sources: [] as Array<{ id: string; title: string }>,
      };
    }

    const excerpts = docs
      .map((d, i) => `[${i + 1}] ${d.title} (${d.collection})\n${(d.content ?? "").slice(0, 3000)}`)
      .join("\n\n---\n\n");

    const { runAiChat } = await import("@/lib/ai/gateway.server");
    const { chargeAiAction } = await import("@/lib/ai/usage.server");
    const charge = await chargeAiAction(context.supabase, data.orgId, "knowledge", "assistant");
    const result = await runAiChat({
      orgId: data.orgId,
      userId: context.userId,
      purpose: "assistant",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You answer strictly from the provided company documents. Cite the numbered sources you used like [1]. If the documents do not contain the answer, say so plainly instead of guessing.",
        },
        { role: "user", content: `DOCUMENTS:\n${excerpts}\n\nQUESTION: ${data.question}` },
      ],
    }).catch(async (e) => { await charge.refund().catch(() => {}); throw e; });

    return {
      answer: result.text,
      sources: docs.map((d) => ({ id: d.id, title: d.title })),
    };
  });

export const summariseKnowledgeDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => SummariseInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: doc, error } = await context.supabase
      .from("knowledge_docs")
      .select("id,title,content")
      .eq("id", data.docId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Document not found");

    const { runAiChat } = await import("@/lib/ai/gateway.server");
    const { chargeAiAction } = await import("@/lib/ai/usage.server");
    const charge = await chargeAiAction(context.supabase, data.orgId, "knowledge", "summaries");
    const result = await runAiChat({
      orgId: data.orgId,
      userId: context.userId,
      purpose: "summaries",
      temperature: 0.3,
      messages: [
        { role: "system", content: "Summarise the document in two or three plain sentences." },
        { role: "user", content: `${doc.title}\n\n${(doc.content ?? "").slice(0, 8000)}` },
      ],
    }).catch(async (e) => { await charge.refund().catch(() => {}); throw e; });

    await context.supabase.from("knowledge_docs").update({ summary: result.text }).eq("id", doc.id);
    return { summary: result.text };
  });
