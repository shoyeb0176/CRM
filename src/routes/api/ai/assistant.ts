// The assistant, streamed: POST the same body as aiAssistantSend with the signed-in user's
// access token; the answer comes back as server-sent events (status, text pieces, then the result).
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { AssistantInput, runAssistant, type AssistantEvent } from "@/lib/ai/ai.functions";

/** The caller's own database client and user id, from their access token (row-level security applies). */
async function signedIn(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return null;
  const supabase = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  return error || !data?.claims?.sub ? null : { supabase, userId: data.claims.sub };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/ai/assistant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await signedIn(request);
        if (!auth) return json(401, { error: "Sign in again to use the assistant." });
        const { overLimit } = await import("@/lib/rate-limit.server");
        if (await overLimit(`assistant:${auth.userId}`, 30, 60)) return json(429, { error: "That's a lot of messages in a minute. Wait a moment and try again." });
        const parsed = AssistantInput.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json(400, { error: "That message couldn't be read." });

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (e: AssistantEvent | { type: "error"; error: string }) =>
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
            try {
              const result = await runAssistant(auth.supabase, auth.userId, parsed.data, send);
              send({ type: "done", result });
            } catch (e) {
              send({ type: "error", error: e instanceof Error ? e.message : String(e) });
            } finally {
              controller.close();
            }
          },
        });
        return new Response(stream, {
          headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" },
        });
      },
    },
  },
});
