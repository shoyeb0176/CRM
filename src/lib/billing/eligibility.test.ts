import { describe, expect, test } from "bun:test";
import { startupEligible } from "./eligibility";

describe("startupEligible", () => {
  test("small headcount or small revenue qualifies; over both doesn't", () => {
    expect(startupEligible("1-15", "1m-10m")).toBe(true);
    expect(startupEligible("51-200", "under-100k")).toBe(true);
    expect(startupEligible("16-50", "100k-1m")).toBe(false);
  });
  test("unanswered is unknown", () => {
    expect(startupEligible(null, "under-100k")).toBeNull();
  });
});
