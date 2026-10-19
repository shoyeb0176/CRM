import { createFileRoute, Link } from "@tanstack/react-router";
import { TIERS, tierPrice } from "@/lib/billing/pricing";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import dashboardHero from "@/assets/dashboard-hero.jpg";
import { APP_VERSION } from "@/lib/version";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inuberry — One operations system for your whole business" },
      { name: "description", content: "Run sales, invoicing, inventory, projects, HR and accounting from a single multi-tenant workspace. Built for small and mid-sized teams." },
      { property: "og:title", content: "Inuberry — One operations system for your whole business" },
      { property: "og:description", content: "Run sales, invoicing, inventory, projects, HR and accounting from a single multi-tenant workspace. Built for small and mid-sized teams." },
    ],
  }),
  component: LandingPage,
});

const MODULES: Array<[string, string]> = [
  ["MOD_01", "CRM & Pipeline"],
  ["MOD_02", "Sales Orders"],
  ["MOD_03", "Customers"],
  ["MOD_04", "Products & Services"],
  ["MOD_05", "Quotes & Invoices"],
  ["MOD_06", "Inventory"],
  ["MOD_07", "Purchasing"],
  ["MOD_08", "Projects & Tasks"],
  ["MOD_09", "HR & Employees"],
  ["MOD_10", "Accounting"],
  ["MOD_11", "Reports & Dashboards"],
  ["MOD_12", "Admin & Settings"],
];

