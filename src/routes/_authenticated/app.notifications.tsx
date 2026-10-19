import { createFileRoute, redirect } from "@tanstack/react-router";

// Notifications live in the Inbox now; old links and bookmarks land there.
export const Route = createFileRoute("/_authenticated/app/notifications")({
  beforeLoad: () => { throw redirect({ to: "/app/inbox", search: { tab: "notifications" } }); },
});
