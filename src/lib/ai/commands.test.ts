import { expect, test } from "bun:test";
import { COMMANDS, helpText, parseCommand, runCommand } from "./commands";

test("only messages starting with a slash and a word are commands", () => {
  expect(parseCommand("/sales")).toMatchObject({ name: "sales", rest: "" });
  expect(parseCommand("  /LEADS acme corp ")).toMatchObject({ name: "leads", rest: "acme corp" });
  expect(parseCommand("/nope")?.command).toBeNull();
  expect(parseCommand("what are /sales like?")).toBeNull();
  expect(parseCommand("1/2 of the stock")).toBeNull();
  expect(parseCommand("/")).toBeNull();
});

test("each command runs its tool and formats the result", async () => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const fake = async (tool: string, args: Record<string, unknown>) => {
    calls.push([tool, args]);
    if (tool === "inventory_low_stock") return { status: "ok", products: [
      { id: "p1", name: "Widget", sku: "W1", on_hand: 2, low_stock_threshold: 5, stock_status: "low" },
      { id: "p3", name: "Thing", sku: null, on_hand: 0, low_stock_threshold: null, stock_status: "out" },
    ] };
    if (tool === "invoice_search") return { status: "ok", invoices: [{ id: "i1", number: "INV-7", due_date: "2026-09-01", balance_due: 1200.5, currency: "USD" }] };
    if (tool === "report_generate_sales_summary") return { status: "ok",
      invoiced_and_paid_by_month: [{ month: "2026-08", invoiced: 10, paid: 5 }, { month: "2026-09", invoiced: 20, paid: 15 }],
      open_pipeline: { value: 9000, deals: 3, by_stage: [{ stage: "Proposal", value: 9000 }] }, top_customers: [{ name: "Acme", value: 15 }] };
    if (tool === "project_summarize_status") return { status: "error", error: "Project not found (project_id or project_name)." };
    return { status: "ok", leads: [] };
  };
  const stock = await runCommand(parseCommand("/low-stock")!, fake);
  expect(stock).toContain("Widget");
  expect(stock).toContain("Thing");
  expect(stock).toContain("[Thing](/app/products/p3) | — | 0 | — | out");
  expect(await runCommand(parseCommand("/overdue")!, fake)).toContain("[INV-7](/app/invoices/i1)");
  expect(calls.find(([t]) => t === "invoice_search")?.[1]).toEqual({ status: "overdue" });
  const sales = await runCommand(parseCommand("/sales")!, fake);
  expect(sales).toContain("| 2026-09 | 20 | 15 |");
  expect(sales).toContain("Open pipeline: **9,000** across 3 deals.");
  expect(await runCommand(parseCommand("/project Website")!, fake)).toBe("Project not found (project_id or project_name).");
  expect(await runCommand(parseCommand("/leads zed")!, fake)).toBe('No leads matching "zed".');
});

test("help, unknown commands and missing arguments answer without a tool", async () => {
  const never = async () => { throw new Error("no tool should run"); };
  expect(await runCommand(parseCommand("/help")!, never)).toBe(helpText());
  expect(await runCommand(parseCommand("/oops")!, never)).toContain("There's no `/oops` command.");
  expect(await runCommand(parseCommand("/crm")!, never)).toBe("Add what to look for: `/crm <name, company or email>`");
  for (const c of COMMANDS) expect(helpText()).toContain(`/${c.name}`);
});

test("/ai-stats sums models, cache use, cost and tool success", async () => {
  const stats = { status: "ok", days: 30,
    models: [
      { model: "gpt-6-luna", calls: 10, failed: 1, input_tokens: 10000, output_tokens: 2000, cached_tokens: 6000, median_ms: 1500, cost_usd: 0.0024 },
      { model: "mystery", calls: 2, failed: 0, input_tokens: 0, output_tokens: 0, cached_tokens: 0, median_ms: null, cost_usd: null },
    ],
    tools: [{ tool: "invoice_search", calls: 4, ok: 3 }],
    proposals: { executed: 3, rejected: 1, pending: 2 }, agent_actions: {}, commands: 5, usage: { used: 12, limit: 25 } };
  let args: Record<string, unknown> = {};
  const out = await runCommand(parseCommand("/ai-stats 7")!, async (_t, a) => { args = a; return stats; });
  expect(args).toEqual({ days: 7 });
  expect(out).toContain("12 model calls, 92% answered (1 failed or timed out)");
  expect(out).toContain("60% of them from the provider's cache");
  expect(out).toContain("Estimated cost **$0.00** (models without a known price not included)");
  expect(out).toContain("**Tool calls:** 4, 75% worked.");
  expect(out).toContain("3 done, 1 turned down, 0 failed, 2 waiting (75% of decided ones went through)");
  expect(out).toContain("AI actions this month: 12 of 25.");
});
