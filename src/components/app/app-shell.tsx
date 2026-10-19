import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { APP_VERSION } from "@/lib/version";
import { useMyMemberships } from "@/lib/use-memberships";
import { useCurrentMembership, useSwitchWorkspace } from "@/lib/use-current-org";
import { supabase } from "@/integrations/supabase/client";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { ROLE_LABELS } from "@/lib/settings/use-admin";
import { createContext, lazy, Suspense, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Settings, LogOut, ChevronDown, Shield, Menu, X, Sparkles, Search, Check, PanelLeftClose, PanelLeftOpen, Pin, Bug, MessageSquareWarning } from "lucide-react";
import type { ReactNode } from "react";
import { NotificationsBell } from "@/components/app/notifications-bell";
import { IconTips } from "@/components/app/icon-tips";
import { Tour } from "@/components/app/tour";
import { HelpMenu } from "@/components/app/help-menu";
import { moduleSummaryQuery, OVERVIEW_MODULE } from "@/lib/module-summary";
import { useHiddenModules } from "@/lib/use-hidden-modules";
import { openReportDialog, useIsPlatformReviewer } from "@/lib/feedback/feedback";
import { AiEntityProvider } from "@/lib/ai/entity-context";
import { NAV_FOOTER, NAV_GROUPS, SUB_PAGES, moduleShown, pageHelp, type NavItem } from "@/components/app/nav";
import { useAttentionCounts } from "@/lib/notifications/use-attention";
import { usePlanStatus, useTrialStatus } from "@/lib/billing/use-subscription";
import { useCurrentUser } from "@/lib/use-current-user";
import { resetAnalytics, useProductAnalytics } from "@/lib/analytics";
import { CookieConsent } from "@/components/marketing/cookie-consent";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";

