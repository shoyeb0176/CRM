// Starts active agents whose schedule is due or whose event has happened. Called every 5 minutes by
// the database (pg_cron + pg_net, DB-29) through /api/public/agents/dispatch. Each run is like a
// manual one: reads happen, changes and emails wait in Inbox › Approvals, one AI action is used.
import { scheduleSlot, type EventConfig, type ScheduleConfig } from "./agent-spec";

/* eslint-disable @typescript-eslint/no-explicit-any */
const MAX_RUNS = 10; // per call, so one busy workspace can't hold up the rest

type Trigger = {
  id: string; org_id: string; agent_id: string; trigger_name: string; trigger_type: "scheduled" | "event_based";
  trigger_config_json: Record<string, any> | null; created_at: string; updated_at: string;
  ai_agents: { id: string; name: string; status: string; owner_user_id: string | null } | null;
};

export async function dispatchAgents(now = new Date()) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { runAgentCore } = await import("./agent-run.server");
  const { notifyUsers } = await import("@/lib/notifications/notify.server");
  const { data, error } = await db.from("ai_agent_triggers")
    .select("id,org_id,agent_id,trigger_name,trigger_type,trigger_config_json,created_at,updated_at,ai_agents!inner(id,name,status,owner_user_id)")
    .eq("is_enabled", true).in("trigger_type", ["scheduled", "event_based"]).eq("ai_agents.status", "active").limit(500);
  if (error) throw new Error(error.message);

  const started: { agent: string; trigger: string; ok: boolean }[] = [];
  for (const t of (data ?? []) as unknown as Trigger[]) {
    if (started.length >= MAX_RUNS) break;
    const agent = t.ai_agents;
    if (!agent?.owner_user_id) continue;
    const cfg = t.trigger_config_json ?? {};
    let prompt: string | null = null;
    let next: Record<string, unknown> = cfg;

    if (t.trigger_type === "scheduled") {
      const slot = scheduleSlot(cfg as ScheduleConfig, now);
      if (!slot || slot === cfg.last_slot) continue;
      next = { ...cfg, last_slot: slot };
      prompt = (cfg as ScheduleConfig).prompt || "Do your scheduled job now.";
    } else {
      const since = (cfg.since as string | undefined) ?? t.created_at;
      const { data: events } = await db.from("notification_events")
        .select("title,body,entity_type,entity_id,created_at").eq("org_id", t.org_id).eq("kind", (cfg as EventConfig).event)
        .gt("created_at", since).order("created_at").limit(50);
      if (!events?.length) continue;
      // The same event goes to several people; describe each thing once.
      const seen = new Set<string>();
      const lines = events.filter((e) => { const k = `${e.entity_type}:${e.entity_id ?? e.title}`; if (seen.has(k)) return false; seen.add(k); return true; })
        .slice(0, 15).map((e) => `- ${e.title}${e.body ? `: ${e.body}` : ""}`);
      next = { ...cfg, since: events[events.length - 1].created_at };
      prompt = `${(cfg as EventConfig).prompt || "Deal with what just happened."}\n\nWhat happened:\n${lines.join("\n")}`;
    }

    // Claim the slot first, so a second dispatcher (or a retry) doesn't run it twice.
    const { data: claimed } = await db.from("ai_agent_triggers").update({ trigger_config_json: next as never, updated_at: now.toISOString() })
      .eq("id", t.id).eq("updated_at", t.updated_at).select("id");
    if (!claimed?.length) continue;

    try {
      const r = await runAgentCore(db, agent.owner_user_id, agent.id, prompt, { type: t.trigger_type, label: t.trigger_name });
      started.push({ agent: agent.name, trigger: t.trigger_name, ok: !r.error });
      if (!r.error && r.reply) {
        await notifyUsers(t.org_id, [agent.owner_user_id], {
          kind: "agents.message", title: `${agent.name}: ${t.trigger_name}`,
          body: r.reply.slice(0, 300) + (r.proposals ? ` (${r.proposals} change${r.proposals === 1 ? "" : "s"} waiting for approval)` : ""),
          link: `/app/agents/${agent.id}`, module: "agents",
        });
      }
    } catch (e) {
      // Out of AI actions, a paused plan…: the run row records failures it got to; nothing else to do.
      started.push({ agent: agent.name, trigger: t.trigger_name, ok: false });
      console.error("[agent dispatch]", agent.id, e instanceof Error ? e.message : e);
    }
  }
  return { checked: data?.length ?? 0, started };
}
