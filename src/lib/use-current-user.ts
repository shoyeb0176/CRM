import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clearSnapshots } from "@/lib/query-snapshot";

export function useCurrentUser() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    getSessionUser().then(({ data }) => {
      if (mounted) setUser(data.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return user;
}

// supabase.auth.getUser() asks the auth server every time (about 300 ms), and every page change
// and many saves waited on it. The server still checks each token, but only once every few
// minutes per token; calls in between (and calls at the same moment) reuse that answer.
const VERIFY_FOR_MS = 5 * 60_000;
let verified: { token: string; user: User; at: number } | null = null;
let inFlight: { token: string; p: Promise<Awaited<ReturnType<typeof supabase.auth.getUser>>> } | null = null;

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT" || event === "USER_UPDATED") verified = null;
  if (event === "SIGNED_OUT") clearSnapshots();
});

/** The signed-in user, checked with the auth server (same shape as supabase.auth.getUser()). */
export async function getSessionUser() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { data: { user: null }, error: null };
  if (verified?.token === token && Date.now() - verified.at < VERIFY_FOR_MS) {
    return { data: { user: verified.user }, error: null };
  }
  if (inFlight?.token !== token) inFlight = { token, p: supabase.auth.getUser(token) };
  const p = inFlight.p;
  const res = await p;
  if (inFlight?.p === p) inFlight = null;
  if (res.data.user) verified = { token, user: res.data.user, at: Date.now() };
  return { data: { user: res.data.user }, error: res.error };
}

/**
 * For opening the app: the saved session's user at once, with the server check running in the
 * background (cold-start note 1). If the server says the session is no longer valid, sign out and
 * go to the sign-in page. A network failure keeps the session (offline isn't signed out). The
 * database checks the token on every request regardless, so nothing loads for a bad session.
 */
export async function getSessionUserFast(onRejected: () => void) {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return { data: { user: null }, error: null };
  void getSessionUser().then(async (res) => {
    const status = (res.error as { status?: number } | null)?.status;
    if (res.data.user || (res.error && status !== 401 && status !== 403)) return;
    await supabase.auth.signOut().catch(() => {});
    onRejected();
  });
  return { data: { user }, error: null };
}
