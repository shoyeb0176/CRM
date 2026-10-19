/**
 * Models often write LaTeX as \[ … \] and \( … \); remark-math only reads $$ … $$ and $ … $.
 * ponytail: also rewrites inside code blocks; fine for chat, revisit if users paste LaTeX source.
 */
export function normalizeMath(md: string): string {
  return md
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m: string) => `\n$$\n${m.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m: string) => `$${m.trim()}$`);
}
