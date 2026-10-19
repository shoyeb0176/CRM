// Partner offers on the free Startup plan: the way Startup pays for itself. Shown only when the
// workspace's plan has sponsor offers switched on, only here on the dashboard, never inside records,
// documents, reports or AI chats. Nothing about the workspace is sent: an offer is a fixed link.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgSubscription } from "@/lib/billing/use-subscription";

type Offer = { id: string; title: string; body: string; url: string; category: string };

export function SponsorOffers() {
  const sub = useOrgSubscription();
  const show = !!sub.data?.plan?.limits?.sponsor_offers;
  const offers = useQuery({
    enabled: show,
    queryKey: ["sponsor-offers"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("sponsor_offers")
        .select("id, title, body, url, category").eq("is_active", true).order("sort_order").limit(3);
      if (error) return []; // database update DB-27 not applied yet
      return (data ?? []) as unknown as Offer[];
    },
  });
  if (!show || !offers.data?.length) return null;
  return (
    <section aria-labelledby="sponsor-title" className="border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="sponsor-title" className="text-sm font-semibold">From our partners</h2>
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Sponsored</span>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {offers.data.map((o) => (
          <li key={o.id}>
            <a href={o.url} target="_blank" rel="sponsored noopener noreferrer"
              className="group flex h-full flex-col border border-border bg-background p-3 transition-colors hover:border-foreground/30">
              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{o.category}</span>
              <span className="mt-1 flex items-center gap-1 text-sm font-medium">{o.title}<ExternalLink className="size-3 text-muted-foreground" /></span>
              {o.body && <span className="mt-1 text-xs text-muted-foreground">{o.body}</span>}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        These keep Startup free. Your business data is never shared with sponsors.{" "}
        <Link to="/app/settings/billing" className="text-primary hover:underline">No offers on Startup Plus</Link>.
      </p>
    </section>
  );
}
