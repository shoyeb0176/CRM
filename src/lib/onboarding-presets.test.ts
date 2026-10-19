import { expect, test } from "bun:test";
import { PROFESSIONS, suggestedModules } from "./onboarding-presets";
import { WORKSPACE_MODULES } from "@/components/app/nav";

const ALL = WORKSPACE_MODULES.map((m) => m.key);

test("every preset names real modules and always includes CRM", () => {
  for (const p of PROFESSIONS) {
    expect(p.modules.every((m) => ALL.includes(m))).toBe(true);
    expect(p.modules).toContain("crm");
  }
});

test("suggestions keep the sidebar's order; unknown means everything", () => {
  expect(suggestedModules("consulting", ALL)).toEqual(["crm", "invoices", "projects"]);
  expect(suggestedModules("", ALL)).toEqual(ALL);
});
