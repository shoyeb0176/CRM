import { expect, test } from "bun:test";
import { requestEffort } from "./gateway.server";

test("GPT-6 Luna and Sol calls with tools use effort none (Chat Completions rule)", () => {
  expect(requestEffort("gpt-6-luna", true, "low")).toBe("none");
  expect(requestEffort("gpt-6.1-sol", true, "medium")).toBe("none");
  expect(requestEffort("gpt-6-luna", false, "low")).toBe("low");
  expect(requestEffort("gpt-5-mini", true, "low")).toBe("low");
  expect(requestEffort("gpt-4o-mini", true, "low")).toBeUndefined();
});
