// The assistant and AI apps only describe what's in the guide, so every page must be in it.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { APP_GUIDE } from "./app-guide";
import { COMMANDS } from "./commands";
import { NAV_GROUPS } from "@/components/app/nav";

describe("APP_GUIDE", () => {
  test("names every sidebar page", () => {
    const missing = NAV_GROUPS.flatMap((g) => g.items).filter((i) => !APP_GUIDE.includes(i.to) && !APP_GUIDE.includes(i.label));
    expect(missing.map((i) => i.to)).toEqual([]);
  });
  test("names every Settings page", () => {
    const src = readFileSync(new URL("../../components/settings/settings-shell.tsx", import.meta.url), "utf8");
    const labels = [...src.matchAll(/to: "\/app\/settings\/[\w-]+",\s+label: "([^"]+)"/g)].map((m) => m[1]);
    expect(labels.length).toBeGreaterThan(10);
    expect(labels.filter((l) => !APP_GUIDE.includes(l))).toEqual([]);
  });
  test("lists every slash command and the features people ask about", () => {
    for (const c of COMMANDS) expect(APP_GUIDE).toContain(`/${c.name}`);
    for (const t of ["Take the tour", "Show Getting started", "Your sidebar", "Settings › Organization › Modules", "/app/platform/insights", "/app/agents/templates", "A new version"]) {
      expect(APP_GUIDE).toContain(t);
    }
  });
});
