// Server functions for platform-level admin actions.
// Every mutation writes a platform_audit_logs row inside the handler.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

async function requirePlatformOwner(supabase: any): Promise<void> {
  const { data, error } = await supabase.rpc("is_platform_owner");
  if (error || !data) throw new Error("Forbidden: platform operator role required.");
}

async function audit(supabase: any, action: string, targetOrg: string | null, details: Record<string, unknown>) {
  await supabase.from("platform_audit_logs").insert({
    target_org: targetOrg,
    action,
    details,
  });
}

/* ============================= Stats ============================= */

export const getPlatformOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformOwner(context.supabase);
    const { data, error } = await context.supabase.rpc("platform_overview_stats");
    if (error) throw new Error(error.message);
    return data?.[0] ?? null;
  });

/**
 * Update check for self-hosted installs. UPDATE_FEED_URL points at Inuberry's release feed
 * (https://crm.inuberry.com/api/public/releases) or a GitHub "latest release" URL. Only the version
 * and notes are fetched; nothing about this install is sent. When a newer version is out, the
 * platform owner also gets a notification (once per version).
 */
export const checkForUpdate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformOwner(context.supabase);
    const { APP_VERSION, isNewerVersion } = await import("@/lib/version");
    const canInstall = !!(process.env.UPDATER_URL && process.env.UPDATER_TOKEN);
    const none = { current: APP_VERSION, latest: null as string | null, notes: [] as string[], url: null as string | null, updateAvailable: false, canInstall };
    const feed = process.env.UPDATE_FEED_URL;
    if (!feed) return none;
    try {
      const res = await fetch(feed, { headers: { accept: "application/json, application/vnd.github+json", "user-agent": "inuberry-update-check" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { version?: string; notes?: string[]; tag_name?: string; html_url?: string; body?: string };
      const latest = (j.version ?? j.tag_name ?? "").replace(/^v/i, "") || null;
      const notes = j.notes ?? (j.body ? j.body.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2)) : []);
      const updateAvailable = !!latest && isNewerVersion(latest);
      if (updateAvailable) await notifyUpdate(context.supabase, latest!);
      return { ...none, latest, notes: notes.slice(0, 12), url: j.html_url ?? null, updateAvailable };
    } catch {
      return none;
    }
  });

/** One notification per new version for the platform owner (in the Platform workspace). */
async function notifyUpdate(sb: SupabaseClient<Database>, version: string) {
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: m } = await supabaseAdmin.from("memberships").select("org_id")
    .eq("user_id", u.user.id).eq("role", "platform_owner").eq("status", "active").limit(1).maybeSingle();
  if (!m) return;
  const title = `Inuberry ${version} is available`;
  const { count } = await supabaseAdmin.from("notification_events").select("id", { count: "exact", head: true })
    .eq("user_id", u.user.id).eq("title", title);
  if (count) return;
  const { notifyUsers } = await import("@/lib/notifications/notify.server");
  await notifyUsers(m.org_id, [u.user.id], {
    kind: "system.update", title, body: "See what's new and install it from the Platform overview.",
    module: "system", link: "/app/platform?update=1", action: "See update",
  });
}

async function updater(path: string, method: "GET" | "POST") {
  const url = process.env.UPDATER_URL, token = process.env.UPDATER_TOKEN;
  if (!url || !token) throw new Error("One-click updates aren't set up on this install. Update by hand: docker compose pull && docker compose up -d");
  const res = await fetch(`${url.replace(/\/+$/, "")}${path}`, { method, headers: { authorization: `Bearer ${token}` } });
  const body = (await res.json().catch(() => ({}))) as { error?: string; state?: string; message?: string };
  if (!res.ok && res.status !== 202) throw new Error(body.error ?? `Updater answered ${res.status}`);
  return body;
}

/** Starts the one-click update (the updater service pulls the new image and restarts the app). */
export const installUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformOwner(context.supabase);
    await updater("/update", "POST");
    return { started: true };
  });

