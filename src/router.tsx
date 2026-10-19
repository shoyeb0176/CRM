import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { startSnapshots } from "./lib/query-snapshot";

export const getRouter = () => {
  // Data counts as fresh for 30 s, and switching back to the tab doesn't refetch every query.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
  });

  // Paint the first screen from the last visit's numbers while fresh ones load.
  startSnapshots(queryClient);

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Hovering or focusing a link starts loading that page's code, so the click itself is quicker.
    defaultPreload: "intent",
    // Show the loading skeleton sooner (default 1 s) and don't hold it longer than needed (default 0.5 s).
    defaultPendingMs: 400,
    defaultPendingMinMs: 150,
  });

  return router;
};
