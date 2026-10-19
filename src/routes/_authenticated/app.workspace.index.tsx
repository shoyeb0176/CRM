import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { PAGE_TEMPLATES } from "@/lib/workspace/templates";
import { usePages, useWorkspaces, useWorkspaceMutations } from "@/lib/workspace/use-workspace";
import { FileText, FolderPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/workspace/")({
  head: () => ({ meta: [{ title: "Pages — Inuberry" }] }),
  component: WorkspaceHome,
});

function WorkspaceHome() {
  const navigate = useNavigate();
  const workspaces = useWorkspaces();
  const pages = usePages();
  const { createWorkspace, createPage } = useWorkspaceMutations();

  const [newWorkspace, setNewWorkspace] = useState("");
  const [composer, setComposer] = useState<{ workspaceId: string; templateId: string; title: string } | null>(null);

  async function handleCreateWorkspace() {
    const name = newWorkspace.trim();
    if (!name) return;
    try {
      await createWorkspace.mutateAsync(name);
      setNewWorkspace("");
      toast.success("Workspace created");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleCreatePage() {
    if (!composer) return;
    try {
      const id = await createPage.mutateAsync({
        workspaceId: composer.workspaceId,
        templateId: composer.templateId,
        title: composer.title,
      });
      setComposer(null);
      navigate({ to: "/app/workspace/$pageId", params: { pageId: id } });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const loading = workspaces.isLoading || pages.isLoading;
  const empty = !loading && (workspaces.data?.length ?? 0) === 0;

  return (
    <AppShell title="Pages" breadcrumb="workspace">
      <div className="mb-6 flex flex-wrap items-end gap-2 border-b border-border pb-4">
        <input
          value={newWorkspace}
          onChange={(e) => setNewWorkspace(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateWorkspace()}
          placeholder="New workspace name"
          className="w-56 border border-input bg-card shadow-xs px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <Button variant="kit" size="kit"
          onClick={handleCreateWorkspace}
          disabled={createWorkspace.isPending}
          className="flex px-3 py-2 hover:bg-accent"
        >
          <FolderPlus className="size-3" /> Add workspace
        </Button>
      </div>

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {empty && (
        <div className="border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Workspaces hold free-form pages — meeting notes, briefs, account plans, procedures — next to your structured records.
          </p>
          <p className="mt-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Create your first workspace above
          </p>
        </div>
      )}

      <div className="space-y-8">
        {(workspaces.data ?? []).map((ws) => {
          const wsPages = (pages.data ?? []).filter((p) => p.workspace_id === ws.id && !p.parent_page_id);
          return (
            <section key={ws.id}>
              <header className="mb-3 flex items-center justify-between border-b border-border pb-2">
                <h2 className="font-heading text-base uppercase tracking-wide">
                  {ws.icon ? `${ws.icon} ` : ""}{ws.name}
                </h2>
                <Button variant="kit" size="kit"
                  onClick={() => setComposer({ workspaceId: ws.id, templateId: "blank", title: "" })}
                  className="flex gap-1 px-2 py-1 hover:bg-accent"
                >
                  <Plus className="size-3" /> New page
                </Button>
              </header>

              {composer?.workspaceId === ws.id && (
                <div className="mb-4 border border-border bg-card shadow-sm p-4">
                  <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                    {PAGE_TEMPLATES.map((t) => (
                      <Button variant="bare" size="bare"
                        key={t.id}
                        onClick={() => setComposer({ ...composer, templateId: t.id })}
                        className={`border p-3 text-left transition-colors ${
                          composer.templateId === t.id ? "border-primary bg-accent" : "border-border hover:bg-muted/40"
                        }`}
                      >
                        <div className="text-sm font-semibold">{t.icon} {t.label}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{t.description}</div>
                      </Button>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      value={composer.title}
                      onChange={(e) => setComposer({ ...composer, title: e.target.value })}
                      placeholder="Page title (optional)"
                      className="flex-1 min-w-48 border border-input bg-card shadow-xs px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <Button variant="kitSolid" size="kit"
                      onClick={handleCreatePage}
                      disabled={createPage.isPending}
                      className="border border-primary bg-primary px-3 py-2 text-primary-foreground"
                    >
                      Create page
                    </Button>
                    <Button variant="kit" size="kit"
                      onClick={() => setComposer(null)}
                      className="px-3 py-2 hover:bg-accent"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {wsPages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pages yet.</p>
              ) : (
                <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
                  {wsPages.map((p) => (
                    <Link
                      key={p.id}
                      to="/app/workspace/$pageId"
                      params={{ pageId: p.id }}
                      className="group bg-background p-4 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{p.icon ?? <FileText className="size-4 text-muted-foreground" />}</span>
                        <span className="truncate text-sm font-semibold">{p.title}</span>
                      </div>
                      <div className="mt-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                        Updated {new Date(p.updated_at).toLocaleDateString()}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
