// Server-only core of the public REST API (/api/public/v1/*).
// Authenticates an API key, scopes every query to that key's organization,
// and exposes a small whitelist of resources with safe column projections.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

let _admin: SupabaseClient<Database> | null = null;
export function apiAdmin(): SupabaseClient<Database> {
  if (!_admin) {
    _admin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return _admin;
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type ResourceDef = {
  table: keyof Database["public"]["Tables"];
  columns: string;
  writable: string[];
  orderBy: string;
  search?: string[];
  /** Table has an `archived` flag: lists hide archived rows unless ?include_archived=true. */
  archivable?: boolean;
};

export const RESOURCES: Record<string, ResourceDef> = {
  companies: {
    table: "companies",
    columns: "id,name,website,industry,size,status,phone,address,city,country,created_at,updated_at",
    writable: ["name", "website", "industry", "size", "status", "phone", "address", "city", "country"],
    orderBy: "created_at",
    search: ["name", "industry", "city"],
    archivable: true,
  },
  contacts: {
    table: "contacts",
    columns: "id,first_name,last_name,email,phone,job_title,company_id,lifecycle_stage,created_at,updated_at",
    writable: ["first_name", "last_name", "email", "phone", "job_title", "company_id", "lifecycle_stage"],
    orderBy: "created_at",
    search: ["first_name", "last_name", "email"],
    archivable: true,
  },
  leads: {
    table: "leads",
    columns: "id,name,email,phone,company_name,status,source,estimated_value,created_at,updated_at",
    writable: ["name", "email", "phone", "company_name", "status", "source", "estimated_value", "notes"],
    orderBy: "created_at",
    search: ["name", "email", "company_name"],
  },
  deals: {
    table: "deals",
    columns: "id,title,amount,currency,status,stage_id,company_id,contact_id,expected_close_date,created_at,updated_at",
    writable: ["title", "amount", "currency", "status", "stage_id", "company_id", "contact_id", "expected_close_date"],
    orderBy: "created_at",
    search: ["title"],
  },
  products: {
    table: "products",
    columns: "id,name,sku,product_type,sale_price,cost_price,currency,is_active,created_at,updated_at",
    writable: ["name", "sku", "product_type", "sale_price", "cost_price", "currency", "is_active"],
    orderBy: "created_at",
    search: ["name", "sku"],
    archivable: true,
  },
  invoices: {
    table: "invoices",
    columns: "id,number,status,company_id,issue_date,due_date,subtotal,tax_total,total,amount_paid,balance_due,currency,created_at",
    writable: ["status", "due_date", "notes"],
    orderBy: "created_at",
    search: ["number"],
  },
  projects: {
    table: "projects",
    columns: "id,name,code,status,customer_company_id,start_date,due_date,budget,currency,created_at,updated_at",
    writable: ["name", "code", "status", "customer_company_id", "start_date", "due_date", "budget"],
    orderBy: "created_at",
    search: ["name", "code"],
    archivable: true,
  },
  tasks: {
    table: "project_tasks",
    columns: "id,title,description,status,priority,project_id,assignee_id,due_date,created_at,updated_at",
    writable: ["title", "description", "status", "priority", "project_id", "assignee_id", "due_date"],
    orderBy: "created_at",
    search: ["title"],
  },
};

export type AuthedKey = { keyId: string; orgId: string; scopes: string[] };

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function authenticateKey(request: Request): Promise<AuthedKey | Response> {
  const header = request.headers.get("authorization") ?? "";
  const raw = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : (request.headers.get("x-api-key") ?? "").trim();
  if (!raw) return jsonResponse({ error: "Missing API key" }, 401);

  const hash = await sha256Hex(raw);
  const { data } = await apiAdmin()
    .from("api_keys")
    .select("id,org_id,scopes,revoked_at,expires_at")
    .eq("key_hash", hash)
    .maybeSingle();
  if (!data) return jsonResponse({ error: "Invalid API key" }, 401);
  if (data.revoked_at) return jsonResponse({ error: "API key revoked" }, 401);
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return jsonResponse({ error: "API key expired" }, 401);
  }
  await apiAdmin().from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { keyId: data.id, orgId: data.org_id, scopes: (data.scopes ?? []) as string[] };
}

export async function logRequest(
  auth: AuthedKey,
  method: string,
  path: string,
  status: number,
  startedAt: number,
) {
  try {
    await apiAdmin().from("api_request_logs").insert({
      org_id: auth.orgId,
      api_key_id: auth.keyId,
      method,
      path,
      status,
      duration_ms: Math.round(performance.now() - startedAt),
    });
  } catch {
    /* logging must never break the response */
  }
}

function pick(body: Record<string, unknown>, writable: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of writable) if (k in body) out[k] = body[k];
  return out;
}

