// Sends due notification emails. Called every 2 minutes by the database (pg_cron + pg_net,
// migration 0037) with the secret it holds; anyone else gets 401.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/notifications/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { dispatchNotificationEmails, siteUrlFrom } = await import("@/lib/notifications/email.server");
        const site = siteUrlFrom(request);
        const { data: secret } = await supabaseAdmin.rpc("notification_dispatch_secret", { _site_url: site });
        const given = request.headers.get("x-dispatch-secret") ?? "";
        if (!secret || given.length !== String(secret).length || given !== secret) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
        }
        const result = await dispatchNotificationEmails(site);
        return new Response(JSON.stringify(result), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
      },
    },
  },
});
