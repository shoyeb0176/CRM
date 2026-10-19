import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { NO_MAILBOX, sendDocumentEmail } from "@/lib/sales/send-document.functions";
import { useNavigate } from "@tanstack/react-router";

import { friendlyError } from "@/lib/friendly-error";
/** "Email" button + sheet that sends a quote or invoice to the customer. */
export function SendDocumentButton({ doc, id, number, defaultTo, onSent }: {
  doc: "quote" | "invoice"; id: string; number: string; defaultTo?: string | null; onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { if (open) { setTo(defaultTo ?? ""); setMessage(""); } }, [open, defaultTo]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) return toast.error("Enter a valid email address");
    setSending(true);
    try {
      const r = await sendDocumentEmail({ data: { doc, id, to: to.trim(), message: message.trim() || undefined } });
      if ("error" in r) {
        if (r.code === NO_MAILBOX) {
          // Nothing can be sent until a mailbox exists: close the sheet so the toast's button is free to click.
          setOpen(false);
          return toast.error(r.error, {
            duration: 10_000,
            action: { label: "Set up", onClick: () => { void navigate({ to: "/app/settings/email" }); } },
          });
        }
        return toast.error(r.error);
      }
      toast.success(r.message);
      setOpen(false);
      onSent();
    } catch (err) {
      toast.error(friendlyError(err, "Email could not be sent"));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Mail className="mr-1 size-3.5" /> Email</Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Email {doc} {number}</SheetTitle>
            <SheetDescription>Sent from your company mailbox (Settings → Email). The customer gets the {doc} lines and totals. Drafts are marked as sent.</SheetDescription>
          </SheetHeader>
          <form onSubmit={send} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="send-to" className="font-mono text-xs uppercase tracking-widest text-muted-foreground">To</Label>
              <Input id="send-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="send-msg" className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Message (optional)</Label>
              <Textarea id="send-msg" rows={4} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            <SheetFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={sending}>{sending ? "Sending…" : "Send"}</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
