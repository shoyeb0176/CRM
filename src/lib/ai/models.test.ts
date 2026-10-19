import { describe, expect, test } from "bun:test";
import { ownProviderModel } from "./models";

describe("ownProviderModel", () => {
  test("a built-in model name left on a direct provider becomes that provider's default", () => {
    expect(ownProviderModel("anthropic", "google/gemini-3.8-flash")).toBe("claude-haiku-5-5");
    expect(ownProviderModel("openai", "openai/gpt-5.6-terra")).toBe("gpt-6-luna");
  });
  test("keeps a real choice, and OpenRouter-style names on OpenAI-compatible endpoints", () => {
    expect(ownProviderModel("anthropic", "claude-sonnet-5-5")).toBe("claude-sonnet-5-5");
    expect(ownProviderModel("openai_compatible", "anthropic/claude-haiku-5-5")).toBe("anthropic/claude-haiku-5-5");
  });
  test("empty means the default; Azure has none (the deployment name is needed)", () => {
    expect(ownProviderModel("google", "")).toBe("gemini-3.8-flash");
    expect(ownProviderModel("azure_openai", null)).toBe("");
  });
});
