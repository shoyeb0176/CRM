import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useApiKeys(orgId?: string) {
  return useQuery({
    queryKey: ["api-keys", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("id,name,prefix,scopes,last_used_at,revoked_at,created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useWebhookEndpoints(orgId?: string) {
  return useQuery({
    queryKey: ["webhook-endpoints", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_endpoints")
        .select("id,name,url,events,is_active,secret,last_delivery_at,created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useWebhookDeliveries(orgId?: string) {
  return useQuery({
    queryKey: ["webhook-deliveries", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_deliveries")
        .select("id,event,status,response_code,error,created_at,endpoint_id")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
}

export function useApiRequestLogs(orgId?: string) {
  return useQuery({
    queryKey: ["api-request-logs", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_request_logs")
        .select("id,method,path,status,duration_ms,created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
}
