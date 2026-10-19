import { expect, test } from "bun:test";
import { rankHelp } from "./tools";
import { docSections } from "@/lib/docs/content";

const top = (q: string) => rankHelp(q, docSections())[0]?.title ?? "";

test("help search finds the right guide", () => {
  expect(top("How do I create a new invoice?")).toContain("Invoices");
  expect(top("How much does the Growth plan cost?")).toContain("cost");
  expect(top("How do I invite a teammate?")).toContain("teammates");
  expect(top("How do I connect Claude with MCP?")).toContain("Connect your AI");
});

test("rare words outweigh common ones, and nothing matches nonsense", () => {
  expect(rankHelp("zzqx blorp", docSections())).toEqual([]);
});
