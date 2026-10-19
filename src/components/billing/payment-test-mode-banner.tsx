// Our own Stripe publishable key when set, else the one Lovable's payments connector provides.
const clientToken = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN) as
  | string
  | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full bg-destructive/15 border-b border-destructive/30 px-4 py-2 text-center text-xs">
        Production checkout is not configured. Complete payments go-live to accept real payments.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full bg-warning/15 border-b border-warning/30 px-4 py-2 text-center text-xs">
        Test mode — payments in the preview do not charge real money.
      </div>
    );
  }
  return null;
}
