import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { CookieConsent } from "@/components/marketing/cookie-consent";
import { useWebsiteAnalytics } from "@/lib/analytics";
import { LEGAL } from "@/lib/legal-config";

export function LedgerLines() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 flex justify-between px-6 opacity-20 md:px-12">
      <div className="animate-ledger-line w-px bg-foreground/10" />
      <div className="animate-ledger-line w-px bg-foreground/10 [animation-delay:100ms]" />
      <div className="animate-ledger-line w-px bg-foreground/10 [animation-delay:200ms]" />
      <div className="animate-ledger-line w-px bg-foreground/10 [animation-delay:300ms]" />
    </div>
  );
}

export function MarketingNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="font-display text-2xl uppercase tracking-tight">
          Inuberry
        </Link>
        <div className="hidden gap-6 text-xs font-medium uppercase tracking-wider lg:flex">
          <Link to="/features" className="transition-colors hover:text-primary">Features</Link>
          <Link to="/crm" className="transition-colors hover:text-primary">CRM</Link>
          <Link to="/invoicing" className="transition-colors hover:text-primary">Invoicing</Link>
          <Link to="/inventory" className="transition-colors hover:text-primary">Inventory</Link>
          <Link to="/projects" className="transition-colors hover:text-primary">Projects</Link>
          <Link to="/hr" className="transition-colors hover:text-primary">HR</Link>
          <Link to="/accounting" className="transition-colors hover:text-primary">Accounting</Link>
          <Link to="/pricing" className="transition-colors hover:text-primary">Pricing</Link>
          <Link to="/docs" className="transition-colors hover:text-primary">Docs</Link>
        </div>
        <div className="flex gap-3">
          <Link
            to="/auth"
            className="border border-border px-4 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors hover:bg-foreground/5"
          >
            Log in
          </Link>
          <Link
            to="/contact"
            className="hidden border border-foreground px-4 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors hover:bg-foreground hover:text-background md:inline-block"
          >
            Demo
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="bg-foreground px-4 py-1.5 font-mono text-xs uppercase tracking-wider text-background transition-colors hover:bg-primary"
          >
            Start free
          </Link>
        </div>
      </div>
    </nav>
  );
}

export function MarketingFooter() {
  return (
    <footer className="relative z-10 border-t border-border py-12">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-12 px-6 md:grid-cols-6">
        <div className="col-span-2 md:col-span-1">
          <div className="font-display text-2xl uppercase">Inuberry</div>
          <p className="mt-4 max-w-xs text-xs text-muted-foreground">
            One ERP for CRM, invoicing, inventory, projects, HR, and accounting.
          </p>
          <p className="mt-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {LEGAL.company}
            <br />
            {LEGAL.address}
            <br />
            <a href={`mailto:${LEGAL.supportEmail}`} className="hover:text-primary">{LEGAL.supportEmail}</a>
          </p>
        </div>
        <FooterCol title="Modules" links={[["CRM", "/crm"], ["Invoicing", "/invoicing"], ["Inventory", "/inventory"], ["Projects", "/projects"], ["HR", "/hr"], ["Accounting", "/accounting"]]} />
        <FooterCol title="Product" links={[["Features", "/features"], ["Pricing", "/pricing"], ["Request demo", "/contact"]]} />
        <FooterCol title="Developers" links={[["Install guide", "/docs/self-hosting"], ["Updates", "/docs/updates"], ["Connect your AI", "/docs/mcp"], ["FAQ", "/docs/faq"]]} />
        <FooterCol title="Company" links={[["Contact", "/contact"], ["Log in", "/auth"]]} />
        <FooterCol title="Legal" links={[["Terms", "/legal/terms"], ["Privacy", "/legal/privacy"], ["DPA", "/legal/dpa"], ["Security", "/legal/security"], ["Refunds", "/legal/refund"]]} />
      </div>
      <div className="mx-auto mt-12 flex max-w-7xl items-center justify-between border-t border-border px-6 pt-8">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          © {new Date().getFullYear()} {LEGAL.company}. All rights reserved.
        </div>
        <div className="flex gap-2">
          <div className="size-2 bg-foreground/20" />
          <div className="size-2 bg-foreground/20" />
          <div className="size-2 bg-primary" />
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <div className="mb-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</div>
      <ul className="space-y-2 text-sm">
        {links.map(([label, href]) => (
          <li key={label}>
            <Link to={href} className="transition-colors hover:text-primary">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}


export function MarketingShell({ children }: { children: ReactNode }) {
  useWebsiteAnalytics();
  return (
    <div className="relative min-h-screen bg-background font-sans text-foreground selection:bg-primary/20">
      <LedgerLines />
      <MarketingNav />
      <main className="relative z-10">{children}</main>
      <MarketingFooter />
      <CookieConsent />
    </div>
  );
}
