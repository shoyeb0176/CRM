import { createFileRoute, redirect } from "@tanstack/react-router";
import { focusSearch } from "@/lib/use-focus-row";

// Agent approvals are in the Inbox with every other AI request. Old links keep working.
export const Route = createFileRoute("/_authenticated/app/agents/approvals")({
  validateSearch: focusSearch("action"),
  beforeLoad: ({ search }) => { throw redirect({ to: "/app/inbox", search: { tab: "approvals", ...search } }); },
});
