import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { useOrgId } from "@/lib/crm/use-org";

export type FieldType = "text" | "long_text" | "number" | "date" | "checkbox" | "select" | "url" | "email";

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  long_text: "Long text",
  number: "Number",
  date: "Date",
  checkbox: "Checkbox",
  select: "Select",
  url: "Link",
  email: "Email",
};

export type CustomDatabase = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
};

export type CustomField = {
  id: string;
  database_id: string | null;
  key: string;
  label: string;
  field_type: FieldType;
  options: string[];
  required: boolean;
  sort_order: number;
};

export type CustomRecord = {
  id: string;
  database_id: string;
  data: Record<string, unknown>;
  sort_order: number;
  created_at: string;
};

export type DatabaseView = {
  id: string;
  database_id: string;
  name: string;
  view_type: "table" | "board";
  group_by: string | null;
  sort_order: number;
};

export type DatabaseTemplate = {
  id: string;
  label: string;
  description: string;
  icon: string;
  fields: Array<{ label: string; key: string; field_type: FieldType; options?: string[] }>;
  groupBy?: string;
};

export const DATABASE_TEMPLATES: DatabaseTemplate[] = [
  {
    id: "blank",
    label: "Blank database",
    description: "Just a Name field — add your own.",
    icon: "🗂️",
    fields: [{ label: "Name", key: "name", field_type: "text" }],
  },
  {
    id: "tracker",
    label: "Work tracker",
    description: "Name, status, owner, due date, notes.",
    icon: "✅",
    groupBy: "status",
    fields: [
      { label: "Name", key: "name", field_type: "text" },
      { label: "Status", key: "status", field_type: "select", options: ["Not started", "In progress", "Blocked", "Done"] },
      { label: "Owner", key: "owner", field_type: "text" },
      { label: "Due date", key: "due_date", field_type: "date" },
      { label: "Notes", key: "notes", field_type: "long_text" },
    ],
  },
  {
    id: "applicants",
    label: "Applicant tracker",
    description: "Candidates moving through hiring stages.",
    icon: "🧑‍💼",
    groupBy: "stage",
    fields: [
      { label: "Candidate", key: "name", field_type: "text" },
      { label: "Role", key: "role", field_type: "text" },
      { label: "Stage", key: "stage", field_type: "select", options: ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"] },
      { label: "Email", key: "email", field_type: "email" },
      { label: "CV link", key: "cv", field_type: "url" },
    ],
  },
  {
    id: "assets",
    label: "Asset register",
    description: "Equipment, owners, value and purchase date.",
    icon: "💻",
    groupBy: "category",
    fields: [
      { label: "Asset", key: "name", field_type: "text" },
      { label: "Category", key: "category", field_type: "select", options: ["Laptop", "Phone", "Vehicle", "Tool", "Other"] },
      { label: "Assigned to", key: "owner", field_type: "text" },
      { label: "Value", key: "value", field_type: "number" },
      { label: "Purchased", key: "purchased", field_type: "date" },
      { label: "In service", key: "active", field_type: "checkbox" },
    ],
  },
  {
    id: "content",
    label: "Content calendar",
    description: "Posts, channels, publish dates and status.",
    icon: "📅",
    groupBy: "status",
    fields: [
      { label: "Title", key: "name", field_type: "text" },
      { label: "Channel", key: "channel", field_type: "select", options: ["Blog", "LinkedIn", "Email", "Other"] },
      { label: "Status", key: "status", field_type: "select", options: ["Idea", "Drafting", "Review", "Scheduled", "Published"] },
      { label: "Publish date", key: "publish_date", field_type: "date" },
    ],
  },
];


/** Per-row save queue so cell edits on the same row never race. */
const rowQueues = new Map<string, Promise<void>>();

export function useDatabases() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["custom-databases", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<CustomDatabase[]> => {
      const { data, error } = await supabase
        .from("custom_databases")
        .select("id,name,description,icon")
        .eq("org_id", orgId!)
        .eq("archived", false)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDatabase(databaseId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["custom-database", orgId, databaseId],
    enabled: !!orgId && !!databaseId,
    queryFn: async (): Promise<CustomDatabase> => {
      const { data, error } = await supabase
        .from("custom_databases")
        .select("id,name,description,icon")
        .eq("org_id", orgId!)
        .eq("id", databaseId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useFields(databaseId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["custom-fields", orgId, databaseId],
    enabled: !!orgId && !!databaseId,
    queryFn: async (): Promise<CustomField[]> => {
      const { data, error } = await supabase
        .from("custom_fields")
        .select("id,database_id,key,label,field_type,options,required,sort_order")
        .eq("org_id", orgId!)
        .eq("database_id", databaseId!)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((f) => ({
        ...f,
        field_type: f.field_type as FieldType,
        options: Array.isArray(f.options) ? (f.options as string[]) : [],
      }));
    },
  });
}

export function useRecords(databaseId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["custom-records", orgId, databaseId],
    enabled: !!orgId && !!databaseId,
    queryFn: async (): Promise<CustomRecord[]> => {
      const { data, error } = await supabase
        .from("custom_records")
        .select("id,database_id,data,sort_order,created_at")
        .eq("org_id", orgId!)
        .eq("database_id", databaseId!)
        .eq("archived", false)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, data: (r.data ?? {}) as Record<string, unknown> }));
    },
  });
}

