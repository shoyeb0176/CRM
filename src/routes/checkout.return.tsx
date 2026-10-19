import { createFileRoute, Link } from "@tanstack/react-router";
import { useOrgSubscription } from "@/lib/billing/use-subscription";

export const Route = createFileRoute("/checkout/return")({
  head: () => ({
    meta: [
      { title: "Payment complete — Inuberry" },
      { name: "description", content: "Confirmation of your Inuberry subscription checkout." },
      { property: "og:title", content: "Payment complete — Inuberry" },
      { property: "og:description", content: "Confirmation of your Inuberry subscription checkout." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id } = Route.useSearch();
  const sub = useOrgSubscription();
  const planName = sub.data?.plan?.name;

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md border border-border bg-card shadow-sm p-8 text-center">
        <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Payment</div>
        <h1 className="mb-4 font-display text-3xl uppercase tracking-tight">
          {session_id ? (planName ? `${planName} is active` : "Subscription activated") : "Checkout not completed"}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {session_id
            ? "Thanks — your plan updates within a few seconds as we receive confirmation from the payment provider."
            : "We didn't receive a payment confirmation. You can start the checkout again from Billing."}
        </p>
        <Link
          to="/app/settings/billing"
          className="inline-block bg-primary px-6 py-2 font-mono text-xs uppercase tracking-widest text-primary-foreground hover:opacity-90"
        >
          {session_id ? "Back to billing" : "Try again"}
        </Link>
      </div>
    </div>
  );
}
