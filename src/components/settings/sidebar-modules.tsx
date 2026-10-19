// "Your sidebar": each person hides modules they never use. Only their own sidebar changes;
// the pages still open from search and links, and nobody else's sidebar is affected.
import { toast } from "sonner";
import { WORKSPACE_MODULES } from "@/components/app/nav";
import { useCurrentMembership } from "@/lib/use-current-org";
import { useHiddenModules, useSetHiddenModules } from "@/lib/use-hidden-modules";
import { friendlyError } from "@/lib/friendly-error";

import { SectionTitle } from "@/components/ui/section-title";
export function SidebarModulesCard() {
  const hidden = useHiddenModules();
  const save = useSetHiddenModules();
  const enabled = useCurrentMembership().membership?.organizations.enabled_modules;
  const list = WORKSPACE_MODULES.filter((m) => !enabled || enabled.includes(m.key));
  const current = hidden.data ?? [];

  const toggle = (key: string, show: boolean) => {
    const next = show ? current.filter((k) => k !== key) : [...current, key];
    save.mutate(next, { onError: (e) => toast.error(friendlyError(e, "Couldn't save your sidebar")) });
  };

  return (
    <section className="border border-border bg-card shadow-sm">
      <header className="border-b border-border px-4 py-3">
        <SectionTitle>Your sidebar</SectionTitle>
        <p className="text-xs text-muted-foreground">Untick modules you never use to shorten your sidebar. Only yours changes; search still finds every page.</p>
      </header>
      <ul className="grid gap-px bg-border sm:grid-cols-2">
        {list.map((m) => {
          const shown = !current.includes(m.key);
          return (
            <li key={m.key} className="bg-card">
              <label className="flex cursor-pointer items-start gap-3 p-3">
                <input type="checkbox" className="mt-1 size-4 accent-[var(--primary)]" checked={shown}
                  disabled={hidden.isLoading || save.isPending} onChange={(e) => toggle(m.key, e.target.checked)} />
                <span>
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="block text-xs text-muted-foreground">{m.desc}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
