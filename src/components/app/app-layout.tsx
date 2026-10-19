// The /app layout and its loading, error and not-found screens. They live outside the route file and
// load on demand, so the app frame (sidebar, top bar, bell, tour) isn't in the main file every
// visitor downloads, the public website pages included.
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppFrame, AppShell } from "@/components/app/app-shell";
import { useMyMemberships } from "@/lib/use-memberships";
import { Button } from "@/components/ui/button";

export function AppLayout() {
  const navigate = useNavigate();
  const { data, isLoading } = useMyMemberships();

  useEffect(() => {
    if (!isLoading && data && data.length === 0) {
      navigate({ to: "/onboarding" });
    }
  }, [data, isLoading, navigate]);

  if (isLoading) {
    return (
      // The app's outline (sidebar, top bar, cards) while the workspace loads, so it reads as the
      // app arriving rather than a blank page.
      <div role="status" aria-label="Loading workspace" className="flex h-screen bg-background">
        <div className="hidden w-60 shrink-0 bg-sidebar md:block" />
        <div className="flex flex-1 flex-col">
          <div className="h-16 shrink-0 border-b border-border" />
          <div className="space-y-4 p-4 md:p-6">
            <div className="h-6 w-48 animate-pulse bg-foreground/10" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse border border-border bg-card sm:h-36" />)}
            </div>
            <div className="h-64 animate-pulse border border-border bg-card" />
          </div>
        </div>
      </div>
    );
  }
  return <AppFrame><Outlet /></AppFrame>;
}

export function AppPending() {
  return (
    <AppShell title="Loading" breadcrumb="loading">
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse bg-foreground/10" />
        <div className="grid grid-cols-1 gap-px border border-border bg-border md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-background p-6">
              <div className="h-3 w-20 animate-pulse bg-foreground/10" />
              <div className="mt-4 h-6 w-28 animate-pulse bg-foreground/10" />
            </div>
          ))}
        </div>
        <div className="h-64 animate-pulse border border-border bg-foreground/5" />
      </div>
    </AppShell>
  );
}

export function AppError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <AppShell title="Something broke" breadcrumb="error">
      <div className="max-w-xl border border-border bg-card shadow-sm p-6">
        <div className="font-mono text-xs uppercase tracking-widest text-destructive">Error</div>
        <h2 className="mt-1 font-display text-2xl uppercase tracking-tight">This page didn't load</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {(error instanceof Error && error.message) || "The system encountered an unexpected condition."}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="kitSolid" size="kit"
            onClick={() => { router.invalidate(); reset(); }}
            className="px-4 py-2 tracking-wider"
          >
            Try again
          </Button>
          <Link
            to="/app"
            className="border border-foreground px-4 py-2 font-mono text-xs uppercase tracking-wider text-foreground transition-colors hover:bg-foreground hover:text-background"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

export function AppNotFound() {
  useEffect(() => {
    document.title = "Page not found — Inuberry";
  }, []);
  return (
    <AppShell title="Page not found" breadcrumb="404">
      <div className="max-w-xl border border-border bg-card shadow-sm p-6">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">ERR_404</div>
        <h2 className="mt-1 font-display text-3xl uppercase tracking-tight">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          That page isn't part of your workspace. It may have moved or never existed.
        </p>
        <div className="mt-6">
          <Link
            to="/app"
            className="inline-flex bg-foreground px-4 py-2 font-mono text-xs uppercase tracking-wider text-background transition-colors hover:bg-primary"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
