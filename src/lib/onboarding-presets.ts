// Onboarding questions: how someone found Inuberry, what their business does, and the modules that
// suit it. The suggestion is only a starting point; they can tick more, and turn others on later in
// Settings › Organization › Modules.
import type { WorkspaceModule } from "@/components/app/nav";

export const REFERRAL_SOURCES = [
  { key: "search", label: "Search (Google, Bing…)" },
  { key: "social", label: "Social media" },
  { key: "friend", label: "A friend or colleague" },
  { key: "partner", label: "Our accountant or a partner" },
  { key: "ai", label: "An AI assistant (ChatGPT, Claude…)" },
  { key: "event", label: "An event or talk" },
  { key: "other", label: "Something else" },
] as const;

export const PROFESSIONS: { key: string; label: string; modules: WorkspaceModule[] }[] = [
  { key: "retail", label: "Retail shop", modules: ["crm", "sales", "invoices", "inventory", "purchasing"] },
  { key: "wholesale", label: "Wholesale or distribution", modules: ["crm", "sales", "invoices", "inventory", "purchasing", "accounting"] },
  { key: "services", label: "Services or agency", modules: ["crm", "sales", "invoices", "projects"] },
  { key: "trades", label: "Trades or construction", modules: ["crm", "sales", "invoices", "projects", "purchasing"] },
  { key: "manufacturing", label: "Manufacturing", modules: ["crm", "sales", "invoices", "inventory", "purchasing", "accounting", "hr"] },
  { key: "consulting", label: "Consulting or freelance", modules: ["crm", "invoices", "projects"] },
  { key: "nonprofit", label: "Non-profit", modules: ["crm", "invoices", "projects", "accounting", "workspace"] },
  { key: "other", label: "Something else", modules: ["crm", "sales", "invoices"] },
];

/** The modules to tick for a profession (unknown or blank: everything, as before). */
export function suggestedModules(profession: string, all: WorkspaceModule[]): WorkspaceModule[] {
  const p = PROFESSIONS.find((x) => x.key === profession);
  return p ? all.filter((m) => p.modules.includes(m)) : all;
}
