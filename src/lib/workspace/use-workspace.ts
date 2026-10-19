import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { useOrgId } from "@/lib/crm/use-org";
import { PAGE_TEMPLATES, type BlockContent, type BlockType } from "@/lib/workspace/templates";

export type Workspace = {
  id: string;
  name: string;
  icon: string | null;
  sort_order: number;
};

export type PageRow = {
  id: string;
  workspace_id: string;
  parent_page_id: string | null;
  title: string;
  icon: string | null;
  entity_type: string | null;
  entity_id: string | null;
  sort_order: number;
  archived: boolean;
  updated_at: string;
};

export type BlockRow = {
  id: string;
  page_id: string;
  type: BlockType;
  content: BlockContent;
  sort_order: number;
};

export function useWorkspaces() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["workspaces", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Workspace[]> => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id,name,icon,sort_order")
        .eq("org_id", orgId!)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePages() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["pages", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<PageRow[]> => {
      const { data, error } = await supabase
        .from("pages")
        .select("id,workspace_id,parent_page_id,title,icon,entity_type,entity_id,sort_order,archived,updated_at")
        .eq("org_id", orgId!)
        .eq("archived", false)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as PageRow[];
    },
  });
}

export function usePage(pageId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["page", orgId, pageId],
    enabled: !!orgId && !!pageId,
    queryFn: async (): Promise<PageRow> => {
      const { data, error } = await supabase
        .from("pages")
        .select("id,workspace_id,parent_page_id,title,icon,entity_type,entity_id,sort_order,archived,updated_at")
        .eq("org_id", orgId!)
        .eq("id", pageId!)
        .single();
      if (error) throw error;
      return data as PageRow;
    },
  });
}

export function useBlocks(pageId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["blocks", orgId, pageId],
    enabled: !!orgId && !!pageId,
    queryFn: async (): Promise<BlockRow[]> => {
      const { data, error } = await supabase
        .from("blocks")
        .select("id,page_id,type,content,sort_order")
        .eq("org_id", orgId!)
        .eq("page_id", pageId!)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as BlockRow[];
    },
  });
}

export function useWorkspaceMutations() {
  const orgId = useOrgId();
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["workspaces", orgId] });
    qc.invalidateQueries({ queryKey: ["pages", orgId] });
  };

  const createWorkspace = useMutation({
    mutationFn: async (name: string) => {
      const { data: auth } = await getSessionUser();
      const { data, error } = await supabase
        .from("workspaces")
        .insert({ org_id: orgId!, name, created_by: auth.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });

  const createPage = useMutation({
    mutationFn: async (args: {
      workspaceId: string;
      templateId: string;
      title?: string;
      parentPageId?: string | null;
      entityType?: string | null;
      entityId?: string | null;
    }) => {
      const tpl = PAGE_TEMPLATES.find((t) => t.id === args.templateId) ?? PAGE_TEMPLATES[0];
      const { data: auth } = await getSessionUser();
      const userId = auth.user?.id ?? null;
      const { data: page, error } = await supabase
        .from("pages")
        .insert({
          org_id: orgId!,
          workspace_id: args.workspaceId,
          parent_page_id: args.parentPageId ?? null,
          title: args.title?.trim() || tpl.title,
          icon: tpl.icon,
          entity_type: args.entityType ?? null,
          entity_id: args.entityId ?? null,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (tpl.blocks.length) {
        const { error: bErr } = await supabase.from("blocks").insert(
          tpl.blocks.map((b, i) => ({
            org_id: orgId!,
            page_id: page.id,
            type: b.type,
            content: b.content,
            sort_order: i,
            created_by: userId,
          })),
        );
        if (bErr) throw bErr;
      }
      return page.id as string;
    },
    onSuccess: invalidate,
  });

  const updatePage = useMutation({
    mutationFn: async (args: { id: string; title?: string; icon?: string | null; archived?: boolean }) => {
      const { id, ...patch } = args;
      const { error } = await supabase.from("pages").update(patch).eq("id", id).eq("org_id", orgId!);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["page", orgId, v.id] });
    },
  });

  return { createWorkspace, createPage, updatePage };
}

export function useBlockMutations(pageId: string | undefined) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["blocks", orgId, pageId] });

  const addBlock = useMutation({
    mutationFn: async (args: { type: BlockType; sortOrder: number; content?: BlockContent }) => {
      const { data: auth } = await getSessionUser();
      const { error } = await supabase.from("blocks").insert({
        org_id: orgId!,
        page_id: pageId!,
        type: args.type,
        content: (args.content ?? {}),
        sort_order: args.sortOrder,
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateBlock = useMutation({
    mutationFn: async (args: { id: string; content: BlockContent }) => {
      const { error } = await supabase
        .from("blocks")
        .update({ content: args.content })
        .eq("id", args.id)
        .eq("org_id", orgId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteBlock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blocks").delete().eq("id", id).eq("org_id", orgId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const reorder = useMutation({
    mutationFn: async (ordered: BlockRow[]) => {
      for (let i = 0; i < ordered.length; i++) {
        const b = ordered[i];
        if (b.sort_order === i) continue;
        const { error } = await supabase.from("blocks").update({ sort_order: i }).eq("id", b.id).eq("org_id", orgId!);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  return { addBlock, updateBlock, deleteBlock, reorder };
}
