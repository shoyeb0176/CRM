// Pay runs are worked out on the server: create a draft with every employee's line, and recalculate
// lines. They run with the signed-in person's own database access, so row-level security and the
// database's own checks (lines add up, approved runs are locked) still apply.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { lineFor, payContexts } from "./runs";
import type { PayFrequency } from "./us";

const FREQ = z.enum(["weekly", "biweekly", "semimonthly", "monthly"]);
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createPayRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ orgId: z.string().uuid(), start: DAY, end: DAY, payDate: DAY, frequency: FREQ }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const contexts = await payContexts(db, data.orgId, data.payDate);
    if (!contexts.size) throw new Error("No active employees have payroll details yet. Add them on each employee's page under Payroll profile.");
    const { data: run, error } = await db.from("pay_runs")
      .insert({ org_id: data.orgId, period_start: data.start, period_end: data.end, pay_date: data.payDate, pay_frequency: data.frequency })
      .select("id").single();
    if (error) throw new Error(error.message);
    const lines = [...contexts.entries()].map(([employeeId, ctx]) => ({ org_id: data.orgId, pay_run_id: run.id, employee_id: employeeId, ...lineFor(ctx, data.frequency) }));
    const { error: e2 } = await db.from("pay_run_lines").insert(lines);
    if (e2) {
      await db.from("pay_runs").delete().eq("id", run.id);
      throw new Error(e2.message);
    }
    return { id: run.id as string };
  });

/** Recalculate one line with new hours or gross pay, or every line from the latest payroll details. */
export const recalcPayRunLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    orgId: z.string().uuid(), runId: z.string().uuid(), lineId: z.string().uuid().optional(),
    change: z.object({ hours: z.number().min(0).max(1000).optional(), gross: z.number().min(0).max(10_000_000).optional() }).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: run, error } = await db.from("pay_runs").select("id, status, pay_date, pay_frequency").eq("id", data.runId).eq("org_id", data.orgId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!run) throw new Error("Pay run not found.");
    if (run.status !== "draft") throw new Error("Only a draft pay run can be changed.");
    const contexts = await payContexts(db, data.orgId, run.pay_date, run.id);
    let q = db.from("pay_run_lines").select("id, employee_id, hours").eq("pay_run_id", run.id);
    if (data.lineId) q = q.eq("id", data.lineId);
    const { data: lines, error: e2 } = await q;
    if (e2) throw new Error(e2.message);
    let updated = 0;
    for (const l of lines ?? []) {
      const c = contexts.get(l.employee_id);
      if (!c) {
        if (data.lineId) throw new Error("This employee has no payroll details any more, so the line can't be recalculated.");
        continue;
      }
      const change = data.lineId ? (data.change ?? {}) : { hours: l.hours ?? undefined };
      const { error: e3 } = await db.from("pay_run_lines").update(lineFor(c, run.pay_frequency as PayFrequency, change)).eq("id", l.id);
      if (e3) throw new Error(e3.message);
      updated++;
    }
    return { updated };
  });
