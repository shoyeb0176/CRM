// Shared Stripe client. ALL server-side Stripe calls must use createStripeClient(env).
//
// Two modes:
//  - Direct (STRIPE_SECRET_KEY set): our own Stripe account, called straight from this server.
//    Sandbox vs live comes from the key itself (sk_test_ / sk_live_), not from the browser.
//  - Lovable connector (no STRIPE_SECRET_KEY): STRIPE_SANDBOX_API_KEY / STRIPE_LIVE_API_KEY are
//    Lovable gateway connection ids, not Stripe secrets; calls go through connector-gateway.lovable.dev.

import Stripe from "stripe";

const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export type StripeEnv = "sandbox" | "live";

const GATEWAY_STRIPE_BASE = "https://connector-gateway.lovable.dev/stripe";
const API_VERSION = "2026-03-25.dahlia";

/** Our own Stripe secret key, when configured (read per call: Workers bind env per request). */
function directSecretKey(): string | null {
  return process.env.STRIPE_SECRET_KEY || null;
}

export function isDirectStripe(): boolean {
  return !!directSecretKey();
}

/** Sandbox/live of the direct key: sk_test_ / rk_test_ are sandbox, everything else live. */
function directEnv(key: string): StripeEnv {
  return /^(sk|rk)_test_/.test(key) ? "sandbox" : "live";
}

/**
 * The Stripe mode this server actually uses. In direct mode it comes from the secret key;
 * the browser's view (from its publishable key) must agree, otherwise checkout would mix accounts.
 */
export function resolveStripeEnv(requested: StripeEnv): StripeEnv {
  const key = directSecretKey();
  if (!key) return requested;
  const env = directEnv(key);
  if (env !== requested) {
    throw new Error(
      `Stripe keys don't match: the server uses a ${env} secret key but the app was built with a ${requested} publishable key.`,
    );
  }
  return env;
}

export function getConnectionApiKey(env: StripeEnv): string {
  return env === "sandbox"
    ? getEnv("STRIPE_SANDBOX_API_KEY")
    : getEnv("STRIPE_LIVE_API_KEY");
}

export function createStripeClient(env: StripeEnv): Stripe {
  const secretKey = directSecretKey();
  if (secretKey) {
    resolveStripeEnv(env);
    return new Stripe(secretKey, { apiVersion: API_VERSION, httpClient: Stripe.createFetchHttpClient() });
  }

  const connectionApiKey = getConnectionApiKey(env);
  const lovableApiKey = getEnv("LOVABLE_API_KEY");

  return new Stripe(connectionApiKey, {
    apiVersion: API_VERSION,
    httpClient: Stripe.createFetchHttpClient((input, init) => {
      const stripeUrl = input instanceof Request ? input.url : input.toString();
      const gatewayUrl = stripeUrl.replace("https://api.stripe.com", GATEWAY_STRIPE_BASE);
      return fetch(gatewayUrl, {
        ...init,
        headers: {
          ...Object.fromEntries(
            new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).entries(),
          ),
          "X-Connection-Api-Key": connectionApiKey,
          "Lovable-API-Key": lovableApiKey,
        },
      });
    }),
  });
}

export function getStripeErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { message?: string; type?: string; code?: string; raw?: { message?: string; type?: string; code?: string } };
    const message = e.raw?.message ?? e.message;
    if (message) {
      const details = [e.raw?.type ?? e.type, e.raw?.code ?? e.code].filter(Boolean);
      return details.length ? `${message} (${details.join(", ")})` : message;
    }
  }
  return "Stripe request failed";
}

/** Environment for an incoming webhook: from the direct key, else the ?env= the Lovable connector adds. */
export function webhookEnv(queryEnv: string | null): StripeEnv | null {
  const key = directSecretKey();
  if (key) return directEnv(key);
  return queryEnv === "sandbox" || queryEnv === "live" ? queryEnv : null;
}

export async function verifyWebhook(req: Request, env: StripeEnv): Promise<{ id?: string; type: string; data: { object: any } }> {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET
    || (env === "sandbox" ? getEnv("PAYMENTS_SANDBOX_WEBHOOK_SECRET") : getEnv("PAYMENTS_LIVE_WEBHOOK_SECRET"));

  if (!signature || !body) throw new Error("Missing signature or body");

  let timestamp: string | undefined;
  const v1Signatures: string[] = [];
  for (const part of signature.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = value;
    if (key === "v1") v1Signatures.push(value);
  }
  if (!timestamp || v1Signatures.length === 0) throw new Error("Invalid signature format");

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) throw new Error("Webhook timestamp too old");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const expected = Array.from(new Uint8Array(signed), (b) => b.toString(16).padStart(2, "0")).join("");

  if (!v1Signatures.includes(expected)) throw new Error("Invalid webhook signature");
  return JSON.parse(body);
}
