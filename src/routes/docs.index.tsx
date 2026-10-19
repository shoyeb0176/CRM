import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, BarChart3, Bot, Briefcase, FileText, Handshake, HelpCircle, Inbox, Landmark, Package, PlugZap, Receipt,
  RefreshCw, Server, ShoppingBasket, ShoppingCart, Users, Workflow,
} from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { DOCS, MODULE_DOCS } from "@/lib/docs/content";

export const Route = createFileRoute("/docs/")({
  head: () => ({
    meta: [
      { title: "Docs — Inuberry" },
      { name: "description", content: "How to use each part of Inuberry, connect your AI apps, run it on your own server, and answers to common questions." },
    ],
  }),
  component: DocsHome,
});

const ICONS: Record<string, typeof Server> = {
  "self-hosting": Server, updates: RefreshCw, mcp: PlugZap, faq: HelpCircle,
  inbox: Inbox, crm: Handshake, sales: ShoppingCart, invoices: Receipt, "products-and-stock": Package, purchasing: ShoppingBasket,
  projects: Briefcase, accounting: Landmark, hr: Users, "ai-agents": Bot, automations: Workflow, "workspace-tools": FileText, reports: BarChart3,
};

function DocsHome() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-5xl px-4 pt-24 pb-10 sm:px-6">
        <div className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">/ docs</div>
        <h1 className="font-display text-5xl uppercase leading-[0.95] tracking-tight md:text-6xl">Guides</h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          How to use each part of Inuberry, connect your AI apps, and run it on your own server.
        </p>
      </section>
      {([["Set up", "Install, update and connect your AI apps.", DOCS], ["Using Inuberry", "What each part of the app is for and how to start.", MODULE_DOCS]] as const).map(([group, blurb, list]) => (
        <section key={group} className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
          <h2 className="font-heading text-xl">{group}</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">{blurb}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((d) => {
              const Icon = ICONS[d.slug] ?? HelpCircle;
              return (
                <Link key={d.slug} to="/docs/$slug" params={{ slug: d.slug }} className="group flex flex-col gap-3 border border-border bg-background p-6 hover:bg-foreground/[0.03]">
                  <Icon className="size-5 text-primary" />
                  <div className="text-lg font-semibold">{d.title}</div>
                  <p className="flex-1 text-sm text-muted-foreground">{d.summary}</p>
                  <span className="flex items-center gap-1 text-sm font-medium text-primary">Read <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </MarketingShell>
  );
}
