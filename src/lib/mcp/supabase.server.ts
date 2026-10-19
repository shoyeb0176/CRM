// Per-user Supabase client for MCP tool handlers.
// Every MCP call runs as the calling user's identity: we pass the verified
// bearer token through to Supabase so RLS enforces exactly the same tenant
// isolation and RBAC the user has in the app — never broader.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function supabaseForUser(token: string): SupabaseClient<Database> {
  const url = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase environment is not configured");
  }
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}
