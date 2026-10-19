// Deep links from notifications (?action=, ?deal=, ?task=, ?request=): scroll the record into view
// and mark it, so people land on the exact thing the notification was about.
import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

export const FOCUS_CLASS = "outline outline-2 -outline-offset-2 outline-primary bg-primary/5";
export const focusDomId = (id: string) => `focus-${id}`;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** validateSearch for pages that accept one optional record id (anything else is dropped). */
export const focusSearch = <K extends string>(key: K) =>
  (s: Record<string, unknown>): Partial<Record<K, string>> => {
    const v = s[key];
    return typeof v === "string" && UUID.test(v) ? ({ [key]: v } as Partial<Record<K, string>>) : {};
  };

export function useScrollToFocus(id: string | undefined, ready: boolean) {
  useEffect(() => {
    if (!id || !ready) return;
    const t = setTimeout(() => document.getElementById(focusDomId(id))?.scrollIntoView({ block: "center", behavior: "smooth" }), 100);
    return () => clearTimeout(t);
  }, [id, ready]);
}

/**
 * `?new=1` on a list page opens its blank "New …" form once, then drops the parameter. Search
 * (Ctrl+K), the assistant and links use it to jump straight to creating a record.
 */
export function useOpenOnNew(open: () => void, ready = true) {
  const want = useRouterState({ select: (s) => (s.location.search as Record<string, unknown>).new !== undefined });
  const navigate = useNavigate();
  const done = useRef(false);
  useEffect(() => {
    if (!want || !ready || done.current) return;
    done.current = true;
    navigate({ to: ".", replace: true, search: ({ new: _drop, ...rest }: Record<string, unknown>) => rest });
    open();
  }, [want, ready]); // eslint-disable-line react-hooks/exhaustive-deps
}
