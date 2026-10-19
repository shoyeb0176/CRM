import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CONSENT_EVENT } from "@/lib/analytics";

const STORAGE_KEY = "inuberry.cookie.consent";

type Choice = "accepted" | "necessary";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      /* SSR / blocked storage */
    }
  }, []);

  const choose = (choice: Choice) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ choice, at: new Date().toISOString() }));
    } catch {
      /* ignore */
    }
    setVisible(false);
    window.dispatchEvent(new Event(CONSENT_EVENT));
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-3xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur md:inset-x-auto md:right-6 md:bottom-6 md:p-5"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-xs text-muted-foreground md:max-w-xl">
          We use strictly necessary cookies to keep you signed in, and optional
          analytics cookies to improve the product. Read our{" "}
          <Link to="/legal/privacy" className="text-primary underline">privacy policy</Link>.
        </p>
        <div className="flex gap-2">
          <Button variant="kit" size="kit"
            onClick={() => choose("necessary")}
            className="px-3 py-1.5 tracking-wider"
          >
            Necessary only
          </Button>
          <Button variant="kitSolid" size="kit"
            onClick={() => choose("accepted")}
            className="px-3 py-1.5 tracking-wider"
          >
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
