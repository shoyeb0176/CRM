import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getSessionUser } from "@/lib/use-current-user";

export const Route = createFileRoute("/portal")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await getSessionUser();
    if (location.pathname === "/portal/auth") return {};
    if (error || !data.user) {
      throw redirect({ to: "/portal/auth" });
    }
    return {};
  },
  component: () => <Outlet />,
});
