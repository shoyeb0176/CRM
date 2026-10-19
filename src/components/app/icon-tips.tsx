// One tooltip for every icon-only button in the app: on hover or keyboard focus, a button or link
// whose only label is aria-label (a bell, a pencil, a bin) shows that label beside it. Mounted once
// in the app frame, so no page has to wrap its icons.
import { useEffect, useState } from "react";

type Tip = { text: string; x: number; y: number; below: boolean };

export function IconTips() {
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.("button[aria-label], a[aria-label], [role=button][aria-label]");
      clearTimeout(timer);
      if (!el || (el.textContent ?? "").trim()) return setTip(null); // has visible text: no tip needed
      timer = setTimeout(() => {
        const r = el.getBoundingClientRect();
        const below = r.top < 48;
        setTip({ text: el.getAttribute("aria-label") ?? "", x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below });
      }, e.type === "focusin" ? 0 : 350);
    };
    const hide = () => { clearTimeout(timer); setTip(null); };
    document.addEventListener("pointerover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("scroll", hide, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", show);
      document.removeEventListener("focusin", show);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("scroll", hide, true);
    };
  }, []);
  if (!tip?.text) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[100] max-w-56 bg-foreground px-2 py-1 text-xs text-background shadow-md"
      style={{ left: Math.min(Math.max(tip.x, 70), window.innerWidth - 70), top: tip.y, transform: `translate(-50%, ${tip.below ? "0" : "-100%"})` }}
    >
      {tip.text}
    </div>
  );
}
