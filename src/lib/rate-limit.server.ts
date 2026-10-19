// How often one caller may hit a public endpoint (hit_rate_limit, migration 0039).
// If the counter can't be reached (database update not applied yet, a hiccup), the call is allowed:
// a limit must never take the app down.

/** True when this call goes over the limit: `max` calls per `windowSeconds` for `key`. */
export async function overLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("hit_rate_limit", { _key: key, _max: max, _window_seconds: windowSeconds });
    return !error && data === false;
  } catch {
    return false;
  }
}

/** The caller's IP address as the host reports it. */
export function clientIp(request: Request | undefined) {
  const h = request?.headers;
  return h?.get("cf-connecting-ip") || h?.get("x-forwarded-for")?.split(",")[0].trim() || h?.get("x-real-ip") || "unknown";
}

/** A short, non-reversible id for a secret (an API key or token), for use in a limit key. */
export async function secretId(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 429 with a Retry-After header. */
export function tooMany(retryAfterSeconds: number, message = "Too many requests. Wait a moment and try again.") {
  return new Response(JSON.stringify({ error: "rate_limited", error_description: message }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(retryAfterSeconds) },
  });
}
