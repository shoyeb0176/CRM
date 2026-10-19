// Stripe webhook handler — org-scoped subscription sync.
// Verifies signature, then updates organization_subscriptions + billing_events.
import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook, webhookEnv } from "@/lib/stripe.server";
import type { Database } from "@/integrations/supabase/types";

let _admin: SupabaseClient<Database> | null = null;
function admin(): SupabaseClient<Database> {
  if (!_admin) {
    _admin = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  return _admin;
}

async function resolvePlanIdFromPrice(lookupKey: string | undefined): Promise<string | null> {
  if (!lookupKey) return null;
  const { data } = await admin()
    .from("subscription_plans")
    .select("id")
    .or(`stripe_price_id_monthly.eq.${lookupKey},stripe_price_id_yearly.eq.${lookupKey}`)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function billingCycleFromPrice(lookupKey: string | undefined): Promise<"monthly" | "yearly"> {
  if (!lookupKey) return "monthly";
  return lookupKey.endsWith("_yearly") ? "yearly" : "monthly";
}

async function logEvent(orgId: string, type: string, description: string, amount: number | null, payload: any, stripeEventId?: string) {
  await admin().from("billing_events").insert({
    org_id: orgId,
    event_type: type,
    description,
    amount,
    currency: "USD",
    stripe_event_id: stripeEventId ?? null,
    payload,
  });
  // Owners and admins hear about money moving (or not).
  const notice = BILLING_NOTICES[type];
  if (notice) {
    const { notifyUsers, workspaceLeads } = await import("@/lib/notifications/notify.server");
    const money = amount != null ? `${amount.toFixed(2)} USD. ` : "";
    await notifyUsers(orgId, await workspaceLeads(orgId), {
      kind: notice.kind, title: notice.title, body: `${money}${description}`.trim(), severity: notice.severity,
      module: "billing", link: "/app/settings/billing", action: notice.action,
    });
  }
}

const BILLING_NOTICES: Record<string, { kind: string; title: string; severity: "success" | "error"; action: string }> = {
  "package.purchased": { kind: "billing.payment", title: "Plan payment received: thank you", severity: "success", action: "View billing" },
  "payment.succeeded": { kind: "billing.payment", title: "Plan payment received", severity: "success", action: "View billing" },
  "payment.failed": { kind: "billing.payment_failed", title: "Your plan payment failed", severity: "error", action: "Fix payment" },
};

/**
 * Which workspace an event belongs to: our orgId metadata when Stripe carries it, otherwise the
 * workspace whose saved Stripe customer matches (subscription invoices and charges don't copy
 * subscription metadata).
 */
async function orgIdFor(obj: any): Promise<string | null> {
  const fromMeta =
    obj?.metadata?.orgId ||
    obj?.parent?.subscription_details?.metadata?.orgId ||
    obj?.subscription_details?.metadata?.orgId ||
    obj?.customer_details?.metadata?.orgId;
  if (fromMeta) return fromMeta;
  const customer = typeof obj?.customer === "string" ? obj.customer : obj?.customer?.id;
  if (!customer) return null;
  const { data } = await admin()
    .from("organization_subscriptions").select("org_id").eq("stripe_customer_id", customer).maybeSingle();
  return (data?.org_id as string | undefined) ?? null;
}

async function starterPlanId(): Promise<string | null> {
  const { data } = await admin().from("subscription_plans").select("id").eq("code", "starter").maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * A prepaid package or storage plan was paid: switch the plan on for its term.
 * Buying the same plan again before it ends extends it from the current end date.
 * Stripe may deliver an event more than once, so a session already recorded is ignored.
 */
async function activatePackage(session: any) {
  const { orgId, planId } = session.metadata ?? {};
  if (!orgId || !planId || session.payment_status !== "paid") return;
  const db = admin() as any;
  const { data: seen } = await db.from("billing_events").select("id").eq("stripe_event_id", session.id).maybeSingle();
  if (seen) return;

  const [{ data: plan }, { data: sub }] = await Promise.all([
    db.from("subscription_plans").select("id,name,term_months").eq("id", planId).maybeSingle(),
    db.from("organization_subscriptions").select("plan_id,current_period_end").eq("org_id", orgId).maybeSingle(),
  ]);
  if (!plan?.term_months) {
    console.error("Webhook: paid package with unknown plan", planId);
    return;
  }
  const now = new Date();
  const currentEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  const start = sub?.plan_id === plan.id && currentEnd && currentEnd > now ? currentEnd : now;
  const end = new Date(start);
  end.setMonth(end.getMonth() + plan.term_months);

  await db.from("organization_subscriptions").update({
    plan_id: plan.id,
    status: "active",
    billing_cycle: "yearly",
    current_period_start: start.toISOString(),
    current_period_end: end.toISOString(),
    trial_ends_at: null,
    cancel_at_period_end: false,
    stripe_customer_id: session.customer ?? null,
  }).eq("org_id", orgId);
  await logEvent(orgId, "package.purchased", `${plan.name} until ${end.toISOString().slice(0, 10)}`,
    (session.amount_total ?? 0) / 100, { id: session.id, planId: plan.id }, session.id);
}

async function handleCheckoutCompleted(session: any, _env: StripeEnv) {
  const orgId = session.metadata?.orgId;
  if (!orgId) return;
  if (session.metadata?.kind === "package") return activatePackage(session);
  const update: Record<string, unknown> = {
    stripe_customer_id: session.customer ?? null,
    ...(session.subscription ? { stripe_subscription_id: session.subscription } : {}),
    ...(session.payment_status !== "unpaid" ? { status: "active" } : {}),
  };
  await admin().from("organization_subscriptions").update(update as never).eq("org_id", orgId);
  await logEvent(orgId, "checkout.completed", "Checkout completed", (session.amount_total ?? 0) / 100, session, session.id);
}

async function handleInvoicePaymentFailed(invoice: any, _env: StripeEnv) {
  const orgId = await orgIdFor(invoice);
  if (!orgId) return;
  await admin().from("organization_subscriptions").update({ status: "past_due" }).eq("org_id", orgId);
  await logEvent(orgId, "payment.failed", "Invoice payment failed", (invoice.amount_due ?? 0) / 100, invoice, invoice.id);
}

async function handleSubscriptionChange(subscription: any, env: StripeEnv, eventType: string) {
  const orgId = await orgIdFor(subscription);
  if (!orgId) {
    console.error("Webhook: subscription with no orgId metadata", subscription.id);
    return;
  }
  const item = subscription.items?.data?.[0];
  const lookupKey: string | undefined =
    item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id;
  const planId = await resolvePlanIdFromPrice(lookupKey);
  const cycle = await billingCycleFromPrice(lookupKey);

  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  // A canceled/deleted subscription drops the workspace back to the free Starter plan.
  const canceled = eventType === "subscription.canceled" || subscription.status === "canceled";
  const targetPlanId = canceled ? await starterPlanId() : planId;

  const update = {
    // Falling back to free Starter keeps the workspace usable — never leave it "canceled".
    status: canceled ? "active" : subscription.status,
    billing_cycle: cycle,
    stripe_subscription_id: canceled ? null : subscription.id,
    stripe_customer_id: subscription.customer,
    current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: canceled ? false : !!subscription.cancel_at_period_end,
    canceled_at: canceled ? null : subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
    ...(targetPlanId ? { plan_id: targetPlanId } : {}),
  };

  await admin().from("organization_subscriptions").update(update).eq("org_id", orgId);
  await logEvent(orgId, eventType, `Subscription ${subscription.status}`, null, { id: subscription.id, status: subscription.status, lookupKey });
}

async function handleTransactionCompleted(charge: any, env: StripeEnv) {
  const orgId = await orgIdFor(charge);
  if (!orgId) return;
  const amount = (charge.amount ?? charge.amount_total ?? 0) / 100;
  await logEvent(orgId, "payment.succeeded", "Payment received", amount, charge, charge.id);
}

async function handlePaymentFailed(charge: any, env: StripeEnv) {
  const orgId = await orgIdFor(charge);
  if (!orgId) return;
  await logEvent(orgId, "payment.failed", charge.failure_message ?? "Payment failed", null, charge, charge.id);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case "subscription.created":
    case "customer.subscription.created":
      await handleSubscriptionChange(event.data.object, env, "subscription.created");
      break;
    case "subscription.updated":
    case "customer.subscription.updated":
      await handleSubscriptionChange(event.data.object, env, "subscription.updated");
      break;
    case "subscription.canceled":
    case "customer.subscription.deleted":
      await handleSubscriptionChange(event.data.object, env, "subscription.canceled");
      break;
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleCheckoutCompleted(event.data.object, env);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object, env);
      break;
    case "transaction.completed":
    case "charge.succeeded":
      await handleTransactionCompleted(event.data.object, env);
      break;
    case "transaction.payment_failed":
    case "charge.failed":
      await handlePaymentFailed(event.data.object, env);
      break;
    default:
      console.log("Unhandled stripe event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Direct Stripe: mode comes from STRIPE_SECRET_KEY. Lovable connector: ?env=sandbox|live.
        const env = webhookEnv(new URL(request.url).searchParams.get("env"));
        if (!env) {
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, env);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
