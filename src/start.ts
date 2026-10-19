import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/lovable/")) {
    return next();
  }
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// CSRF protection for server functions: reject cross-site calls to the RPC
// endpoint. Browsers always send Origin (or Sec-Fetch-Site) on POST requests.
const csrfMiddleware = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/_serverFn")) return next();
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return new Response("Forbidden (CSRF)", { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
    let originHost = "";
    try { originHost = new URL(origin).host; } catch { /* invalid */ }
    if (originHost !== host && originHost !== url.host) {
      return new Response("Forbidden (CSRF)", { status: 403 });
    }
  } else if (request.method !== "GET" && !site) {
    // Non-browser clients without Origin/Sec-Fetch-Site must use the public API instead.
    return new Response("Forbidden (CSRF)", { status: 403 });
  }
  return next();
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
