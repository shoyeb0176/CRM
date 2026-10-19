import { createFileRoute, redirect } from "@tanstack/react-router";
import { focusSearch } from "@/lib/use-focus-row";

// AI approvals live in the Inbox now. Old links (notifications, emails, AI apps) keep working.
export const Route = createFileRoute("/_authenticated/app/ai/approvals")({
  validateSearch: focusSearch("action"),
  beforeLoad: ({ search }) => { throw redirect({ to: "/app/inbox", search: { tab: "approvals", ...search } }); },
});
