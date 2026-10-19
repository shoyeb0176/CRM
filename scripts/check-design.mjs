#!/usr/bin/env node
// Keeps the design kit's rules in the code: square corners, theme colours (not raw Tailwind palette
// colours), text no smaller than 12px, and a label on every icon-only button. Runs in CI; run it locally with `bun run check:design`.
// The shared UI kit (src/components/ui) and the print pages (fixed colours for paper) are exempt.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../src/", import.meta.url));
const EXEMPT = [join("components", "ui") + sep, "print.$doc.$id.tsx", "print.payslips.$runId.tsx"];
const RULES = [
  [/\brounded(?:-(?:sm|md|lg|xl|2xl|t|b|l|r|tl|tr|bl|br))?(?=["\s`}])/g, "rounded corners (the design is square; rounded-full is fine for dots)"],
  [/\b(?:text|bg|border|ring|fill|stroke)-(?:emerald|green|amber|yellow|sky|blue|red|orange|rose|lime|teal|cyan|indigo|violet|purple|pink|slate|gray|zinc|neutral|stone)-\d{2,3}\b/g, "raw palette colour (use primary, success, warning, info, destructive, muted…)"],
  [/\btext-\[(?:[0-9]|1[01])px\]/g, "text under 12px (use text-xs)"],
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (p.endsWith(".tsx")) yield p;
  }
}

// Every button is a <Button> (variant "kit" / "kitSolid" for the design kit's action buttons,
// "bare" with size "bare" for buttons with their own layout), so they share focus and disabled styles.
const MAX_RAW_BUTTONS = 0;
let rawButtons = 0;

/** Buttons whose only content is an icon need a name for screen readers (aria-label or title). */
function unlabelledIconButtons(text) {
  const found = [];
  for (const m of text.matchAll(/<(button|Button)(?=[\s>])/g)) {
    // Find the end of the opening tag, skipping `>` inside {…} and strings (arrow functions).
    let i = m.index + m[0].length, depth = 0, quote = null;
    for (; i < text.length; i++) {
      const c = text[i];
      if (quote) { if (c === quote) quote = null; }
      else if (depth === 0 && (c === '"' || c === "'" || c === "`")) quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    if (text[i - 1] === "/") continue;
    const attrs = text.slice(m.index, i);
    const close = text.indexOf(`</${m[1]}>`, i);
    if (close < 0) continue;
    const body = text.slice(i + 1, close).trim();
    if (/^<[A-Z]\w*\b[^<>]*\/>$/s.test(body) && !/\b(aria-label|aria-labelledby|title)=/.test(attrs)) {
      found.push(text.slice(0, m.index).split("\n").length);
    }
  }
  return found;
}

let problems = 0;
for (const file of files(ROOT)) {
  const rel = relative(ROOT, file);
  for (const line of unlabelledIconButtons(readFileSync(file, "utf8"))) {
    problems++;
    console.log(`src/${rel.split(sep).join("/")}:${line}  icon-only button without aria-label or title`);
  }
  if (EXEMPT.some((e) => rel.startsWith(e) || rel.endsWith(e))) continue;
  const text = readFileSync(file, "utf8");
  if (!rel.startsWith(join("components", "ui") + sep)) rawButtons += (text.match(/<button\b/g) ?? []).length;
  text.split("\n").forEach((line, i) => {
    for (const [re, why] of RULES) {
      for (const m of line.matchAll(re)) {
        problems++;
        console.log(`src/${rel.split(sep).join("/")}:${i + 1}  ${m[0]}  ${why}`);
      }
    }
  });
}
if (rawButtons > MAX_RAW_BUTTONS) {
  problems++;
  console.log(`${rawButtons} raw <button> elements (at most ${MAX_RAW_BUTTONS}): use <Button> from components/ui/button.`);
}
if (problems) {
  console.log(`\n${problems} design-rule problem(s).`);
  process.exit(1);
}
console.log("Design rules: OK");
