// The modules a person hid from their own sidebar (user_preferences.hidden_modules, DB-27).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";

export function useHiddenModules() {
  return useQuery({
    queryKey: ["hidden-modules"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data: { user } } = await getSessionUser();
      if (!user) return [];
      const { data, error } = await supabase.from("user_preferences").select("hidden_modules").eq("user_id", user.id).maybeSingle();
      if (error) return []; // database update not applied yet: nothing hidden
      return ((data as { hidden_modules?: string[] } | null)?.hidden_modules) ?? [];
    },
  });
}

export function useSetHiddenModules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (hidden: string[]) => {
      const { data: { user } } = await getSessionUser();
      if (!user) throw new Error("You're signed out. Sign in again.");
      const { error } = await supabase.from("user_preferences")
        .upsert({ user_id: user.id, hidden_modules: hidden }, { onConflict: "user_id" });
      if (error) throw error;
      return hidden;
    },
    onSuccess: (hidden) => qc.setQueryData(["hidden-modules"], hidden),
  });
}
