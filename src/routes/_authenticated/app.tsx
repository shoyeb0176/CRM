import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

const layout = () => import("@/components/app/app-layout");

export const Route = createFileRoute("/_authenticated/app")({
  component: lazyRouteComponent(layout, "AppLayout"),
  pendingComponent: lazyRouteComponent(layout, "AppPending"),
  errorComponent: lazyRouteComponent(layout, "AppError"),
  notFoundComponent: lazyRouteComponent(layout, "AppNotFound"),
});
