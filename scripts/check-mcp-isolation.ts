// Every MCP tool must stay inside the caller's workspace. With a personal key the tools use full
// database access, so each query has to filter by org_id itself. This runs every tool against a
// stand-in database that records each query, and fails if any read, write or function call isn't
// limited to the caller's workspace. Run: bun scripts/check-mcp-isolation.ts (also in CI).
import { randomUUID } from "node:crypto";
import { TOOLS } from "../src/lib/mcp/tools";

const ORG = randomUUID();
const USER = randomUUID();
// Reads that are scoped by the caller's own user id instead of a workspace.
const USER_SCOPED = new Set(["memberships"]);

type Call = { table?: string; rpc?: string; ops: Array<[string, unknown[]]> };
let calls: Call[] = [];

/** A query builder that accepts any chain, records it, and resolves to an empty result. */
function recorder(call: Call): unknown {
  const result = { data: [], error: null, count: 0 };
  const proxy: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (ok: (v: unknown) => void) => ok(result);
      return (...args: unknown[]) => {
        call.ops.push([String(prop), args]);
        if (prop === "single" || prop === "maybeSingle") {
          const one = { data: null, error: null };
          return { then: (ok: (v: unknown) => void) => ok(one) };
        }
        return proxy;
      };
    },
  });
  return proxy;
}

const db = {
  from(table: string) { const c: Call = { table, ops: [] }; calls.push(c); return recorder(c); },
  rpc(name: string, args: Record<string, unknown>) { const c: Call = { rpc: name, ops: [["args", [args]]] }; calls.push(c); return recorder(c); },
};

/** Sample arguments from a tool's zod shape: ids for *_id fields, a word for text, 1 for numbers. */
function sampleArgs(shape: Record<string, { _def?: { typeName?: string; innerType?: unknown } }> | undefined) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(shape ?? {})) {
    let t = v?._def?.typeName, inner = v as { _def?: { typeName?: string; innerType?: unknown; values?: string[] } };
    while (t === "ZodOptional" || t === "ZodDefault" || t === "ZodNullable") { inner = inner._def!.innerType as typeof inner; t = inner._def?.typeName; }
    out[k] = t === "ZodNumber" ? 1 : t === "ZodBoolean" ? false : t === "ZodEnum" ? inner._def!.values![0] : k.endsWith("_id") || k === "id" ? randomUUID() : "Acme";
  }
  return out;
}

const scoped = (c: Call) => c.ops.some(([op, a]) => (op === "eq" || op === "match") && (a[0] === "org_id" ? a[1] === ORG : typeof a[0] === "object" && (a[0] as Record<string, unknown>)?.org_id === ORG));
const userScoped = (c: Call) => c.ops.some(([op, a]) => op === "eq" && a[0] === "user_id" && a[1] === USER);
const writes = (c: Call) => c.ops.filter(([op]) => op === "insert" || op === "upsert").flatMap(([, a]) => [a[0]].flat() as Array<Record<string, unknown>>);

const problems: string[] = [];
for (const tool of TOOLS as unknown as Array<{ name: string; inputSchema?: Record<string, never>; handler: (a: unknown, c: unknown) => Promise<unknown> }>) {
  calls = [];
  const ctx = { appContext: { db, userId: USER, orgId: ORG, role: "org_owner", via: "key" } };
  try { await tool.handler(sampleArgs(tool.inputSchema), ctx); } catch { /* empty stand-in data makes some tools stop early; the calls so far still count */ }
  for (const c of calls) {
    if (c.rpc) {
      const args = (c.ops[0][1][0] ?? {}) as Record<string, unknown>;
      if (args._org !== ORG && args._org_id !== ORG) problems.push(`${tool.name}: rpc ${c.rpc} without this workspace (${JSON.stringify(args)})`);
      continue;
    }
    const rows = writes(c);
    if (rows.length) {
      for (const r of rows) if (r.org_id !== ORG) problems.push(`${tool.name}: insert into ${c.table} without org_id = this workspace`);
      continue;
    }
    if (USER_SCOPED.has(c.table!) ? !userScoped(c) && !scoped(c) : !scoped(c)) {
      problems.push(`${tool.name}: ${c.table} ${c.ops.map(([o]) => o).join(".")} isn't filtered by org_id`);
    }
  }
  console.log(`${tool.name}: ${calls.length} quer${calls.length === 1 ? "y" : "ies"} checked`);
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`\nMCP isolation: OK (${TOOLS.length} tools)`);
