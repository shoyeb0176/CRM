import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { useCurrentMembership } from "@/lib/use-current-org";
import { useCanStartTrial } from "@/lib/billing/use-subscription";
import { startBusinessTrial } from "@/lib/billing/billing.functions";

import { friendlyError } from "@/lib/friendly-error";
import { Button } from "@/components/ui/button";
/** "Start 14-day free trial" — renders only while the workspace can still use its one trial. */
export function StartTrialButton({ className }: { className?: string }) {
  const orgId = useCurrentMembership().membership?.org_id ?? null;
  const { canStart } = useCanStartTrial();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  if (!orgId || !canStart) return null;

  async function start() {
    setLoading(true);
    try {
      const res = await startBusinessTrial({ data: { orgId: orgId! } });
      if ("error" in res) throw new Error(res.error);
      await qc.invalidateQueries();
      toast.success("Your 14-day Business trial has started.");
    } catch (e) {
      toast.error(friendlyError(e, "Could not start the trial"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="bare" size="bare"
      onClick={start}
      disabled={loading}
      className={
        className ??
        "inline-flex items-center gap-2 border border-foreground px-5 py-2.5 font-mono text-xs uppercase tracking-widest hover:bg-foreground hover:text-background disabled:opacity-50"
      }
    >
      <Sparkles className="size-3.5" /> {loading ? "Starting…" : "Start 14-day free trial"}
    </Button>
  );
}
