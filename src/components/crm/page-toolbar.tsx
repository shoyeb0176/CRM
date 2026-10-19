import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import type { ReactNode } from "react";

export function PageToolbar({
  search,
  onSearchChange,
  placeholder,
  filters,
  actions,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  placeholder?: string;
  filters?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[220px]">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder ?? "Search…"}
          className="pl-9"
        />
      </div>
      {filters}
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </div>
  );
}
