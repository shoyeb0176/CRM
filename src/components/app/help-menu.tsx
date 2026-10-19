import { useNavigate } from "@tanstack/react-router";
import { BookOpen, CircleHelp, Compass, Inbox, ListChecks, MessageSquareWarning, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { startTour } from "@/components/app/tour";
import { showChecklist, type Checklist } from "@/lib/checklists";
import { openReportDialog } from "@/lib/feedback/feedback";

/** The ? in the top bar: the tour, the dashboard checklists, guides and reports, always one click away. */
export function HelpMenu() {
  const navigate = useNavigate();
  const show = (c: Checklist) => { showChecklist(c); void navigate({ to: "/app" }); };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="bare" size="bare" aria-label="Help"
          className="flex size-9 items-center justify-center border border-border text-muted-foreground hover:bg-accent hover:text-foreground">
          <CircleHelp className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-none">
        <DropdownMenuLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Help</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => startTour()}><Compass className="mr-2 size-4" /> Take the tour</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => show("getting-started")}><ListChecks className="mr-2 size-4" /> Show Getting started</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => show("first-sale")}><Rocket className="mr-2 size-4" /> Show Your first sale</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><a href="/docs" target="_blank" rel="noopener noreferrer"><BookOpen className="mr-2 size-4" /> Guides</a></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openReportDialog()}><MessageSquareWarning className="mr-2 size-4" /> Report a problem</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigate({ to: "/app/feedback" })}><Inbox className="mr-2 size-4" /> My reports</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
