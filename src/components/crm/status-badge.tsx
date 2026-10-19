import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  default:  "bg-muted text-foreground border-border",
  primary:  "bg-primary/10 text-primary border-primary/30",
  success:  "bg-success/10 text-success border-success/30",
  warning:  "bg-warning/10 text-warning border-warning/30",
  danger:   "bg-destructive/10 text-destructive border-destructive/30",
  info:     "bg-info/10 text-info border-info/30",
  neutral:  "bg-secondary text-secondary-foreground border-border",
};

export type BadgeTone = keyof typeof TONE;

export function StatusBadge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center border px-2 py-0.5 font-mono text-xs uppercase tracking-widest",
        TONE[tone],
      )}
    >
      {children}
    </span>
  );
}
