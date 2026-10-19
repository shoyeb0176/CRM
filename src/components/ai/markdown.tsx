import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Link } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CodeBlock } from "@/components/ui/code-block";
import { linkTarget } from "@/lib/notifications/kinds";
import { normalizeMath } from "./normalize-math";

/**
 * AI text as formatted markdown in the app's own style: GitHub tables and task lists, math
 * ($x^2$, $$…$$), code, and links. Links into the app (/app/…) navigate in place.
 */
export function Markdown({ children, className, onNavigate }: {
  children: string;
  className?: string;
  /** Called when an in-app link is followed (e.g. to close the assistant panel). */
  onNavigate?: () => void;
}) {
  const components: Components = {
    p: ({ node: _n, ...p }) => <p className="my-2 first:mt-0 last:mb-0" {...p} />,
    ul: ({ node: _n, ...p }) => <ul className="my-2 list-disc space-y-1 pl-5" {...p} />,
    ol: ({ node: _n, ...p }) => <ol className="my-2 list-decimal space-y-1 pl-5" {...p} />,
    li: ({ node: _n, ...p }) => <li className="pl-0.5 marker:text-muted-foreground" {...p} />,
    h1: ({ node: _n, ...p }) => <h3 className="mb-2 mt-4 font-heading text-base first:mt-0" {...p} />,
    h2: ({ node: _n, ...p }) => <h4 className="mb-2 mt-4 font-heading text-sm uppercase tracking-wide first:mt-0" {...p} />,
    h3: ({ node: _n, ...p }) => <h5 className="mb-1 mt-3 font-heading text-sm first:mt-0" {...p} />,
    h4: ({ node: _n, ...p }) => <h6 className="mb-1 mt-3 font-heading text-sm first:mt-0" {...p} />,
    strong: ({ node: _n, ...p }) => <strong className="font-semibold text-foreground" {...p} />,
    blockquote: ({ node: _n, ...p }) => <blockquote className="my-2 border-l-2 border-primary/50 pl-3 text-muted-foreground" {...p} />,
    hr: () => <hr className="my-3 border-border" />,
    table: ({ node: _n, ...p }) => (
      <div className="my-2 overflow-x-auto border border-border bg-card shadow-sm">
        <table className="w-full border-collapse text-xs" {...p} />
      </div>
    ),
    thead: ({ node: _n, ...p }) => <thead className="bg-muted" {...p} />,
    th: ({ node: _n, ...p }) => <th className="border-b border-border px-2 py-1.5 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground" {...p} />,
    td: ({ node: _n, ...p }) => <td className="border-b border-border px-2 py-1.5 align-top tabular-nums last:border-b-0" {...p} />,
    // A fenced block: coloured by its language, with a copy button.
    pre: ({ children: kids }) => {
      const el = kids as ReactElement<{ className?: string; children?: ReactNode }>;
      const lang = /language-([\w+-]+)/.exec(el?.props?.className ?? "")?.[1];
      return <CodeBlock code={String(el?.props?.children ?? "").replace(/\n$/, "")} language={lang} className="my-2" />;
    },
    code: ({ node: _n, className: c, children: kids, ...p }) =>
      c ? <code className={cn("font-mono", c)} {...p}>{kids}</code>
        // An in-app path written as code (`/app/products`) becomes a link.
        : typeof kids === "string" && /^\/app(\/[\w$.-]+)*(\?[\w=&-]+)?$/.test(kids)
          ? <Link {...(linkTarget(kids) as { to: string })} onClick={onNavigate} className="bg-muted px-1 py-0.5 font-mono text-[0.85em] text-primary underline underline-offset-2">{kids}</Link>
          : <code className="bg-muted px-1 py-0.5 font-mono text-[0.85em]" {...p}>{kids}</code>,
    a: ({ node: _n, href = "", children: kids, ...p }) =>
      href.startsWith("/app") ? (
        <Link {...(linkTarget(href) as { to: string })} onClick={onNavigate} className="font-medium text-primary underline underline-offset-2">{kids}</Link>
      ) : (
        <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2" {...p}>{kids}</a>
      ),
  };
  return (
    <div className={cn("text-sm leading-relaxed break-words", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
        {normalizeMath(children)}
      </ReactMarkdown>
    </div>
  );
}
