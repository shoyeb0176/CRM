// Self-check for Stripe mode selection and webhook signature verification (src/lib/stripe.server.ts).
// Run: bun scripts/selftest-stripe.ts
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { isDirectStripe, resolveStripeEnv, verifyWebhook, webhookEnv } from "../src/lib/stripe.server";

const SECRET = "whsec_selftest";
function signedRequest(body: string, secret = SECRET, ts = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  return new Request("https://x/api/public/payments/webhook", {
    method: "POST", body, headers: { "stripe-signature": `t=${ts},v1=${sig}` },
  });
}

// Lovable connector mode (no STRIPE_SECRET_KEY): env comes from ?env=.
delete process.env.STRIPE_SECRET_KEY;
assert.equal(isDirectStripe(), false);
assert.equal(webhookEnv("sandbox"), "sandbox");
assert.equal(webhookEnv(null), null);
assert.equal(resolveStripeEnv("live"), "live");

// Direct mode: env comes from the key, and must match the browser's publishable key.
process.env.STRIPE_SECRET_KEY = "sk_test_abc";
assert.equal(isDirectStripe(), true);
assert.equal(webhookEnv(null), "sandbox");
assert.equal(webhookEnv("live"), "sandbox");
assert.equal(resolveStripeEnv("sandbox"), "sandbox");
assert.throws(() => resolveStripeEnv("live"), /don't match/);
process.env.STRIPE_SECRET_KEY = "sk_live_abc";
assert.equal(webhookEnv(null), "live");

// Webhook signatures: valid passes, tampered body / wrong secret / stale timestamp fail.
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: {} } });
assert.equal((await verifyWebhook(signedRequest(body), "sandbox")).type, "checkout.session.completed");
await assert.rejects(verifyWebhook(signedRequest(body, "whsec_wrong"), "sandbox"), /Invalid webhook signature/);
const tampered = signedRequest(body);
await assert.rejects(
  verifyWebhook(new Request(tampered.url, { method: "POST", body: body.replace("evt_1", "evt_2"), headers: tampered.headers }), "sandbox"),
  /Invalid webhook signature/,
);
await assert.rejects(verifyWebhook(signedRequest(body, SECRET, Math.floor(Date.now() / 1000) - 3600), "sandbox"), /too old/);

console.log("stripe self-test: ok");
