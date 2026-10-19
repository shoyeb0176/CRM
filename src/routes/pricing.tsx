import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { INSTALL_SERVICES, SELF_HOST_LICENCES, SMALL_PLAN_LIMITS, TIERS, tierPrice, type Tier } from "@/lib/billing/pricing";

import { Button } from "@/components/ui/button";
const DESCRIPTION = "Free for small businesses, then $12 to $349 a month. No per-user fees: you pay for what your business needs, not for every person you hire.";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing | Inuberry" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Pricing | Inuberry" },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const [cadence, setCadence] = useState<"month" | "year">("month");
  return (
    <MarketingShell>
      <section className="mx-auto max-w-7xl px-4 pt-24 pb-10 sm:px-6">
        <div className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">/ pricing</div>
        <h1 className="max-w-3xl font-display text-5xl uppercase leading-[0.95] tracking-tighter sm:text-6xl">
          Pay for what <br />
          you use, not who <span className="text-primary">you hire.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          No per-user fees. The price follows what your business needs: the modules, the automation, the AI and
          the support. Small businesses start free.
        </p>
        <div className="mt-8 inline-flex border border-border" role="group" aria-label="Billing period">
          {(["month", "year"] as const).map((c) => (
            <Button variant="bare" size="bare"
              key={c}
              onClick={() => setCadence(c)}
              aria-pressed={cadence === c}
              className={`px-4 py-2 font-mono text-xs uppercase tracking-wider transition-colors ${cadence === c ? "bg-foreground text-background" : "hover:bg-muted"}`}
            >
              {c === "month" ? "Monthly" : "Yearly · 2 months free"}
            </Button>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-6 sm:px-6">
        <div className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {TIERS.map((t) => <PlanColumn key={t.key} tier={t} cadence={cadence} />)}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Prices in US dollars. New workspaces start on Startup. To move to a paid plan before online checkout
          opens, <Link to="/contact" className="text-primary hover:underline">talk to us</Link>.
        </p>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-3xl uppercase tracking-tight">Startup or Startup Plus?</h2>
          <p className="mt-3 text-muted-foreground">
            Startup is free for businesses with 15 or fewer employees, or under $100,000 a year in revenue. Sponsors
            pay for it: you'll see offers for business tools on the dashboard and in the marketplace, never inside
            your records, invoices, reports or HR data. We never sell your data or show advertisers your numbers.
            Startup Plus removes the offers and gives you more room.
          </p>
        </div>
        <div className="overflow-x-auto border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted font-mono text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-2 text-left font-normal">What you get</th><th className="px-4 py-2 font-normal">Startup</th><th className="px-4 py-2 font-normal">Startup Plus</th></tr>
            </thead>
            <tbody>
              {SMALL_PLAN_LIMITS.map(([k, a, b]) => (
                <tr key={k} className="border-t border-border">
                  <td className="px-4 py-2">{k}</td>
                  <td className="px-4 py-2 text-center tabular-nums">{a}</td>
                  <td className="px-4 py-2 text-center tabular-nums">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="self-hosted" className="scroll-mt-20 border-t border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">/ self-hosted</div>
          <h2 className="max-w-3xl font-display text-4xl uppercase leading-none tracking-tight">Run it on your own servers</h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Inuberry Cloud is the simple option: we run the servers, updates, backups and monitoring. If you need your
            data in your own cloud account or office, you can self-host with a yearly licence. You provide the
            servers; the licence covers the software, its updates and security fixes.
          </p>
          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <div className="border border-border bg-background">
              <div className="border-b border-border px-5 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Yearly licence</div>
              <ul>
                {SELF_HOST_LICENCES.map(([plan, price]) => (
                  <li key={plan} className="flex justify-between border-b border-border px-5 py-3 text-sm last:border-b-0">
                    <span>{plan}</span><span className="font-medium tabular-nums">{price}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-4">
              {INSTALL_SERVICES.map(([name, price, what]) => (
                <div key={name} className="border border-border bg-card shadow-sm p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold">{name}</h3>
                    <span className="font-mono text-sm">{price}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{what}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/contact" className="bg-foreground px-6 py-3 font-mono text-xs uppercase tracking-wider text-background transition-colors hover:bg-primary">
              Get a licence
            </Link>
            <Link to="/docs/$slug" params={{ slug: "self-hosting" }} className="border border-foreground px-6 py-3 font-mono text-xs uppercase tracking-wider transition-colors hover:bg-foreground hover:text-background">
              Read the install guide
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

function PlanColumn({ tier: t, cadence }: { tier: Tier; cadence: "month" | "year" }) {
  const price = tierPrice(t, cadence);
  const unit = t.monthly == null ? "/ month" : t.monthly === 0 ? "forever" : cadence === "year" ? "/ year" : "/ month";
  return (
    <div className={`flex flex-col gap-5 bg-background p-7 ${t.featured ? "ring-2 ring-foreground ring-inset" : ""}`}>
      <div className="flex items-center justify-between border-b border-border pb-3">
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{t.tagline}</span>
        {t.featured && <span className="bg-primary px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-primary-foreground">Recommended</span>}
      </div>
      <div>
        <div className="font-display text-3xl uppercase">{t.name}</div>
        <p className="mt-2 text-sm text-muted-foreground">{t.forWho}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-5xl">{price}</span>
        <span className="font-mono text-xs text-muted-foreground">{unit}</span>
      </div>
      <ul className="flex-1 space-y-2 border-t border-border pt-5">
        {t.features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-sm">
            <span className="mt-2 size-1.5 shrink-0 bg-primary" />
            {f}
          </li>
        ))}
      </ul>
      <Link
        to={t.cta.to}
        search={t.cta.to === "/auth" ? { mode: "signup" } : undefined}
        className={`mt-2 px-6 py-3 text-center font-mono text-xs uppercase tracking-wider transition-colors ${
          t.featured ? "bg-foreground text-background hover:bg-primary" : "border border-foreground hover:bg-foreground hover:text-background"
        }`}
      >
        {t.cta.label}
      </Link>
    </div>
  );
}
