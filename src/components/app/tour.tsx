import { useEffect, useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";

// A short walk (six stops on a computer, five on a phone) around the frame for someone new: it rings each control and says what it's for.
// Runs once per person (remembered in this browser); "Take the tour" on the dashboard runs it again.
const STEPS: { target: string; title: string; text: string }[] = [
  // Phones show the menu button instead of the sidebar; a step whose control isn't on screen is skipped.
  { target: "[aria-label='Open menu']", title: "Your modules", text: "Tap here for every module: CRM, sales, invoices, stock, projects, accounting and HR." },
  { target: "aside nav", title: "Your modules", text: "Everything lives in the sidebar: CRM, sales, invoices, stock, projects, accounting and HR. Fold it to icons with the button at the top." },
  { target: "[aria-label^='Search']", title: "Search and go", text: "Find any customer, invoice or page, or start something new. Ctrl K (⌘K on a Mac) opens it from anywhere." },
  { target: "[aria-label='Open assistant']", title: "Ask AI", text: "Ask about your numbers or have it draft and update records. It asks before changing anything. Type / for quick commands." },
  { target: "[aria-label^='Notifications']", title: "What needs you", text: "Approvals, overdue invoices, low stock and replies show up here and in the Inbox." },
  { target: "[aria-label='Help']", title: "Help", text: "Replay this tour, bring back the Getting started and Your first sale checklists, open the guides or see your reports." },
  { target: "[aria-label='Report a problem']", title: "Tell us", text: "Something broken or confusing? Report it here with a screenshot; you'll see our reply under My reports." },
];
const DONE_KEY = "inuberry.tour-done";
const START_EVENT = "inuberry:tour";

/** Starts the tour (from a button anywhere). */
export function startTour() { window.dispatchEvent(new Event(START_EVENT)); }

const visible = (e: HTMLElement) => { const r = e.getBoundingClientRect(); return e.offsetParent !== null && r.width > 0 && r.height > 0; };
const findTarget = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].find(visible);

export function Tour() {
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const start = () => setStep(0);
    window.addEventListener(START_EVENT, start);
    let seen = true;
    try { seen = localStorage.getItem(DONE_KEY) === "1"; } catch { /* storage blocked: don't nag */ }
    const t = !seen ? setTimeout(start, 800) : undefined;
    return () => { window.removeEventListener(START_EVENT, start); clearTimeout(t); };
  }, []);

  const finish = () => { setStep(null); try { localStorage.setItem(DONE_KEY, "1"); } catch { /* ignore */ } };

  useLayoutEffect(() => {
    if (step === null) return;
    const el = findTarget(STEPS[step].target);
    if (!el) { if (step < STEPS.length - 1) setStep(step + 1); else finish(); return; }
    el.scrollIntoView({ block: "nearest" });
    // Follow the target when the window resizes, the page scrolls or the sidebar folds.
    const place = () => setRect(el.getBoundingClientRect());
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    ro.observe(document.body);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { ro.disconnect(); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [step]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  if (step === null || !rect) return null;
  const s = STEPS[step];
  // Count only the stops this screen has (phones have no sidebar, computers no menu button).
  const shown = STEPS.map((_, i) => i).filter((i) => i === step || findTarget(STEPS[i].target));
  const pos = shown.indexOf(step);
  const last = pos === shown.length - 1;
  const prev = pos > 0 ? shown[pos - 1] : null;
  // Card beside tall targets (the sidebar); otherwise below, or above when there's no room below.
  // Always kept inside the window, whatever its size.
  const vw = window.innerWidth, vh = window.innerHeight, M = 12;
  // Phones: a full-width card pinned to the bottom of the screen (the top when the control is down there).
  const phone = vw < 640;
  const W = phone ? vw - 2 * M : Math.min(300, vw - 2 * M);
  const H = 170; // about the card's height; only used to choose a side and keep it on screen
  const beside = rect.height > vh / 2 && rect.right + M + W <= vw - M;
  const left = phone ? M : Math.max(M, Math.min(vw - W - M, beside ? rect.right + M : rect.right - W));
  const below = rect.bottom + M + H <= vh - M;
  const at = phone ? (rect.bottom > vh - H - 2 * M ? { top: M } : { bottom: M })
    : { top: beside ? Math.max(M, Math.min(vh - H - M, rect.top + 80)) : below ? rect.bottom + M : Math.max(M, rect.top - H - M) };
  // The ring sits 4px outside the target but never past the window edge (the sidebar touches x = 0).
  const rl = Math.max(2, rect.left - 4), rt = Math.max(2, rect.top - 4);
  const ringBox = { left: rl, top: rt, width: Math.min(vw - 2, rect.right + 4) - rl, height: Math.min(vh - 2, rect.bottom + 4) - rt };
  return (
    <>
      {/* The ring's huge shadow dims everything around the control being explained. */}
      <div aria-hidden className="pointer-events-none fixed z-[60] outline outline-2 outline-primary transition-all duration-200 motion-reduce:transition-none"
        style={{ ...ringBox, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.45)" }} />
      <div role="dialog" aria-modal="false" aria-labelledby="tour-title" className="fixed z-[61] max-h-[calc(100vh-24px)] overflow-y-auto border border-border bg-popover p-4 text-popover-foreground shadow-xl"
        style={{ left, width: W, ...at }}>
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{pos + 1} of {shown.length}</div>
        <h2 id="tour-title" className="mt-1 text-sm font-semibold">{s.title}</h2>
        <p aria-live="polite" className="mt-1 text-sm text-muted-foreground">{s.text}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={finish}>Skip</Button>
          <div className="flex gap-2">
            {prev !== null && <Button variant="outline" size="sm" onClick={() => setStep(prev)}>Back</Button>}
            <Button size="sm" autoFocus onClick={() => (last ? finish() : setStep(shown[pos + 1]))}>{last ? "Done" : "Next"}</Button>
          </div>
        </div>
      </div>
    </>
  );
}
