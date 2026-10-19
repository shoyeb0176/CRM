// Client-side Stripe.js loader. Derives the environment from the token prefix —
// never falls through to 'live' when the token is missing.
import type { Stripe } from "@stripe/stripe-js";

type StripeEnv = "sandbox" | "live";

// Our own Stripe publishable key when set, else the one Lovable's payments connector provides.
const clientToken = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN) as
  | string
  | undefined;

function paymentsEnvironment(): StripeEnv {
  if (clientToken?.startsWith("pk_test_")) return "sandbox";
  if (clientToken?.startsWith("pk_live_")) return "live";
  throw new Error(
    "Payments are not configured for this build. Complete go-live in your Lovable project to enable production checkout.",
  );
}

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    paymentsEnvironment();
    // The loader downloads only when checkout opens; most pages only need getStripeEnvironment().
    stripePromise = import("@stripe/stripe-js").then(({ loadStripe }) => loadStripe(clientToken as string));
  }
  return stripePromise;
}

export function getStripeEnvironment(): StripeEnv {
  return paymentsEnvironment();
}