function LandingPage() {
  return (
    <MarketingShell>
      {/* HERO */}
      <section className="relative px-6 pt-24 pb-16">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-end gap-12 lg:grid-cols-12">
          <div className="animate-fade-up lg:col-span-7">
            <div className="mb-6 flex items-center gap-2 font-mono text-xs uppercase tracking-wider">
              <span className="size-2 bg-primary" />
              v{APP_VERSION} · Operational
            </div>
            <h1 className="mb-8 font-display text-6xl uppercase leading-[0.9] tracking-tighter md:text-8xl">
              One system <br />
              for the whole <br />
              <span className="text-primary">business.</span>
            </h1>
            <p className="mb-10 max-w-md text-pretty text-lg text-muted-foreground">
              Inuberry puts CRM, invoicing, inventory, projects, HR and accounting in one app with one
              database, so your team stops copying data between tools.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="bg-foreground px-8 py-4 font-mono text-sm uppercase tracking-wider text-background transition-all hover:bg-primary"
              >
                Start free
              </Link>
              <Link
                to="/"
                hash="modules"
                className="border border-foreground px-8 py-4 font-mono text-sm uppercase tracking-wider transition-all hover:bg-foreground hover:text-background"
              >
                See all modules
              </Link>
            </div>
          </div>
          <div className="animate-fade-up [animation-delay:200ms] lg:col-span-5">
            <div className="border border-border bg-foreground/5">
              <img
                src={dashboardHero}
                alt="Inuberry operations dashboard preview showing KPIs, a trend line, and recent invoices"
                width={800}
                height={1000}
                className="aspect-[4/5] w-full object-cover grayscale transition-all duration-700 hover:grayscale-0"
              />
            </div>
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <div className="border-y border-border bg-background py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-6 opacity-50">
          {["FORTUNA CORP", "METAVIEW", "AXON LOGISTICS", "HEXA MFG", "NORDIK CO"].map((b) => (
            <div key={b} className="font-display text-xl tracking-wider">{b}</div>
          ))}
        </div>
      </div>

      {/* MODULES */}
      <section id="modules" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12 flex items-baseline justify-between border-b border-foreground/10 pb-4">
          <h2 className="font-display text-4xl uppercase">Infrastructure</h2>
          <span className="font-mono text-xs uppercase tracking-wider opacity-50">12 modules · 1 workspace</span>
        </div>
        <div className="grid grid-cols-2 gap-px border border-border bg-border md:grid-cols-4">
          {MODULES.map(([code, name]) => (
            <div key={code} className="group bg-background p-8 transition-colors hover:bg-foreground/5">
              <div className="mb-6 size-4 bg-foreground/10 transition-colors group-hover:bg-primary" />
              <div className="mb-2 font-mono text-xs uppercase tracking-widest">{code}</div>
              <div className="font-bold uppercase tracking-tight">{name}</div>
            </div>
          ))}
        </div>
      </section>

      {/* DARK STATS */}
      <section className="bg-foreground py-24 text-background">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid items-center gap-24 lg:grid-cols-2">
            <div>
              <h2 className="mb-8 font-display text-5xl uppercase leading-tight">
                Real-time <br /> operational <br /> clarity.
              </h2>
              <p className="mb-10 max-w-md text-pretty text-base text-background/70">
                Every invoice, stock movement and closed deal lands in the same ledger.
                One source of truth, one set of permissions, one place to look.
              </p>
              <div className="space-y-6">
                <Stat label="Pipeline value" value="$4,892,100.00" accent />
                <Stat label="Active users" value="142" />
                <Stat label="Inventory turnover" value="18.4×" />
              </div>
            </div>
            <div className="relative">
              <div className="border border-white/10 bg-white/5 p-4">
                <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
                  <span className="font-mono text-xs uppercase tracking-widest">INV_8842.pdf</span>
                  <span className="bg-primary px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-foreground">
                    Paid
                  </span>
                </div>
                <div className="space-y-2 opacity-80">
                  <div className="h-3 w-full bg-white/10" />
                  <div className="h-3 w-2/3 bg-white/10" />
                  <div className="h-3 w-1/2 bg-white/10" />
                  <div className="h-3 w-3/4 bg-white/10" />
                  <div className="h-3 w-1/3 bg-white/10" />
                </div>
              </div>
              <div className="absolute -bottom-8 -left-8 bg-primary p-6 font-mono text-xs uppercase tracking-wider text-foreground">
                Auto-reconciliation active
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY INUBERRY */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12 flex items-baseline justify-between border-b border-foreground/10 pb-4">
          <h2 className="font-display text-4xl uppercase">Why Inuberry</h2>
          <span className="font-mono text-xs uppercase tracking-wider opacity-50">04 reasons</span>
        </div>
        <div className="grid gap-px border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
          {[
            ["One workspace", "Sales, finance, inventory, and HR data on a single schema. No exports, no syncs."],
            ["Built for SMBs", "Designed for teams of 1–500. The price, the polish, and the depth that fit."],
            ["Your choice of home", "Use Inuberry Cloud, or run it free on your own server. Either way, updates install in one click."],
            ["No per-user fees", "Free for small businesses. After that you pay for what the business needs, not for every person you hire."],
          ].map(([title, body], i) => (
            <div key={title} className="bg-background p-8">
              <div className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="mb-3 font-bold uppercase tracking-tight">{title}</div>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CUSTOMER TYPES */}
      <section className="border-y border-border bg-foreground/[0.02] py-24">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="mb-12 max-w-2xl font-display text-4xl uppercase leading-tight">Built for the businesses that build everything else.</h2>
          <div className="grid gap-px bg-border md:grid-cols-3">
            {[
              ["Agencies & consultancies", "Pipeline, projects, time and invoicing in one place."],
              ["Product & ecommerce", "Inventory, fulfillment, and accounting in lockstep."],
              ["Services & trades", "Quotes, scheduling, billing, and customer history in one record."],
              ["Manufacturers", "BOMs, purchasing, stock, and COGS tracked together."],
              ["Professional services", "Retainers, recurring invoices, and team utilization."],
              ["Growing startups", "Scale from 3 to 300 without replatforming."],
            ].map(([title, body]) => (
              <div key={title} className="bg-background p-8">
                <div className="mb-3 font-bold uppercase tracking-tight">{title}</div>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING PREVIEW */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12 flex items-baseline justify-between border-b border-foreground/10 pb-4">
          <h2 className="font-display text-4xl uppercase">Pricing</h2>
          <Link to="/pricing" className="font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-primary">
            See full plans →
          </Link>
        </div>
        <PricingPreview />
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="flex flex-col items-start justify-between gap-8 border-t border-foreground/10 pt-12 md:flex-row md:items-end">
          <div>
            <div className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">Begin</div>
            <h2 className="max-w-xl font-display text-5xl uppercase leading-tight">
              Replace five tools with one.
            </h2>
          </div>
          <div className="flex flex-wrap gap-4">
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
        </div>
      </section>

    </MarketingShell>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`border-l ${accent ? "border-primary" : "border-white/20"} pl-6`}>
      <div className={`mb-1 font-mono text-xs uppercase tracking-widest ${accent ? "text-primary" : "opacity-50"}`}>
        {label}
      </div>
      <div className="font-mono text-3xl">{value}</div>
    </div>
  );
}

/** Same plans as /pricing (from the database), plus self-hosting. */
function PricingPreview() {
  const pick = TIERS.filter((t) => ["startup", "core", "growth", "business"].includes(t.key));
  return (
    <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
      {pick.map((t) => (
        <Link key={t.key} to="/pricing" className="bg-background p-8 transition-colors hover:bg-foreground/[0.03]">
          <div className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">{t.name}</div>
          <div className="mb-1 font-display text-3xl">{tierPrice(t, "month")}<span className="ml-1 font-mono text-xs text-muted-foreground">{t.monthly ? "/ month" : ""}</span></div>
          <div className="text-xs text-muted-foreground">{t.tagline}</div>
        </Link>
      ))}
      <Link to="/pricing" hash="self-hosted" className="bg-background p-8 transition-colors hover:bg-foreground/[0.03]">
        <div className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">Self-hosted</div>
        <div className="mb-1 font-display text-3xl">$590<span className="ml-1 font-mono text-xs text-muted-foreground">/ year</span></div>
        <div className="text-xs text-muted-foreground">Your own servers, licensed yearly</div>
      </Link>
    </div>
  );
}
