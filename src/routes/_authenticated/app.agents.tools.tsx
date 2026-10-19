import { createFileRoute } from "@tanstack/react-router";
import { AgentsShell } from "@/components/agents/agents-shell";
import { TOOL_REGISTRY } from "@/lib/agents/tool-registry";
import { StatusBadge } from "@/components/crm/status-badge";

export const Route = createFileRoute("/_authenticated/app/agents/tools")({
  head: () => ({ meta: [{ title: "Tool registry — Inuberry" }] }),
  component: ToolRegistryPage,
});

function ToolRegistryPage() {
  const internal = TOOL_REGISTRY.filter((t) => t.category === "internal");
  const external = TOOL_REGISTRY.filter((t) => t.category === "external");
  return (
    <AgentsShell title="Tool registry">
      <p className="mb-6 text-sm text-muted-foreground">
        Every action an agent can take goes through one of these tools. New tools are registered in code at <code>src/lib/agents/tool-registry.ts</code>.
      </p>
      <h2 className="mb-2 font-heading text-lg uppercase">Internal ERP tools</h2>
      <ToolTable tools={internal} />
      <h2 className="mb-2 mt-8 font-heading text-lg uppercase">External tools</h2>
      <ToolTable tools={external} />
    </AgentsShell>
  );
}

function ToolTable({ tools }: { tools: typeof TOOL_REGISTRY }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border border-border bg-card text-sm">
        <thead className="border-b border-border font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Tool</th>
            <th className="px-3 py-2 text-left">Type</th>
            <th className="px-3 py-2 text-left">Requires</th>
            <th className="px-3 py-2 text-left">Flags</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((t) => (
            <tr key={t.name} className="border-b border-border align-top">
              <td className="px-3 py-2">
                <div className="font-medium">{t.label}</div>
                <div className="font-mono text-xs text-muted-foreground">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.description}</div>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{t.toolType}</td>
              <td className="px-3 py-2 text-xs">
                {t.requiredPermissions.length ? t.requiredPermissions.map((p) => `${p.module}:${p.action}`).join(", ") : "—"}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {t.readOnly ? <StatusBadge tone="info">Read-only</StatusBadge> : <StatusBadge tone="warning">Write</StatusBadge>}
                  {t.requiresApproval && <StatusBadge tone="warning">Approval</StatusBadge>}
                  {t.externalAccess && <StatusBadge tone="danger">External</StatusBadge>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
