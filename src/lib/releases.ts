// Release notes from CHANGELOG.md, for the public feed (/api/public/releases) that self-hosted
// installs check, and for the update pop-up.
import changelog from "../../CHANGELOG.md?raw";

export type Release = { version: string; date: string | null; notes: string[] };

export function parseChangelog(md: string = changelog): Release[] {
  const out: Release[] = [];
  for (const block of md.split(/\n(?=## )/).slice(1)) {
    const head = block.match(/^## (\d+\.\d+\.\d+)(?: \(([^)]+)\))?/);
    if (!head) continue;
    const notes: string[] = [];
    for (const line of block.split("\n").slice(1)) {
      if (line.startsWith("- ")) notes.push(line.slice(2).trim());
      else if (/^\s{2,}\S/.test(line) && notes.length) notes[notes.length - 1] += " " + line.trim();
    }
    out.push({ version: head[1], date: head[2] ?? null, notes: notes.map((n) => n.replace(/`/g, "")) });
  }
  return out;
}
