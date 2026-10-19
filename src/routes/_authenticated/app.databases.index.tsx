import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { DATABASE_TEMPLATES, useDatabaseMutations, useDatabases } from "@/lib/databases/use-databases";
import { Database, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/databases/")({
  head: () => ({ meta: [{ title: "Databases — Inuberry" }] }),
  component: DatabasesHome,
});

function DatabasesHome() {
  const navigate = useNavigate();
  const dbs = useDatabases();
  const { createDatabase } = useDatabaseMutations();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("tracker");
  const [name, setName] = useState("");

  async function create() {
    try {
      const id = await createDatabase.mutateAsync({ name, templateId });
      setOpen(false);
      setName("");
      navigate({ to: "/app/databases/$databaseId", params: { databaseId: id } });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <AppShell title="Databases" breadcrumb="databases">
      <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
        <p className="max-w-xl text-sm text-muted-foreground">
          Build your own tables for anything the standard modules don't cover — trackers, registers, calendars — with your
          own fields and table or board views.
        </p>
        <Button variant="kit" size="kit"
          onClick={() => setOpen((v) => !v)}
          className="flex gap-1 px-3 py-2 hover:bg-accent"
        >
          <Plus className="size-3" /> New database
        </Button>
      </div>

      {open && (
        <div className="mb-6 border border-border bg-card shadow-sm p-4">
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {DATABASE_TEMPLATES.map((t) => (
              <Button variant="bare" size="bare"
                key={t.id}
                onClick={() => setTemplateId(t.id)}
                className={`border p-3 text-left transition-colors ${
                  templateId === t.id ? "border-primary bg-accent" : "border-border hover:bg-muted/40"
                }`}
              >
                <div className="text-sm font-semibold">{t.icon} {t.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t.description}</div>
              </Button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Database name"
              className="min-w-48 flex-1 border border-input bg-card shadow-xs px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <Button variant="kitSolid" size="kit"
              onClick={create}
              disabled={createDatabase.isPending}
              className="border border-primary bg-primary px-3 py-2 text-primary-foreground"
            >
              Create
            </Button>
            <Button variant="kit" size="kit"
              onClick={() => setOpen(false)}
              className="px-3 py-2 hover:bg-accent"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {dbs.isLoading && <Skeleton className="h-28 w-full" />}

      {!dbs.isLoading && (dbs.data?.length ?? 0) === 0 && (
        <div className="border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No databases yet. Create one from a template above.
        </div>
      )}

      <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {(dbs.data ?? []).map((d) => (
          <Link
            key={d.id}
            to="/app/databases/$databaseId"
            params={{ databaseId: d.id }}
            className="bg-background p-4 transition-colors hover:bg-muted/30"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{d.icon ?? <Database className="size-4 text-muted-foreground" />}</span>
              <span className="truncate text-sm font-semibold">{d.name}</span>
            </div>
            {d.description && <p className="mt-2 text-xs text-muted-foreground">{d.description}</p>}
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
