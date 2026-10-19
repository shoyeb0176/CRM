import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";

export function LockedModule({
  module,
  title,
  description,
  requiredPlan = "Growth",
}: {
  module: string;
  title: string;
  description?: string;
  requiredPlan?: string;
}) {
  return (
    <AppShell title={title} breadcrumb={`${module} / locked`}>
      <div className="mx-auto max-w-xl border border-dashed border-border bg-card p-10 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
          <Lock className="size-5 text-muted-foreground" />
        </div>
        <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Plan upgrade required
        </div>
        <h2 className="mb-3 font-display text-2xl uppercase tracking-tight">
          {title} is on the {requiredPlan} plan
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          {description ??
            `Unlock ${title.toLowerCase()} and the rest of Inuberry's advanced modules by upgrading your workspace plan.`}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            to="/app/settings/billing"
            className="bg-foreground px-4 py-2 font-mono text-xs uppercase tracking-wider text-background hover:bg-primary"
          >
            View plans
          </Link>
          <Link
            to="/app"
            className="border border-border px-4 py-2 font-mono text-xs uppercase tracking-wider text-foreground hover:bg-muted"
          >
            Back to home
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
