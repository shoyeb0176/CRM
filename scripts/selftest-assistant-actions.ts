// Self-check for the assistant/agent action plumbing: the ```action block parser, which tools
// need approval, and that approved assistant actions write to the right table.
// Run: bun scripts/selftest-assistant-actions.ts
import assert from "node:assert/strict";
import { parseActions, stripActions } from "../src/lib/agents/tool-loop.server";
import { TOOL_REGISTRY, isWriteTool } from "../src/lib/agents/tool-registry";
import { executeAction } from "../src/lib/ai/entity-ai.functions";
import { normalizeMath } from "../src/components/ai/normalize-math";

// Parser
const text = 'Sure.\n```action\n{ "tool": "create_lead", "args": { "name": "Acme" }, "reason": "asked" }\n```\n```action\nnot json\n```';
assert.deepEqual(parseActions(text), [{ tool: "create_lead", args: { name: "Acme" }, reason: "asked" }]);
assert.equal(stripActions(text), "Sure.");

// Approval rules: creates need approval, searches don't.
const tool = (n: string) => TOOL_REGISTRY.find((t) => t.name === n)!;
for (const n of ["crm_create_lead", "crm_create_company", "crm_create_contact", "task_create", "invoice_create_draft"]) {
  assert.ok(isWriteTool(tool(n)), `${n} must need approval`);
}
for (const n of ["crm_search_contacts", "crm_list_leads", "crm_list_deals", "invoice_search", "inventory_check_stock"]) {
  assert.ok(!isWriteTool(tool(n)), `${n} must run without approval`);
}

// executeAction routes each key to the right table (fake client records the inserts).
// The fake workspace already has one company, "Acme Ltd".
const inserts: { table: string; row: Record<string, unknown> }[] = [];
const fake = {
  from(table: string) {
    let looked = "";
    const q: any = {
      insert(row: Record<string, unknown>) { inserts.push({ table, row }); return q; },
      select() { return q; }, eq() { return q; }, limit() { return q; },
      ilike(_c: string, v: string) { looked = v.toLowerCase(); return q; },
      single: async () => ({ data: { id: "id-1", project_id: "p-1", ...inserts.at(-1)?.row }, error: null }),
      maybeSingle: async () => ({ data: table === "companies" && looked === "acme ltd" ? { id: "co-1", name: "Acme Ltd" } : null, error: null }),
    };
    return q;
  },
  rpc: async () => ({ data: null }),
};
const run = (key: string, payload: Record<string, unknown>) => executeAction(fake as never, "org-1", "user-1", key as never, payload);

const lead = await run("create_lead", { name: "Acme Ltd", email: "jane@acme.test" });
assert.equal(inserts.at(-1)!.table, "leads");
assert.equal(inserts.at(-1)!.row.owner_id, "user-1");
assert.equal(lead.link, "/app/crm/leads");

await run("create_company", { name: "Globex" });
assert.equal(inserts.at(-1)!.table, "companies");

// An existing company (any case) is reused, not duplicated.
const before = inserts.length;
const again = await run("create_company", { name: "acme LTD" });
assert.equal(inserts.length, before);
assert.equal(again.link, "/app/crm/companies/co-1");

await run("create_contact", { first_name: "Jane", company_name: "Acme Ltd" });
assert.equal(inserts.at(-1)!.table, "contacts");
assert.equal(inserts.at(-1)!.row.company_id, "co-1");

await run("create_task", { title: "Call Jane", project_id: "p-1" });
assert.equal(inserts.at(-1)!.table, "project_tasks");

await assert.rejects(run("create_company", {}), /name is required/i);
await assert.rejects(run("create_task", { title: "No project" }), /project/i);
await assert.rejects(run("delete_everything", {}), /Unknown action/);

// Chat math: \[ … \] and \( … \) become the $$ / $ that remark-math reads.
assert.equal(normalizeMath("A \\(x^2\\) and\n\\[ A = P \\]"), "A $x^2$ and\n\n$$\nA = P\n$$\n");
assert.equal(normalizeMath("cost $5"), "cost $5");

console.log("assistant actions selftest: ok");
