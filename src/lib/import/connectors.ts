// Turns what Notion and Airtable return (their APIs, or a Notion export zip) into plain text
// records, which the importer then treats exactly like CSV rows. No network calls here.

import { parseCsv } from "./csv";

type Json = Record<string, any>;

// ---------- Notion API ----------

export function notionText(rich: Json[] | undefined): string {
  return (rich ?? []).map((t) => t.plain_text ?? "").join("");
}

/** One Notion property as text (dates as YYYY-MM-DD, lists comma-separated). */
export function notionPropertyText(p: Json | undefined): string {
  if (!p) return "";
  switch (p.type) {
    case "title": case "rich_text": return notionText(p[p.type]);
    case "number": return p.number == null ? "" : String(p.number);
    case "select": case "status": return p[p.type]?.name ?? "";
    case "multi_select": return (p.multi_select ?? []).map((o: Json) => o.name).join(", ");
    case "date": return p.date ? [p.date.start, p.date.end].filter(Boolean).join(" → ") : "";
    case "checkbox": return p.checkbox ? "true" : "false";
    case "url": case "email": case "phone_number": case "created_time": case "last_edited_time": return p[p.type] ?? "";
    case "people": return (p.people ?? []).map((u: Json) => u.name ?? u.person?.email ?? "").filter(Boolean).join(", ");
    case "created_by": case "last_edited_by": return p[p.type]?.name ?? "";
    case "files": return (p.files ?? []).map((f: Json) => f.file?.url ?? f.external?.url ?? f.name).join(", ");
    case "relation": return (p.relation ?? []).map((r: Json) => r.id).join(", ");
    case "unique_id": return p.unique_id ? `${p.unique_id.prefix ? `${p.unique_id.prefix}-` : ""}${p.unique_id.number}` : "";
    case "formula": { const f = p.formula ?? {}; const v = f[f.type]; return v == null ? "" : typeof v === "object" ? (v.start ?? "") : String(v); }
    case "rollup": {
      const r = p.rollup ?? {};
      if (r.type === "array") return (r.array ?? []).map((x: Json) => notionPropertyText(x)).filter(Boolean).join(", ");
      const v = r[r.type]; return v == null ? "" : typeof v === "object" ? (v.start ?? "") : String(v);
    }
    default: return "";
  }
}

/** A database row or page as a record: its properties, title first. */
export function notionPageRecord(page: Json): Record<string, string> {
  const props = Object.entries((page.properties ?? {}) as Record<string, Json>);
  props.sort(([, a], [, b]) => (a.type === "title" ? -1 : b.type === "title" ? 1 : 0));
  return Object.fromEntries(props.map(([k, v]) => [k, notionPropertyText(v)]));
}

export function notionTitle(item: Json): string {
  if (item.object === "database") return notionText(item.title) || "Untitled database";
  const t = Object.values((item.properties ?? {}) as Record<string, Json>).find((p) => p.type === "title");
  return notionText(t?.title) || "Untitled";
}

/** Notion blocks (with `children` attached where fetched) as Markdown. Unknown blocks are skipped. */
export function notionBlocksToMarkdown(blocks: Json[], depth = 0): string {
  const pad = "  ".repeat(depth);
  const out: string[] = [];
  let n = 0;
  for (const b of blocks) {
    const d = b[b.type] ?? {};
    const text = notionText(d.rich_text);
    n = b.type === "numbered_list_item" ? n + 1 : 0;
    let line: string | null;
    switch (b.type) {
      case "paragraph": line = text; break;
      case "heading_1": line = `# ${text}`; break;
      case "heading_2": line = `## ${text}`; break;
      case "heading_3": line = `### ${text}`; break;
      case "bulleted_list_item": line = `- ${text}`; break;
      case "numbered_list_item": line = `${n}. ${text}`; break;
      case "to_do": line = `- [${d.checked ? "x" : " "}] ${text}`; break;
      case "toggle": line = `- ${text}`; break;
      case "quote": line = `> ${text}`; break;
      case "callout": line = `> ${d.icon?.emoji ? `${d.icon.emoji} ` : ""}${text}`; break;
      case "code": line = "```" + (d.language ?? "") + "\n" + text + "\n```"; break;
      case "divider": line = "---"; break;
      case "child_page": line = `**${d.title ?? ""}**`; break;
      case "bookmark": case "embed": case "link_preview": line = d.url ?? null; break;
      case "image": case "file": case "pdf": case "video":
        line = `[${notionText(d.caption) || b.type}](${d.file?.url ?? d.external?.url ?? ""})`; break;
      case "table_row": line = `| ${(d.cells ?? []).map((c: Json[]) => notionText(c)).join(" | ")} |`; break;
      default: line = null;
    }
    if (line !== null) out.push(pad + line);
    if (Array.isArray(b.children) && b.children.length) out.push(notionBlocksToMarkdown(b.children, b.type === "table" ? depth : depth + 1));
  }
  return depth ? out.join("\n") : out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------- Airtable API ----------

/** One Airtable cell as text: lists comma-separated, people by name, attachments by URL. */
export function airtableValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(airtableValue).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const o = v as Json;
    return o.name ?? o.email ?? o.url ?? o.text ?? (o.specialValue != null ? String(o.specialValue) : JSON.stringify(o));
  }
  return String(v);
}

