// Server-only webhook dispatcher: signs and posts events to an org's endpoints,
// then records every attempt so the org can see what happened.
import { apiAdmin, sha256Hex } from "./rest.server";

export const WEBHOOK_EVENTS = [
  "companies.created",
  "companies.updated",
  "companies.deleted",
  "contacts.created",
  "contacts.updated",
  "leads.created",
  "leads.updated",
  "deals.created",
  "deals.updated",
  "invoices.created",
  "invoices.updated",
  "products.created",
  "projects.created",
  "tasks.created",
  "tasks.updated",
] as const;

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function deliverToEndpoint(
  endpoint: { id: string; org_id: string; url: string; secret: string },
  event: string,
  payload: unknown,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const body = JSON.stringify({ event, created_at: new Date().toISOString(), data: payload });
  let status: number | null = null;
  let error: string | null = null;
  try {
    const signature = await sign(endpoint.secret, body);
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-inuberry-event": event,
        "x-inuberry-signature": signature,
      },
      body,
    });
    status = res.status;
    if (!res.ok) error = `Endpoint responded with ${res.status}`;
  } catch (e) {
    error = e instanceof Error ? e.message : "Request failed";
  }

  await apiAdmin().from("webhook_deliveries").insert({
    org_id: endpoint.org_id,
    endpoint_id: endpoint.id,
    event,
    payload: JSON.parse(body),
    status: error ? "failed" : "delivered",
    response_code: status,
    error,
  });
  await apiAdmin()
    .from("webhook_endpoints")
    .update({ last_delivery_at: new Date().toISOString() })
    .eq("id", endpoint.id);

  return { ok: !error, status: status ?? undefined, error: error ?? undefined };
}

export async function dispatchWebhookEvent(orgId: string, event: string, payload: unknown) {
  const { data } = await apiAdmin()
    .from("webhook_endpoints")
    .select("id,org_id,url,secret,events")
    .eq("org_id", orgId)
    .eq("is_active", true);
  const targets = (data ?? []).filter(
    (e) => !e.events?.length || e.events.includes(event),
  );
  await Promise.all(targets.map((e) => deliverToEndpoint(e, event, payload)));
}

/** A random, readable secret for a new endpoint. */
export function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `whsec_${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function hashKey(raw: string) {
  return sha256Hex(raw);
}
