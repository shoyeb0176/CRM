// Code and data shown in the app: a language label, a copy button and syntax colours.
// Colours come from the theme (styles.css, .hljs-*), so light and dark both work.
import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

// The highlighter loads on first use, so pages without code don't download it.
let hljsReady: Promise<typeof import("highlight.js/lib/core").default> | null = null;
function loadHljs() {
  hljsReady ??= (async () => {
    const [{ default: hljs }, ...langs] = await Promise.all([
      import("highlight.js/lib/core"),
      import("highlight.js/lib/languages/json"), import("highlight.js/lib/languages/bash"),
      import("highlight.js/lib/languages/typescript"), import("highlight.js/lib/languages/javascript"),
      import("highlight.js/lib/languages/sql"), import("highlight.js/lib/languages/yaml"),
      import("highlight.js/lib/languages/python"), import("highlight.js/lib/languages/ini"),
    ]);
    ["json", "bash", "typescript", "javascript", "sql", "yaml", "python", "ini"].forEach((name, i) => hljs.registerLanguage(name, langs[i].default));
    return hljs;
  })();
  return hljsReady;
}

const ALIASES: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", sh: "bash", shell: "bash",
  terminal: "bash", zsh: "bash", yml: "yaml", py: "python", env: "ini", toml: "ini", dotenv: "ini",
};
const KNOWN = new Set(["json", "bash", "typescript", "javascript", "sql", "yaml", "python", "ini"]);
const LABELS: Record<string, string> = { bash: "terminal", ini: "env", typescript: "ts", javascript: "js" };

export function CodeBlock({ code, language, label, lineNumbers, maxHeight, className }: {
  code: string;
  /** json, bash, ts, js, sql, yaml, python or env; anything else is shown as plain text. */
  language?: string;
  /** Header text; defaults to the language. */
  label?: string;
  lineNumbers?: boolean;
  /** Tailwind max-height class for long output, e.g. "max-h-72". */
  maxHeight?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const lang = language ? ALIASES[language.toLowerCase()] ?? language.toLowerCase() : undefined;
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    setHtml(null);
    if (!lang || !KNOWN.has(lang)) return;
    let alive = true;
    loadHljs()
      .then((h) => { if (alive) setHtml(h.highlight(code, { language: lang, ignoreIllegals: true }).value); })
      .catch(() => { /* plain text is fine */ });
    return () => { alive = false; };
  }, [code, lang]);
  const lines = lineNumbers ? code.split("\n").length : 0;

  return (
    <div className={cn("min-w-0 border border-border bg-muted/40", className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-xs text-muted-foreground">{label ?? (lang ? LABELS[lang] ?? lang : "text")}</span>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {})}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Copy to clipboard"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className={cn("flex overflow-auto", maxHeight)}>
        {lines > 0 && (
          <pre aria-hidden className="select-none border-r border-border px-3 py-3 text-right font-mono text-xs leading-relaxed text-muted-foreground/60">
            {Array.from({ length: lines }, (_, i) => i + 1).join("\n")}
          </pre>
        )}
        {html != null
          ? <pre className="hljs min-w-0 flex-1 p-3 font-mono text-xs leading-relaxed"><code dangerouslySetInnerHTML={{ __html: html }} /></pre>
          : <pre className="min-w-0 flex-1 p-3 font-mono text-xs leading-relaxed"><code>{code}</code></pre>}
      </div>
    </div>
  );
}

/** A JSON value (an AI action's details, an audit entry) as a coloured, copyable block. */
export function JsonBlock({ value, label = "json", maxHeight = "max-h-72", className }: { value: unknown; label?: string; maxHeight?: string; className?: string }) {
  return <CodeBlock code={JSON.stringify(value, null, 2) ?? "null"} language="json" label={label} maxHeight={maxHeight} className={className} />;
}
