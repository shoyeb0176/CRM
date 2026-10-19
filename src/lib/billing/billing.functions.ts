// Server functions for org-scoped Stripe checkout and billing portal.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EnvSchema = z.enum(["sandbox", "live"]);

const CheckoutInput = z.object({
  orgId: z.string().uuid(),
  priceId: z.string().regex(/^[a-z0-9_]+$/),
  returnUrl: z.string().url(),
  environment: EnvSchema,
});

type CheckoutResult = { clientSecret: string } | { error: string };

export const createOrgCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CheckoutInput.parse(d))
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const { supabase, userId } = context;

    // Authorize: caller must be org admin/owner
    const { data: isAdmin } = await supabase.rpc("has_org_role", {
      _org: data.orgId,
      _roles: ["org_owner", "org_admin"],
    });
    if (!isAdmin) return { error: "Only org owners or admins can manage billing." };

    const [{ data: org }, { data: sub }, { data: user }, { count: seatCount }] = await Promise.all([
      supabase.from("organizations").select("id,name").eq("id", data.orgId).maybeSingle(),
      supabase.from("organization_subscriptions").select("id,stripe_customer_id").eq("org_id", data.orgId).maybeSingle(),
      supabase.auth.getUser(),
      supabase.from("memberships").select("id", { count: "exact", head: true })
        .eq("org_id", data.orgId).eq("status", "active"),
    ]);
    if (!org) return { error: "Organization not found." };

    const quantity = Math.max(1, seatCount ?? 1);
    const email = user?.user?.email ?? undefined;

    try {
      const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
      const stripe = createStripeClient(data.environment);

      // Resolve human-readable priceId via lookup_keys
      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      if (!prices.data.length) return { error: `Price '${data.priceId}' not found.` };
      const price = prices.data[0];

      // Resolve or create Customer keyed on orgId metadata
      let customerId = sub?.stripe_customer_id ?? null;
      if (!customerId) {
        const found = await stripe.customers.search({
          query: `metadata['orgId']:'${data.orgId}'`,
          limit: 1,
        });
        customerId = found.data[0]?.id ?? null;
      }
      if (!customerId) {
        const created = await stripe.customers.create({
          ...(email ? { email } : {}),
          name: org.name,
          metadata: { orgId: data.orgId, createdBy: userId },
        });
        customerId = created.id;
      }

      // Make sure the org has a subscription row to attach billing state to.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (sub?.id) {
        await supabaseAdmin.from("organization_subscriptions")
          .update({ stripe_customer_id: customerId }).eq("org_id", data.orgId);
      } else {
        const { data: starter } = await supabaseAdmin
          .from("subscription_plans").select("id").eq("code", "starter").maybeSingle();
        await supabaseAdmin.from("organization_subscriptions").insert({
          org_id: data.orgId,
          plan_id: starter?.id as string,
          status: "incomplete",
          billing_cycle: data.priceId.endsWith("_yearly") ? "yearly" : "monthly",
          stripe_customer_id: customerId,
        });
      }

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: price.id, quantity }],
        mode: "subscription",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer: customerId,
        // Stripe Tax is not configured in this sandbox — enabling it fails session creation.
        automatic_tax: { enabled: false },
        metadata: { orgId: data.orgId, userId, seats: String(quantity) },
        subscription_data: { metadata: { orgId: data.orgId, userId } },
      });

      return { clientSecret: session.client_secret ?? "" };
    } catch (e) {
      const { getStripeErrorMessage } = await import("@/lib/stripe.server");
      return { error: getStripeErrorMessage(e) };
    }
  });

/** Find or create the Stripe customer for a workspace, and remember it on the subscription row. */
async function ensureStripeCustomer(stripe: any, orgId: string, orgName: string, email: string | undefined, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: sub } = await supabaseAdmin.from("organization_subscriptions")
    .select("stripe_customer_id").eq("org_id", orgId).maybeSingle();
  let customerId: string | null = sub?.stripe_customer_id ?? null;
  if (!customerId) {
    const found = await stripe.customers.search({ query: `metadata['orgId']:'${orgId}'`, limit: 1 });
    customerId = found.data[0]?.id ?? null;
  }
  if (!customerId) {
    const created = await stripe.customers.create({
      ...(email ? { email } : {}), name: orgName, metadata: { orgId, createdBy: userId },
    });
    customerId = created.id;
  }
  await supabaseAdmin.from("organization_subscriptions").update({ stripe_customer_id: customerId }).eq("org_id", orgId);
  return customerId as string;
}

