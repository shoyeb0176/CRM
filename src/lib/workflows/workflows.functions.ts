import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ENTITY_TABLE,
  ENTITY_TITLE_FIELD,
  ENTITY_LINK,
  type WorkflowAction,
  type WorkflowCondition,
  type WorkflowEntity,
} from "./workflow-model";
import { deliverToChannels } from "@/lib/comms/comms.functions";
import { notifyOrg } from "@/lib/notify-org";

type SBClient = SupabaseClient<Database>;

const Input = z.object({ workflowId: z.string().uuid(), dryRun: z.boolean().optional() });

function matches(row: Record<string, unknown>, c: WorkflowCondition): boolean {
  const raw = row[c.field];
  const val = c.value;
  switch (c.op) {
    case "eq": return String(raw ?? "") === val;
    case "neq": return String(raw ?? "") !== val;
    case "gt": return Number(raw ?? 0) > Number(val || 0);
    case "lt": return Number(raw ?? 0) < Number(val || 0);
    case "contains": return String(raw ?? "").toLowerCase().includes(val.toLowerCase());
    case "is_empty": return raw === null || raw === undefined || raw === "";
    case "not_empty": return !(raw === null || raw === undefined || raw === "");
    case "older_than_days": {
      if (!raw) return false;
      const t = new Date(String(raw)).getTime();
      if (Number.isNaN(t)) return false;
      return t < Date.now() - Number(val || 0) * 86_400_000;
    }
    default: return false;
  }
}

function render(tpl: string, row: Record<string, unknown>, label: string) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(row[k] ?? "")).replace(/\{\{title\}\}/g, label);
}

export const runWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: SBClient; userId: string };
    const { data: wf } = await supabase.from("workflows").select("*").eq("id", data.workflowId).maybeSingle();
    if (!wf) throw new Error("Workflow not found");

    const entity = wf.entity as WorkflowEntity;
    const table = ENTITY_TABLE[entity];
    if (!table) throw new Error("Unsupported entity");

    const conditions = (wf.conditions ?? []) as unknown as WorkflowCondition[];
    const actions = (wf.actions ?? []) as unknown as WorkflowAction[];

    let matched = 0;
    let actionsRun = 0;
    let status: "success" | "error" = "success";
    let log = "";

    try {
      const { data: rows, error } = await supabase
        .from(table as "invoices")
        .select("*")
        .eq("org_id", wf.org_id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const hits = (rows ?? []).filter((r) =>
        conditions.every((c) => matches(r as unknown as Record<string, unknown>, c)),
      ) as unknown as Array<Record<string, unknown>>;
      matched = hits.length;

      if (!data.dryRun) {
        for (const row of hits.slice(0, 50)) {
          const id = String(row.id);
          const label = String(row[ENTITY_TITLE_FIELD[entity]] ?? entity);
          const link = ENTITY_LINK[entity](id);
          for (const a of actions) {
            if (a.type === "notify") {
              const title = render(a.title || wf.name, row, label);
              const body = a.body ? render(a.body, row, label) : `${label}`;
              const { error: e } = await notifyOrg(supabase, wf.org_id, {
                title, body, severity: a.severity ?? "info", module: entity, entityType: entity, entityId: id, link,
              });
              if (!e) actionsRun++;
              await deliverToChannels(supabase, wf.org_id, { title, body, link });
            } else if (a.type === "create_task" || a.type === "log_activity") {
              const { error: e } = await supabase.from("activities").insert({
                org_id: wf.org_id,
                title: render(a.title || wf.name, row, label),
                description: a.body ? render(a.body, row, label) : `Created by workflow "${wf.name}" for ${label}.`,
                type: a.type === "create_task" ? "task" : "note",
                owner_id: userId,
                created_by: userId,
                entity_type: ["company", "contact", "deal", "lead"].includes(entity)
                  ? (entity as "company" | "contact" | "deal" | "lead")
                  : null,
                entity_id: ["company", "contact", "deal", "lead"].includes(entity) ? id : null,
              });
              if (!e) actionsRun++;
            } else if (a.type === "webhook" && a.url) {
              try {
                await fetch(a.url, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ workflow: wf.name, entity, id, record: row }),
                });
                actionsRun++;
              } catch {
                /* ignore webhook failures per record */
              }
            }
          }
        }
      }
      log = data.dryRun
        ? `Preview: ${matched} record(s) match the conditions.`
        : `${matched} record(s) matched, ${actionsRun} action(s) executed.`;
    } catch (e) {
      status = "error";
      log = e instanceof Error ? e.message : String(e);
    }

    if (!data.dryRun) {
      await supabase.from("workflow_runs").insert({
        org_id: wf.org_id,
        workflow_id: wf.id,
        status,
        matched,
        actions_run: actionsRun,
        log,
        triggered_by: userId,
        finished_at: new Date().toISOString(),
      });
      await supabase.from("workflows").update({ last_run_at: new Date().toISOString() }).eq("id", wf.id);
    }

    return { matched, actionsRun, status, log };
  });
