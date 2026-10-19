import { describe, expect, test } from "bun:test";
import { describeTrigger, normalizeAgentSpec, scheduleSlot } from "./agent-spec";

describe("normalizeAgentSpec", () => {
  test("keeps real modules and tools, drops coming-soon tools, adds a manual trigger", () => {
    const s = normalizeAgentSpec({
      name: "  Overdue chaser ", instructions: "Find overdue invoices and draft reminders.",
      modules: [{ module: "invoices", update: true }, { module: "nope", read: true }],
      tools: ["invoice_search", "send_email_placeholder", "invoice_search"],
      triggers: [{ type: "scheduled", config: { every: "week", at: "9:00", day: 1 } }],
    });
    expect(s.name).toBe("Overdue chaser");
    expect(s.modules).toEqual([{ module: "invoices", read: true, create: false, update: true, execute: false }]);
    expect(s.tools).toEqual(["invoice_search"]);
    expect(s.triggers[0].type).toBe("manual");
    expect(s.triggers[1]).toMatchObject({ type: "scheduled", config: { every: "week", at: "09:00", day: 1 } });
    expect(s.requires_approval).toBe(true);
  });
  test("refuses an agent with no name or no instructions", () => {
    expect(() => normalizeAgentSpec({ name: "", instructions: "x".repeat(20), modules: [], tools: [], triggers: [] })).toThrow();
    expect(() => normalizeAgentSpec({ name: "A", instructions: "hi", modules: [], tools: [], triggers: [] })).toThrow();
  });
  test("accepts the looser shapes the assistant sometimes sends", () => {
    const s = normalizeAgentSpec({ name: "A", instructions: "Report overdue invoices.",
      modules: '{"invoices":"read","CRM":{"read":true}}' as never, tools: "invoice_search, nope" as never,
      triggers: { type: "scheduled", config: { every: "hour" } } as never });
    expect(s.modules.map((m) => m.module)).toEqual(["invoices", "crm"]);
    expect(s.tools).toEqual(["invoice_search"]);
    expect(s.triggers.map((x) => x.type)).toEqual(["manual", "scheduled"]);
    expect(normalizeAgentSpec({ name: "A", instructions: "Report overdue invoices.", modules: ["invoices"] as never, tools: [], triggers: [] }).modules[0].read).toBe(true);
  });
  test("drops unknown events", () => {
    const s = normalizeAgentSpec({ name: "A", instructions: "Do the thing well.", modules: [], tools: [],
      triggers: [{ type: "event_based", config: { event: "alert.invoice_overdue" } }, { type: "event_based", config: { event: "made.up" } }] });
    expect(s.triggers.map((t) => t.type)).toEqual(["manual", "event_based"]);
    expect(describeTrigger(s.triggers[1])).toBe("When an invoice becomes overdue");
  });
});

describe("scheduleSlot", () => {
  const mon0830 = new Date("2026-10-19T08:30:00Z"); // a Monday
  const mon0915 = new Date("2026-10-19T09:15:00Z");
  test("daily: not before the time, the day's date after it", () => {
    expect(scheduleSlot({ every: "day", at: "09:00" }, mon0830)).toBeNull();
    expect(scheduleSlot({ every: "day", at: "09:00" }, mon0915)).toBe("2026-10-19");
  });
  test("weekly only on its day, weekdays skip the weekend", () => {
    expect(scheduleSlot({ every: "week", at: "09:00", day: 1 }, mon0915)).toBe("2026-10-19");
    expect(scheduleSlot({ every: "week", at: "09:00", day: 5 }, mon0915)).toBeNull();
    expect(scheduleSlot({ every: "weekday", at: "09:00" }, new Date("2026-10-18T10:00:00Z"))).toBeNull(); // Sunday
  });
  test("time zones: 09:00 in Dhaka is 03:00 UTC", () => {
    expect(scheduleSlot({ every: "day", at: "09:00", tz: "Asia/Dhaka" }, new Date("2026-10-19T03:05:00Z"))).toBe("2026-10-19");
    expect(scheduleSlot({ every: "day", at: "09:00", tz: "Asia/Dhaka" }, new Date("2026-10-19T02:55:00Z"))).toBeNull();
  });
  test("hourly gives one slot per hour", () => {
    expect(scheduleSlot({ every: "hour" }, mon0830)).toBe("2026-10-19T08");
  });
});
