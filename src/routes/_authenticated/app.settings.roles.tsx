import { createFileRoute } from "@tanstack/react-router";
import { SettingsShell } from "@/components/settings/settings-shell";
import { ROLE_LABELS, MODULES, ROLE_MATRIX, ACCESS_COLOR } from "@/lib/settings/use-admin";

export const Route = createFileRoute("/_authenticated/app/settings/roles")({
  head: () => ({ meta: [{ title: "Roles & Permissions — Settings" }] }),
  component: RolesPage,
});

const ROLES = Object.keys(ROLE_MATRIX);

function RolesPage() {
  return (
    <SettingsShell title="Roles & Permissions" breadcrumb="settings · roles">
      <div className="mb-6">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Permission matrix</div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Inuberry ships with practical default roles. Each role exposes a curated slice of the workspace.
          Custom roles are coming in a future release.
        </p>
      </div>

      <div className="overflow-x-auto border border-border bg-card shadow-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="sticky left-0 z-10 bg-muted px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">Role</th>
              {MODULES.map((m) => (
                <th key={m.key} className="px-3 py-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLES.map((role) => (
              <tr key={role} className="border-b border-border last:border-b-0">
                <td className="sticky left-0 z-10 bg-background px-4 py-3">
                  <div className="font-semibold">{ROLE_LABELS[role] ?? role}</div>
                  <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{role}</div>
                </td>
                {MODULES.map((m) => {
                  const access = ROLE_MATRIX[role][m.key];
                  return (
                    <td key={m.key} className="px-3 py-3">
                      <span className={`inline-block min-w-[60px] px-2 py-0.5 text-center font-mono text-xs uppercase tracking-wider ${ACCESS_COLOR[access]}`}>
                        {access}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex flex-wrap gap-3 text-xs">
        <Legend label="Full"  swatch="bg-primary text-primary-foreground" desc="Create, edit, delete and configure." />
        <Legend label="Write" swatch="bg-foreground/80 text-background"   desc="Create and edit records." />
        <Legend label="Read"  swatch="bg-muted text-foreground"           desc="View only." />
        <Legend label="None"  swatch="border border-border bg-background text-muted-foreground" desc="Hidden from navigation." />
      </div>
    </SettingsShell>
  );
}

function Legend({ label, swatch, desc }: { label: string; swatch: string; desc: string }) {
  return (
    <div className="flex items-center gap-2 border border-border px-3 py-1.5">
      <span className={`px-2 py-0.5 font-mono text-xs uppercase tracking-wider ${swatch}`}>{label}</span>
      <span className="text-muted-foreground">{desc}</span>
    </div>
  );
}