/** Progress of the one-click update, from the updater service. */
export const updateProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformOwner(context.supabase);
    try { return await updater("/status", "GET"); } catch (e) { return { state: "unknown", message: e instanceof Error ? e.message : String(e) }; }
  });

export const getOrgDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePlatformOwner(context.supabase);
    const [org, sub, stats, susp, offering, demo] = await Promise.all([
      context.supabase.from("organizations").select("*").eq("id", data.orgId).maybeSingle(),
      context.supabase
        .from("organization_subscriptions")
        .select("*, plan:plan_id(id,name,code,price_monthly,modules,user_limit,ai_agent_limit), offering:custom_offering_id(id,name,override_price,modules,override_limits)")
        .eq("org_id", data.orgId)
        .maybeSingle(),
      context.supabase.rpc("platform_org_stats", { _org: data.orgId }),
      context.supabase
        .from("org_suspensions")
        .select("*")
        .eq("org_id", data.orgId)
        .order("suspended_at", { ascending: false })
        .limit(5),
      context.supabase
        .from("custom_offerings")
        .select("*")
        .eq("org_id", data.orgId)
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      context.supabase.from("demo_orgs").select("*").eq("org_id", data.orgId).maybeSingle(),
    ]);
    return {
      org: org.data,
      subscription: sub.data,
      stats: stats.data ?? {},
      suspensions: susp.data ?? [],
      offerings: offering.data ?? [],
      demo: demo.data,
      isSuspended: (susp.data ?? []).some((s) => !s.reactivated_at),
    };
  });

/* ============================ Suspend ============================ */

export const suspendOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ orgId: z.string().uuid(), reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePlatformOwner(context.supabase);
    const { error } = await context.supabase.from("org_suspensions").insert({
      org_id: data.orgId,
      reason: data.reason,
    });
    if (error) throw new Error(error.message);
    await context.supabase.from("organizations").update({ status: "suspended" }).eq("id", data.orgId);
    await audit(context.supabase, "org.suspend", data.orgId, { reason: data.reason });
    return { ok: true };
  });

export const reactivateOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePlatformOwner(context.supabase);
    const { error } = await context.supabase
      .from("org_suspensions")
      .update({ reactivated_at: new Date().toISOString(), reactivated_by: context.userId })
      .eq("org_id", data.orgId)
      .is("reactivated_at", null);
    if (error) throw new Error(error.message);
    await context.supabase.from("organizations").update({ status: "active" }).eq("id", data.orgId);
    await audit(context.supabase, "org.reactivate", data.orgId, {});
    return { ok: true };
  });

/* ========================= Custom offerings ======================= */

const OfferingInput = z.object({
  orgId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  overridePrice: z.number().nonnegative().nullable().optional(),
  overrideInterval: z.enum(["monthly", "yearly", "none"]).nullable().optional(),
  modules: z.array(z.string()).nullable().optional(),
  userLimit: z.number().int().positive().nullable().optional(),
  aiAgentLimit: z.number().int().nonnegative().nullable().optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const createCustomOffering = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => OfferingInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePlatformOwner(context.supabase);
    const limits: Record<string, number> = {};
    if (data.userLimit != null) limits.user_limit = data.userLimit;
    if (data.aiAgentLimit != null) limits.ai_agent_limit = data.aiAgentLimit;

    const { data: row, error } = await context.supabase
      .from("custom_offerings")
      .insert({
        org_id: data.orgId,
        name: data.name,
        override_price: data.overridePrice ?? null,
        override_interval: data.overrideInterval ?? null,
        modules: data.modules ?? null,
        override_limits: limits,
        trial_ends_at: data.trialEndsAt ?? null,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Attach to org subscription if present
    await context.supabase
      .from("organization_subscriptions")
      .update({ custom_offering_id: row.id })
      .eq("org_id", data.orgId);

    await audit(context.supabase, "offering.create", data.orgId, { offering_id: row.id, name: data.name });
    return { id: row.id };
  });

export const detachCustomOffering = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ orgId: z.string().uuid(), offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePlatformOwner(context.supabase);
    await context.supabase
      .from("custom_offerings")
      .update({ is_active: false })
      .eq("id", data.offeringId);
    await context.supabase
      .from("organization_subscriptions")
      .update({ custom_offering_id: null })
      .eq("org_id", data.orgId)
      .eq("custom_offering_id", data.offeringId);
    await audit(context.supabase, "offering.detach", data.orgId, { offering_id: data.offeringId });
    return { ok: true };
  });

