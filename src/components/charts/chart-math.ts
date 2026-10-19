// Pure helpers for the charts (kept apart from React so they can be unit-tested).

/** Whole-number percentages that add up to exactly 100 (largest remainder), or all 0 when empty. */
export function shares(values: number[]): number[] {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  if (!total) return values.map(() => 0);
  const raw = values.map((v) => (Math.max(0, v) / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((s, v) => s + v, 0);
  raw
    .map((v, i) => [v - Math.floor(v), i] as const)
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (left-- > 0) out[i]++;
    });
  return out;
}

// Status names mean the same thing everywhere: done is green, waiting is amber, in motion is blue,
// gone wrong is red, not started is grey. Anything else takes the next chart colour.
const STATUS_COLOR: Array<[RegExp, string]> = [
  [
    /^(paid|won|completed?|done|approved|received|accepted|active|converted|closed_won|delivered|in_stock|ok)$/,
    "var(--success)",
  ],
  [
    /^(overdue|lost|rejected|cancell?ed|failed|out|out_of_stock|closed_lost|blocked|void)$/,
    "var(--destructive)",
  ],
  [
    /^(partially_paid|partial|pending|pending_approval|on_hold|low|review|in_review|waiting|expiring)$/,
    "var(--warning)",
  ],
  [/^(sent|open|in_progress|ordered|submitted|contacted|qualified|new|todo|to_do)$/, "var(--info)"],
  [/^(draft|unknown|none|no_stage|archived)$/, "var(--muted-foreground)"],
];
const PALETTE = [
  "var(--chart-2)",
  "var(--chart-1)",
  "var(--chart-4)",
  "var(--info)",
  "var(--chart-3)",
  "var(--chart-5)",
];
/** A colour for a status or category label; `i` picks from the palette when the label means nothing special. */
export function colorFor(label: string, i: number): string {
  const key = label
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return STATUS_COLOR.find(([re]) => re.test(key))?.[1] ?? PALETTE[i % PALETTE.length];
}
