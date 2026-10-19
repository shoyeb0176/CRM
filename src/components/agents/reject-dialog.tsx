import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** In-app replacement for window.prompt() when rejecting an agent action. */
export function RejectActionDialog({
  open, onOpenChange, onConfirm, loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (reason: string | undefined) => void;
  loading?: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setReason(""); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject action?</DialogTitle>
          <DialogDescription>The agent won't carry out this change. You can add a reason for the record.</DialogDescription>
        </DialogHeader>
        <Textarea rows={3} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button variant="destructive" disabled={loading}
            onClick={() => { onConfirm(reason.trim() || undefined); setReason(""); }}>
            {loading ? "Rejecting…" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
