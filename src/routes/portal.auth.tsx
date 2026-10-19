import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

import { friendlyError } from "@/lib/friendly-error";
export const Route = createFileRoute("/portal/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Customer Portal — Inuberry" }] }),
  component: PortalAuth,
});

function PortalAuth() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSessionUser().then(({ data }) => {
      if (data.user) navigate({ to: "/portal" });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/portal` },
        });
        if (error) throw error;
        toast.success("Account created. Check your inbox to confirm, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/portal" });
      }
    } catch (err) {
      toast.error(friendlyError(err, "Authentication failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 font-sans text-foreground">
      <div className="w-full max-w-md border border-border bg-card shadow-sm p-8">
        <Link to="/" className="font-display text-2xl uppercase">Inuberry</Link>
        <div className="mt-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Customer Portal
        </div>
        <h1 className="mt-6 font-display text-2xl uppercase">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use the email your supplier added to the portal. New users sign up with that email to activate access.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border border-input bg-card shadow-xs px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full border border-input bg-card shadow-xs px-3 py-2 text-sm"
            />
          </div>
          <Button variant="kitSolid" size="kit"
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 tracking-wider"
          >
            {loading ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm">
          {mode === "signin" ? (
            <Button variant="bare" size="bare" onClick={() => setMode("signup")} className="text-muted-foreground hover:text-foreground">
              New customer? Create an account
            </Button>
          ) : (
            <Button variant="bare" size="bare" onClick={() => setMode("signin")} className="text-muted-foreground hover:text-foreground">
              Already have access? Sign in
            </Button>
          )}
        </div>
        <div className="mt-6 border-t border-border pt-4 text-center">
          <Link to="/" className="font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground">
            ← Back to Inuberry
          </Link>
        </div>
      </div>
    </div>
  );
}
