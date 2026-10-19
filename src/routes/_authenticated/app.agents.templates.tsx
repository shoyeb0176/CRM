import { createFileRoute, Link } from "@tanstack/react-router";
import { AgentsShell } from "@/components/agents/agents-shell";
import { AGENT_TEMPLATES } from "@/lib/agents/agent-templates";
import { StatusBadge } from "@/components/crm/status-badge";
import { describeTrigger, USABLE_TOOLS } from "@/lib/agents/agent-spec";
import { MODULE_LABELS } from "@/lib/agents/tool-registry";

export const Route = createFileRoute("/_authenticated/app/agents/templates")({
  head: () => ({ meta: [{ title: "Templates — Inuberry" }] }),
  component: TemplatesPage,
});

function TemplatesPage() {
  return (
    <AgentsShell title="Agent templates">
      <p className="mb-6 text-sm text-muted-foreground">
        Start from a template: it fills in the instructions, data access, tools and when it runs. You review
        every choice before saving. Or ask the assistant ("I want an agent that…") and it will set one up with you.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {AGENT_TEMPLATES.map((t) => (
          <article key={t.key} className="border border-border bg-card shadow-sm p-5">
            <header className="mb-2 flex items-start justify-between">
              <h3 className="font-display text-xl">{t.name}</h3>
              <StatusBadge tone={t.requires_approval ? "warning" : "info"}>{t.requires_approval ? "Approval required" : "Read-only safe"}</StatusBadge>
            </header>
            <p className="mb-3 text-sm text-muted-foreground">{t.description}</p>
            <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-xs">
              <dt className="font-mono uppercase text-muted-foreground">Modules</dt>
              <dd>{t.modules.map((m) => MODULE_LABELS[m.module] ?? m.module).join(", ")}</dd>
              <dt className="font-mono uppercase text-muted-foreground">Tools</dt>
              <dd>{t.tools.map((n) => USABLE_TOOLS.find((x) => x.name === n)?.label ?? n).join(", ")}</dd>
              <dt className="font-mono uppercase text-muted-foreground">Runs</dt>
              <dd>{["When you run it", ...t.triggers.map(describeTrigger)].join(" · ")}</dd>
            </dl>
            <div className="mt-4">
              <Link
                to="/app/agents/new"
                search={{ template: t.key }}
                className="inline-block bg-foreground px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-background hover:bg-primary"
              >
                Use this template →
              </Link>
            </div>
          </article>
        ))}
      </div>
    </AgentsShell>
  );
}