/** Handles GET/POST/PATCH/DELETE for /api/public/v1/<resource>[/<id>]. */
export async function handleRestRequest(request: Request, splat: string): Promise<Response> {
  const started = performance.now();
  const auth = await authenticateKey(request);
  if (auth instanceof Response) return auth;

  const segments = splat.split("/").filter(Boolean);
  const method = request.method.toUpperCase();
  const path = `/api/public/v1/${segments.join("/")}`;
  const finish = async (res: Response) => {
    await logRequest(auth, method, path, res.status, started);
    return res;
  };

  if (segments.length === 0) {
    return finish(jsonResponse({ resources: Object.keys(RESOURCES), docs: "/api/public/v1/<resource>" }));
  }

  const [name, id] = segments;
  const def = RESOURCES[name!];
  if (!def) return finish(jsonResponse({ error: `Unknown resource '${name}'` }, 404));

  const canWrite = auth.scopes.includes("write");
  if (method !== "GET" && !canWrite) {
    return finish(jsonResponse({ error: "This API key is read-only" }, 403));
  }
  if (method === "GET" && !auth.scopes.includes("read") && !canWrite) {
    return finish(jsonResponse({ error: "This API key cannot read" }, 403));
  }
  // The API writes with the service role, which skips the database's plan lock, so check it here:
  // a workspace whose plan has ended stays readable but can't change data until it renews.
  if (method !== "GET") {
    const { data: active } = await (apiAdmin() as unknown as SupabaseClient).rpc("org_is_active", { _org: auth.orgId });
    if (active === false) {
      return finish(jsonResponse({ error: "This workspace's plan has ended. Data is read-only until it is renewed." }, 402));
    }
  }

  // Resource tables are chosen from a fixed whitelist, so we query them untyped.
  const db = apiAdmin() as unknown as SupabaseClient;
  const table = db.from(def.table as string);

  try {
    if (method === "GET" && id) {
      const { data, error } = await table.select(def.columns).eq("org_id", auth.orgId).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return finish(jsonResponse({ error: "Not found" }, 404));
      return finish(jsonResponse({ data }));
    }

    if (method === "GET") {
      const url = new URL(request.url);
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);
      const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
      const q = url.searchParams.get("q");
      const status = url.searchParams.get("status");
      let query = table
        .select(def.columns, { count: "exact" })
        .eq("org_id", auth.orgId)
        .order(def.orderBy, { ascending: false })
        .range(offset, offset + limit - 1);
      if (status) query = query.eq("status", status);
      if (def.archivable && url.searchParams.get("include_archived") !== "true") query = query.eq("archived", false);
      if (q && def.search?.length) {
        query = query.or(def.search.map((c) => `${c}.ilike.%${q}%`).join(","));
      }
      const { data, error, count } = await query;
      if (error) throw new Error(error.message);
      return finish(jsonResponse({ data, meta: { limit, offset, total: count ?? null } }));
    }

    const body = method === "DELETE" ? {} : ((await request.json().catch(() => ({}))) as Record<string, unknown>);

    if (method === "POST") {
      const values = pick(body, def.writable);
      if (!Object.keys(values).length) return finish(jsonResponse({ error: "No writable fields supplied" }, 400));
      const { data, error } = await table
        .insert({ ...values, org_id: auth.orgId })
        .select(def.columns)
        .single();
      if (error) throw new Error(error.message);
      await dispatch(auth.orgId, `${name}.created`, data);
      return finish(jsonResponse({ data }, 201));
    }

    if (method === "PATCH") {
      if (!id) return finish(jsonResponse({ error: "An id is required" }, 400));
      const values = pick(body, def.writable);
      if (!Object.keys(values).length) return finish(jsonResponse({ error: "No writable fields supplied" }, 400));
      const { data, error } = await table
        .update(values)
        .eq("org_id", auth.orgId)
        .eq("id", id)
        .select(def.columns)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return finish(jsonResponse({ error: "Not found" }, 404));
      await dispatch(auth.orgId, `${name}.updated`, data);
      return finish(jsonResponse({ data }));
    }

    if (method === "DELETE") {
      if (!id) return finish(jsonResponse({ error: "An id is required" }, 400));
      const { error } = await table.delete().eq("org_id", auth.orgId).eq("id", id);
      if (error) throw new Error(error.message);
      await dispatch(auth.orgId, `${name}.deleted`, { id });
      return finish(jsonResponse({ data: { id, deleted: true } }));
    }

    return finish(jsonResponse({ error: "Method not allowed" }, 405));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return finish(jsonResponse({ error: message }, 400));
  }
}

async function dispatch(orgId: string, event: string, payload: unknown) {
  const { dispatchWebhookEvent } = await import("./webhooks.server");
  await dispatchWebhookEvent(orgId, event, payload);
}
