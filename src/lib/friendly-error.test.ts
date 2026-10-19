import { describe, expect, test } from "bun:test";
import { friendlyError } from "./friendly-error";

describe("friendlyError", () => {
  test("shows the database's own message (plan limits), which isn't an Error instance", () => {
    const e = { code: "P0001", message: "Your Startup plan includes 1 automation. Upgrade in Settings › Billing." };
    expect(friendlyError(e, "Could not create workflow")).toBe(e.message);
  });
  test("maps known codes and falls back when there is no message", () => {
    expect(friendlyError({ code: "42501", message: "permission denied for table x" })).toBe("You don't have permission to do that");
    expect(friendlyError(null, "Could not save")).toBe("Could not save");
    expect(friendlyError(new Error("boom"))).toBe("boom");
  });
});
