// Tick the parts of Inuberry a workspace uses; the rest leave the sidebar, search and dashboard.
// Used when a workspace is created and in Settings › Organization.
import { WORKSPACE_MODULES, type WorkspaceModule } from "@/components/app/nav";

export const ALL_MODULES = WORKSPACE_MODULES.map((m) => m.key);

/** NULL in the database means "everything", so new modules show up for workspaces that never chose. */
export const toEnabledModules = (picked: WorkspaceModule[]) => (picked.length === ALL_MODULES.length ? null : picked);

export function ModulePicker({ value, onChange, disabled }: {
  value: WorkspaceModule[];
  onChange: (v: WorkspaceModule[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-px border border-border bg-border sm:grid-cols-2">
      {WORKSPACE_MODULES.map((m) => {
        const on = value.includes(m.key);
        return (
          <label key={m.key} className={`flex cursor-pointer items-start gap-3 bg-background p-3 ${disabled ? "cursor-default opacity-70" : "hover:bg-muted/40"}`}>
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--color-primary)]"
              checked={on}
              disabled={disabled}
              onChange={() => onChange(on ? value.filter((k) => k !== m.key) : [...value, m.key])}
            />
            <span>
              <span className="block text-sm font-medium">{m.label}</span>
              <span className="block text-xs text-muted-foreground">{m.desc}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
