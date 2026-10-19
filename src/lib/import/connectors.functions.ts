// Direct import from Notion and Airtable with the workspace's own token. The token is either typed
// for one import or saved (encrypted) for the workspace by an owner or admin; it never goes back to
// the browser. Each call does a small amount of work (one page of rows, or a few page bodies) so the
// browser drives the paging and no request runs long.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { airtableRecords, notionBlocksToMarkdown, notionPageRecord, notionTitle } from "./connectors";

const Provider = z.enum(["notion", "airtable"]);
type ProviderName = z.infer<typeof Provider>;
type Json = Record<string, any>;
type RpcClient = { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown }> };

const NOTION = "https://api.notion.com/v1";
const AIRTABLE = "https://api.airtable.com/v0";
const ID = /^[A-Za-z0-9-]{8,64}$/;

const HELP: Record<ProviderName, string> = {
  notion: "Notion didn't accept the token. Use the Internal Integration Secret (it starts with ntn_ or secret_), and share the pages or databases with that integration (••• › Connections).",
  airtable: "Airtable didn't accept the token. It needs the data.records:read and schema.bases:read scopes, and the bases you want added under Access.",
};

async function isAdmin(supabase: unknown, orgId: string) {
  const { data } = await (supabase as RpcClient).rpc("has_org_role", { _org: orgId, _roles: ["org_owner", "org_admin"] });
  return !!data;
}

/** The token to use: the one typed for this import, or the workspace's saved one (owners and admins). */
async function tokenFor(supabase: unknown, orgId: string, provider: ProviderName, typed?: string): Promise<string> {
  const { data: member } = await (supabase as RpcClient).rpc("is_org_member", { _org: orgId });
  if (!member) throw new Error("Not a member of this workspace.");
  if (typed?.trim()) return typed.trim();
  if (!(await isAdmin(supabase, orgId))) throw new Error("Paste a token to import. Only owners and admins can use the workspace's saved one.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("import_connections").select("id, token").eq("org_id", orgId).eq("provider", provider).maybeSingle();
  if (!data) throw new Error(`No ${provider === "notion" ? "Notion" : "Airtable"} token is saved for this workspace yet.`);
  const { decryptSecret } = await import("@/lib/crypto.server");
  await supabaseAdmin.from("import_connections").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return decryptSecret(data.token);
}

/** GET/POST to Notion or Airtable, one retry on rate limiting, readable errors. */
async function api(provider: ProviderName, token: string, path: string, body?: Json): Promise<Json> {
  const url = (provider === "notion" ? NOTION : AIRTABLE) + path;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  if (provider === "notion") headers["Notion-Version"] = "2022-06-28";
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, Math.min(5, Number(res.headers.get("retry-after")) || 1) * 1000));
      continue;
    }
    const j = (await res.json().catch(() => ({}))) as Json;
    if (res.ok) return j;
    if (res.status === 401 || res.status === 403) throw new Error(HELP[provider]);
    if (res.status === 404) throw new Error(provider === "notion"
      ? "Notion couldn't find that. Share it with your integration (••• › Connections) and try again."
      : "Airtable couldn't find that base or table. Check the token has access to the base.");
    const msg = typeof j.message === "string" ? j.message : typeof j.error?.message === "string" ? j.error.message : `HTTP ${res.status}`;
    throw new Error(`${provider === "notion" ? "Notion" : "Airtable"}: ${msg}`);
  }
}

// ---------- saved tokens ----------

export const saveImportConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ orgId: z.string().uuid(), provider: Provider, token: z.string().min(10).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.supabase, data.orgId))) throw new Error("Only workspace owners and admins can save a token.");
    const token = data.token.trim();
    // Check it works before saving.
    const who = data.provider === "notion" ? await api("notion", token, "/users/me") : await api("airtable", token, "/meta/whoami");
    const label = data.provider === "notion" ? (who.bot?.workspace_name ?? who.name ?? null) : (who.email ?? null);
    const { encryptSecret } = await import("@/lib/crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("import_connections").upsert({
      org_id: data.orgId, provider: data.provider, label, token: await encryptSecret(token),
      token_last4: token.slice(-4), created_by: context.userId, created_at: new Date().toISOString(), last_used_at: null,
    }, { onConflict: "org_id,provider" });
    if (error) throw new Error(error.message);
    return { ok: true as const, label };
  });

export const removeImportConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ orgId: z.string().uuid(), provider: Provider }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.supabase, data.orgId))) throw new Error("Only workspace owners and admins can remove a token.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("import_connections").delete().eq("org_id", data.orgId).eq("provider", data.provider);
    return { ok: true as const };
  });

// ---------- browsing and fetching ----------

const Base = z.object({ orgId: z.string().uuid(), provider: Provider, token: z.string().max(500).optional() });

export type ImportSource = { id: string; title: string; kind: "database" | "pages" | "base" | "table" };

