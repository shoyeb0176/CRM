// File attachments on records. Files go to the private "org-files" bucket through signed URLs that
// only this server hands out, after checking membership, the plan (lapsed = read-only) and the
// storage quota of the workspace's plan.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "org-files";
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const GB = 1024 ** 3;

export const ATTACHMENT_ENTITIES = [
  "company", "contact", "deal", "lead", "quote", "invoice", "sales_order", "purchase_order",
  "vendor_bill", "expense", "project", "task", "employee", "supplier", "product",
] as const;
export type AttachmentEntity = (typeof ATTACHMENT_ENTITIES)[number];

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Keep letters, digits, dot, dash and underscore; the rest becomes "-". */
export function safeFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+/, "");
  return (cleaned || "file").slice(-120);
}

/** Storage quota in bytes for the workspace's plan (and any custom offering), or null when unlimited. */
async function quotaBytes(orgId: string): Promise<number | null> {
  const db = await admin();
  const { data: limits, error } = await db.rpc("org_limits", { _org: orgId });
  const fromLimits = !error ? (limits as { storage_gb?: number } | null)?.storage_gb : undefined;
  if (fromLimits != null) return Number(fromLimits) * GB;
  const { data } = await db.from("organization_subscriptions")
    .select("subscription_plans(storage_limit_gb)").eq("org_id", orgId).maybeSingle();
  const gb = data?.subscription_plans?.storage_limit_gb;
  return gb == null ? null : Number(gb) * GB;
}

async function usedBytes(orgId: string): Promise<number> {
  const { data } = await (await admin()).from("attachments").select("size_bytes").eq("org_id", orgId);
  return (data ?? []).reduce((s: number, r: { size_bytes: number }) => s + Number(r.size_bytes), 0);
}

async function assertCanWrite(supabase: any, orgId: string) {
  const { data: member } = await supabase.rpc("is_org_member", { _org: orgId });
  if (member !== true) throw new Error("You are not a member of this workspace.");
  const { data: active } = await supabase.rpc("org_is_active", { _org: orgId });
  if (active === false) throw new Error("Your plan has ended. Files are read-only until you renew in Settings → Billing.");
}

function formatSize(bytes: number) {
  return bytes >= GB ? `${(bytes / GB).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

const UploadInput = z.object({
  orgId: z.string().uuid(),
  entityType: z.enum(ATTACHMENT_ENTITIES),
  entityId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  size: z.number().int().min(0),
});

/** Step 1: check the plan and quota, then hand out a one-time signed upload URL. */
export const requestUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => UploadInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertCanWrite(context.supabase, data.orgId);
    if (data.size > MAX_FILE_BYTES) throw new Error(`Files can be up to ${formatSize(MAX_FILE_BYTES)}.`);
    const quota = await quotaBytes(data.orgId);
    if (quota !== null) {
      const used = await usedBytes(data.orgId);
      if (used + data.size > quota) {
        throw new Error(`Not enough storage: ${formatSize(used)} of ${formatSize(quota)} used. Free some space or choose a bigger plan.`);
      }
    }
    const path = `${data.orgId}/${data.entityType}/${data.entityId}/${crypto.randomUUID()}-${safeFileName(data.fileName)}`;
    const { data: signed, error } = await (await admin()).storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) throw new Error(`Upload could not start: ${error.message}`);
    return { path, token: signed.token as string };
  });

const ConfirmInput = UploadInput.omit({ size: true }).extend({ path: z.string().min(10).max(600), mimeType: z.string().max(200).optional() });

/** Step 2: after the browser uploaded the file, record it with its real size (checked again). */
export const confirmUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ConfirmInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertCanWrite(context.supabase, data.orgId);
    const prefix = `${data.orgId}/${data.entityType}/${data.entityId}/`;
    if (!data.path.startsWith(prefix) || data.path.includes("..")) throw new Error("Invalid upload path.");
    const db = await admin();
    const objectName = data.path.slice(prefix.length);
    const { data: listed, error } = await db.storage.from(BUCKET).list(prefix.slice(0, -1), { search: objectName, limit: 1 });
    const obj = listed?.find((o: { name: string }) => o.name === objectName);
    if (error || !obj) throw new Error("The uploaded file wasn't found. Please try again.");
    const size = Number(obj.metadata?.size ?? 0);

    const quota = await quotaBytes(data.orgId);
    if (size > MAX_FILE_BYTES || (quota !== null && (await usedBytes(data.orgId)) + size > quota)) {
      await db.storage.from(BUCKET).remove([data.path]);
      throw new Error("The file is larger than your remaining storage allows.");
    }
    const { data: row, error: insErr } = await db.from("attachments").insert({
      org_id: data.orgId, entity_type: data.entityType, entity_id: data.entityId, path: data.path,
      file_name: data.fileName.slice(0, 255), mime_type: data.mimeType ?? obj.metadata?.mimetype ?? null,
      size_bytes: size, uploaded_by: context.userId,
    }).select("id").single();
    if (insErr) {
      await db.storage.from(BUCKET).remove([data.path]);
      throw new Error(insErr.message);
    }
    return { id: row.id as string };
  });

/** A short-lived download link. The row is read with the user's own rights, so RLS decides access. */
export const getAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("attachments").select("path,file_name").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("File not found.");
    const { data: signed, error } = await (await admin()).storage.from(BUCKET)
      .createSignedUrl(row.path, 300, { download: row.file_name });
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl as string };
  });

/** Delete a file (members may delete even when the plan has ended, to free space). */
export const deleteAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: row } = await sb.from("attachments").select("path,org_id").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("File not found.");
    const { error } = await sb.from("attachments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await (await admin()).storage.from(BUCKET).remove([row.path]);
    return { ok: true as const };
  });
