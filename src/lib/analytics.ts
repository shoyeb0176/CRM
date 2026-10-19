// Product analytics, only after the visitor accepts optional cookies and only when the IDs are set.
// - PostHog (EU) inside the app: page views, the signed-in user (id, email) and their workspace (name, plan).
// - Google Analytics 4 on the public website only, anonymous (Google's terms forbid personal data).
// Never sent: customers, invoices or any other business record. Both IDs are public (VITE_), not secrets.
import { useEffect, useState } from "react";
import type { PostHog } from "posthog-js";

const CONSENT_KEY = "inuberry.cookie.consent";
export const CONSENT_EVENT = "inuberry:consent";

export function analyticsAllowed(): boolean {
  try {
    return JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "null")?.choice === "accepted";
  } catch {
    return false;
  }
}

/** True once optional cookies are accepted; follows the banner without a reload. */
function useConsent() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const read = () => setOk(analyticsAllowed());
    read();
    window.addEventListener(CONSENT_EVENT, read);
    return () => window.removeEventListener(CONSENT_EVENT, read);
  }, []);
  return ok;
}

let posthog: Promise<PostHog> | null = null;
function loadPosthog(key: string) {
  posthog ??= import("posthog-js").then(({ default: ph }) => {
    ph.init(key, {
      api_host: import.meta.env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com",
      capture_pageview: "history_change",
      person_profiles: "identified_only",
      session_recording: { maskAllInputs: true, maskTextSelector: "[data-private]" },
    });
    return ph;
  });
  return posthog;
}

/** Inside the app: tie page views to the signed-in user and workspace. Clears on sign-out via reset(). */
export function useProductAnalytics(user: { id: string; email?: string | null } | null, org: { id: string; name: string; plan?: string | null } | null) {
  const ok = useConsent();
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  useEffect(() => {
    if (!ok || !key || !user) return;
    void loadPosthog(key).then((ph) => {
      ph.identify(user.id, { email: user.email ?? undefined });
      if (org) ph.group("workspace", org.id, { name: org.name, plan: org.plan ?? undefined });
    });
  }, [ok, key, user?.id, user?.email, org?.id, org?.name, org?.plan]);
}

export function resetAnalytics() {
  void posthog?.then((ph) => ph.reset());
}

/** On the public website: Google Analytics 4, anonymous, no Google signals. */
export function useWebsiteAnalytics() {
  const ok = useConsent();
  const id = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
  useEffect(() => {
    if (!ok || !id || document.getElementById("ga4")) return;
    const w = window as unknown as { dataLayer: unknown[]; gtag: (...a: unknown[]) => void };
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() { w.dataLayer.push(arguments); }; // gtag expects the arguments object
    w.gtag("js", new Date());
    w.gtag("config", id, { allow_google_signals: false, allow_ad_personalization_signals: false });
    const s = document.createElement("script");
    s.id = "ga4";
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(s);
  }, [ok, id]);
}
