import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { CrmShell } from "@/components/crm/crm-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { StatusBadge, type BadgeTone } from "@/components/crm/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { useOrgId } from "@/lib/crm/use-org";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type Activity = Database["public"]["Tables"]["activities"]["Row"];
export type AType = Database["public"]["Enums"]["activity_type"];

export const TYPES: AType[] = ["call","email","meeting","task","follow_up","note"];
const schema = z.object({
  type: z.enum(["call","email","meeting","task","follow_up","note"]),
  title: z.string().trim().min(1, "Required").max(255),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  due_at: z.string().optional().or(z.literal("")),
});

export function ActivityDrawer({ open, onOpenChange, activity, onSaved, defaultEntity }: {
  open: boolean; onOpenChange: (v: boolean) => void; activity: Activity | null; onSaved: () => void;
  defaultEntity?: { entity_type: Database["public"]["Enums"]["crm_entity_type"]; entity_id: string };
}) {
  const orgId = useOrgId();
  const [form, setForm] = useState(() => init(activity, defaultEntity));
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { setForm(init(activity, defaultEntity)); setErrors({}); }, [activity, defaultEntity]);

  const m = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) {
        const errs: Record<string, string> = {};
        parsed.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
        setErrors(errs); throw new Error("Validation failed");
      }
      setErrors({});
      const { data: { user } } = await getSessionUser();
      const payload = {
        org_id: orgId!,
        type: form.type, title: form.title,
        description: form.description || null,
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        entity_type: form.entity_type, entity_id: form.entity_id,
      };
      if (activity) {
        const { error } = await supabase.from("activities").update(payload).eq("id", activity.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("activities").insert({ ...payload, owner_id: user?.id, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(activity ? "Activity updated" : "Activity created"); onSaved(); onOpenChange(false); },
    onError: (e: Error) => { if (e.message !== "Validation failed") toast.error(e.message); },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{activity ? "Edit activity" : "New activity"}</SheetTitle>
          <SheetDescription>Plan and track work against contacts, deals and companies.</SheetDescription>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="mt-6 space-y-4">
          <F label="Type">
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as AType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t.replaceAll("_"," ")}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="Title" err={errors.title}><Input value={form.title} onChange={(e)=>setForm({...form, title: e.target.value})} maxLength={255} /></F>
          <F label="Due"><Input type="datetime-local" value={form.due_at} onChange={(e)=>setForm({...form, due_at: e.target.value})} /></F>
          <F label="Notes"><Textarea rows={3} value={form.description} onChange={(e)=>setForm({...form, description: e.target.value})} maxLength={5000} /></F>
          <SheetFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={m.isPending}>Cancel</Button>
            <Button type="submit" disabled={m.isPending}>{m.isPending ? "Saving…" : "Save"}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function init(a: Activity | null, def?: { entity_type: Database["public"]["Enums"]["crm_entity_type"]; entity_id: string }) {
  return {
    type: (a?.type ?? "task") as AType,
    title: a?.title ?? "",
    description: a?.description ?? "",
    due_at: a?.due_at ? new Date(a.due_at).toISOString().slice(0,16) : "",
    entity_type: (a?.entity_type ?? def?.entity_type ?? null) as Database["public"]["Enums"]["crm_entity_type"] | null,
    entity_id: (a?.entity_id ?? def?.entity_id ?? null) as string | null,
  };
}

function F({ label, err, children }: { label: string; err?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
      {children}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
