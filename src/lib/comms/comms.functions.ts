import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SBClient = SupabaseClient<Database>;

/** Payload shape accepted by both Slack and Microsoft Teams incoming webhooks. */
export function chatPayload(kind: string, title: string, body?: string, link?: string) {
  const text = [title, body, link].filter(Boolean).join("\n");
  if (kind === "teams") {
    return { "@type": "MessageCard", "@context": "https://schema.org/extensions", summary: title, title, text: [body, link].filter(Boolean).join("\n\n") };
  }
  return { text };
}

/** Fan a message out to every active chat channel of an org. Returns delivered count. */
export async function deliverToChannels(
  supabase: SBClient,
  orgId: string,
  msg: { title: string; body?: string; link?: string },
) {
  const { data: channels } = await supabase
    .from("comm_channels")
    .select("id, kind, webhook_url")
    .eq("org_id", orgId)
    .eq("is_active", true);

  let delivered = 0;
  for (const ch of channels ?? []) {
    try {
      const res = await fetch(ch.webhook_url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(chatPayload(ch.kind, msg.title, msg.body, msg.link)),
      });
      if (res.ok) {
        delivered++;
        await supabase.from("comm_channels").update({ last_delivery_at: new Date().toISOString(), last_error: null }).eq("id", ch.id);
      } else {
        await supabase.from("comm_channels").update({ last_error: `HTTP ${res.status}` }).eq("id", ch.id);
      }
    } catch (e) {
      await supabase.from("comm_channels").update({ last_error: e instanceof Error ? e.message : String(e) }).eq("id", ch.id);
    }
  }
  return delivered;
}

export const testCommChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ channelId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: SBClient };
    const { data: ch } = await supabase
      .from("comm_channels")
      .select("id, kind, name, webhook_url")
      .eq("id", data.channelId)
      .maybeSingle();
    if (!ch) throw new Error("Channel not found");

    try {
      const res = await fetch(ch.webhook_url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(chatPayload(ch.kind, "Test message from your workspace", `Delivery to "${ch.name}" is working.`)),
      });
      const ok = res.ok;
      await supabase
        .from("comm_channels")
        .update(ok ? { last_delivery_at: new Date().toISOString(), last_error: null } : { last_error: `HTTP ${res.status}` })
        .eq("id", ch.id);
      return { ok, status: res.status };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabase.from("comm_channels").update({ last_error: message }).eq("id", ch.id);
      return { ok: false, status: 0, message };
    }
  });

export const broadcastToChannels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ orgId: z.string().uuid(), title: z.string().min(1), body: z.string().optional(), link: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: SBClient };
    const delivered = await deliverToChannels(supabase, data.orgId, data);
    return { delivered };
  });