/** Plan notices: a lapsed plan (data read-only), or the plan ending within 14 days. */
function PlanBanner() {
  const trial = useTrialStatus();
  const plan = usePlanStatus();
  let text: string | null = null;
  let urgent = false;
  if (plan.lapsed) {
    text = "Your plan has ended · data is read-only until you renew";
    urgent = true;
  } else if (trial.isTrial) {
    text = `Business trial: ${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left`;
  } else if (plan.daysLeft !== null && plan.daysLeft <= 14) {
    text = `${plan.planName} ends in ${plan.daysLeft} day${plan.daysLeft === 1 ? "" : "s"}`;
  }
  if (!text) return null;
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 md:px-6 ${
        urgent ? "border-destructive/40 bg-destructive/10" : "border-border bg-muted"
      }`}
    >
      <span className={`font-mono text-xs uppercase tracking-widest ${urgent ? "text-destructive" : "text-muted-foreground"}`}>
        {text}
      </span>
      <Link
        to="/app/settings/billing"
        className="font-mono text-xs uppercase tracking-widest text-primary hover:underline"
      >
        {urgent ? "Renew" : "See plans"}
      </Link>
    </div>
  );
}

// Labels for known pages, from the sidebar and the command palette ("CRM · Leads" → "Leads").
const PATH_LABELS: Record<string, string> = Object.fromEntries([
  ...[...NAV_GROUPS.flatMap((g) => g.items), ...NAV_FOOTER].map((i) => [i.to, i.label] as const),
  ...SUB_PAGES.map((p) => [p.to, p.label.split(" · ").pop()!] as const),
  ["/app", "Home"],
  ["/app/crm/companies", "Companies"], ["/app/crm/contacts", "Contacts"], ["/app/crm/leads", "Leads"],
  ["/app/crm/deals", "Deals"], ["/app/sales/quotes", "Quotes"], ["/app/platform", "Platform"],
]);

const humanize = (seg: string) => decodeURIComponent(seg).replace(/[-_]/g, " ");

/**
 * Parent pages of the current URL as links, e.g. Home › Settings above the "Email" title.
 * Built from the path, so pages only pass their title. A segment links only if it is a real page.
 * Ids in the middle of a path take their label from the page's `breadcrumb` text when it lines up.
 */
/** A thin moving bar under the top bar while a page or its first data is loading, so a click
 *  shows at once that it worked. Background refreshes of data already on screen don't count. */
function NavProgress() {
  const routing = useRouterState({ select: (s) => s.status === "pending" });
  const firstLoads = useIsFetching({ predicate: (q) => q.state.data === undefined });
  if (!routing && firstLoads === 0) return null;
  return (
    <div role="progressbar" aria-label="Loading" className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
      <div className="h-full w-1/4 bg-primary animate-nav-progress motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-60" />
    </div>
  );
}

function AppBreadcrumbs({ breadcrumb }: { breadcrumb?: string }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const segs = pathname.replace(/\/+$/, "").split("/").filter(Boolean); // ["app", "settings", "email"]
  if (segs[0] !== "app" || segs.length < 2) return null;
  const textParts = breadcrumb?.split(/\s+[/·]\s+/) ?? [];
  const crumbs = segs.slice(0, -1).map((seg, i) => {
    const to = "/" + segs.slice(0, i + 1).join("/");
    const exists = !!(router.routesByPath as unknown as Record<string, unknown>)[to];
    const label = PATH_LABELS[to] ?? (/^[0-9a-f-]{20,}$/i.test(seg) ? textParts[i - 1] ?? "…" : humanize(seg));
    return { to, label, exists };
  });
  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap gap-1 overflow-hidden font-mono text-xs uppercase tracking-widest sm:gap-1.5">
        {crumbs.map((c, i) => (
          <BreadcrumbItem key={c.to} className="min-w-0 shrink">
            {i > 0 && <BreadcrumbSeparator className="list-none [&>svg]:size-3" />}
            {c.exists ? (
              <BreadcrumbLink asChild className="truncate hover:text-primary hover:underline">
                <Link to={c.to}>{c.label}</Link>
              </BreadcrumbLink>
            ) : (
              <span className="truncate">{c.label}</span>
            )}
          </BreadcrumbItem>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** Who is signed in: name, email and role, so it's obvious which account and workspace you're using. */
function AccountCard({ role, platformOwner, onSignOut, compact }: { role?: string; platformOwner: boolean; onSignOut: () => void; compact?: boolean }) {
  const me = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      const user = s.session?.user;
      if (!user) return null;
      const { data: p } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      return { email: user.email ?? "", name: p?.full_name || (user.user_metadata?.full_name as string | undefined) || "" };
    },
  });
  const email = me.data?.email ?? "";
  const name = me.data?.name || email.split("@")[0];
  const initials = (name.match(/\b\p{L}/gu) ?? []).slice(0, 2).join("").toUpperCase() || "?";
  if (compact) {
    return (
      <div className="flex shrink-0 justify-center border-t border-sidebar-border py-3">
        <div className="flex size-9 items-center justify-center bg-primary font-mono text-xs font-semibold text-primary-foreground" aria-label={name ? `Signed in as ${name}` : "Account"} role="img">
          {initials}
        </div>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-sidebar-border px-4 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center bg-primary font-mono text-xs font-semibold text-primary-foreground" aria-hidden>
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold" title={name}>{name || "…"}</div>
        <div className="truncate text-xs text-sidebar-foreground/60" title={email}>{email}</div>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {role && role !== "platform_owner" && <span className="font-mono text-xs uppercase tracking-widest text-sidebar-foreground/50">{ROLE_LABELS[role] ?? role}</span>}
          {platformOwner && <span className="bg-primary/20 px-1 font-mono text-xs uppercase tracking-widest text-primary">Platform owner</span>}
        </div>
      </div>
      <Button variant="bare" size="bare"
        onClick={onSignOut}
        aria-label="Sign out"
        title="Sign out"
        className="flex size-9 shrink-0 items-center justify-center text-sidebar-foreground/70 transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:bg-destructive/15 focus-visible:text-destructive"
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}

function AppShellInner({ children, title, breadcrumb }: { children: ReactNode; title: string; breadcrumb?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const memberships = useMyMemberships();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [assistantOpen, setAssistantOpenRaw] = useState(false);
  // The assistant is mounted closed a few seconds after the app opens (or when you point at Ask AI),
  // so its code and conversation list are ready before the first click.
  const [assistantLoaded, setAssistantLoaded] = useState(false);
  const setAssistantOpen = (v: boolean) => { if (v) setAssistantLoaded(true); setAssistantOpenRaw(v); };
  const [paletteOpen, setPaletteOpenRaw] = useState(false);
  const [paletteLoaded, setPaletteLoaded] = useState(false);
  const setPaletteOpen = (v: boolean | ((o: boolean) => boolean)) => { setPaletteLoaded(true); setPaletteOpenRaw(v); };
  // Search used to download its code on the first click, which felt like a missed click. Now it's
  // ready (mounted, closed) two seconds after the app opens, or as soon as you point at the box.
  useEffect(() => {
    const t = setTimeout(() => setPaletteLoaded(true), 2000);
    const a = setTimeout(() => setAssistantLoaded(true), 3500);
    return () => { clearTimeout(t); clearTimeout(a); };
  }, []);
  const [aiQuestion, setAiQuestion] = useState<string | undefined>();
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  // Icon-only sidebar. While it's collapsed, hovering opens the full sidebar over the page.
  const MINI_KEY = "inuberry.nav.mini";
  const [mini, setMiniRaw] = useState(() => { try { return localStorage.getItem(MINI_KEY) === "1"; } catch { return false; } });
  const setMini = (v: boolean) => { setMiniRaw(v); setPeek(false); try { localStorage.setItem(MINI_KEY, v ? "1" : "0"); } catch { /* private mode */ } };
  // What the rail shows lags `mini` while collapsing: the full sidebar stays until the width has
  // finished shrinking, so the labels are clipped away instead of the contents swapping at once.
  const [railCompact, setRailCompact] = useState(mini);
  useEffect(() => {
    if (!mini) { setRailCompact(false); return; }
    const t = setTimeout(() => setRailCompact(true), 300);
    return () => clearTimeout(t);
  }, [mini]);
  const [peek, setPeekRaw] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const setPeek = (v: boolean) => {
    clearTimeout(peekTimer.current);
    // A short pause before opening, so passing over the rail on the way somewhere doesn't open it.
    if (v) peekTimer.current = setTimeout(() => setPeekRaw(true), 90);
    else peekTimer.current = setTimeout(() => { setPeekRaw(false); setWorkspaceOpen(false); }, 80);
  };
  const [modKey, setModKey] = useState("Ctrl");
  useEffect(() => { if (/Mac|iPhone|iPad/.test(navigator.platform)) setModKey("⌘"); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The phone drawer closes on Escape and when the page changes.
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const help = pageHelp(pathname);
  // The frame stays mounted across pages, so start each page at the top.
  useEffect(() => { document.getElementById("app-main-scroll")?.scrollTo(0, 0); }, [pathname]);

  const { membership: current, memberships: orgList } = useCurrentMembership();
  const switchWorkspace = useSwitchWorkspace();
  const me = useCurrentUser();
  const planName = usePlanStatus().planName;
  useProductAnalytics(me ? { id: me.id, email: me.email } : null,
    current ? { id: current.org_id, name: current.organizations.name, plan: planName || null } : null);

  async function handleSignOut() {
    resetAnalytics();
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const isActive = (to: string) =>
    to === "/app" ? pathname === "/app"
      : to === "/app/settings" ? pathname.startsWith(to) && !pathname.startsWith("/app/settings/billing")
      : pathname === to || pathname.startsWith(to + "/");

  // Sidebar groups people folded away (the group holding the current page always shows).
  const NAV_KEY = "inuberry.nav.collapsed";
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(NAV_KEY) ?? "[]"); } catch { return []; }
  });
  const toggleGroup = (label: string) => setCollapsed((c) => {
    const next = c.includes(label) ? c.filter((x) => x !== label) : [...c, label];
    try { localStorage.setItem(NAV_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  });
  const attention = useAttentionCounts(current?.org_id);

  // Pointing at a module starts fetching its overview numbers, so they're usually there on the click.
  const warmQc = useQueryClient();
  const warm = (to: string) => {
    const m = OVERVIEW_MODULE[to];
    if (m && current?.org_id) void warmQc.prefetchQuery(moduleSummaryQuery(current.org_id, m));
  };

  const SideLink = ({ item, compact, nested }: { item: NavItem; compact?: boolean; nested?: boolean }) => {
    const active = isActive(item.to);
    const Icon = item.icon;
    const n = item.badge ? attention.data?.[item.badge] ?? 0 : 0;
    if (compact) {
      return (
        <Link
          to={item.to}
          onPointerEnter={() => warm(item.to)}
          onFocus={() => warm(item.to)}
          aria-label={n > 0 ? `${item.label} (${n} waiting)` : item.label}
          className={`relative mx-auto flex size-10 items-center justify-center transition-colors ${
            active ? "bg-sidebar-accent text-primary" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          }`}
        >
          <Icon className="size-4" />
          {n > 0 && <span className="absolute right-1.5 top-1.5 size-2 bg-primary" aria-hidden />}
        </Link>
      );
    }
    return (
      <Link
        to={item.to}
        onClick={() => setMobileOpen(false)}
        onPointerEnter={() => warm(item.to)}
        onFocus={() => warm(item.to)}
        className={`group flex items-center gap-3 border-l-2 py-1.5 pr-4 text-sm transition-colors ${nested ? "-ml-px pl-3" : "pl-4"} ${
          active
            ? "border-primary bg-sidebar-accent text-sidebar-foreground"
            : "border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        }`}
      >
        <Icon className="size-4 shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
        {n > 0 && (
          <span className="min-w-5 bg-primary px-1.5 text-center font-mono text-xs leading-5 text-primary-foreground" aria-label={`${n} waiting`}>
            {n > 99 ? "99+" : n}
          </span>
        )}
      </Link>
    );
  };

  const platformOwner = !!memberships.data?.some((m) => m.role === "platform_owner");
  // Reviewers who aren't owners only reach Platform › Feedback.
  const reviewer = useIsPlatformReviewer();
  const platformLink: NavItem | null = platformOwner ? { label: "Platform admin", to: "/app/platform", icon: Shield }
    : reviewer.data ? { label: "Feedback", to: "/app/platform/feedback", icon: MessageSquareWarning } : null;
  const hiddenModules = useHiddenModules();
  const groups = NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((i) => moduleShown(i.to, current?.organizations.enabled_modules, current?.role, hiddenModules.data)) }))
    .filter((group) => group.items.length > 0);
  const orgName = current?.organizations.name ?? "—";

  // Load the code for every sidebar page in the background once the app has settled, so a first
  // click on a module only waits for its data. Files are small and cached for a year.
  const preloadRouter = useRouter();
  const preloadKey = groups.map((g) => g.items.map((i) => i.to).join()).join();
  useEffect(() => {
    const t = setTimeout(() => {
      for (const g of groups) for (const i of g.items) preloadRouter.preloadRoute({ to: i.to }).catch(() => {});
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadKey]);

  /** The sidebar's contents: full, or icon-only (`compact`) for the collapsed rail. */
  const sidebarBody = (compact: boolean, place: "desktop" | "mobile") => (
    <>
      <div className={`flex h-16 shrink-0 items-center border-b border-sidebar-border ${compact ? "justify-center" : "justify-between px-4"}`}>
        <Link to="/app" className="font-display text-xl uppercase tracking-tight text-sidebar-foreground" onClick={() => setMobileOpen(false)} aria-label={compact ? "Inuberry home" : undefined}>
          {compact ? "I" : "Inuberry"}
        </Link>
        {place === "mobile" ? (
          <Button variant="bare" size="bare" className="text-sidebar-foreground/60" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X className="size-5" />
          </Button>
        ) : !compact && (
          mini ? (
            <Button variant="bare" size="bare" onClick={() => setMini(false)} className="flex size-8 items-center justify-center text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground" aria-label="Keep the sidebar open">
              <Pin className="size-4" />
            </Button>
          ) : (
            <Button variant="bare" size="bare" onClick={() => setMini(true)} className="flex size-8 items-center justify-center text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground" aria-label="Collapse the sidebar">
              <PanelLeftClose className="size-4" />
            </Button>
          )
        )}
      </div>
      <div className="relative border-b border-sidebar-border">
        {compact ? (
          <div className="flex justify-center py-3" aria-label={`Workspace: ${orgName}`} role="img">
            <span className="flex size-9 items-center justify-center border border-sidebar-border font-mono text-xs font-semibold uppercase">
              {orgName.slice(0, 2)}
            </span>
          </div>
        ) : (
          <Button variant="bare" size="bare"
            onClick={() => setWorkspaceOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-sidebar-accent"
            aria-haspopup="menu"
            aria-expanded={workspaceOpen}
          >
            <div className="min-w-0">
              <div className="font-mono text-xs uppercase tracking-widest opacity-50">Workspace</div>
              <div className="truncate text-sm font-semibold">{orgName}</div>
            </div>
            <ChevronDown className={`size-4 opacity-50 transition-transform ${workspaceOpen ? "rotate-180" : ""}`} />
          </Button>
        )}
        {!compact && workspaceOpen && (
          <div className="absolute inset-x-2 top-full z-30 border border-border bg-popover text-popover-foreground shadow-lg">
            {orgList.map((m) => (
              <Button variant="bare" size="bare"
                key={m.org_id}
                onClick={async () => {
                  setWorkspaceOpen(false);
                  setMobileOpen(false);
                  if (m.org_id !== current?.org_id) await switchWorkspace(m.org_id);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="truncate">{m.organizations.name}</span>
                {m.org_id === current?.org_id && <Check className="size-3.5 shrink-0 text-primary" />}
              </Button>
            ))}
            <Link
              to="/onboarding"
              search={{ new: "1" }}
              onClick={() => { setWorkspaceOpen(false); setMobileOpen(false); }}
              className="block border-t border-border px-3 py-2 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              + Create workspace
            </Link>
          </div>
        )}
      </div>
      <nav className={`flex-1 overflow-y-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${compact ? "space-y-1" : ""}`}>
        {groups.map((group, gi) => {
          if (compact) {
            return (
              <div key={group.label} className={`space-y-1 ${gi ? "border-t border-sidebar-foreground/10 pt-1" : ""}`}>
                {group.items.map((item) => <SideLink key={item.to} item={item} compact />)}
              </div>
            );
          }
          const hasActive = group.items.some((i) => isActive(i.to));
          const open = hasActive || !collapsed.includes(group.label);
          return (
            <div key={group.label} className="mb-1">
              <Button variant="bare" size="bare"
                onClick={() => toggleGroup(group.label)}
                aria-expanded={open}
                className="flex w-full items-center justify-between px-4 pb-1 pt-2 font-mono text-xs uppercase tracking-widest text-sidebar-foreground/45 hover:text-sidebar-foreground/80"
              >
                {group.label}
                <ChevronDown className={`size-3 transition-transform ${open ? "" : "-rotate-90"}`} />
              </Button>
              {open && (
                <div className="ml-6 border-l border-sidebar-foreground/15">
                  {group.items.map((item) => <SideLink key={item.to} item={item} nested />)}
                </div>
              )}
            </div>
          );
        })}
        <div className={`mt-2 border-t border-sidebar-foreground/10 pt-2 ${compact ? "space-y-1" : ""}`}>
          {NAV_FOOTER.map((item) => <SideLink key={item.to} item={item} compact={compact} />)}
        </div>
        {platformLink && (
          compact ? (
            <div className="mt-1 border-t border-sidebar-foreground/10 pt-1">
              <SideLink item={platformLink} compact />
            </div>
          ) : (
            <div className="mb-3">
              <div className="px-4 pb-1 pt-2 font-mono text-xs uppercase tracking-widest text-sidebar-foreground/40">Platform</div>
              <SideLink item={platformLink} />
            </div>
          )
        )}
      </nav>
      {compact && place === "desktop" && (
        <Button variant="bare" size="bare" onClick={() => setMini(false)} className="mx-auto mb-1 flex size-10 items-center justify-center text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground" aria-label="Expand the sidebar">
          <PanelLeftOpen className="size-4" />
        </Button>
      )}
      <AccountCard role={current?.role} platformOwner={platformOwner} onSignOut={handleSignOut} compact={compact} />
    </>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-background font-sans text-foreground">
      {/* DESKTOP SIDEBAR: full, or an icon rail that opens over the page on hover */}
      <div
        className={`relative hidden h-dvh shrink-0 transition-[width] duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none md:block ${mini ? "w-16" : "w-60"}`}
        onMouseEnter={() => mini && setPeek(true)}
        onMouseLeave={() => mini && setPeek(false)}
      >
        {/* The width animates and the page beside it follows, so it shrinks and grows with it. */}
        <aside className="absolute inset-y-0 left-0 z-30 h-dvh w-full overflow-hidden border-r border-border bg-sidebar text-sidebar-foreground">
          <div className={`flex h-full flex-col ${railCompact ? "w-16" : "w-60"}`}>
            {sidebarBody(railCompact, "desktop")}
          </div>
        </aside>
        {mini && (
          // The full sidebar, revealed over the page from the rail's edge: it slides open with a
          // decelerating curve and closes a little faster. Nothing re-flows; only clip and opacity move.
          <aside
            aria-hidden={!peek}
            inert={!peek}
            className={`absolute inset-y-0 left-0 z-40 flex h-dvh w-60 flex-col border-r border-border bg-sidebar text-sidebar-foreground
              transition-[clip-path,opacity,box-shadow] motion-reduce:transition-opacity ${
              peek
                ? "opacity-100 shadow-xl duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)] [clip-path:inset(0_0_0_0)]"
                : "pointer-events-none opacity-0 shadow-none duration-200 ease-[cubic-bezier(0.4,0,1,1)] [clip-path:inset(0_calc(100%-4rem)_0_0)]"
            }`}
          >
            {sidebarBody(false, "desktop")}
          </aside>
        )}
      </div>

      {/* MOBILE SIDEBAR */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur duration-200 animate-in fade-in md:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-sidebar text-sidebar-foreground shadow-xl duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] animate-in slide-in-from-left motion-reduce:animate-none md:hidden">
            {sidebarBody(false, "mobile")}
          </aside>
        </>
      )}

      {/* MAIN */}
      <div id="app-main-scroll" className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable]">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur md:gap-4 md:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Button variant="bare" size="bare"
              className="md:hidden text-foreground/70"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </Button>
            <div className="min-w-0">
              <AppBreadcrumbs breadcrumb={breadcrumb} />
              <h1 className="truncate font-display text-xl uppercase tracking-tight">{title}</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 md:gap-3">
            <Button variant="bare" size="bare"
              onClick={() => setPaletteOpen(true)}
              onPointerEnter={() => setPaletteLoaded(true)}
              onFocus={() => setPaletteLoaded(true)}
              className="flex h-9 w-9 items-center justify-center gap-2 border border-input bg-card text-left text-sm text-muted-foreground shadow-xs transition-colors hover:border-primary/50 sm:w-44 sm:justify-start sm:px-3 lg:w-72 xl:w-80"
              aria-label={`Search (${modKey === "⌘" ? "⌘K" : "Ctrl+K"})`}
            >
              <Search className="size-4 shrink-0" />
              <span className="hidden min-w-0 flex-1 truncate sm:inline lg:hidden">Search…</span>
              <span className="hidden min-w-0 flex-1 truncate lg:inline">Search customers, invoices, pages…</span>
              <kbd className="ml-auto hidden shrink-0 border border-border bg-background px-1.5 font-mono text-xs md:inline">{modKey === "⌘" ? "⌘K" : "Ctrl K"}</kbd>
            </Button>
            <Button variant="kit" size="kit"
              onClick={() => { setAiQuestion(undefined); setAssistantOpen(true); }}
              onPointerEnter={() => setAssistantLoaded(true)}
              onFocus={() => setAssistantLoaded(true)}
              className="flex h-9 gap-1.5 px-3 hover:bg-accent"
              aria-label="Open assistant"
            >
              <Sparkles className="size-3 text-primary" />
              <span className="hidden sm:inline">Ask AI</span>
            </Button>
            <HelpMenu />
            <Button variant="bare" size="bare"
              onClick={() => openReportDialog()}
              className="flex size-9 items-center justify-center border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Report a problem"
            >
              <Bug className="size-4" />
            </Button>
            <NotificationsBell />
            <span className="hidden font-mono text-xs uppercase tracking-widest text-muted-foreground md:inline">
              v{APP_VERSION} · live
            </span>
            <span className="size-2 bg-primary" />
          </div>
          <NavProgress />
        </header>
        <PlanBanner />
        <main className="flex-1 p-4 md:p-6">
          {help && (
            <p className="-mt-1 mb-4 max-w-3xl text-sm text-muted-foreground">
              {help.text}{" "}
              {help.doc && <Link to="/docs/$slug" params={{ slug: help.doc }} className="whitespace-nowrap text-primary hover:underline">Learn more</Link>}
            </p>
          )}
          {children}
        </main>
      </div>
      {assistantLoaded && (
        <Suspense fallback={null}>
          <AssistantPanel open={assistantOpen} onOpenChange={setAssistantOpen} initialQuestion={aiQuestion} />
        </Suspense>
      )}
      <IconTips />
      <Tour />
      {/* Shown once to anyone who reached the app without passing the website's banner. */}
      <CookieConsent />
      <Suspense fallback={null}><ReportDialog /></Suspense>
      <Suspense fallback={null}>
        {memberships.data?.some((m) => m.role === "platform_owner") && <UpdateDialog enabled />}
        {paletteLoaded && (
          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            onAskAi={(q) => { setAiQuestion(q); setAssistantOpen(true); }}
          />
        )}
      </Suspense>
    </div>
  );
}

const CommandPalette = lazy(() => import("@/components/app/command-palette").then((m) => ({ default: m.CommandPalette })));
const UpdateDialog = lazy(() => import("@/components/platform/update-dialog").then((m) => ({ default: m.UpdateDialog })));
const ReportDialog = lazy(() => import("@/components/feedback/report-dialog").then((m) => ({ default: m.ReportDialog })));
const AssistantPanel = lazy(() => import("@/components/ai/assistant-panel").then((m) => ({ default: m.AssistantPanel })));

type PageHeader = { title: string; breadcrumb?: string };
const FrameContext = createContext<((h: PageHeader) => void) | null>(null);

/**
 * The sidebar, top bar, search, bell and assistant. Mounted once by the /app layout, so moving
 * between pages keeps the assistant's conversation and doesn't rebuild the sidebar.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<PageHeader>({ title: "" });
  return (
    <AiEntityProvider>
      <FrameContext.Provider value={setHeader}>
        <AppShellInner title={header.title} breadcrumb={header.breadcrumb}>{children}</AppShellInner>
      </FrameContext.Provider>
    </AiEntityProvider>
  );
}

/** A page: hands its title to the frame. Outside the frame (loading and error screens) it draws one. */
export function AppShell({ children, title, breadcrumb }: { children: ReactNode; title: string; breadcrumb?: string }) {
  const setHeader = useContext(FrameContext);
  useLayoutEffect(() => { setHeader?.({ title, breadcrumb }); }, [setHeader, title, breadcrumb]);
  if (setHeader) return <>{children}</>;
  return (
    <AiEntityProvider>
      <AppShellInner title={title} breadcrumb={breadcrumb}>{children}</AppShellInner>
    </AiEntityProvider>
  );
}
