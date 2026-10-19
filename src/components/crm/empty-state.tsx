import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
  compact,
}: {
  title: string;
  description?: string;
  /** The next step, usually a "New…" button. */
  action?: ReactNode;
  /** Smaller, for use inside a card. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="border border-dashed border-border p-8 text-center">
        <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">No data</div>
        <div className="mt-2 font-heading text-lg">{title}</div>
        {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
        {action && <div className="mt-4 flex justify-center">{action}</div>}
      </div>
    );
  }
  return (
    <div className="border border-dashed border-border bg-card/30 p-12 text-center">
      <div className="mx-auto inline-flex items-center justify-center bg-foreground px-3 py-1 font-mono text-xs uppercase tracking-widest text-background">
        No data
      </div>
      <h3 className="mt-4 font-display text-2xl uppercase">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