/* ============================ Plan change ========================= */

export const changeOrgPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        planId: z.string().uuid(),
        billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
        status: z.enum(["trialing", "active", "canceled", "past_due"]).optional(),
        // When the plan ends. A date in the past makes the company's data read-only (for testing
        // or after a manual deal ends). Omitted: packages run their term from today; old plans don't end.
        periodEnd: z.string().datetime().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePlatformOwner(context.supabase);
    const { data: existing } = await context.supabase
      .from("organization_subscriptions")
      .select("id")
      .eq("org_id", data.orgId)
      .maybeSingle();
    const { data: plan } = await context.supabase
      .from("subscription_plans").select("plan_kind,term_months").eq("id", data.planId).maybeSingle();
    const patch: any = { plan_id: data.planId, billing_cycle: data.billingCycle };
    if (data.status) patch.status = data.status;
    if (data.periodEnd) {
      patch.current_period_end = data.periodEnd;
      if (!data.status) patch.status = "active";
    } else if (plan?.plan_kind === "tier") {
      // Pricing-page plans run month to month until changed.
      patch.current_period_start = new Date().toISOString();
      patch.current_period_end = null;
      if (!data.status) patch.status = "active";
    } else if (plan && plan.plan_kind !== "legacy" && plan.term_months) {
      const end = new Date();
      end.setMonth(end.getMonth() + plan.term_months);
      patch.current_period_start = new Date().toISOString();
      patch.current_period_end = end.toISOString();
      if (!data.status) patch.status = "active";
    }
    if (existing) {
      await context.supabase.from("organization_subscriptions").update(patch).eq("id", existing.id);
    } else {
      await context.supabase.from("organization_subscriptions").insert({ org_id: data.orgId, ...patch });
    }
    await audit(context.supabase, "org.change_plan", data.orgId, patch);
    return { ok: true };
  });

/* ============================ Demo orgs =========================== */

const FIRST_NAMES = ["Alex", "Jordan", "Sam", "Riley", "Casey", "Morgan", "Taylor", "Avery", "Quinn", "Reese", "Rowan", "Skyler", "Emerson", "Harper", "Kai"];
const LAST_NAMES = ["Nguyen", "Patel", "Kim", "Garcia", "Silva", "Cohen", "Okafor", "Dubois", "Rossi", "Novak", "Chen", "Ahmed", "Martin", "Andersen", "Suzuki"];

function pick<T>(a: T[], i: number): T { return a[i % a.length]; }

const DemoInput = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,40}$/),
  planId: z.string().uuid().optional(),
  seedDepth: z.enum(["none", "basic", "rich"]).default("basic"),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  users: z
    .array(
      z.object({
        mode: z.enum(["seed_only", "invite", "temp_password"]),
        email: z.string().email().optional(),
        firstName: z.string().max(60).optional(),
        lastName: z.string().max(60).optional(),
        role: z.enum(["org_admin", "manager", "sales_rep", "accountant", "hr_manager", "inventory_manager", "staff", "read_only"]).default("staff"),
      }),
    )
    .max(50)
    .default([]),
});

