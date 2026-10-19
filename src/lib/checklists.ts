// The dashboard's two checklists (Getting started, Your first sale) can be closed, and brought back
// from Help in the top bar, the search box or the assistant (/setup). Closed state is per workspace,
// in this browser.
import { useEffect, useState } from "react";

export type Checklist = "getting-started" | "first-sale";
const EVENT = "inuberry:checklists";
const key = (c: Checklist, orgId: string | null | undefined) => `inuberry.${c}-hidden.${orgId}`;

/** Hidden or not, plus "shown on request": a card brought back stays open even when every step is done. */
export function useChecklist(c: Checklist, orgId: string | null | undefined) {
  const read = () => { try { return localStorage.getItem(key(c, orgId)) === "1"; } catch { return false; } };
  const [hidden, setHiddenState] = useState(read);
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    setHiddenState(read());
    const show = (e: Event) => { if ((e as CustomEvent<Checklist>).detail === c) { setHiddenState(false); setRequested(true); } };
    window.addEventListener(EVENT, show);
    return () => window.removeEventListener(EVENT, show);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, orgId]);
  const hide = () => {
    setHiddenState(true);
    setRequested(false);
    try { localStorage.setItem(key(c, orgId), "1"); } catch { /* storage blocked: hidden until reload */ }
  };
  return { hidden, requested, hide };
}

/** Bring a closed checklist back, in every workspace on this browser. */
export function showChecklist(c: Checklist) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(`inuberry.${c}-hidden.`)) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: c }));
}
