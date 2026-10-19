// "Report a problem": tell the Inuberry team about a bug, something hard to use, an idea or a
// question, with or without a screenshot of the area. Mounted once in the app frame; opened from
// the top bar, the search box, or openReportDialog().
import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Camera, ImagePlus, PenLine, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { useCurrentMembership } from "@/lib/use-current-org";
import { APP_VERSION } from "@/lib/version";
import { REPORT_KINDS, describeBrowser, type ReportKind } from "@/lib/feedback/feedback";
import { ScreenshotSelect, capturePage } from "./screenshot-select";

import { friendlyError } from "@/lib/friendly-error";
type Step = "choose" | "select" | "form";

export function ReportDialog() {
  const pathname = useRouterState({ select: (s) => s.location.pathname + s.location.searchStr });
  const { membership } = useCurrentMembership();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("choose");
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [shot, setShot] = useState<Blob | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<ReportKind>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ kind?: ReportKind; title?: string }>).detail ?? {};
      reset();
      if (d.kind) setKind(d.kind);
      if (d.title) { setTitle(d.title); setStep("form"); }
      setOpen(true);
    };
    window.addEventListener("inuberry:report", onOpen);
    return () => window.removeEventListener("inuberry:report", onOpen);
  }, []);

  useEffect(() => {
    if (!shot) { setShotUrl(null); return; }
    const url = URL.createObjectURL(shot);
    setShotUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [shot]);

  function reset() {
    setStep("choose"); setCanvas(null); setShot(null); setCaptureFailed(false);
    setKind("bug"); setTitle(""); setDescription(""); setBusy(false);
  }

  async function takeScreenshot() {
    setOpen(false);
    setBusy(true);
    // Let the dialog close before the picture is taken.
    await new Promise((r) => setTimeout(r, 250));
    try {
      setCanvas(await capturePage());
      setStep("select");
    } catch {
      setCaptureFailed(true);
      setStep("form");
      setOpen(true);
      toast.error("The screenshot didn't work in this browser. You can upload an image instead.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!title.trim() || !description.trim()) return;
    setBusy(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) throw new Error("Sign in again to send this report.");
      let screenshotPath: string | null = null;
      if (shot) {
        const ext = shot.type === "image/jpeg" ? "jpg" : shot.type === "image/webp" ? "webp" : "png";
        screenshotPath = `${uid}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("feedback").upload(screenshotPath, shot, { contentType: shot.type || "image/png" });
        if (up.error) throw new Error(`The screenshot didn't upload: ${up.error.message}`);
      }
      const { data, error } = await supabase.from("platform_tickets").insert({
        org_id: membership?.org_id ?? null, kind, title: title.trim(), description: description.trim(),
        page_url: pathname.slice(0, 2000), app_version: APP_VERSION, user_agent: navigator.userAgent.slice(0, 500),
        viewport: `${window.innerWidth}×${window.innerHeight}`, screenshot_path: screenshotPath,
      }).select("id, ticket_number").single();
      if (error) throw error;
      setOpen(false);
      reset();
      toast.success(`Sent as ${data.ticket_number}. You'll get a notification when someone replies.`, {
        action: { label: "My reports", onClick: () => { void navigate({ to: "/app/feedback", search: { ticket: data.id } }); } },
      });
    } catch (e) {
      toast.error(friendlyError(e, "The report didn't send. Try again."));
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o && step !== "select") reset(); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-report-ignore>
          {step === "choose" ? (
            <>
              <DialogHeader>
                <DialogTitle>Report a problem</DialogTitle>
                <DialogDescription>Tell the Inuberry team what went wrong or what could be better. We read every report.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="bare" size="bare" type="button" onClick={takeScreenshot} disabled={busy}
                  className="flex flex-col items-start gap-2 border border-border p-4 text-left transition-colors hover:border-primary hover:bg-primary/5">
                  <Camera className="size-5 text-primary" />
                  <span className="font-semibold">Screenshot and describe</span>
                  <span className="text-xs text-muted-foreground">Select the area on this page that shows the problem, then add a note.</span>
                </Button>
                <Button variant="bare" size="bare" type="button" onClick={() => setStep("form")}
                  className="flex flex-col items-start gap-2 border border-border p-4 text-left transition-colors hover:border-primary hover:bg-primary/5">
                  <PenLine className="size-5 text-primary" />
                  <span className="font-semibold">Just write a ticket</span>
                  <span className="text-xs text-muted-foreground">Describe it in words. You can still add a picture.</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                See what you've sent and the replies in <Link to="/app/feedback" className="text-primary hover:underline" onClick={() => setOpen(false)}>My reports</Link>.
              </p>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="grid gap-4">
              <DialogHeader>
                <DialogTitle>Report a problem</DialogTitle>
                <DialogDescription>Say what you did, what happened, and what you expected instead.</DialogDescription>
              </DialogHeader>

              {shotUrl ? (
                <div className="grid gap-2">
                  <img src={shotUrl} alt="Your screenshot" className="max-h-56 w-full border border-border bg-muted object-contain" />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={takeScreenshot} disabled={busy}><RotateCcw className="mr-1 size-3.5" /> Retake</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setShot(null)}><Trash2 className="mr-1 size-3.5" /> Remove</Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2">
                  {!captureFailed && (
                    <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={takeScreenshot} disabled={busy}>
                      <Camera className="mr-1 size-3.5" /> Add a screenshot
                    </Button>
                  )}
                  <FileDropzone accept="image/png,image/jpeg,image/webp" onFiles={([f]) => (!["image/png", "image/jpeg", "image/webp"].includes(f.type) ? toast.error("Attach a PNG, JPEG or WebP image.") : f.size > 10 * 1024 * 1024 ? toast.error("That image is over 10 MB. Try a smaller one.") : setShot(f))}
                    label={<span className="inline-flex items-center gap-1.5"><ImagePlus className="size-4" /> Or drop an image here</span>}
                    hint="PNG, JPG or WebP, up to 10 MB" className="py-4" />
                </div>
              )}

              <div className="grid gap-1.5">
                <Label className="text-xs">What is it?</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as ReportKind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{REPORT_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rp-title" className="text-xs">Short title</Label>
                <Input id="rp-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder="e.g. Saving an invoice does nothing" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rp-desc" className="text-xs">What happened? (required)</Label>
                <Textarea id="rp-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={10000} required rows={5}
                  placeholder="1. I opened… 2. I clicked… 3. Instead of …, I saw …" />
              </div>
              <p className="text-xs text-muted-foreground">
                Sent with it: this page ({pathname.split("?")[0]}), version {APP_VERSION}, {describeBrowser()}, screen {typeof window !== "undefined" ? `${window.innerWidth}×${window.innerHeight}` : ""}.
              </p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
                <Button type="submit" disabled={busy || !title.trim() || !description.trim()}>{busy ? "Sending…" : "Send report"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      {step === "select" && canvas && (
        <ScreenshotSelect
          canvas={canvas}
          onDone={(blob) => { setShot(blob); setCanvas(null); setStep("form"); setOpen(true); }}
          onCancel={() => { setCanvas(null); setStep(shot || title ? "form" : "choose"); setOpen(true); }}
        />
      )}
    </>
  );
}
