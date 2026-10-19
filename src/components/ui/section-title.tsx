import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The title of a section inside an app page (a panel, a card, a list). One size everywhere, the same
 * as the chart panels. The page's own title is in the top bar; marketing pages keep their display type.
 */
export function SectionTitle({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <h2 id={id} className={cn("text-sm font-semibold", className)}>{children}</h2>;
}
