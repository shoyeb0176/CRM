import { expect, test } from "bun:test";
import { zipSync, strToU8 } from "fflate";
import { coerce, parseCsv, parseNumber, tableFromRecords } from "./csv";
import {
  airtableRecords, notionBlocksToMarkdown, notionExportTables, notionPageRecord, notionTitle, readNotionZip,
} from "./connectors";

const rt = (text: string) => [{ type: "text", plain_text: text }];

test("CSV: semicolon and tab files, quoted delimiters", () => {
  expect(parseCsv('Name;Price\n"A; B";"1.234,50"\n')).toEqual({ headers: ["Name", "Price"], rows: [["A; B", "1.234,50"]] });
  expect(parseCsv("Name\tCity\nAcme\tBerlin\n").rows).toEqual([["Acme", "Berlin"]]);
  expect(parseCsv('Name,Note\nAcme,"x; y; z"\n').rows).toEqual([["Acme", "x; y; z"]]);
});

test("numbers in either locale", () => {
  expect(parseNumber("1,234.56")).toBe(1234.56);
  expect(parseNumber("1.234,56")).toBe(1234.56);
  expect(parseNumber("1 234,56")).toBe(1234.56);
  expect(parseNumber("€12,50")).toBe(12.5);
  expect(parseNumber("1,234")).toBe(1234);
  expect(parseNumber("1.234.567")).toBe(1234567);
  expect(parseNumber("3.5")).toBe(3.5);
  expect(parseNumber("(45)")).toBe(-45);
  expect(parseNumber("-7")).toBe(-7);
  expect(parseNumber("n/a")).toBeNull();
  expect(coerce("$ 2,000", "number")).toBe(2000);
});

test("records to a table keep every column", () => {
  expect(tableFromRecords([{ a: "1" }, { b: "2", a: "3" }])).toEqual({ headers: ["a", "b"], rows: [["1", ""], ["3", "2"]] });
});

test("Notion database row: title first, every property type as text", () => {
  const page = {
    object: "page", id: "p1",
    properties: {
      Amount: { type: "number", number: 1200 },
      Name: { type: "title", title: rt("Acme renewal") },
      Stage: { type: "status", status: { name: "Won" } },
      Tags: { type: "multi_select", multi_select: [{ name: "B2B" }, { name: "EU" }] },
      Close: { type: "date", date: { start: "2026-03-01", end: null } },
      Done: { type: "checkbox", checkbox: true },
      Owner: { type: "people", people: [{ name: "Sam" }] },
      Ref: { type: "unique_id", unique_id: { prefix: "DEAL", number: 7 } },
      Score: { type: "formula", formula: { type: "number", number: 3 } },
    },
  };
  const rec = notionPageRecord(page);
  expect(Object.keys(rec)[0]).toBe("Name");
  expect(rec).toMatchObject({
    Name: "Acme renewal", Amount: "1200", Stage: "Won", Tags: "B2B, EU", Close: "2026-03-01",
    Done: "true", Owner: "Sam", Ref: "DEAL-7", Score: "3",
  });
  expect(notionTitle(page)).toBe("Acme renewal");
  expect(notionTitle({ object: "database", title: rt("Deals") })).toBe("Deals");
});

test("Notion blocks to Markdown", () => {
  const md = notionBlocksToMarkdown([
    { type: "heading_2", heading_2: { rich_text: rt("Goals") } },
    { type: "numbered_list_item", numbered_list_item: { rich_text: rt("First") } },
    { type: "numbered_list_item", numbered_list_item: { rich_text: rt("Second") },
      children: [{ type: "bulleted_list_item", bulleted_list_item: { rich_text: rt("detail") } }] },
    { type: "to_do", to_do: { rich_text: rt("Call"), checked: true } },
    { type: "code", code: { rich_text: rt("x = 1"), language: "python" } },
    { type: "unsupported", unsupported: {} },
    { type: "paragraph", paragraph: { rich_text: rt("End.") } },
  ]);
  expect(md).toBe("## Goals\n\n1. First\n\n2. Second\n\n  - detail\n\n- [x] Call\n\n```python\nx = 1\n```\n\nEnd.");
});

test("Airtable records: field order, lists, people, attachments", () => {
  const recs = airtableRecords([
    { id: "rec1", fields: { Notes: "hi", Name: "Acme", Tags: ["a", "b"], Owner: { name: "Sam", email: "s@x.io" }, Files: [{ url: "https://x/f.pdf", filename: "f.pdf" }], Paid: true } },
  ], ["Name", "Tags"]);
  expect(Object.keys(recs[0]).slice(0, 2)).toEqual(["Name", "Tags"]);
  expect(recs[0]).toEqual({ Name: "Acme", Tags: "a, b", Notes: "hi", Owner: "Sam", Files: "https://x/f.pdf", Paid: "true" });
});

const ID = "0123456789abcdef0123456789abcdef";
const exportFiles = {
  [`Export/Deals ${ID}.csv`]: "Name,Stage\nAcme renewal,Won\nNo page,Lost\n",
  [`Export/Deals ${ID}_all.csv`]: "Name,Stage\nAcme renewal,Won\nNo page,Lost\nOld one,Lost\n",
  [`Export/Deals ${ID}/Acme renewal ${ID}.md`]: "# Acme renewal\n\nStage: Won\n\nSigned for **two** years.\n",
  [`Export/Wiki ${ID}.md`]: "# Wiki home\n\nWelcome.\n",
};

test("Notion export: database rows get their page text, loose pages become a table", () => {
  const tables = notionExportTables(exportFiles);
  expect(tables.map((t) => t.name)).toEqual(["Deals", "Pages"]);
  const deals = tables[0];
  expect(deals.headers).toEqual(["Name", "Stage", "Body"]);
  expect(deals.rows.length).toBe(3); // the _all file, not the current view
  expect(deals.rows[0][2]).toBe("Signed for **two** years.");
  expect(deals.rows[1][2]).toBe("");
  expect(tables[1].rows).toEqual([["Wiki home", "Welcome.", "Export"]]);
});

test("Notion export zip, including a zip inside the zip", async () => {
  const inner = zipSync(Object.fromEntries(Object.entries(exportFiles).map(([k, v]) => [k, strToU8(v)])));
  const outer = zipSync({ "Export-Part-1.zip": inner });
  const tables = await readNotionZip(new File([outer], "export.zip"));
  expect(tables.map((t) => t.name)).toEqual(["Deals", "Pages"]);
});