const PackageInput = z.object({
  orgId: z.string().uuid(),
  planId: z.string().uuid(),
  returnUrl: z.string().url(),
  environment: EnvSchema,
});

/**
 * Buy (or renew) a prepaid package or storage plan: one Stripe Checkout payment for the whole term.
 * The price comes from the plan row the platform owner set, never from the browser.
 * The webhook (checkout.session.completed) switches the plan on when Stripe confirms payment.
 */
export const createPackageCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => PackageInput.parse(d))
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_org_role", { _org: data.orgId, _roles: ["org_owner", "org_admin"] });
    if (!isAdmin) return { error: "Only org owners or admins can manage billing." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: plan }, { data: org }, { data: user }] = await Promise.all([
      supabaseAdmin.from("subscription_plans")
        .select("id,name,plan_kind,term_months,price_total,currency,user_limit,is_active,is_public")
        .eq("id", data.planId).maybeSingle(),
      supabase.from("organizations").select("id,name").eq("id", data.orgId).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    if (!org) return { error: "Organization not found." };
    if (!plan || !plan.is_active || !plan.is_public || !["package", "storage"].includes(plan.plan_kind)) {
      return { error: "This plan isn't available to buy." };
    }
    const amount = Math.round(Number(plan.price_total) * 100);
    if (!(amount > 0) || !plan.term_months) return { error: "This plan has no price yet." };

    // A package must fit everyone already in the workspace.
    if (plan.user_limit != null) {
      const { count } = await supabaseAdmin.from("memberships").select("id", { count: "exact", head: true })
        .eq("org_id", data.orgId).eq("status", "active");
      if ((count ?? 0) > plan.user_limit) {
        return { error: `This package allows ${plan.user_limit} users, but the workspace has ${count}. Choose a bigger package or remove members first.` };
      }
    }

    try {
      const { createStripeClient } = await import("@/lib/stripe.server");
      const stripe = createStripeClient(data.environment);
      const customer = await ensureStripeCustomer(stripe, data.orgId, org.name, user?.user?.email ?? undefined, userId);
      const meta = { orgId: data.orgId, userId, planId: plan.id, kind: "package" };
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ui_mode: "embedded_page",
        customer,
        return_url: data.returnUrl,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: String(plan.currency || "USD").toLowerCase(),
            unit_amount: amount,
            product_data: {
              name: `${plan.name}: ${plan.term_months} months`,
              description: plan.user_limit == null ? "Unlimited users" : `Up to ${plan.user_limit} users`,
            },
          },
        }],
        automatic_tax: { enabled: false },
        metadata: meta,
        payment_intent_data: { metadata: meta },
      });
      return { clientSecret: session.client_secret ?? "" };
    } catch (e) {
      const { getStripeErrorMessage } = await import("@/lib/stripe.server");
      return { error: getStripeErrorMessage(e) };
    }
  });

const TrialInput = z.object({ orgId: z.string().uuid() });

type TrialResult = { ok: true; trialEndsAt: string } | { error: string };

