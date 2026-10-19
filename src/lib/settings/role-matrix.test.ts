import { expect, test } from "bun:test";
import { MODULES, ROLE_MATRIX, moduleAccess } from "./role-matrix";

test("every role has an entry for every module", () => {
  for (const [role, row] of Object.entries(ROLE_MATRIX)) {
    for (const m of MODULES) expect(row[m.key], `${role}.${m.key}`).toBeDefined();
  }
});

test("owners and admins have full access everywhere", () => {
  for (const m of MODULES) {
    expect(moduleAccess("org_owner", m.key)).toBe("full");
    expect(moduleAccess("org_admin", m.key)).toBe("full");
  }
});

test("only owners and admins manage settings", () => {
  const managers = Object.keys(ROLE_MATRIX).filter((r) => ROLE_MATRIX[r].settings !== "none");
  expect(managers.sort()).toEqual(["org_admin", "org_owner"]);
});

test("full HR access matches the database's has_hr_access (owner, admin, HR manager)", () => {
  const hr = Object.keys(ROLE_MATRIX).filter((r) => ROLE_MATRIX[r].hr === "full");
  expect(hr.sort()).toEqual(["hr_manager", "org_admin", "org_owner"]);
});

test("read-only never writes; unknown roles get nothing; platform owner counts as owner", () => {
  for (const m of MODULES) expect(["read", "none"]).toContain(moduleAccess("read_only", m.key));
  expect(moduleAccess("someone_else", "crm")).toBe("none");
  expect(moduleAccess(null, "crm")).toBe("none");
  expect(moduleAccess("platform_owner", "settings")).toBe("full");
});
