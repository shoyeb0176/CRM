import type { ErrorComponentProps } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { useNewVersionPrompt } from "@/lib/version-check";
import { TitleHints } from "@/components/app/title-hints";
import { Button } from "@/components/ui/button";

function NotFoundComponent() {
  useEffect(() => {
    document.title = "Page not found — Inuberry";
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="font-mono text-xs text-muted-foreground mb-4">ERR_404 / ROUTE_NOT_FOUND</div>
        <h1 className="font-display text-7xl uppercase text-foreground">404</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          The page you're looking for isn't part of the system.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center bg-foreground px-4 py-2 font-mono text-xs uppercase tracking-wider text-background transition-colors hover:bg-primary"
          >
            Return home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="font-mono text-xs text-destructive mb-4">ERR_500 / RUNTIME</div>
        <h1 className="font-display text-3xl uppercase text-foreground">Something broke</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The system encountered an unexpected condition.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="kitSolid" size="kit"
            onClick={() => { router.invalidate(); reset(); }}
            className="px-4 py-2 tracking-wider"
          >
            Try again
          </Button>
          <a
            href="/"
            className="border border-foreground px-4 py-2 font-mono text-xs uppercase tracking-wider text-foreground transition-colors hover:bg-foreground hover:text-background"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Inuberry — One operations system for your whole business" },
      { name: "description", content: "Run sales, invoicing, inventory, projects, HR and accounting from a single multi-tenant workspace. Built for small and mid-sized teams." },
      { name: "author", content: "Inuberry" },
      { property: "og:title", content: "Inuberry — One operations system for your whole business" },
      { property: "og:description", content: "Run sales, invoicing, inventory, projects, HR and accounting from a single multi-tenant workspace. Built for small and mid-sized teams." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Inuberry — One operations system for your whole business" },
      { name: "twitter:description", content: "Run sales, invoicing, inventory, projects, HR and accounting from a single multi-tenant workspace. Built for small and mid-sized teams." },
      { property: "og:image", content: "/og-image.png" },
      { name: "twitter:image", content: "/og-image.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);
  useNewVersionPrompt();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster />
      <TitleHints />
    </QueryClientProvider>
  );
}
