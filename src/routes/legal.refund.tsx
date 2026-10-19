import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/marketing/legal-page";
import { LEGAL } from "@/lib/legal-config";

export const Route = createFileRoute("/legal/refund")({
  head: () => ({
    meta: [
      { title: "Refund Policy — Inuberry" },
      { name: "description", content: "Inuberry's refund and cancellation policy for paid subscriptions." },
      { property: "og:title", content: "Refund Policy — Inuberry" },
      { property: "og:description", content: "Inuberry's refund and cancellation policy." },
    ],
  }),
  component: RefundPage,
});

function RefundPage() {
  return (
    <LegalPage eyebrow="Legal" title="Refund Policy">
      <p>This Refund Policy describes when {LEGAL.company} refunds subscription fees paid for Inuberry.</p>

      <h2>Cancellation</h2>
      <p>You can cancel your subscription at any time from the in-app billing portal. Cancellation takes effect at the end of the current billing period; you retain access until that date.</p>

      <h2>Refunds</h2>
      <ul>
        <li>Monthly plans: non-refundable for the current period; no further charges after cancellation.</li>
        <li>Annual plans: prorated refund for unused full months is available within 30 days of payment on written request.</li>
        <li>Free trials: never charged unless you upgrade.</li>
        <li>Duplicate charges or billing errors: full refund.</li>
        <li>Statutory rights (e.g. EU 14-day cooling-off for consumers): honored where applicable.</li>
      </ul>

      <h2>How to request</h2>
      <p>
        Email <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a> with
        your account email and reason. We respond within five business days.
      </p>
    </LegalPage>
  );
}
