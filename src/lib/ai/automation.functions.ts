import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ ruleId: z.string().uuid() });

// The rules themselves live in the database (run_automation_rule, migration 0030) so the
// daily pg_cron job and this "Run now" button do exactly the same thing.
export const runAutomationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const { data: res, error } = await sb.rpc("run_automation_rule", { _rule: data.ruleId });
    if (error) {
      throw new Error(error.message.includes("run_automation_rule")
        ? "Automation rules need database update DB-10. Ask your administrator to apply it."
        : error.message);
    }
    return res as { matches: number; created: number; status: "success" | "error"; log: string };
  });
