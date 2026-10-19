import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createOrgCheckoutSession, createPackageCheckout } from "@/lib/billing/billing.functions";

/**
 * Stripe's embedded checkout. Pass `planId` to buy a prepaid package or storage plan,
 * or `priceId` (a Stripe lookup key) for the old per-seat subscriptions.
 */
export function StripeEmbeddedCheckoutInline({
  orgId,
  planId,
  priceId,
  returnUrl,
}: {
  orgId: string;
  planId?: string;
  priceId?: string;
  returnUrl?: string;
}) {
  const fetchClientSecret = async (): Promise<string> => {
    const common = {
      orgId,
      returnUrl: returnUrl ?? `${window.location.origin}/app/settings/billing?checkout=success`,
      environment: getStripeEnvironment(),
    };
    const result = planId
      ? await createPackageCheckout({ data: { ...common, planId } })
      : await createOrgCheckoutSession({ data: { ...common, priceId: priceId! } });
    if ("error" in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error("Checkout did not return a client secret");
    return result.clientSecret;
  };

  return (
    <div id="checkout" className="min-h-[600px]">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
