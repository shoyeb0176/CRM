// Full-screen "select the problem area" step. Shows a frozen picture of the page; the user drags a
// box (mouse or touch), presses Enter for the whole screen, or Esc to cancel.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

type Box = { x: number; y: number; w: number; h: number };

/** A picture of the page as it looks now, at screen size. Elements marked data-report-ignore are left out. */
export async function capturePage(): Promise<HTMLCanvasElement> {
  const { domToCanvas } = await import("modern-screenshot");
  return domToCanvas(document.body, {
    width: window.innerWidth,
    height: window.innerHeight,
    scale: Math.min(window.devicePixelRatio || 1, 2),
    backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
    filter: (n) => !(n instanceof HTMLElement && n.dataset.reportIgnore !== undefined),
    features: { restoreScrollPosition: true },
    timeout: 8000,
  });
}

export function ScreenshotSelect({ canvas, onDone, onCancel }: {
  canvas: HTMLCanvasElement;
  onDone: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const url = useRef(canvas.toDataURL("image/png"));

  async function crop(b: Box | null) {
    const ratio = canvas.width / window.innerWidth;
    const r = b ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(r.w * ratio));
    out.height = Math.max(1, Math.round(r.h * ratio));
    out.getContext("2d")!.drawImage(canvas, r.x * ratio, r.y * ratio, r.w * ratio, r.h * ratio, 0, 0, out.width, out.height);
    out.toBlob((blob) => blob && onDone(blob), "image/png");
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      if (e.key === "Enter") { e.preventDefault(); void crop(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toBox = (a: { x: number; y: number }, b: { x: number; y: number }): Box =>
    ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

  return createPortal(
    <div
      data-report-ignore
      role="dialog"
      aria-label="Select the problem area"
      className="fixed inset-0 z-[200] cursor-crosshair touch-none select-none"
      style={{ backgroundImage: `url(${url.current})`, backgroundSize: "100% 100%" }}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); start.current = { x: e.clientX, y: e.clientY }; setBox(null); }}
      onPointerMove={(e) => { if (start.current) setBox(toBox(start.current, { x: e.clientX, y: e.clientY })); }}
      onPointerUp={(e) => {
        const s = start.current; start.current = null;
        if (!s) return;
        const b = toBox(s, { x: e.clientX, y: e.clientY });
        if (b.w > 12 && b.h > 12) void crop(b); else setBox(null);
      }}
    >
      {/* Dim everything outside the selection. */}
      {box ? (
        <div className="pointer-events-none absolute border-2 border-primary" style={{ left: box.x, top: box.y, width: box.w, height: box.h, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.45)" }} />
      ) : (
        <div className="pointer-events-none absolute inset-0" style={{ background: "rgb(0 0 0 / 0.3)" }} />
      )}
      <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
        <div className="max-w-xl bg-foreground px-4 py-2 text-center text-sm text-background shadow-lg">
          <strong>Drag to select the problem area.</strong> Enter uses the whole screen · Esc cancels
        </div>
      </div>
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2" onPointerDown={(e) => e.stopPropagation()}>
        <Button type="button" variant="outline" className="shadow-lg" onClick={() => void crop(null)}>Use whole screen</Button>
        <Button type="button" variant="outline" className="shadow-lg" onClick={onCancel}>Cancel</Button>
      </div>
    </div>,
    document.body,
  );
}
