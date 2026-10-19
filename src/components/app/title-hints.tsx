import { useEffect, useState } from "react";

type Tip = { text: string; x: number; y: number; below: boolean };

/**
 * Shows every `title="…"` hint as a styled tooltip, quickly on hover and also on keyboard focus,
 * instead of the browser's slow grey box (which never appears for keyboard users). The title is
 * put back when the pointer or focus leaves, so it still serves as the accessible name.
 * Mounted once at the root; nothing else needs to change to get it.
 */
export function TitleHints() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let el: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function hide() {
      clearTimeout(timer);
      if (el?.dataset.hint !== undefined) {
        if (!el.hasAttribute("title")) el.setAttribute("title", el.dataset.hint);
        if (el.dataset.hintLabel !== undefined) el.removeAttribute("aria-label");
        delete el.dataset.hint;
        delete el.dataset.hintLabel;
      }
      el = null;
      setTip(null);
    }

    function show(target: EventTarget | null, delay: number) {
      const next = (target as Element | null)?.closest?.<HTMLElement>("[title], [data-hint]") ?? null;
      if (next === el) return;
      hide();
      const text = next?.getAttribute("title")?.trim();
      if (!next || !text) return;
      el = next;
      // Park the title so the browser doesn't draw its own box on top.
      next.dataset.hint = next.getAttribute("title")!;
      next.removeAttribute("title");
      // An icon-only control is named by its title: keep the name for screen readers meanwhile.
      if (!next.hasAttribute("aria-label") && !next.textContent?.trim()) {
        next.setAttribute("aria-label", text);
        next.dataset.hintLabel = "";
      }
      timer = setTimeout(() => {
        const r = next.getBoundingClientRect();
        const below = r.top < 48;
        setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below });
      }, delay);
    }

    const over = (e: PointerEvent) => { if (e.pointerType === "mouse") show(e.target, 300); };
    const focus = (e: FocusEvent) => { if ((e.target as Element).matches?.(":focus-visible")) show(e.target, 0); };
    const out = (e: Event) => {
      const to = (e as PointerEvent).relatedTarget as Node | null;
      if (el && to && el.contains(to)) return;
      hide();
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide, true);
    window.addEventListener("scroll", hide, true);
    return () => {
      hide();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide, true);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      role="tooltip"
      data-report-ignore
      className="pointer-events-none fixed z-[100] max-w-xs bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-md"
      style={{
        left: Math.min(Math.max(tip.x, 140), window.innerWidth - 140),
        top: tip.y,
        transform: `translate(-50%, ${tip.below ? "0" : "-100%"})`,
      }}
    >
      {tip.text}
    </div>
  );
}
