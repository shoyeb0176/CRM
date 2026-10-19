import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type KnowledgeDoc = {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  collection: string;
  tags: string[];
  source: string;
  is_published: boolean;
  updated_at: string;
};

export const DOC_TEMPLATES: Array<{ key: string; label: string; collection: string; description: string; content: string }> = [
  {
    key: "blank",
    label: "Blank document",
    collection: "General",
    description: "Start from an empty page.",
    content: "",
  },
  {
    key: "faq",
    label: "Customer FAQ",
    collection: "Customer support",
    description: "Common questions and approved answers.",
    content: "## Question\n\nAnswer…\n\n## Question\n\nAnswer…",
  },
  {
    key: "policy",
    label: "Internal policy",
    collection: "Policies",
    description: "A rule everyone should follow.",
    content: "### Purpose\n\n### Who it applies to\n\n### The policy\n\n### Exceptions",
  },
  {
    key: "product",
    label: "Product notes",
    collection: "Products",
    description: "How a product or service works, and what to tell customers.",
    content: "### What it is\n\n### Who it is for\n\n### Pricing\n\n### Common objections",
  },
  {
    key: "runbook",
    label: "How-to / runbook",
    collection: "Procedures",
    description: "Step-by-step instructions for a recurring task.",
    content: "1. \n2. \n3. ",
  },
];

export function useKnowledgeDocs(orgId?: string, search?: string) {
  return useQuery({
    queryKey: ["knowledge", orgId, search ?? ""],
    enabled: !!orgId,
    queryFn: async () => {
      let q = supabase
        .from("knowledge_docs")
        .select("id,title,summary,collection,tags,source,is_published,updated_at")
        .eq("org_id", orgId!)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (search?.trim()) q = q.or(`title.ilike.%${search.trim()}%,content.ilike.%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useKnowledgeDoc(docId?: string) {
  return useQuery({
    queryKey: ["knowledge-doc", docId],
    enabled: !!docId,
    queryFn: async () => {
      const { data, error } = await supabase.from("knowledge_docs").select("*").eq("id", docId!).maybeSingle();
      if (error) throw error;
      return data as KnowledgeDoc | null;
    },
  });
}

export function useKnowledgeMutations(orgId?: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["knowledge"] });
    qc.invalidateQueries({ queryKey: ["knowledge-doc"] });
  };

  const create = useMutation({
    mutationFn: async (input: { title: string; collection: string; content: string }) => {
      const { data, error } = await supabase
        .from("knowledge_docs")
        .insert({ org_id: orgId!, ...input })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<KnowledgeDoc>) => {
      const { error } = await supabase.from("knowledge_docs").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("knowledge_docs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