export const createDemoOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => DemoInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePlatformOwner(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Create org
    const { data: org, error: orgErr } = await supabaseAdmin
      .from("organizations")
      .insert({ name: data.name, slug: data.slug, created_by: context.userId })
      .select("id")
      .single();
    if (orgErr || !org) throw new Error(orgErr?.message ?? "Failed to create org");

    // 2) Mark as demo
    await supabaseAdmin.from("demo_orgs").insert({
      org_id: org.id,
      created_by: context.userId,
      seed_depth: data.seedDepth,
      expires_at: data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 86400000).toISOString() : null,
    });

    // 3) Subscribe to a plan if provided
    if (data.planId) {
      await supabaseAdmin.from("organization_subscriptions").insert({
        org_id: org.id,
        plan_id: data.planId,
        status: "trialing",
        trial_ends_at: data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 86400000).toISOString() : null,
      });
    }

    // 4) Seed COA/warehouse/deal stages for basic+
    if (data.seedDepth !== "none") {
      await Promise.all([
        supabaseAdmin.rpc("seed_default_coa", { _org: org.id }),
        supabaseAdmin.rpc("seed_default_warehouse", { _org: org.id }),
        supabaseAdmin.rpc("seed_default_deal_stages", { _org: org.id }),
      ]);
    }

    // 5) Provision users
    const credentials: Array<{ email: string; password?: string; mode: string }> = [];
    for (let i = 0; i < data.users.length; i++) {
      const u = data.users[i];
      const first = u.firstName ?? pick(FIRST_NAMES, i);
      const last = u.lastName ?? pick(LAST_NAMES, i);
      const email = u.email ?? `${first.toLowerCase()}.${last.toLowerCase()}+${data.slug}${i}@demo.inuberry.local`;

      if (u.mode === "seed_only") {
        // Employee record only, no auth user
        await supabaseAdmin.from("employees").insert({
          org_id: org.id,
          first_name: first,
          last_name: last,
          email,
          employment_type: "full_time",
          status: "active",
        });
        credentials.push({ email, mode: "seed_only" });
        continue;
      }

      let userId: string | null = null;
      if (u.mode === "temp_password") {
        const password = `Demo!${Math.random().toString(36).slice(2, 10)}A1`;
        const { data: created, error: uErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: `${first} ${last}` },
        });
        if (uErr) throw new Error(`Auth create failed for ${email}: ${uErr.message}`);
        userId = created.user?.id ?? null;
        credentials.push({ email, password, mode: "temp_password" });
      } else {
        const { data: invited, error: iErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: `${first} ${last}`, org_slug: data.slug },
        });
        if (iErr) throw new Error(`Invite failed for ${email}: ${iErr.message}`);
        userId = invited.user?.id ?? null;
        credentials.push({ email, mode: "invite" });
      }

      if (userId) {
        await supabaseAdmin.from("memberships").insert({
          org_id: org.id,
          user_id: userId,
          role: u.role,
          invited_by: context.userId,
        });
        await supabaseAdmin.from("employees").insert({
          org_id: org.id,
          user_id: userId,
          first_name: first,
          last_name: last,
          email,
          employment_type: "full_time",
          status: "active",
        });
      }
    }

    // 6) Rich business data (best-effort; skip on failure)
    if (data.seedDepth === "rich") {
      try {
        // A few contacts / companies / deals / products
        const companies = Array.from({ length: 4 }).map((_, k) => ({
          org_id: org.id,
          name: `${pick(LAST_NAMES, k + 3)} & Co`,
          website: `https://example-${k}.test`,
        }));
        await supabaseAdmin.from("companies").insert(companies);
        const products = Array.from({ length: 6 }).map((_, k) => ({
          org_id: org.id,
          name: `Demo product ${k + 1}`,
          sku: `DEMO-${data.slug}-${1000 + k}`,
          sale_price: 50 + k * 25,
          cost_price: 25 + k * 10,
        }));
        await supabaseAdmin.from("products").insert(products);
      } catch {
        // non-fatal
      }
    }

    await audit(context.supabase, "demo.create", org.id, { seed_depth: data.seedDepth, user_count: data.users.length });
    return { orgId: org.id, credentials };
  });

