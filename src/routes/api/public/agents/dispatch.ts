// Starts scheduled and event-triggered AI agents. Called every 5 minutes by the database (pg_cron +
// pg_net, DB-29) with the same secret the notification sender uses; anyone else gets 401.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/agents/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: secret } = await supabaseAdmin.rpc("notification_dispatch_secret", {});
        const given = request.headers.get("x-dispatch-secret") ?? "";
        if (!secret || given.length !== String(secret).length || given !== secret) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
        }
        const { dispatchAgents } = await import("@/lib/agents/agent-dispatch.server");
        const result = await dispatchAgents();
        return new Response(JSON.stringify(result), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
      },
    },
  },
});
