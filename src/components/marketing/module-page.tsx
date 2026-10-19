import { Link } from "@tanstack/react-router";
import { MarketingShell } from "./marketing-shell";

export interface ModuleFeature {
  title: string;
  body: string;
}

export interface ModulePageProps {
  code: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  intro: string;
  features: ModuleFeature[];
  outcomes: Array<[string, string]>;
}

export function ModulePage(props: ModulePageProps) {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-7xl px-6 pt-24 pb-12">
        <div className="mb-6 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <span className="size-2 bg-primary" />
          {props.code} · {props.eyebrow}
        </div>
        <h1 className="mb-6 max-w-4xl font-display text-5xl uppercase leading-[0.95] tracking-tighter md:text-7xl">
          {props.title}
        </h1>
        <p className="max-w-2xl text-pretty text-lg text-muted-foreground">{props.subtitle}</p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="bg-foreground px-8 py-4 font-mono text-sm uppercase tracking-wider text-background transition-colors hover:bg-primary"
          >
            Start free
          </Link>
          <Link
            to="/contact"
            className="border border-foreground px-8 py-4 font-mono text-sm uppercase tracking-wider transition-colors hover:bg-foreground hover:text-background"
          >
            Request demo
          </Link>
        </div>
      </section>

      <section className="border-y border-border bg-foreground/[0.02]">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <p className="max-w-3xl text-pretty text-xl leading-relaxed">{props.intro}</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12 flex items-baseline justify-between border-b border-foreground/10 pb-4">
          <h2 className="font-display text-3xl uppercase">Capabilities</h2>
          <span className="font-mono text-xs uppercase tracking-wider opacity-50">
            {String(props.features.length).padStart(2, "0")} capabilities
          </span>
        </div>
        <div className="grid grid-cols-1 gap-px border border-border bg-border md:grid-cols-2">
          {props.features.map((f, i) => (
            <div key={f.title} className="bg-background p-8">
              <div className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="mb-3 font-bold uppercase tracking-tight">{f.title}</div>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-foreground py-24 text-background">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="mb-12 max-w-2xl font-display text-4xl uppercase leading-tight">
            What teams accomplish.
          </h2>
          <div className="grid gap-px bg-white/10 md:grid-cols-3">
            {props.outcomes.map(([k, v]) => (
              <div key={k} className="bg-foreground p-8">
                <div className="mb-2 font-mono text-3xl text-primary">{k}</div>
                <div className="text-sm text-background/70">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="flex flex-col items-start justify-between gap-8 border-t border-foreground/10 pt-12 md:flex-row md:items-end">
          <h2 className="max-w-xl font-display text-4xl uppercase leading-tight">
            One platform. Every module included.
          </h2>
          <Link
            to="/pricing"
            className="bg-foreground px-8 py-4 font-mono text-sm uppercase tracking-wider text-background transition-colors hover:bg-primary"
          >
            See pricing
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
