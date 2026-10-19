import { expect, test } from "bun:test";
import { actionsFrom, assistantTurn, parseActions, stripActions, toolSchema } from "./tool-loop.server";

test("toolSchema turns registry hints into JSON Schema", () => {
  const s = toolSchema({ name: "t", description: "", write: true, args: {
    name: "string", id: "uuid?", amount: "number", priority: "low|medium|high?", due: "YYYY-MM-DD?",
  } });
  expect(s.required).toEqual(["name", "amount"]);
  expect(s.properties.id).toEqual({ type: "string", format: "uuid" });
  expect(s.properties.amount).toEqual({ type: "number" });
  expect(s.properties.priority).toEqual({ type: "string", enum: ["low", "medium", "high"] });
  expect(s.properties.due.description).toBe("YYYY-MM-DD");
  expect(s.properties.reason.type).toBe("string");
});

test("fenced action blocks are read and stripped; broken ones are ignored", () => {
  const text = 'Sure.\n```action\n{"tool":"crm_create_lead","args":{"name":"A"},"reason":"asked"}\n```\n```action\nnot json\n```';
  expect(parseActions(text)).toEqual([{ tool: "crm_create_lead", args: { name: "A" }, reason: "asked" }]);
  expect(stripActions(text)).toBe("Sure.");
});

test("native tool calls win over text blocks, and are remembered in the history", () => {
  const calls = [{ tool: "crm_list_leads", args: {}, reason: "" }];
  expect(actionsFrom({ text: '```action\n{"tool":"x"}\n```', toolCalls: calls })).toBe(calls);
  expect(actionsFrom({ text: '```action\n{"tool":"x"}\n```' })[0].tool).toBe("x");
  expect(assistantTurn({ text: "", toolCalls: calls })).toContain("crm_list_leads");
  expect(assistantTurn({ text: "plain" })).toBe("plain");
});
