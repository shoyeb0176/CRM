import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";

export type PortalIdentity = {
  portal_user_id: string;
  org_id: string;
  company_id: string | null;
  contact_id: string | null;
  full_name: string | null;
  email: string;
  org_name: string;
};

export function usePortalIdentity() {
  return useQuery({
    queryKey: ["portal-identity"],
    queryFn: async (): Promise<PortalIdentity | null> => {
      const { data: auth } = await getSessionUser();
      const user = auth.user;
      if (!user) return null;

      // Links invites sent to this (confirmed) email and stamps last login; done in the database
      // because a customer can't update an invite row that isn't linked to them yet (0035 / DB-15).
      await supabase.rpc("claim_portal_invites");

      // ponytail: someone invited by two suppliers sees the first one; add a picker if that happens.
      const { data: row } = await supabase
        .from("customer_portal_users")
        .select("id, org_id, company_id, contact_id, full_name, email, organizations:org_id(name)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at")
        .limit(1)
        .maybeSingle();

      if (!row) return null;

      return {
        portal_user_id: row.id,
        org_id: row.org_id,
        company_id: row.company_id,
        contact_id: row.contact_id,
        full_name: row.full_name,
        email: row.email,
        org_name: (row.organizations as { name: string } | null)?.name ?? "Workspace",
      };
    },
    staleTime: 30_000,
  });
}

export function fmtMoney(n: number | null | undefined, currency = "USD") {
  const v = Number(n ?? 0);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
