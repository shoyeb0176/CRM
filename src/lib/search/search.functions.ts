import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SB = SupabaseClient<Database>;

export type SearchKind =
  | "company" | "contact" | "lead" | "deal" | "invoice"
  | "product" | "project" | "task" | "supplier" | "page" | "doc";

export type SearchHit = {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle?: string;
  url: string;
};

export const SEARCH_KIND_LABELS: Record<SearchKind, string> = {
  company: "Companies",
  contact: "Contacts",
  lead: "Leads",
  deal: "Deals",
  invoice: "Invoices",
  product: "Products",
  project: "Projects",
  task: "Tasks",
  supplier: "Suppliers",
  page: "Pages",
  doc: "Knowledge",
};

function esc(q: string) {
  // PostgREST `or` filters treat , ( ) as syntax — strip them out.
  return q.replace(/[,()*%]/g, " ").trim();
}

export const globalSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      orgId: z.string().uuid(),
      q: z.string().min(1).max(120),
      limit: z.number().int().min(1).max(20).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: SB };
    const term = esc(data.q);
    if (!term) return [] as SearchHit[];
    const like = `%${term}%`;
    const n = data.limit ?? 5;

    const [companies, contacts, leads, deals, invoices, products, projects, tasks, suppliers, pages, docs] =
      await Promise.all([
        supabase.from("companies").select("id,name,industry,city")
          .eq("org_id", data.orgId).or(`name.ilike.${like},industry.ilike.${like},city.ilike.${like}`).limit(n),
        supabase.from("contacts").select("id,first_name,last_name,email,job_title")
          .eq("org_id", data.orgId).or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`).limit(n),
        supabase.from("leads").select("id,name,company_name,email,status")
          .eq("org_id", data.orgId).or(`name.ilike.${like},company_name.ilike.${like},email.ilike.${like}`).limit(n),
        supabase.from("deals").select("id,title,amount,currency,status")
          .eq("org_id", data.orgId).ilike("title", like).limit(n),
        supabase.from("invoices").select("id,number,total,currency,status")
          .eq("org_id", data.orgId).ilike("number", like).limit(n),
        supabase.from("products").select("id,name,sku,sale_price,currency")
          .eq("org_id", data.orgId).or(`name.ilike.${like},sku.ilike.${like}`).limit(n),
        supabase.from("projects").select("id,name,code,status")
          .eq("org_id", data.orgId).or(`name.ilike.${like},code.ilike.${like}`).limit(n),
        supabase.from("project_tasks").select("id,title,project_id,status")
          .eq("org_id", data.orgId).ilike("title", like).limit(n),
        supabase.from("suppliers").select("id,name,contact_name,email")
          .eq("org_id", data.orgId).or(`name.ilike.${like},contact_name.ilike.${like},email.ilike.${like}`).limit(n),
        supabase.from("pages").select("id,title,icon")
          .eq("org_id", data.orgId).eq("archived", false).ilike("title", like).limit(n),
        supabase.from("knowledge_docs").select("id,title,collection")
          .eq("org_id", data.orgId).or(`title.ilike.${like},content.ilike.${like}`).limit(n),
      ]);

    const hits: SearchHit[] = [];

    for (const r of companies.data ?? [])
      hits.push({ id: r.id, kind: "company", title: r.name, subtitle: [r.industry, r.city].filter(Boolean).join(" · "), url: `/app/crm/companies/${r.id}` });
    for (const r of contacts.data ?? [])
      hits.push({ id: r.id, kind: "contact", title: [r.first_name, r.last_name].filter(Boolean).join(" ") || "Contact", subtitle: [r.job_title, r.email].filter(Boolean).join(" · "), url: `/app/crm/contacts/${r.id}` });
    for (const r of leads.data ?? [])
      hits.push({ id: r.id, kind: "lead", title: r.name, subtitle: [r.company_name, r.status].filter(Boolean).join(" · "), url: `/app/crm/leads` });
    for (const r of deals.data ?? [])
      hits.push({ id: r.id, kind: "deal", title: r.title, subtitle: `${r.currency ?? ""} ${r.amount ?? 0} · ${r.status}`.trim(), url: `/app/crm/deals` });
    for (const r of invoices.data ?? [])
      hits.push({ id: r.id, kind: "invoice", title: r.number, subtitle: `${r.currency ?? ""} ${r.total ?? 0} · ${r.status}`.trim(), url: `/app/invoices/${r.id}` });
    for (const r of products.data ?? [])
      hits.push({ id: r.id, kind: "product", title: r.name, subtitle: [r.sku, `${r.currency ?? ""} ${r.sale_price ?? 0}`].filter(Boolean).join(" · "), url: `/app/products/${r.id}` });
    for (const r of projects.data ?? [])
      hits.push({ id: r.id, kind: "project", title: r.name, subtitle: [r.code, r.status].filter(Boolean).join(" · "), url: `/app/projects/${r.id}` });
    for (const r of tasks.data ?? [])
      hits.push({ id: r.id, kind: "task", title: r.title, subtitle: String(r.status), url: `/app/projects/${r.project_id}` });
    for (const r of suppliers.data ?? [])
      hits.push({ id: r.id, kind: "supplier", title: r.name, subtitle: [r.contact_name, r.email].filter(Boolean).join(" · "), url: `/app/suppliers/${r.id}` });

    for (const r of pages.data ?? [])
      hits.push({ id: r.id, kind: "page", title: r.title, subtitle: "Page", url: `/app/workspace/${r.id}` });

    for (const r of docs.data ?? [])
      hits.push({ id: r.id, kind: "doc", title: r.title, subtitle: r.collection ?? "Knowledge", url: `/app/knowledge/${r.id}` });

    const lower = term.toLowerCase();
    hits.sort((a, b) => {
      const sa = a.title.toLowerCase().startsWith(lower) ? 0 : 1;
      const sb = b.title.toLowerCase().startsWith(lower) ? 0 : 1;
      return sa - sb || a.title.localeCompare(b.title);
    });

    return hits;
  });
