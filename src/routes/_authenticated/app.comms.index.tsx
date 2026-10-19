import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import { useAdminContext } from "@/lib/settings/use-admin";
import { CommsTimeline } from "@/components/comms/comms-timeline";
import { Settings2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/comms/")({
  head: () => ({
    meta: [
      { title: "Communications — Inuberry" },
      { name: "description", content: "Emails, meetings and calls with your customers in one timeline." },
      { property: "og:title", content: "Communications timeline" },
      { property: "og:description", content: "Every email, meeting and call with a customer, in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CommsIndex,
});

function CommsIndex() {
  const { orgId } = useAdminContext();

  return (
    <AppShell title="Communications" breadcrumb="comms">
      <div className="mb-4 flex items-center justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Everything you have exchanged with customers — emails, meetings, calls and notes. Log anything here, or from a
          company, contact or project page so it shows on their own timeline.
        </p>
        <Link
          to="/app/comms/settings"
          className="inline-flex shrink-0 items-center gap-1 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-foreground/5"
        >
          <Settings2 className="size-3" /> Connections
        </Link>
      </div>
      <CommsTimeline orgId={orgId ?? undefined} title="All communications" limit={200} />
    </AppShell>
  );
}
