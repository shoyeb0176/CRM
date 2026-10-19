import { expect, test } from "bun:test";
import { parseChangelog } from "./releases";
import pkg from "../../package.json";

test("parses versions, dates and wrapped bullet lines", () => {
  const md = "# Changelog\n\n## 1.2.0 (2026-10-01)\n- First thing\n  continues here\n- Uses `code`\n\n## 1.1.0\n- Older\n";
  expect(parseChangelog(md)).toEqual([
    { version: "1.2.0", date: "2026-10-01", notes: ["First thing continues here", "Uses code"] },
    { version: "1.1.0", date: null, notes: ["Older"] },
  ]);
});

test("the real changelog's newest entry is the package version", () => {
  const [latest] = parseChangelog();
  expect(latest.version).toBe(pkg.version);
  expect(latest.notes.length).toBeGreaterThan(0);
});

test("the version shown in the app matches package.json", async () => {
  const { APP_VERSION } = await import("./version");
  expect(APP_VERSION).toBe(pkg.version);
});
