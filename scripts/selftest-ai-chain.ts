// Self-check for the built-in AI fallback order (src/lib/ai/gateway.server.ts).
// Run: bun scripts/selftest-ai-chain.ts
import assert from "node:assert/strict";
import { instanceTargets } from "../src/lib/ai/gateway.server";

const order = () => instanceTargets(null, null).map((t) => t.provider);
const env = process.env;
for (const k of ["OPENAI_API_KEY", "OPENROUTER_API_KEY", "LOVABLE_API_KEY"]) delete env[k];

assert.deepEqual(order(), ["lovable"], "nothing set: Lovable (shows 'not configured')");
env.LOVABLE_API_KEY = "l";
assert.deepEqual(order(), ["lovable"]);
env.OPENROUTER_API_KEY = "r";
assert.deepEqual(order(), ["openai_compatible", "lovable"]);
env.OPENAI_API_KEY = "o";
assert.deepEqual(order(), ["openai", "openai_compatible", "lovable"]);
delete env.LOVABLE_API_KEY;
assert.deepEqual(order(), ["openai", "openai_compatible"], "off Lovable: no Lovable fallback");
assert.equal(instanceTargets(null, null)[0].model, "gpt-4o-mini");
env.OPENAI_MODEL = "gpt-4.1-mini";
assert.equal(instanceTargets(null, null)[0].model, "gpt-4.1-mini");
console.log("ai chain selftest: ok");
