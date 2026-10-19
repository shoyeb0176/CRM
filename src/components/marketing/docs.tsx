// Renders the guides in src/lib/docs/content.ts (/docs, /docs/<slug>).
import { Link } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
import { CodeBlock } from "@/components/ui/code-block";
import { DOCS, MODULE_DOCS, type Doc } from "@/lib/docs/content";

/** `code`, **bold** and [label](href) inside one line. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = out.length;
    if (m[1]) out.push(<code key={k} className="bg-muted px-1 font-mono text-[0.85em]">{m[1]}</code>);
    else if (m[2]) out.push(<b key={k}>{m[2]}</b>);
    else if (m[4].startsWith("/") && !m[4].startsWith("/api/")) out.push(<Link key={k} to={m[4]} className="text-primary underline-offset-2 hover:underline">{m[3]}</Link>);
    else out.push(<a key={k} href={m[4]} className="text-primary underline-offset-2 hover:underline" target={m[4].startsWith("http") ? "_blank" : undefined} rel="noreferrer">{m[3]}</a>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function DocBody({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\n+/).map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => l.startsWith("- "))) {
          return <ul key={i} className="list-disc space-y-1.5 pl-5">{lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>;
        }
        if (lines.every((l) => /^\d+\. /.test(l))) {
          return <ol key={i} className="list-decimal space-y-1.5 pl-5">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+\. /, ""))}</li>)}</ol>;
        }
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </>
  );
}

/** Picks the colouring from the file name shown above a snippet. */
function langFor(label?: string) {
  if (!label) return "bash";
  if (/\.ya?ml$/.test(label)) return "yaml";
  if (/\.env/.test(label)) return "env";
  if (/\.json$/.test(label)) return "json";
  return /caddyfile/i.test(label) ? undefined : "bash";
}

export function DocPage({ doc }: { doc: Doc }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-20 pb-24 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <nav className="sticky top-24 space-y-6 text-sm" aria-label="Guides">
          {([["Set up", DOCS], ["Using Inuberry", MODULE_DOCS]] as const).map(([group, list]) => (
            <div key={group}>
              <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">{group}</div>
              <ul className="space-y-1">
                {list.map((d) => (
                  <li key={d.slug}>
                    <Link to="/docs/$slug" params={{ slug: d.slug }} className={d.slug === doc.slug ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}>
                      {d.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">On this page</div>
            <ul className="space-y-1">
              {doc.sections.map((s) => (
                <li key={s.id}><a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground">{s.heading}</a></li>
              ))}
            </ul>
          </div>
        </nav>
      </aside>
      <article className="min-w-0">
        <div className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <Link to="/docs" className="hover:text-foreground">Docs</Link> <span>/</span> <span>{doc.audience}</span>
        </div>
        <h1 className="font-display text-4xl uppercase leading-[0.95] tracking-tight sm:text-5xl">{doc.title}</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{doc.summary}</p>
        <div className="mt-10 space-y-10">
          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 border-t border-border pt-6">
              <h2 className="mb-3 text-xl font-semibold">{s.heading}</h2>
              <div className="space-y-3 text-[15px] leading-relaxed text-foreground/90"><DocBody text={s.body} /></div>
              {s.code && <div className="mt-4"><CodeBlock code={s.code} label={s.codeLabel} language={langFor(s.codeLabel)} /></div>}
            </section>
          ))}
        </div>
        <p className="mt-12 text-sm text-muted-foreground">
          Something missing or unclear? <Link to="/contact" className="text-primary hover:underline">Tell us</Link>.
        </p>
      </article>
    </div>
  );
}
