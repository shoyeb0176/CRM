import { useDebounced } from "@/lib/use-paged";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { globalSearch, SEARCH_KIND_LABELS, type SearchHit } from "@/lib/search/search.functions";
import { useOrgId } from "@/lib/crm/use-org";
import { NAV_FOOTER, NAV_GROUPS, NEW_ACTIONS, SUB_PAGES, moduleShown } from "@/components/app/nav";
import { useCurrentMembership } from "@/lib/use-current-org";
import { linkTarget } from "@/lib/notifications/kinds";
import { SETTINGS_SECTIONS } from "@/components/settings/settings-shell";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import {
  Building2, User, Sparkles, Receipt, Package, Briefcase, Truck,
  Target, CheckSquare, ArrowRight, Loader2, FileText, BookOpen, Compass, ListChecks, Rocket, type LucideIcon,
} from "lucide-react";
import { startTour } from "@/components/app/tour";
import { showChecklist } from "@/lib/checklists";

const KIND_ICON = {
  company: Building2, contact: User, lead: Target, deal: Target,
  invoice: Receipt, product: Package, project: Briefcase,
  task: CheckSquare, supplier: Truck, page: FileText, doc: BookOpen,
} as const;

// Every page: the sidebar's modules, then the pages inside them, then Settings.
const NAV: Array<{ label: string; to: string; icon?: LucideIcon }> = [
  ...[...NAV_GROUPS.flatMap((g) => g.items), ...NAV_FOOTER].map((i) => ({ label: i.label, to: i.to, icon: i.icon })),
  ...SUB_PAGES,
  ...SETTINGS_SECTIONS.map((t) => ({ label: `Settings · ${t.label}`, to: t.to, icon: t.icon })),
];

export function CommandPalette({
  open, onOpenChange, onAskAi,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAskAi: (question: string) => void;
}) {
  const navigate = useNavigate();
  const orgId = useOrgId();
  const membership = useCurrentMembership().membership;
  const enabled = membership?.organizations.enabled_modules;
  const role = membership?.role;
  const search = useServerFn(globalSearch);
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);

  useEffect(() => { if (!open) setQuery(""); }, [open]);

  const results = useQuery({
    enabled: open && !!orgId && debounced.trim().length >= 2,
    queryKey: ["global-search", orgId, debounced.trim()],
    queryFn: async () => await search({ data: { orgId: orgId!, q: debounced.trim() } }) as SearchHit[],
    staleTime: 15_000,
  });

  const grouped = useMemo(() => {
    const m = new Map<string, SearchHit[]>();
    for (const h of results.data ?? []) {
      const list = m.get(h.kind) ?? [];
      list.push(h);
      m.set(h.kind, list);
    }
    return [...m.entries()];
  }, [results.data]);

  function go(url: string) {
    onOpenChange(false);
    navigate(linkTarget(url));
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search records, jump to a page, or ask AI…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {results.isFetching && (
          <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Searching…
          </div>
        )}
        {!results.isFetching && <CommandEmpty>No matches.</CommandEmpty>}

        {grouped.map(([kind, hits]) => {
          const Icon = KIND_ICON[kind as keyof typeof KIND_ICON] ?? ArrowRight;
          return (
            <CommandGroup key={kind} heading={SEARCH_KIND_LABELS[kind as keyof typeof SEARCH_KIND_LABELS]}>
              {hits.map((h) => (
                <CommandItem key={`${kind}-${h.id}`} value={`${kind}-${h.id}-${h.title}`} onSelect={() => go(h.url)}>
                  <Icon className="mr-2 size-4 text-muted-foreground" />
                  <span className="truncate">{h.title}</span>
                  {h.subtitle && (
                    <span className="ml-2 truncate font-mono text-xs uppercase text-muted-foreground">
                      {h.subtitle}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}

        {query.trim().length >= 2 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="AI">
              <CommandItem
                value={`ask-ai-${query}`}
                onSelect={() => { onOpenChange(false); onAskAi(query.trim()); }}
              >
                <Sparkles className="mr-2 size-4 text-primary" />
                Ask AI: <span className="ml-1 truncate italic">{query.trim()}</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Create">
          {NEW_ACTIONS.filter((n) => moduleShown(n.to, enabled, role)).map((n) => (
            <CommandItem key={n.to} value={`new ${n.label}`} onSelect={() => go(n.to)}>
              <n.icon className="mr-2 size-4 text-muted-foreground" />
              {n.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Help">
          <CommandItem value="help take the tour" onSelect={() => { onOpenChange(false); startTour(); }}>
            <Compass className="mr-2 size-4 text-muted-foreground" /> Take the tour
          </CommandItem>
          <CommandItem value="help show getting started checklist" onSelect={() => { showChecklist("getting-started"); go("/app"); }}>
            <ListChecks className="mr-2 size-4 text-muted-foreground" /> Show Getting started
          </CommandItem>
          <CommandItem value="help show your first sale checklist" onSelect={() => { showChecklist("first-sale"); go("/app"); }}>
            <Rocket className="mr-2 size-4 text-muted-foreground" /> Show Your first sale
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Go to">
          {NAV.filter((n) => moduleShown(n.to, enabled, role)).map((n) => {
            const Icon = n.icon ?? ArrowRight;
            return (
              <CommandItem key={n.to} value={`nav ${n.label}`} onSelect={() => go(n.to)}>
                <Icon className="mr-2 size-4 text-muted-foreground" />
                {n.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