/* ============================ Delete ============================== */

export const deleteOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ orgId: z.string().uuid(), confirmSlug: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePlatformOwner(context.supabase);
    const { data: org } = await context.supabase.from("organizations").select("slug,name").eq("id", data.orgId).maybeSingle();
    if (!org) throw new Error("Organization not found");
    if (org.slug !== data.confirmSlug) throw new Error("Confirmation slug mismatch");
    await audit(context.supabase, "org.delete", data.orgId, { name: org.name, slug: org.slug });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("organizations").delete().eq("id", data.orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ========================= Impersonation ========================== */

export const requestImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ orgId: z.string().uuid(), reason: z.string().trim().min(10).max(500), durationMinutes: z.number().int().min(15).max(240).default(60) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePlatformOwner(context.supabase);
    const { data: row, error } = await context.supabase
      .from("impersonation_requests")
      .insert({
        org_id: data.orgId,
        requested_by: context.userId,
        reason: data.reason,
        expires_at: new Date(Date.now() + data.durationMinutes * 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(context.supabase, "impersonation.request", data.orgId, { request_id: row.id, reason: data.reason });
    return { requestId: row.id };
  });

// Org owner approves or denies from their own settings page
export const respondImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ requestId: z.string().uuid(), approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: req, error } = await context.supabase
      .from("impersonation_requests")
      .select("id, org_id, status, expires_at")
      .eq("id", data.requestId)
      .maybeSingle();
    if (error || !req) throw new Error("Request not found");
    const { data: isAdmin } = await context.supabase.rpc("has_org_role", { _org: req.org_id, _roles: ["org_owner", "org_admin"] });
    if (!isAdmin) throw new Error("Only org owners/admins can respond");
    if (req.status !== "pending") throw new Error("Request already responded to");
    if (data.approve && req.expires_at && new Date(req.expires_at) <= new Date()) throw new Error("This request has expired; ask for a new one.");
    const { data: user } = await context.supabase.auth.getUser();
    const status = data.approve ? "approved" : "denied";
    // Org admins may only read these tables (RLS), so the write goes through the service role after the checks above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error: upErr } = await supabaseAdmin
      .from("impersonation_requests")
      .update({
        status,
        authorized_by: context.userId,
        authorized_by_email: user?.user?.email ?? null,
        authorized_at: new Date().toISOString(),
      })
      .eq("id", data.requestId)
      .eq("status", "pending")
      .select("id");
    if (upErr) throw new Error(upErr.message);
    if (!updated?.length) throw new Error("Request already responded to");
    // Insert an event visible to org admins
    await supabaseAdmin.from("impersonation_events").insert({
      request_id: data.requestId,
      org_id: req.org_id,
      actor_id: context.userId,
      event_type: data.approve ? "approved" : "denied",
      details: { by: user?.user?.email ?? null },
    });
    return { ok: true, status };
  });

export const endImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: req } = await context.supabase
      .from("impersonation_requests")
      .select("org_id, status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req) throw new Error("Not found");
    const { data: isPlatform } = await context.supabase.rpc("is_platform_owner");
    const { data: isAdmin } = await context.supabase.rpc("has_org_role", { _org: req.org_id, _roles: ["org_owner", "org_admin"] });
    if (!isPlatform && !isAdmin) throw new Error("Forbidden");
    if (req.status !== "approved") throw new Error("Only an approved session can be ended");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin
      .from("impersonation_requests")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", data.requestId);
    if (upErr) throw new Error(upErr.message);
    await supabaseAdmin.from("impersonation_events").insert({
      request_id: data.requestId,
      org_id: req.org_id,
      actor_id: context.userId,
      event_type: "ended",
      details: { by: isPlatform ? "platform" : "org_admin" },
    });
    return { ok: true };
  });
