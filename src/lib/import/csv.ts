// CSV parsing + import targets. Notion and Airtable both export CSV, and their direct
// connections (connectors.ts) produce the same headers + rows, so one importer covers all three.

/** Comma, semicolon (Excel in much of Europe) or tab: whichever the header line uses most. */
function detectDelimiter(src: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const c of src) {
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && c === "\n") break;
    else if (!inQuotes && c in counts) counts[c]++;
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? best : ",";
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(src);

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const cleaned = rows.filter((r) => r.some((v) => v.trim() !== ""));
  const headers = (cleaned.shift() ?? []).map((h) => h.trim());
  return { headers, rows: cleaned };
}

export type ImportFieldType = "text" | "number" | "date" | "boolean";

export type ImportField = {
  key: string;
  label: string;
  type: ImportFieldType;
  required?: boolean;
};

export type ImportTarget = {
  key: string;
  label: string;
  table: string;
  description: string;
  fields: ImportField[];
};

export const IMPORT_TARGETS: ImportTarget[] = [
  {
    key: "companies",
    label: "Companies",
    table: "companies",
    description: "Customer and prospect organizations.",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "website", label: "Website", type: "text" },
      { key: "industry", label: "Industry", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "city", label: "City", type: "text" },
      { key: "country", label: "Country", type: "text" },
    ],
  },
  {
    key: "contacts",
    label: "Contacts",
    table: "contacts",
    description: "People at your customers and prospects.",
    fields: [
      { key: "first_name", label: "First name", type: "text", required: true },
      { key: "last_name", label: "Last name", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "job_title", label: "Job title", type: "text" },
      { key: "company", label: "Company", type: "text" },
    ],
  },
  {
    key: "leads",
    label: "Leads",
    table: "leads",
    description: "Enquiries not yet qualified.",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "email", label: "Email", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "company_name", label: "Company", type: "text" },
      { key: "source", label: "Source", type: "text" },
      { key: "estimated_value", label: "Estimated value", type: "number" },
    ],
  },
  {
    key: "products",
    label: "Products",
    table: "products",
    description: "Products and services you sell.",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "sku", label: "SKU", type: "text" },
      { key: "sale_price", label: "Sale price", type: "number" },
      { key: "cost_price", label: "Cost price", type: "number" },
      { key: "description", label: "Description", type: "text" },
    ],
  },
  {
    key: "knowledge",
    label: "Knowledge documents",
    table: "knowledge_docs",
    description: "Notion or Airtable pages exported as CSV.",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "content", label: "Body", type: "text" },
      { key: "collection", label: "Collection", type: "text" },
    ],
  },
  {
    key: "custom_database",
    label: "One of my databases",
    table: "custom_records",
    description: "Any table you built in the Databases section.",
    fields: [],
  },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns a list of problems for one mapped row (empty = valid). */
export function validateRow(record: Record<string, unknown>, fields: ImportField[]): string[] {
  const problems: string[] = [];
  for (const f of fields) {
    const v = record[f.key];
    if (f.required && (v === undefined || v === null || String(v).trim() === "")) problems.push(`missing ${f.label.toLowerCase()}`);
    if (v != null && String(v).trim() !== "" && /email/i.test(f.key) && !EMAIL_RE.test(String(v).trim())) problems.push("invalid email");
  }
  return problems;
}

/** Best-effort column guess: exact, then loose name match. */
export function guessColumn(headers: string[], field: ImportField): string | "" {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(field.label);
  const key = norm(field.key);
  const exact = headers.find((h) => norm(h) === target || norm(h) === key);
  if (exact) return exact;
  const loose = headers.find((h) => norm(h).includes(key) || key.includes(norm(h)));
  return loose ?? "";
}

/**
 * "1,234.56", "1.234,56", "1 234,56", "€12,50", "(45)" all read as numbers. With only commas, a
 * last group of exactly three digits is thousands ("1,234" = 1234); otherwise the comma is decimal.
 */
export function parseNumber(value: string): number | null {
  const raw = value.trim();
  const negative = /^\(.*\)$/.test(raw) || /^-|-$/.test(raw.replace(/[^0-9.,-]/g, ""));
  let v = raw.replace(/[^0-9.,]/g, "");
  if (!/[0-9]/.test(v)) return null;
  const lastDot = v.lastIndexOf("."), lastComma = v.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const [dec, group] = lastDot > lastComma ? [".", ","] : [",", "."];
    v = v.split(group).join("").replace(dec, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = v.split(sep);
    const thousands = parts.length > 2 || (sep === "," && parts[1].length === 3);
    v = thousands ? parts.join("") : parts.join(".");
  }
  const n = Number(v);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

/** Records (one object per row, e.g. from Notion or Airtable) as CSV-style headers + rows. */
export function tableFromRecords(records: Record<string, string>[]): { headers: string[]; rows: string[][] } {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const r of records) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); headers.push(k); }
  return { headers, rows: records.map((r) => headers.map((h) => r[h] ?? "")) };
}

export function coerce(value: string, type: ImportFieldType): string | number | boolean | null {
  const v = value?.trim() ?? "";
  if (v === "") return null;
  if (type === "number") return parseNumber(v);
  if (type === "boolean") return ["true", "yes", "1", "x", "checked"].includes(v.toLowerCase());
  if (type === "date") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return v;
}

/** Builds CSV text (RFC 4180 quoting) and downloads it in the browser. */
export function downloadCsv(fileName: string, headers: string[], rows: unknown[][]) {
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
  a.click();
  URL.revokeObjectURL(url);
}
