import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";

export type CommKind = "email" | "meeting" | "call" | "note";
export type CommDirection = "inbound" | "outbound";

export const COMM_KIND_LABELS: Record<CommKind, string> = {
  email: "Email",
  meeting: "Meeting",
  call: "Call",
  note: "Note",
};

export type CommEvent = {
  id: string;
  kind: string;
  direction: string;
  subject: string;
  body: string | null;
  occurred_at: string;
  duration_minutes: number | null;
  participants: unknown;
  entity_type: string | null;
  entity_id: string | null;
  source: string;
  created_at: string;
};

export type CommChannel = {
  id: string;
  kind: string;
  name: string;
  webhook_url: string;
  is_active: boolean;
  last_delivery_at: string | null;
  last_error: string | null;
};

export type CommAccount = {
  id: string;
  provider: string;
  account_email: string | null;
  status: string;
  last_synced_at: string | null;
};

export const MAILBOX_PROVIDERS: Array<{ key: string; label: string; description: string }> = [
  { key: "gmail", label: "Gmail", description: "Bring emails with your customers onto their timeline." },
  { key: "outlook", label: "Outlook", description: "Mail and meetings from Microsoft 365." },
  { key: "google_calendar", label: "Google Calendar", description: "Meetings land on the customer timeline." },
];

export function useCommEvents(orgId?: string, filter?: { entityType?: string; entityId?: string; limit?: number }) {
  return useQuery({
    queryKey: ["comm-events", orgId, filter?.entityType ?? "", filter?.entityId ?? ""],
    enabled: !!orgId,
    queryFn: async () => {
      let q = supabase
        .from("comm_events")
        .select("id, kind, direction, subject, body, occurred_at, duration_minutes, participants, entity_type, entity_id, source, created_at")
        .eq("org_id", orgId!)
        .order("occurred_at", { ascending: false })
        .limit(filter?.limit ?? 100);
      if (filter?.entityType && filter.entityId) {
        q = q.eq("entity_type", filter.entityType).eq("entity_id", filter.entityId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CommEvent[];
    },
  });
}

export function useCommEventMutations(orgId?: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["comm-events"] });

  const create = useMutation({
    mutationFn: async (input: {
      kind: CommKind;
      direction: CommDirection;
      subject: string;
      body?: string;
      occurredAt?: string;
      durationMinutes?: number | null;
      participants?: string[];
      entityType?: string | null;
      entityId?: string | null;
    }) => {
      const { data: auth } = await getSessionUser();
      const { error } = await supabase.from("comm_events").insert({
        org_id: orgId!,
        kind: input.kind,
        direction: input.direction,
        subject: input.subject,
        body: input.body ?? null,
        occurred_at: input.occurredAt ?? new Date().toISOString(),
        duration_minutes: input.durationMinutes ?? null,
        participants: input.participants ?? [],
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        source: "manual",
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("comm_events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, remove };
}

export function useCommChannels(orgId?: string) {
  return useQuery({
    queryKey: ["comm-channels", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comm_channels")
        .select("id, kind, name, webhook_url, is_active, last_delivery_at, last_error")
        .eq("org_id", orgId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as CommChannel[];
    },
  });
}

export function useCommChannelMutations(orgId?: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["comm-channels"] });

  const create = useMutation({
    mutationFn: async (input: { kind: string; name: string; webhookUrl: string }) => {
      const { data: auth } = await getSessionUser();
      const { error } = await supabase.from("comm_channels").insert({
        org_id: orgId!,
        kind: input.kind,
        name: input.name,
        webhook_url: input.webhookUrl,
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CommChannel> }) => {
      const { error } = await supabase.from("comm_channels").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("comm_channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

export function useCommAccounts(orgId?: string) {
  return useQuery({
    queryKey: ["comm-accounts", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comm_accounts")
        .select("id, provider, account_email, status, last_synced_at")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as CommAccount[];
    },
  });
}
