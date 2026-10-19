import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/lib/crm/use-org";
import type { FormFieldDef } from "./forms.functions";

export type FormRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  target: "lead" | "custom_database" | "submission_only";
  target_database_id: string | null;
  fields: FormFieldDef[];
  submit_message: string;
  is_published: boolean;
  created_at: string;
};

export const FORM_TARGETS: Array<{ value: FormRow["target"]; label: string; hint: string }> = [
  { value: "lead", label: "Create a lead", hint: "Each submission becomes a new lead in CRM." },
  { value: "custom_database", label: "Add a row to a database", hint: "Each submission becomes a record in one of your databases." },
  { value: "submission_only", label: "Just collect responses", hint: "Responses are stored on the form only." },
];

export const FORM_TEMPLATES: Array<{ id: string; label: string; description: string; target: FormRow["target"]; fields: FormFieldDef[] }> = [
  {
    id: "contact",
    label: "Contact request",
    description: "Name, email, company, message — becomes a lead.",
    target: "lead",
    fields: [
      { key: "name", label: "Full name", type: "text", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "company", label: "Company", type: "text", required: false },
      { key: "message", label: "How can we help?", type: "long_text", required: false },
    ],
  },
  {
    id: "demo",
    label: "Demo request",
    description: "Qualify interest before a call.",
    target: "lead",
    fields: [
      { key: "name", label: "Full name", type: "text", required: true },
      { key: "email", label: "Work email", type: "email", required: true },
      { key: "company", label: "Company", type: "text", required: true },
      { key: "team_size", label: "Team size", type: "select", required: false, options: ["1-10", "11-50", "51-200", "200+"] },
    ],
  },
  {
    id: "blank",
    label: "Blank form",
    description: "One question — add your own.",
    target: "submission_only",
    fields: [{ key: "name", label: "Name", type: "text", required: true }],
  },
];

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function useForms() {
  const orgId = useOrgId();
  return useQuery({
    enabled: !!orgId,
    queryKey: ["forms", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("form_definitions")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FormRow[];
    },
  });
}

export function useForm(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ["form", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("form_definitions").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as unknown as FormRow | null;
    },
  });
}

export function useFormSubmissions(formId: string | undefined) {
  return useQuery({
    enabled: !!formId,
    queryKey: ["form-submissions", formId],
    queryFn: async () => {
      const { data } = await supabase
        .from("form_submissions")
        .select("id,data,created_at,created_entity_type")
        .eq("form_id", formId!)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as Array<{ id: string; data: Record<string, unknown>; created_at: string; created_entity_type: string | null }>;
    },
  });
}

export function useFormMutations() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["forms"] });
    void qc.invalidateQueries({ queryKey: ["form"] });
  };

  const create = useMutation({
    mutationFn: async (input: { name: string; target: FormRow["target"]; fields: FormFieldDef[] }) => {
      const base = slugify(input.name) || "form";
      const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;
      const { data, error } = await supabase
        .from("form_definitions")
        .insert({
          org_id: orgId!,
          name: input.name,
          slug,
          target: input.target,
          fields: input.fields,
        })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data!.id as string;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("form_definitions").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("form_definitions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
