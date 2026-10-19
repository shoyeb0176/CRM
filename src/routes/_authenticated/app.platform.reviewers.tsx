import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlatformShell } from "@/components/platform/platform-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/crm/empty-state";

export const Route = createFileRoute("/_authenticated/app/platform/reviewers")({
  head: () => ({ meta: [{ title: "Reviewers — Platform" }] }),
  component: Reviewers,
});

function Reviewers() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const list = useQuery({
    queryKey: ["platform-reviewers"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_platform_reviewers");
      if (error) throw error;
      return data ?? [];
    },
  });
  const add = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc("add_platform_reviewer", { _email: email.trim() }); if (error) throw error; },
    onSuccess: () => { toast.success("Reviewer added"); setEmail(""); qc.invalidateQueries({ queryKey: ["platform-reviewers"] }); },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (user: string) => { const { error } = await supabase.rpc("remove_platform_reviewer", { _user: user }); if (error) throw error; },
    onSuccess: () => { toast.success("Reviewer removed"); qc.invalidateQueries({ queryKey: ["platform-reviewers"] }); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <PlatformShell title="Reviewers" breadcrumb="platform / reviewers">
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        Reviewers see and answer every report in Feedback, and get an email for each new one. They can't see billing,
        plans, workspaces or impersonation. Platform owners are always reviewers.
      </p>
      <form className="mb-6 flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); if (email.trim()) add.mutate(); }}>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their Inuberry account email" aria-label="Reviewer email" required />
        <Button type="submit" disabled={add.isPending}><UserPlus className="mr-1 size-3.5" /> Add</Button>
      </form>
      {list.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !list.data?.length ? (
        <EmptyState title="No reviewers yet" description="Add a developer or support person by the email they use to sign in to Inuberry." />
      ) : (
        <ul className="grid max-w-2xl gap-px border border-border bg-border">
          {list.data.map((r) => (
            <li key={r.user_id} className="flex items-center gap-3 bg-background px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.full_name || r.email}</div>
                <div className="truncate text-xs text-muted-foreground">{r.email} · added {new Date(r.created_at).toLocaleDateString()}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => remove.mutate(r.user_id)} aria-label={`Remove ${r.email}`}><Trash2 className="size-3.5" /></Button>
            </li>
          ))}
        </ul>
      )}
    </PlatformShell>
  );
}
