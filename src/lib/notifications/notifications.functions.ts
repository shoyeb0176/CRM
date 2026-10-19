// Signed-in helpers for notifications.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Sends this workspace's due notification emails. The bell calls it while someone is online, so
 * emails still go out where the database can't call the app (no pg_net). It also tells the
 * database the app's address for its own 2-minute job.
 */
export const flushNotificationEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: { rpc: (f: string, a: object) => PromiseLike<{ data: unknown }> } };
    const { data: member } = await supabase.rpc("is_org_member", { _org: data.orgId });
    if (member !== true) return { sent: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { dispatchNotificationEmails, siteUrlFrom } = await import("@/lib/notifications/email.server");
    const site = siteUrlFrom(getRequest());
    await supabaseAdmin.rpc("notification_dispatch_secret", { _site_url: site });
    const r = await dispatchNotificationEmails(site, data.orgId);
    return { sent: r.sent };
  });

/** Whether notification emails can go out, and how (Settings › Notifications explains it). */
export const notificationEmailStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { platformSender } = await import("@/lib/notifications/email.server");
    if (platformSender()) return { via: "platform" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: box } = await supabaseAdmin.from("org_mail_settings").select("from_email").eq("org_id", data.orgId).maybeSingle();
    return box ? { via: "workspace" as const, from: box.from_email as string } : { via: "none" as const };
  });
