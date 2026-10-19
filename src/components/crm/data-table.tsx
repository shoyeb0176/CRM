import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { FOCUS_CLASS, focusDomId } from "@/lib/use-focus-row";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

export function DataTable<T extends { id: string }>({
  data,
  columns,
  loading,
  empty,
  onRowClick,
  focusId,
}: {
  data: T[] | undefined;
  columns: Column<T>[];
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Row to scroll to and mark (deep link from a notification). */
  focusId?: string;
}) {
  if (loading) {
    return (
      <div className="border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-muted/30 px-4 py-3">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <>{empty}</>;
  }

  return (
    <div className="overflow-hidden border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground ${c.className ?? ""}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((row) => (
              <tr
                key={row.id}
                id={focusDomId(row.id)}
                onClick={() => onRowClick?.(row)}
                className={`${onRowClick ? "cursor-pointer hover:bg-muted/30" : ""} ${row.id === focusId ? FOCUS_CLASS : ""} transition-colors`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 align-middle ${c.className ?? ""}`}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
