import { describe, expect, test } from "bun:test";
import { foldResponsesEvent, parseResponses, responsesBody, type RParsed } from "./responses-api";

describe("Responses API helpers", () => {
  test("puts system text in instructions, the rest in input, tools flat, effort under reasoning", () => {
    const b = responsesBody({
      model: "gpt-6-luna", effort: "low", cacheKey: "org-1", maxOutputTokens: 500, stream: true,
      messages: [{ role: "system", content: "A" }, { role: "system", content: "B" }, { role: "user", content: "hi" }],
      tools: [{ name: "find_leads", description: "Find leads", parameters: { type: "object", properties: {} } }],
    });
    expect(b.instructions).toBe("A\n\nB");
    expect(b.input).toEqual([{ role: "user", content: "hi" }]);
    expect(b.tools).toEqual([{ type: "function", name: "find_leads", description: "Find leads", parameters: { type: "object", properties: {} } }]);
    expect(b.reasoning).toEqual({ effort: "low" });
    expect(b.max_output_tokens).toBe(500);
    expect(b.prompt_cache_key).toBe("org-1");
    expect(b.stream).toBe(true);
    expect(b.store).toBe(false);
  });

  test("reads text, function calls and cached tokens from a finished response", () => {
    const r = parseResponses({
      output: [
        { type: "reasoning" },
        { type: "function_call", name: "find_leads", arguments: "{\"q\":\"acme\"}" },
        { type: "message", content: [{ type: "output_text", text: " Done. " }] },
      ],
      usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 80 } },
    });
    expect(r).toEqual({ text: "Done.", calls: [{ name: "find_leads", args: { q: "acme" } }], inputTokens: 100, outputTokens: 20, cachedTokens: 80 });
  });

  test("folds a stream: text pieces, a finished function call, then usage", () => {
    const acc: RParsed = { text: "", calls: [], inputTokens: null, outputTokens: null, cachedTokens: null };
    const seen: string[] = [];
    for (const ev of [
      { type: "response.output_text.delta", delta: "Hel" },
      { type: "response.output_text.delta", delta: "lo" },
      { type: "response.output_item.done", item: { type: "function_call", name: "t", arguments: "not json" } },
      { type: "response.completed", response: { usage: { input_tokens: 5, output_tokens: 2 } } },
    ]) foldResponsesEvent(acc, ev, (d) => seen.push(d));
    expect(seen).toEqual(["Hel", "lo"]);
    expect(acc.text).toBe("Hello");
    expect(acc.calls).toEqual([{ name: "t", args: {} }]);
    expect(acc.inputTokens).toBe(5);
    expect(() => foldResponsesEvent(acc, { type: "response.failed" }, () => {})).toThrow();
  });
});
