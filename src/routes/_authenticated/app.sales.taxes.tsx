import { createFileRoute, redirect } from "@tanstack/react-router";

// Tax rates are managed in one place, Settings › Taxes.
export const Route = createFileRoute("/_authenticated/app/sales/taxes")({
  beforeLoad: () => { throw redirect({ to: "/app/settings/taxes" }); },
});
