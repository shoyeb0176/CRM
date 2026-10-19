import type { ReactNode } from "react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { LEGAL } from "@/lib/legal-config";

export function LegalPage({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <MarketingShell>
      <article className="mx-auto max-w-3xl px-6 py-20">
        <div className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {eyebrow} · Effective {LEGAL.effectiveDate}
        </div>
        <h1 className="font-display text-5xl uppercase tracking-tight">{title}</h1>
        <div className="prose prose-neutral mt-10 max-w-none text-sm leading-relaxed text-foreground/90 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:uppercase [&_h2]:tracking-tight [&_h3]:mt-6 [&_h3]:font-mono [&_h3]:text-xs [&_h3]:uppercase [&_h3]:tracking-widest [&_h3]:text-muted-foreground [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1 [&_a]:text-primary [&_a]:underline">
          {children}
        </div>
        <p className="mt-16 border-t border-border pt-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {LEGAL.company} · {LEGAL.address} · {LEGAL.supportEmail}
        </p>
      </article>
    </MarketingShell>
  );
}