/** Notion: databases shared with the integration, plus "All shared pages". Airtable: bases, or a base's tables. */
export const listImportSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Base.extend({ baseId: z.string().regex(ID).optional() }).parse(d))
  .handler(async ({ data, context }): Promise<{ sources: ImportSource[] }> => {
    const token = await tokenFor(context.supabase, data.orgId, data.provider, data.token);
    if (data.provider === "notion") {
      const sources: ImportSource[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 5; i++) {
        const j = await api("notion", token, "/search", { filter: { property: "object", value: "database" }, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
        for (const d of j.results ?? []) sources.push({ id: d.id, title: notionTitle(d), kind: "database" });
        if (!j.has_more) break;
        cursor = j.next_cursor;
      }
      sources.sort((a, b) => a.title.localeCompare(b.title));
      return { sources: [{ id: "pages", title: "All pages shared with the integration", kind: "pages" }, ...sources] };
    }
    if (data.baseId) {
      const j = await api("airtable", token, `/meta/bases/${data.baseId}/tables`);
      return { sources: (j.tables ?? []).map((t: Json) => ({ id: t.id, title: t.name, kind: "table" as const })) };
    }
    const sources: ImportSource[] = [];
    let offset: string | undefined;
    for (let i = 0; i < 5; i++) {
      const j = await api("airtable", token, `/meta/bases${offset ? `?offset=${encodeURIComponent(offset)}` : ""}`);
      for (const b of j.bases ?? []) sources.push({ id: b.id, title: b.name, kind: "base" });
      if (!j.offset) break;
      offset = j.offset;
    }
    return { sources };
  });

/** One page (up to 100) of rows from a Notion database, Notion's shared pages, or an Airtable table. */
export const fetchImportRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Base.extend({
    sourceId: z.string().regex(ID), baseId: z.string().regex(ID).optional(), cursor: z.string().max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<{ records: Record<string, string>[]; pageIds: string[]; next: string | null }> => {
    const token = await tokenFor(context.supabase, data.orgId, data.provider, data.token);
    if (data.provider === "notion") {
      const page = { page_size: 100, ...(data.cursor ? { start_cursor: data.cursor } : {}) };
      const j = data.sourceId === "pages"
        ? await api("notion", token, "/search", { ...page, filter: { property: "object", value: "page" } })
        : await api("notion", token, `/databases/${data.sourceId}/query`, page);
      const results = (j.results ?? []) as Json[];
      // Shared pages that are rows of a database are left to that database's import.
      const rows = data.sourceId === "pages" ? results.filter((p) => p.parent?.type !== "database_id") : results;
      return {
        records: rows.map((p) => (data.sourceId === "pages" ? { Title: notionTitle(p) } : notionPageRecord(p))),
        pageIds: rows.map((p) => p.id),
        next: j.has_more ? j.next_cursor : null,
      };
    }
    if (!data.baseId) throw new Error("Choose a base first.");
    const qs = new URLSearchParams({ pageSize: "100" });
    if (data.cursor) qs.set("offset", data.cursor);
    const [j, meta] = await Promise.all([
      api("airtable", token, `/${data.baseId}/${data.sourceId}?${qs}`),
      data.cursor ? Promise.resolve(null) : api("airtable", token, `/meta/bases/${data.baseId}/tables`).catch(() => null),
    ]);
    const table = (meta?.tables ?? []).find((t: Json) => t.id === data.sourceId);
    const order = (table?.fields ?? []).map((f: Json) => f.name as string);
    return { records: airtableRecords(j.records ?? [], order), pageIds: (j.records ?? []).map((r: Json) => r.id), next: j.offset ?? null };
  });

/** The text of up to 10 Notion pages, as Markdown (nested blocks one level deep). */
export const fetchNotionBodies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    orgId: z.string().uuid(), token: z.string().max(500).optional(), pageIds: z.array(z.string().regex(ID)).min(1).max(10),
  }).parse(d))
  .handler(async ({ data, context }): Promise<{ bodies: Record<string, string> }> => {
    const token = await tokenFor(context.supabase, data.orgId, "notion", data.token);
    // ponytail: 40 child-block requests per call keeps under hosting sub-request limits; deeper nesting is cut off.
    let budget = 40;
    async function children(id: string, depth: number): Promise<Json[]> {
      const blocks: Json[] = [];
      let cursor: string | undefined;
      do {
        if (budget-- <= 0) break;
        const j = await api("notion", token, `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
        blocks.push(...(j.results ?? []));
        cursor = j.has_more ? j.next_cursor : undefined;
      } while (cursor);
      if (depth < 1) {
        for (const b of blocks) if (b.has_children && b.type !== "child_page" && b.type !== "child_database") b.children = await children(b.id, depth + 1);
      }
      return blocks;
    }
    const bodies: Record<string, string> = {};
    for (const id of data.pageIds) bodies[id] = notionBlocksToMarkdown(await children(id, 0));
    return { bodies };
  });
