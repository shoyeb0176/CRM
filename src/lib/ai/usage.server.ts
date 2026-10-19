// AI actions per month (migration 0042). One action = one message to the assistant or an agent,
// one AI summary or one knowledge answer, however many model calls it takes. Actions on the
// workspace's own AI key are recorded but never refused.
import { usesOwnKey, type AiPurpose } from "./gateway.server";

export type AiActionKind = "assistant" | "agent" | "brief" | "knowledge";
type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

export class AiLimitError extends Error {
  constructor(public used: number, public limit: number, public resetsOn: string) {
    super(`This workspace has used all ${limit} AI actions for this month. They reset on ${resetsOn}. ` +
      "Upgrade in Settings › Billing, or connect your own AI key in Settings › AI.");
    this.name = "AiLimitError";
  }
}

/** Count one action for the signed-in user (their own Supabase client). Throws AiLimitError at the limit. */
export async function chargeAiAction(supabase: unknown, orgId: string, kind: AiActionKind, purpose: AiPurpose) {
  const byo = await usesOwnKey(orgId, purpose).catch(() => false);
  const { data, error } = await (supabase as Rpc).rpc("consume_ai_action", { _org: orgId, _kind: kind, _byo: byo });
  // If the counter isn't there yet (database update not applied), don't block the AI.
  if (error) return { id: null as number | null, refund: async () => {} };
  const r = data as { ok: boolean; id?: number; used: number; limit: number; resets_on: string };
  if (!r.ok) throw new AiLimitError(r.used, r.limit, r.resets_on);
  return {
    id: r.id ?? null,
    /** Give the action back when the AI never answered. */
    refund: async () => { if (r.id) await (supabase as Rpc).rpc("refund_ai_action", { _id: r.id }); },
  };
}
