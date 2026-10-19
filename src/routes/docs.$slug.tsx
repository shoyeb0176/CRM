import { createFileRoute, notFound } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { DocPage } from "@/components/marketing/docs";
import { docBySlug } from "@/lib/docs/content";

export const Route = createFileRoute("/docs/$slug")({
  // The docs text loads with the page, not with the app's first download.
  loader: async ({ params }) => {
    const doc = (await import("@/lib/docs/content")).docBySlug(params.slug);
    if (!doc) throw notFound();
    return { slug: doc.slug, title: doc.title, summary: doc.summary };
  },
  head: ({ loaderData: doc }) => {
    return {
      meta: doc
        ? [{ title: `${doc.title} — Inuberry` }, { name: "description", content: doc.summary }, { property: "og:title", content: doc.title }, { property: "og:description", content: doc.summary }]
        : [{ title: "Not found — Inuberry" }],
    };
  },
  component: DocRoute,
});

function DocRoute() {
  const { slug } = Route.useLoaderData();
  return (
    <MarketingShell>
      <DocPage doc={docBySlug(slug)!} />
    </MarketingShell>
  );
}
