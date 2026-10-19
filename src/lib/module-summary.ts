// The query behind each module overview (charts, card numbers, recent rows), kept apart from the
// chart components so the sidebar can fetch it ahead without loading the chart library.
import { supabase } from "@/integrations/supabase/client";

export type SummaryModule = "crm" | "sales" | "inventory" | "purchasing" | "projects" | "accounting" | "hr";
type Row = Record<string, number | string>;

/** The query behind a module overview: its charts and (with DB-26) the card numbers and recent rows. */
export function moduleSummaryQuery(orgId: string, module: SummaryModule) {
  return {
    queryKey: ["module-summary", orgId, module],
    staleTime: 60_000,
    queryFn: async () => {
      // One call for the whole page (0046). Before DB-26 is applied it doesn't exist: charts only.
      const ov = await supabase.rpc("module_overview", { _org: orgId, _module: module });
      if (!ov.error) return (ov.data ?? {}) as Record<string, Row[]> & { kpis?: unknown; recent?: unknown };
      if (ov.error.code !== "PGRST202" && ov.error.code !== "42883") throw ov.error;
      const { data, error } = await supabase.rpc("module_summary", { _org: orgId, _module: module });
      if (error) throw error;
      return (data ?? {}) as Record<string, Row[]> & { kpis?: unknown; recent?: unknown };
    },
  };
}

/** The overview page a sidebar link opens, if it has one. */
export const OVERVIEW_MODULE: Record<string, SummaryModule> = {
  "/app/crm": "crm", "/app/sales": "sales", "/app/inventory": "inventory", "/app/purchasing": "purchasing",
  "/app/projects": "projects", "/app/accounting": "accounting", "/app/hr": "hr",
};