export function useViews(databaseId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["database-views", orgId, databaseId],
    enabled: !!orgId && !!databaseId,
    queryFn: async (): Promise<DatabaseView[]> => {
      const { data, error } = await supabase
        .from("database_views")
        .select("id,database_id,name,view_type,group_by,sort_order")
        .eq("org_id", orgId!)
        .eq("database_id", databaseId!)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as DatabaseView[];
    },
  });
}

export function slugKey(label: string, taken: string[] = []) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "field";
  let key = base;
  let i = 2;
  while (taken.includes(key)) key = `${base}_${i++}`;
  return key;
}

export function useDatabaseMutations(databaseId?: string) {
  const orgId = useOrgId();
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["custom-databases", orgId] });
    qc.invalidateQueries({ queryKey: ["custom-fields", orgId, databaseId] });
    qc.invalidateQueries({ queryKey: ["custom-records", orgId, databaseId] });
    qc.invalidateQueries({ queryKey: ["database-views", orgId, databaseId] });
  };

  const createDatabase = useMutation({
    mutationFn: async (args: { name: string; templateId: string }) => {
      const tpl = DATABASE_TEMPLATES.find((t) => t.id === args.templateId) ?? DATABASE_TEMPLATES[0];
      const { data: auth } = await getSessionUser();
      const { data: db, error } = await supabase
        .from("custom_databases")
        .insert({
          org_id: orgId!,
          name: args.name.trim() || tpl.label,
          description: tpl.description,
          icon: tpl.icon,
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: fErr } = await supabase.from("custom_fields").insert(
        tpl.fields.map((f, i) => ({
          org_id: orgId!,
          database_id: db.id,
          key: f.key,
          label: f.label,
          field_type: f.field_type,
          options: (f.options ?? []),
          sort_order: i,
        })),
      );
      if (fErr) throw fErr;

      const views: Array<Record<string, unknown>> = [
        { org_id: orgId!, database_id: db.id, name: "Table", view_type: "table", sort_order: 0 },
      ];
      if (tpl.groupBy) {
        views.push({ org_id: orgId!, database_id: db.id, name: "Board", view_type: "board", group_by: tpl.groupBy, sort_order: 1 });
      }
      const { error: vErr } = await supabase.from("database_views").insert(views as never);
      if (vErr) throw vErr;

      return db.id as string;
    },
    onSuccess: invalidate,
  });

  const addField = useMutation({
    mutationFn: async (args: { label: string; fieldType: FieldType; options?: string[]; takenKeys: string[]; sortOrder: number }) => {
      const { error } = await supabase.from("custom_fields").insert({
        org_id: orgId!,
        database_id: databaseId!,
        key: slugKey(args.label, args.takenKeys),
        label: args.label.trim(),
        field_type: args.fieldType,
        options: (args.options ?? []),
        sort_order: args.sortOrder,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteField = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_fields").delete().eq("id", id).eq("org_id", orgId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const addRecord = useMutation({
    mutationFn: async (data: Record<string, unknown> = {}) => {
      const { data: auth } = await getSessionUser();
      const { error } = await supabase.from("custom_records").insert({
        org_id: orgId!,
        database_id: databaseId!,
        data: data as never,
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setRecordField = useMutation({
    mutationFn: (args: { id: string; key: string; value: unknown }) => {
      const prev = rowQueues.get(args.id) ?? Promise.resolve();
      const next = prev.catch(() => undefined).then(async () => {
        const { error } = await supabase.rpc("set_custom_record_field", {
          _id: args.id, _key: args.key, _value: (args.value ?? null) as never,
        });
        if (error) throw error;
      });
      rowQueues.set(args.id, next);
      return next;
    },
    onSuccess: invalidate,
  });

  const updateRecord = useMutation({
    mutationFn: async (args: { id: string; data: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("custom_records")
        .update({ data: args.data as never })
        .eq("id", args.id)
        .eq("org_id", orgId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteRecord = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_records").delete().eq("id", id).eq("org_id", orgId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const addView = useMutation({
    mutationFn: async (args: { name: string; viewType: "table" | "board"; groupBy?: string | null; sortOrder: number }) => {
      const { error } = await supabase.from("database_views").insert({
        org_id: orgId!,
        database_id: databaseId!,
        name: args.name,
        view_type: args.viewType,
        group_by: args.groupBy ?? null,
        sort_order: args.sortOrder,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteDatabase = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_databases").update({ archived: true }).eq("id", id).eq("org_id", orgId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { createDatabase, addField, deleteField, addRecord, updateRecord, setRecordField, deleteRecord, addView, deleteDatabase };
}
