// What an agent is made of (name, instructions, data access, tools, when it runs), checked the same
// way whether the wizard or the assistant creates it, and when a scheduled agent is due.
import { MODULE_KEYS, TOOL_REGISTRY } from "./tool-registry";

export type AgentModule = { module: string; read?: boolean; create?: boolean; update?: boolean; execute?: boolean };
export type ScheduleConfig = { every: "hour" | "day" | "weekday" | "week"; at?: string; day?: number; tz?: string; prompt?: string };
export type EventConfig = { event: string; prompt?: string };
export type AgentTrigger =
  | { name?: string; type: "manual" }
  | { name?: string; type: "scheduled"; config: ScheduleConfig }
  | { name?: string; type: "event_based"; config: EventConfig };

export type AgentSpec = {
  name: string;
  description?: string;
  instructions: string;
  modules: AgentModule[];
  tools: string[];
  triggers: AgentTrigger[];
  requires_approval?: boolean;
  activate?: boolean;
};

/** Events an agent can start on: the alerts and notifications the app already records. */
export const AGENT_EVENTS: Record<string, string> = {
  "alert.invoice_overdue": "An invoice becomes overdue",
  "alert.deal_stale": "A deal has had no activity for a while",
  "alert.low_stock": "A product runs low or out of stock",
  "alert.task_overdue": "A task becomes overdue",
  "crm.lead": "A new lead arrives from the website",
  "forms.form": "A form is submitted",
  "support.support_ticket": "A customer opens or answers a support ticket",
  "sales.quote_response": "A customer accepts or declines a quote",
  "invoices.paid": "An invoice is paid in full",
  "hr.leave_request": "Someone asks for leave",
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Every Monday at 09:00", for lists and the assistant's approval card. */
export function describeTrigger(t: AgentTrigger): string {
  if (t.type === "manual") return "When you run it";
  if (t.type === "event_based") return `When ${(AGENT_EVENTS[t.config.event] ?? t.config.event).replace(/^An? /, (m) => m.toLowerCase())}`;
  const c = t.config, at = c.at ?? "09:00";
  if (c.every === "hour") return "Every hour";
  if (c.every === "weekday") return `Every weekday at ${at}`;
  if (c.every === "week") return `Every ${WEEKDAYS[c.day ?? 1]} at ${at}`;
  return `Every day at ${at}`;
}

/** Tools an agent can really use (the "coming soon" connection tools are left out). */
export const USABLE_TOOLS = TOOL_REGISTRY.filter((t) => !t.toolType.endsWith("_placeholder") && !t.name.endsWith("_placeholder"));

/** The assistant's model sometimes sends a list as a JSON string, a comma list or a single object. */
function asList(v: unknown): unknown[] {
  if (typeof v === "string") {
    try { return asList(JSON.parse(v)); } catch { return v.split(",").map((x) => x.trim()).filter(Boolean); }
  }
  if (Array.isArray(v)) return v;
  return v && typeof v === "object" ? [v] : [];
}

/** One data-access entry from "invoices", {module: "invoices", ...} or {invoices: "read"}. */
function asModules(m: unknown): AgentModule[] {
  if (typeof m === "string") return [{ module: m, read: true }];
  if (!m || typeof m !== "object") return [];
  const o = m as Record<string, unknown>;
  if (typeof o.module === "string") return [o as AgentModule];
  return Object.entries(o).map(([module, a]) => (a && typeof a === "object"
    ? { module, ...(a as object) }
    : { module, read: true, create: /create|write/i.test(String(a)), update: /change|update|write/i.test(String(a)) }));
}

/** Cleans what the wizard or the assistant asked for; throws a plain message when it can't be used. */
export function normalizeAgentSpec(s: AgentSpec): AgentSpec {
  const name = String(s.name ?? "").trim().slice(0, 80);
  if (!name) throw new Error("The agent needs a name.");
  const instructions = String(s.instructions ?? "").trim().slice(0, 8000);
  if (instructions.length < 10) throw new Error("Say in a sentence or two what the agent should do.");
  const modules = asList(s.modules).flatMap(asModules)
    .map((m) => ({ ...m, module: String(m.module).trim().toLowerCase() }))
    .filter((m) => (MODULE_KEYS as readonly string[]).includes(m.module))
    .map((m) => ({ module: m.module, read: !!(m.read || m.create || m.update || m.execute), create: !!m.create, update: !!m.update, execute: !!m.execute }));
  const usable = new Set(USABLE_TOOLS.map((t) => t.name));
  const tools = [...new Set(asList(s.tools).map(String).filter((t) => usable.has(t)))];
  const triggers: AgentTrigger[] = [];
  for (const t of asList(s.triggers) as AgentTrigger[]) {
    if (!t || typeof t !== "object") continue;
    if (t.type === "manual") triggers.push({ type: "manual", name: t.name || "Manual run" });
    else if (t.type === "scheduled" && ["hour", "day", "weekday", "week"].includes(t.config?.every)) {
      const at = /^([01]\d|2[0-3]):[0-5]\d$/.test(t.config.at ?? "") ? t.config.at : "09:00";
      const config: ScheduleConfig = { every: t.config.every, at, day: Math.min(6, Math.max(0, Number(t.config.day ?? 1) | 0)), tz: t.config.tz || undefined, prompt: t.config.prompt?.slice(0, 2000) };
      triggers.push({ type: "scheduled", name: t.name || describeTrigger({ type: "scheduled", config }), config });
    } else if (t.type === "event_based" && AGENT_EVENTS[t.config?.event]) {
      const config = { event: t.config.event, prompt: t.config.prompt?.slice(0, 2000) };
      triggers.push({ type: "event_based", name: t.name || describeTrigger({ type: "event_based", config }), config });
    }
  }
  if (!triggers.some((t) => t.type === "manual")) triggers.unshift({ type: "manual", name: "Manual run" });
  return { name, description: s.description?.trim().slice(0, 500) || undefined, instructions, modules, tools, triggers, requires_approval: s.requires_approval !== false, activate: !!s.activate };
}

/** The local date, weekday and time for a time zone (falls back to UTC for an unknown zone). */
function localParts(now: Date, tz: string) {
  let f: Intl.DateTimeFormat;
  try { f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }); }
  catch { f = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }); }
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, hour: p.hour, dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}

/**
 * The run slot a schedule is in right now ("2026-10-19" for a daily 09:00 run once it's past 09:00
 * local time), or null when it isn't due. A trigger runs when this differs from the last slot it ran
 * in, so a run that was missed by a few minutes still happens, and never twice in one slot.
 */
export function scheduleSlot(c: ScheduleConfig, now: Date): string | null {
  const l = localParts(now, c.tz || "UTC");
  const at = c.at ?? "09:00";
  if (c.every === "hour") return `${l.date}T${l.hour}`;
  if (l.hm < at) return null;
  if (c.every === "weekday" && (l.dow === 0 || l.dow === 6)) return null;
  if (c.every === "week" && l.dow !== (c.day ?? 1)) return null;
  return l.date;
}
