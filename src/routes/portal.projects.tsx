import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell, PortalCard, EmptyState } from "@/components/portal/portal-shell";
import { usePortalIdentity, fmtDate } from "@/lib/portal/use-portal";
import { useState } from "react";

import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/portal/projects")({
  ssr: false,
  head: () => ({ meta: [{ title: "Projects — Customer Portal" }] }),
  component: PortalProjects,
});

function PortalProjects() {
  const id = usePortalIdentity().data;
  const [selected, setSelected] = useState<string | null>(null);

  const projects = useQuery({
    enabled: !!id?.company_id,
    queryKey: ["portal-projects", id?.org_id, id?.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id,code,name,description,status,start_date,due_date,completed_at")
        .eq("org_id", id!.org_id).eq("customer_company_id", id!.company_id!)
        .eq("archived", false).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const detail = useQuery({
    enabled: !!selected,
    queryKey: ["portal-project-detail", selected],
    queryFn: async () => {
      const [ms, tks] = await Promise.all([
        supabase.from("milestones").select("id,name,description,due_date,status,completed_at,position")
          .eq("project_id", selected!).eq("customer_visible", true).order("position"),
        supabase.from("project_tasks").select("id,title,status,priority,due_date")
          .eq("project_id", selected!).eq("customer_visible", true).order("position"),
      ]);
      return { milestones: ms.data ?? [], tasks: tks.data ?? [] };
    },
  });

  const current = projects.data?.find(p => p.id === selected);

  return (
    <PortalShell title="Projects" breadcrumb="Portal / Projects">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
        <PortalCard title="Your projects">
          {projects.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
           !projects.data?.length ? <EmptyState compact title="No projects yet" /> : (
            <div className="divide-y divide-border">
              {projects.data.map(p => (
                <Button variant="bare" size="bare"
                  key={p.id} onClick={() => setSelected(p.id)}
                  className={`w-full py-3 text-left hover:bg-accent/30 ${selected === p.id ? "bg-accent/40" : ""}`}
                >
                  <div className="px-2 font-medium">{p.name}</div>
                  <div className="px-2 text-xs text-muted-foreground">
                    <span className="uppercase">{p.status}</span> · due {fmtDate(p.due_date)}
                  </div>
                </Button>
              ))}
            </div>
          )}
        </PortalCard>

        <PortalCard title="Project detail">
          {!current ? (
            <div className="text-sm text-muted-foreground">Select a project to see status, milestones, and tasks.</div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="font-mono text-xs uppercase text-muted-foreground">{current.code ?? "—"}</div>
                <div className="font-display text-2xl">{current.name}</div>
                <div className="mt-1 text-xs uppercase text-muted-foreground">{current.status}</div>
                {current.description && <p className="mt-2 text-sm">{current.description}</p>}
                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  <span>Start: {fmtDate(current.start_date)}</span>
                  <span>Due: {fmtDate(current.due_date)}</span>
                  {current.completed_at && <span>Completed: {fmtDate(current.completed_at)}</span>}
                </div>
              </div>

              <div>
                <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Milestones</div>
                {!detail.data?.milestones.length ? (
                  <div className="text-xs text-muted-foreground">No milestones shared.</div>
                ) : (
                  <div className="space-y-2">
                    {detail.data.milestones.map(m => (
                      <div key={m.id} className="border border-border p-3 bg-card shadow-sm">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{m.name}</span>
                          <span className="font-mono text-xs uppercase text-muted-foreground">{m.status}</span>
                        </div>
                        {m.description && <div className="mt-1 text-xs text-muted-foreground">{m.description}</div>}
                        <div className="mt-1 text-xs text-muted-foreground">Due {fmtDate(m.due_date)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Tasks shared with you</div>
                {!detail.data?.tasks.length ? (
                  <div className="text-xs text-muted-foreground">No tasks shared.</div>
                ) : (
                  <div className="divide-y divide-border border border-border">
                    {detail.data.tasks.map(t => (
                      <div key={t.id} className="flex items-center justify-between p-3 text-sm">
                        <div>
                          <div className="font-medium">{t.title}</div>
                          <div className="text-xs text-muted-foreground">Due {fmtDate(t.due_date)} · {t.priority}</div>
                        </div>
                        <span className="font-mono text-xs uppercase text-muted-foreground">{t.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </PortalCard>
      </div>
    </PortalShell>
  );
}
