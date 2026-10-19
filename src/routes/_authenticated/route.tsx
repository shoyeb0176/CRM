import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getSessionUserFast } from "@/lib/use-current-user";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Opens straight away with the saved session; the server check runs alongside and signs out if it fails.
    const { data, error } = await getSessionUserFast(() => {
      window.location.assign(`/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    });
    if (error || !data.user) {
      throw redirect({
        to: "/auth",
        search: { redirect: location.href },
      });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
