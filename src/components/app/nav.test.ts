import { describe, expect, test } from "bun:test";
import { moduleShown } from "./nav";

describe("moduleShown", () => {
  test("hides modules switched off for the workspace", () => {
    expect(moduleShown("/app/hr/leave", ["crm", "sales"])).toBe(false);
    expect(moduleShown("/app/crm/deals", ["crm", "sales"])).toBe(true);
    expect(moduleShown("/app/hr", null)).toBe(true);
  });
  test("hides modules the role can't use", () => {
    expect(moduleShown("/app/accounting", null, "sales_rep")).toBe(false);
    expect(moduleShown("/app/hr/payroll", null, "sales_rep")).toBe(false);
    expect(moduleShown("/app/suppliers", null, "sales_rep")).toBe(false);
    expect(moduleShown("/app/crm", null, "sales_rep")).toBe(true);
    expect(moduleShown("/app/crm", null, "hr_manager")).toBe(false);
    expect(moduleShown("/app/accounting", null, "org_owner")).toBe(true);
    expect(moduleShown("/app/accounting", null, "platform_owner")).toBe(true);
    // Pages outside the role matrix (Inbox, AI, workspace) stay visible.
    expect(moduleShown("/app/inbox", null, "hr_manager")).toBe(true);
  });
  test("hides modules the person hid from their own sidebar", () => {
    expect(moduleShown("/app/hr/leave", null, "org_owner", ["hr"])).toBe(false);
    expect(moduleShown("/app/crm", null, "org_owner", ["hr"])).toBe(true);
    expect(moduleShown("/app/inbox", null, "org_owner", ["hr", "crm"])).toBe(true);
  });
});
