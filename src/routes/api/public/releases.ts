// Public release feed. Self-hosted installs check it (UPDATE_FEED_URL) to offer "Update now".
// Nothing about the caller is recorded.
import { createFileRoute } from "@tanstack/react-router";
import { APP_VERSION } from "@/lib/version";
import { parseChangelog } from "@/lib/releases";

export const Route = createFileRoute("/api/public/releases")({
  server: {
    handlers: {
      GET: async () => {
        const releases = parseChangelog().slice(0, 10);
        const latest = releases.find((r) => r.version === APP_VERSION) ?? releases[0];
        return new Response(JSON.stringify({ name: "inuberry", version: latest?.version ?? APP_VERSION, date: latest?.date ?? null, notes: latest?.notes ?? [], releases }), {
          headers: { "content-type": "application/json", "cache-control": "public, max-age=600", "access-control-allow-origin": "*" },
        });
      },
    },
  },
});
