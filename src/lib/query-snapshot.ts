// A saved copy of the few answers the first screen needs (workspace, plan, dashboard and module
// overviews), so a reload paints at once from the last visit and then refreshes. Kept per signed-in
// user in this browser and removed on sign-out. Anything that fails here just means no snapshot.
import type { QueryClient } from "@tanstack/react-query";

const PREFIX = "inuberry.snapshot.";
const KEEP = new Set(["my-memberships", "current-org-id", "org-subscription", "subscription-plans", "dashboard", "module-summary"]);
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const MAX_BYTES = 300_000;

type Entry = { key: unknown[]; data: unknown; at: number };

/** The signed-in user's id from the saved session, read without waiting on anything. */
function sessionUserId(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^sb-.+-auth-token$/.test(k)) continue;
      const id = JSON.parse(localStorage.getItem(k) ?? "null")?.user?.id;
      if (typeof id === "string") return id;
    }
  } catch { /* storage blocked */ }
  return null;
}

export function clearSnapshots() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* storage blocked */ }
}

/** Load the last snapshot into the cache (as of when it was saved, so it refreshes), then keep it updated. */
export function startSnapshots(qc: QueryClient) {
  if (typeof window === "undefined") return;
  const uid = sessionUserId();
  if (!uid) return;
  const storeKey = PREFIX + uid;
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey) ?? "[]") as Entry[];
    for (const e of saved) {
      if (Date.now() - e.at < MAX_AGE_MS && qc.getQueryData(e.key) === undefined) qc.setQueryData(e.key, e.data, { updatedAt: e.at });
    }
  } catch { /* corrupt snapshot: ignore */ }

  let timer: ReturnType<typeof setTimeout> | undefined;
  qc.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    if (!KEEP.has(String(event.query.queryKey[0]))) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      // Only this user's session: someone else signing in on this browser starts from nothing.
      if (sessionUserId() !== uid) return;
      const entries: Entry[] = qc.getQueryCache().getAll()
        .filter((q) => KEEP.has(String(q.queryKey[0])) && q.state.status === "success" && q.state.data !== undefined)
        .map((q) => ({ key: q.queryKey as unknown[], data: q.state.data, at: q.state.dataUpdatedAt }));
      try {
        const json = JSON.stringify(entries);
        if (json.length <= MAX_BYTES) localStorage.setItem(storeKey, json);
      } catch { /* full or blocked */ }
    }, 1000);
  });
}
