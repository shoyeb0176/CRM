import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { PortalShell, PortalCard } from "@/components/portal/portal-shell";
import { usePortalIdentity } from "@/lib/portal/use-portal";

export const Route = createFileRoute("/portal/profile")({
  ssr: false,
  head: () => ({ meta: [{ title: "Company — Customer Portal" }] }),
  component: PortalProfile,
});

function PortalProfile() {
  const id = usePortalIdentity().data;
  const authUser = useQuery({
    queryKey: ["portal-auth-user"],
    queryFn: async () => (await getSessionUser()).data.user,
  });
  const u = authUser.data;
  const meta = (u?.user_metadata ?? {}) as { full_name?: string; name?: string };
  const displayName = id?.full_name || meta.full_name || meta.name || u?.email?.split("@")[0] || "—";
  const displayEmail = id?.email || u?.email || "—";
  const company = useQuery({
    enabled: !!id?.company_id,
    queryKey: ["portal-company", id?.company_id],
    queryFn: async () => {
      const { data } = await supabase.from("companies")
        .select("name,website,phone,industry,size,address,city,country")
        .eq("id", id!.company_id!).maybeSingle();
      return data;
    },
  });

  return (
    <PortalShell title="Company profile" breadcrumb="Portal / Company">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PortalCard title="Your account">
          <dl className="space-y-3 text-sm">
            <Row label="Name" value={displayName} />
            <Row label="Email" value={displayEmail} />
            <Row label="Workspace" value={id?.org_name ?? "Not linked yet"} />
          </dl>
        </PortalCard>
        <PortalCard title="Company">
          {!company.data ? <div className="text-sm text-muted-foreground">No company info available.</div> : (
            <dl className="space-y-3 text-sm">
              <Row label="Name" value={company.data.name} />
              <Row label="Website" value={company.data.website ?? "—"} />
              <Row label="Phone" value={company.data.phone ?? "—"} />
              <Row label="Industry" value={company.data.industry ?? "—"} />
              <Row label="Address" value={[company.data.address, company.data.city, company.data.country].filter(Boolean).join(", ") || "—"} />
            </dl>
          )}
        </PortalCard>
      </div>
    </PortalShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/50 py-2">
      <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