/** Airtable records ({id, fields}) as records, columns in the table's field order when known. */
export function airtableRecords(records: Json[], fieldOrder: string[] = []): Record<string, string>[] {
  return records.map((r) => {
    const fields = (r.fields ?? {}) as Json;
    const keys = [...fieldOrder.filter((k) => k in fields), ...Object.keys(fields).filter((k) => !fieldOrder.includes(k))];
    return Object.fromEntries(keys.map((k) => [k, airtableValue(fields[k])]));
  });
}

// ---------- Notion export zip ----------

export type ImportTable = { name: string; headers: string[]; rows: string[][] };

// Notion appends a 32-character id to every exported file and folder name.
const cleanName = (file: string) => file.replace(/\.(csv|md)$/i, "").replace(/_all$/i, "").replace(/\s[0-9a-f]{32}$/i, "");
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** A page's Markdown without its "# Title" line and the "Property: value" lines Notion puts under it. */
export function notionPageBody(md: string, headers: string[]): string {
  const lines = md.replace(/\r/g, "").split("\n");
  let i = lines[0]?.startsWith("# ") ? 1 : 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const props = new Set(headers.map((h) => h.toLowerCase()));
  while (i < lines.length && props.has(lines[i].split(":")[0].trim().toLowerCase()) && lines[i].includes(":")) i++;
  return lines.slice(i).join("\n").trim();
}

/**
 * The tables in a Notion "Markdown & CSV" export: each database CSV, with a Body column holding the
 * text of each row's page, plus one "Pages" table for pages that aren't database rows.
 * `files` is the unzipped archive: path → text.
 */
export function notionExportTables(files: Record<string, string>): ImportTable[] {
  const paths = Object.keys(files).filter((p) => !p.startsWith("__MACOSX") && !p.endsWith("/"));
  const md = paths.filter((p) => /\.md$/i.test(p));
  const used = new Set<string>();
  const tables: ImportTable[] = [];
  // Newer exports have "X.csv" (current view) and "X_all.csv" (every row): keep the full one.
  const csvs = paths.filter((p) => /\.csv$/i.test(p) && !(paths.includes(p.replace(/\.csv$/i, "_all.csv"))));
  for (const path of csvs) {
    const { headers, rows } = parseCsv(files[path]);
    if (!headers.length) continue;
    const folder = path.replace(/(_all)?\.csv$/i, "") + "/";
    const pages = new Map<string, string>();
    for (const p of md) {
      if (p.startsWith(folder) && !p.slice(folder.length).includes("/")) pages.set(norm(cleanName(p.slice(folder.length))), p);
    }
    const bodies = rows.map((r) => {
      const p = pages.get(norm(r[0] ?? ""));
      if (!p) return "";
      used.add(p);
      return notionPageBody(files[p], headers);
    });
    if (bodies.some(Boolean)) {
      const col = headers.length;
      headers.push(headers.includes("Body") ? "Page body" : "Body");
      rows.forEach((r, i) => { while (r.length < col) r.push(""); r[col] = bodies[i]; });
    }
    tables.push({ name: cleanName(path.split("/").pop()!), headers, rows });
  }
  const loose = md.filter((p) => !used.has(p));
  if (loose.length) {
    tables.push({
      name: "Pages",
      headers: ["Title", "Body", "Folder"],
      rows: loose.map((p) => {
        const parts = p.split("/");
        const first = files[p].replace(/\r/g, "").split("\n")[0];
        const title = first.startsWith("# ") ? first.slice(2).trim() : cleanName(parts[parts.length - 1]);
        return [title, notionPageBody(files[p], []), parts.slice(0, -1).map(cleanName).join(" / ")];
      }),
    });
  }
  return tables;
}

/** Unzip a Notion export in the browser (fflate is loaded only when a zip is chosen). */
export async function readNotionZip(file: File): Promise<ImportTable[]> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const raw = unzipSync(new Uint8Array(await file.arrayBuffer()));
  // Large exports arrive as a zip of zips ("…-Part-1.zip").
  for (const [p, bytes] of Object.entries(raw)) {
    if (/\.zip$/i.test(p)) { delete raw[p]; Object.assign(raw, unzipSync(bytes)); }
  }
  const files: Record<string, string> = {};
  for (const [p, bytes] of Object.entries(raw)) if (/\.(csv|md)$/i.test(p)) files[p] = strFromU8(bytes);
  return notionExportTables(files);
}