/** Opt-in 14-day Business trial — one per workspace, owners/admins only. */
export const startBusinessTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => TrialInput.parse(d))
  .handler(async ({ data, context }): Promise<TrialResult> => {
    const { supabase } = context;
    const { data: isAdmin } = await supabase.rpc("has_org_role", {
      _org: data.orgId,
      _roles: ["org_owner", "org_admin"],
    });
    if (!isAdmin) return { error: "Only org owners or admins can start the trial." };

    const { data: sub } = await supabase
      .from("organization_subscriptions")
      .select("id,trial_started_at,stripe_subscription_id")
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (sub?.trial_started_at) return { error: "This workspace has already used its free trial." };
    const { data: cur } = await supabase.from("organization_subscriptions")
      .select("subscription_plans(plan_kind)").eq("org_id", data.orgId).maybeSingle();
    if (cur?.subscription_plans?.plan_kind && cur.subscription_plans.plan_kind !== "legacy") {
      return { error: "Your package already includes every module." };
    }
    if (sub?.stripe_subscription_id) return { error: "This workspace already has a paid subscription." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: business } = await supabaseAdmin
      .from("subscription_plans").select("id").eq("code", "business").maybeSingle();
    if (!business?.id) return { error: "Business plan is not available." };

    const now = new Date();
    const ends = new Date(now.getTime() + 14 * 86_400_000);
    const payload = {
      plan_id: business.id as string,
      status: "trialing",
      billing_cycle: "monthly",
      trial_started_at: now.toISOString(),
      trial_ends_at: ends.toISOString(),
      current_period_start: now.toISOString(),
    };

    if (sub?.id) {
      const { error } = await supabaseAdmin
        .from("organization_subscriptions").update(payload as never).eq("org_id", data.orgId);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabaseAdmin
        .from("organization_subscriptions").insert({ org_id: data.orgId, ...payload } as never);
      if (error) return { error: error.message };
    }
    return { ok: true, trialEndsAt: ends.toISOString() };
  });

const PortalInput = z.object({
  orgId: z.string().uuid(),
  returnUrl: z.string().url(),
  environment: EnvSchema,
});

type PortalResult = { url: string } | { error: string };

export const createOrgBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => PortalInput.parse(d))
  .handler(async ({ data, context }): Promise<PortalResult> => {
    const { supabase } = context;
    const { data: isAdmin } = await supabase.rpc("has_org_role", {
      _org: data.orgId,
      _roles: ["org_owner", "org_admin"],
    });
    if (!isAdmin) return { error: "Only org owners or admins can manage billing." };

    const { data: sub } = await supabase
      .from("organization_subscriptions")
      .select("stripe_customer_id")
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (!sub?.stripe_customer_id) return { error: "No billing customer yet — start a subscription first." };

    try {
      const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id,
        return_url: data.returnUrl,
      });
      return { url: portal.url };
    } catch (e) {
      const { getStripeErrorMessage } = await import("@/lib/stripe.server");
      return { error: getStripeErrorMessage(e) };
    }
  });

const SeatInput = z.object({
  orgId: z.string().uuid(),
  environment: EnvSchema,
});

type SeatResult = { quantity: number } | { skipped: true } | { error: string };

/** Keep the Stripe subscription item quantity in step with active members (Stripe prorates). */
export const syncSubscriptionSeats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => SeatInput.parse(d))
  .handler(async ({ data, context }): Promise<SeatResult> => {
    const { supabase } = context;
    const { data: isMember } = await supabase.rpc("is_org_member", { _org: data.orgId });
    if (!isMember) return { error: "Not a member of this workspace." };

    const [{ data: sub }, { count }] = await Promise.all([
      supabase.from("organization_subscriptions")
        .select("stripe_subscription_id,status").eq("org_id", data.orgId).maybeSingle(),
      supabase.from("memberships").select("id", { count: "exact", head: true })
        .eq("org_id", data.orgId).eq("status", "active"),
    ]);
    if (!sub?.stripe_subscription_id) return { skipped: true };
    if (sub.status === "canceled" || sub.status === "expired") return { skipped: true };

    const quantity = Math.max(1, count ?? 1);
    try {
      const { createStripeClient } = await import("@/lib/stripe.server");
      const stripe = createStripeClient(data.environment);
      const subscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
      const item = subscription.items.data[0];
      if (!item) return { skipped: true };
      if (item.quantity === quantity) return { quantity };
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        items: [{ id: item.id, quantity }],
        proration_behavior: "create_prorations",
      });
      return { quantity };
    } catch (e) {
      const { getStripeErrorMessage } = await import("@/lib/stripe.server");
      return { error: getStripeErrorMessage(e) };
    }
  });
