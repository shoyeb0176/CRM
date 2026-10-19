// Tells a tab that's been open across a release that a new version is out, and recovers a tab whose
// old page files were replaced (a failed import of a page chunk) by reloading once.
import { useEffect } from "react";
import { toast } from "sonner";
import { APP_VERSION, isNewerVersion } from "@/lib/version";

const EVERY_MS = 5 * 60_000;
const RELOADED = "inuberry.chunk-reload";

export function useNewVersionPrompt() {
  useEffect(() => {
    let last = 0;
    let shown = false;
    const check = async () => {
      if (shown || Date.now() - last < 60_000 || document.visibilityState === "hidden") return;
      last = Date.now();
      try {
        const r = await fetch("/api/public/version", { cache: "no-store" });
        const { version } = (await r.json()) as { version?: string };
        if (version && isNewerVersion(version, APP_VERSION)) {
          shown = true;
          toast("A new version of Inuberry is ready", {
            id: "new-version", duration: Infinity,
            description: `You're on ${APP_VERSION}; ${version} is out. Refresh to get it (anything you're typing stays until you do).`,
            action: { label: "Refresh", onClick: () => window.location.reload() },
          });
        }
      } catch { /* offline or the endpoint is missing: try again later */ }
    };
    // A page file from the old release is gone: reload once to pick up the new one.
    const onPreloadError = (e: Event) => {
      try {
        if (sessionStorage.getItem(RELOADED)) return;
        sessionStorage.setItem(RELOADED, "1");
      } catch { return; }
      e.preventDefault();
      window.location.reload();
    };
    const t = setInterval(check, EVERY_MS);
    const first = setTimeout(check, 30_000);
    window.addEventListener("focus", check);
    window.addEventListener("vite:preloadError", onPreloadError);
    // A successful start clears the guard, so a later release can reload again.
    const clear = setTimeout(() => { try { sessionStorage.removeItem(RELOADED); } catch { /* ignore */ } }, 10_000);
    return () => {
      clearInterval(t); clearTimeout(first); clearTimeout(clear);
      window.removeEventListener("focus", check);
      window.removeEventListener("vite:preloadError", onPreloadError);
    };
  }, []);
}
