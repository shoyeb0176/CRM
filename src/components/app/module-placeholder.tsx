import { AppShell } from "./app-shell";

export function ModulePlaceholder({
  title,
  breadcrumb,
  code,
  description,
}: {
  title: string;
  breadcrumb: string;
  code: string;
  description: string;
}) {
  return (
    <AppShell title={title} breadcrumb={breadcrumb}>
      <div className="border border-border bg-card shadow-sm p-12 text-center">
        <div className="mx-auto inline-flex items-center justify-center bg-foreground px-3 py-1 font-mono text-xs uppercase tracking-widest text-background">
          MOD_{code}
        </div>
        <h2 className="mt-6 font-display text-4xl uppercase">{title}</h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">{description}</p>
        <div className="mx-auto mt-8 flex max-w-md items-center gap-3 border border-border bg-card shadow-sm p-4 text-left">
          <span className="size-2 shrink-0 bg-primary" />
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Module scaffold — full functionality lands in the next build phase.
          </span>
        </div>
      </div>
    </AppShell>
  );
}
