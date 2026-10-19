import { expect, test } from "bun:test";
import { kindInfo, linkTarget, timeAgo } from "./kinds";

test("linkTarget splits a link into path, search and hash", () => {
  expect(linkTarget("/app/inbox?tab=approvals&action=42#top")).toEqual({ to: "/app/inbox", search: { tab: "approvals", action: "42" }, hash: "top" });
  expect(linkTarget("/app/crm/leads")).toEqual({ to: "/app/crm/leads", search: undefined, hash: undefined });
});

test("timeAgo", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  expect(timeAgo("2026-10-14T11:59:30Z", now)).toBe("just now");
  expect(timeAgo("2026-10-14T11:55:00Z", now)).toBe("5 min ago");
  expect(timeAgo("2026-10-14T09:00:00Z", now)).toBe("3 h ago");
  expect(timeAgo("2026-10-13T10:00:00Z", now)).toBe("yesterday");
  expect(timeAgo("2026-10-20T10:00:00Z", now)).toBe("just now"); // clock skew never shows a negative time
});

test("unknown kinds still get a label", () => {
  expect(kindInfo("made.up").label).toBe("made.up");
  expect(kindInfo(null).label).toBe("Notification");
});
