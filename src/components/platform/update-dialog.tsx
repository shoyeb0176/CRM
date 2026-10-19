// "A new version is available" pop-up for the platform owner of a self-hosted install, with a
// one-click install (updater service) or the two manual commands. Shown once per version, or again
// when opened from the update notification (?update=1).
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { Download, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { checkForUpdate, installUpdate, updateProgress } from "@/lib/platform/platform.functions";
import { CodeBlock } from "@/components/ui/code-block";

const SEEN = "inuberry.update-seen";
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

type Phase = { step: "ask" } | { step: "installing"; message: string } | { step: "done" } | { step: "failed"; message: string };

export function UpdateDialog({ enabled }: { enabled: boolean }) {
  const check = useServerFn(checkForUpdate);
  const install = useServerFn(installUpdate);
  const progress = useServerFn(updateProgress);
  const forced = useRouterState({ select: (s) => (s.location.search as { update?: unknown }).update !== undefined });
  const info = useQuery({ enabled, queryKey: ["update-check"], queryFn: () => check(), staleTime: 6 * 3600_000, refetchOnWindowFocus: false });
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ step: "ask" });
  const d = info.data;

  useEffect(() => {
    if (d?.updateAvailable && d.latest && (forced || read(SEEN) !== d.latest)) setOpen(true);
  }, [d?.updateAvailable, d?.latest, forced]);

  const close = () => { if (d?.latest) write(SEEN, d.latest); setOpen(false); };

  async function start() {
    setPhase({ step: "installing", message: "Downloading the new version…" });
    try {
      await install();
    } catch (e) {
      return setPhase({ step: "failed", message: e instanceof Error ? e.message : String(e) });
    }
    const until = Date.now() + 6 * 60_000;
    const tick = async () => {
      const v = await fetch("/api/public/version", { cache: "no-store" }).then((r) => r.json()).catch(() => null) as { version?: string } | null;
      if (v?.version === d?.latest) return setPhase({ step: "done" });
      const p = await progress().catch(() => null);
      if (p?.state === "failed") return setPhase({ step: "failed", message: p.message ?? "The update failed." });
      if (Date.now() > until) return setPhase({ step: "failed", message: "It's taking longer than expected. Check the updater with: docker compose logs updater" });
      setPhase({ step: "installing", message: p?.state === "done" ? "Restarting…" : (p?.message || "Installing…") });
      setTimeout(tick, 4000);
    };
    setTimeout(tick, 4000);
  }

  if (!d?.updateAvailable) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : phase.step !== "installing" && close())}>
      <DialogContent className="max-w-lg rounded-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Download className="size-4 text-primary" /> Inuberry {d.latest} is available</DialogTitle>
          <DialogDescription>You're on {d.current}. Here's what changed:</DialogDescription>
        </DialogHeader>
        {d.notes.length > 0 && (
          <ul className="max-h-60 list-disc space-y-1.5 overflow-y-auto border border-border bg-muted/30 py-3 pr-3 pl-7 text-sm">
            {d.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}
        {phase.step === "installing" && <p className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> {phase.message} The app restarts by itself; keep this window open.</p>}
        {phase.step === "done" && <p className="text-sm font-medium text-success">Updated to {d.latest}. Reload to use it.</p>}
        {phase.step === "failed" && <p className="text-sm text-destructive">{phase.message}</p>}
        {!d.canInstall && phase.step === "ask" && (
          <div className="text-sm">
            <p className="mb-2 text-muted-foreground">One-click updates aren't set up here. On the server, in the install folder, run:</p>
            <CodeBlock language="bash" code={"docker compose pull\ndocker compose up -d"} />
          </div>
        )}
        <DialogFooter className="gap-2">
          {phase.step === "done" ? (
            <Button onClick={() => window.location.reload()}>Reload</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close} disabled={phase.step === "installing"}>Later</Button>
              {d.canInstall && (
                <Button onClick={start} disabled={phase.step === "installing"}>
                  {phase.step === "failed" ? "Try again" : "Update now"}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
        <p className="text-xs text-muted-foreground">Back up the database before updating. <a className="text-primary hover:underline" href="/docs/updates">How updates work</a></p>
      </DialogContent>
    </Dialog>
  );
}
