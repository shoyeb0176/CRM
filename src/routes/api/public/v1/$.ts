// Public REST API entry point. Authentication is by API key inside the handler.
import { createFileRoute } from "@tanstack/react-router";

async function handle({ request, params }: { request: Request; params: { _splat?: string } }) {
  const { clientIp, overLimit, secretId, tooMany } = await import("@/lib/rate-limit.server");
  // 120 requests a minute per API key (or per address without one).
  const auth = request.headers.get("authorization") ?? "";
  if (await overLimit(auth ? `api:${await secretId(auth)}` : `api-ip:${clientIp(request)}`, 120, 60)) return tooMany(60);
  const { handleRestRequest } = await import("@/lib/api/rest.server");
  return handleRestRequest(request, params._splat ?? "");
}

export const Route = createFileRoute("/api/public/v1/$")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
      PATCH: handle,
      DELETE: handle,
    },
  },
});
