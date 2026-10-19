// Public version endpoint: lets an install (or a monitoring check) see which release it runs.
import { createFileRoute } from "@tanstack/react-router";
import { APP_VERSION } from "@/lib/version";

export const Route = createFileRoute("/api/public/version")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ name: "inuberry", version: APP_VERSION }), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        }),
    },
  },
});
