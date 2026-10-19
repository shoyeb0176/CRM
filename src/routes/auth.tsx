import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { LedgerLines } from "@/components/marketing/marketing-shell";
import { Button } from "@/components/ui/button";


import { friendlyError } from "@/lib/friendly-error";
export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { mode?: "signin" | "signup"; redirect?: string } => ({
    ...(s.mode === "signin" || s.mode === "signup" ? { mode: s.mode } : {}),
    ...(typeof s.redirect === "string" ? { redirect: s.redirect } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Inuberry" },
      { name: "description", content: "Sign in or create a new Inuberry workspace." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode: initialMode, redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);

  // Where to go after signing in: only paths on this site. One with a query (e.g. the AI-app consent
  // page, /oauth/consent?authorization_id=…) is opened as a full URL so the query survives.
  const next = redirect?.startsWith("/") && !redirect.startsWith("//") ? redirect : "/app";
  const goNext = () => (next.includes("?") ? window.location.assign(next) : navigate({ to: next }));

  // If already signed in, leave
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) goNext();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, redirect]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (forgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Check your email for the reset link.");
        setForgot(false);
        return;
      }
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/app`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Account created. Check your inbox to confirm your email.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        goNext();
      }
    } catch (err) {
      toast.error(friendlyError(err, "Authentication failed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    // Off Lovable: Google sign-in through our own Supabase Auth (Google provider set up in Supabase).
    if (import.meta.env.VITE_OAUTH_MODE === "native") {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + next },
      });
      if (error) {
        toast.error(error.message ?? "Google sign-in failed");
        setLoading(false);
      }
      return; // the browser is redirected to Google
    }
    const res = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/app",
    });
    if (res.error) {
      toast.error(res.error.message ?? "Google sign-in failed");
      setLoading(false);
      return;
    }
    if (res.redirected) return;
    goNext();
  }

  return (
    <div className="relative min-h-screen bg-background font-sans text-foreground">
      <LedgerLines />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="border-b border-border">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
            <Link to="/" className="font-display text-2xl uppercase">Inuberry</Link>
            <Link
              to="/"
              className="font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              ← Home
            </Link>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-md border border-border bg-card p-8 shadow-sm">
            <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {forgot ? "RESET / PASSWORD" : mode === "signup" ? "CREATE / WORKSPACE" : "ACCESS / WORKSPACE"}
              </span>
              <span className="size-2 bg-primary" />
            </div>
            <h1 className="mb-1 font-display text-3xl uppercase tracking-tight">
              {forgot ? "Forgot password" : mode === "signup" ? "Start free" : "Welcome back"}
            </h1>
            <p className="mb-6 text-sm text-muted-foreground">
              {forgot
                ? "We'll email you a link to reset your password."
                : mode === "signup"
                ? "Create your Inuberry workspace in under a minute."
                : "Sign in to your Inuberry workspace."}
            </p>

            {!forgot && (
              <>
                <Button variant="kit" size="kit"
                  type="button"
                  onClick={handleGoogle}
                  disabled={loading}
                  className="mb-4 flex w-full gap-3 border-foreground/20 px-4 py-3 tracking-wider"
                >
                  <GoogleIcon />
                  Continue with Google
                </Button>
                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">or</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && !forgot && (
                <Field label="Full name" value={fullName} onChange={setFullName} required />
              )}
              <Field label="Email" type="email" value={email} onChange={setEmail} required />
              {!forgot && (
                <Field
                  label="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  required
                  minLength={mode === "signup" ? 8 : undefined}
                />
              )}

              <Button variant="kitSolid" size="kit"
                type="submit"
                disabled={loading}
                className="w-full px-4 py-3 tracking-wider"
              >
                {loading
                  ? "Working…"
                  : forgot
                  ? "Send reset link"
                  : mode === "signup"
                  ? "Create workspace"
                  : "Sign in"}
              </Button>
            </form>

            <div className="mt-6 flex items-center justify-between text-xs">
              {forgot ? (
                <Button variant="bare" size="bare" onClick={() => setForgot(false)} className="text-muted-foreground hover:text-foreground">
                  ← Back to sign in
                </Button>
              ) : (
                <>
                  <Button variant="bare" size="bare"
                    onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                    className="font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  >
                    {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
                  </Button>
                  {mode === "signin" && (
                    <Button variant="bare" size="bare"
                      onClick={() => setForgot(true)}
                      className="font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      Forgot?
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", required, minLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        className="w-full border border-input bg-card shadow-xs px-3 py-2.5 font-sans text-sm transition-colors focus:border-foreground focus:outline-none"
      />
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.5 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.3 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5c10.8 0 19.5-8.7 19.5-19.5 0-1.3-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.3 29 4.5 24 4.5c-7.3 0-13.5 4.1-16.7 10.2z"/>
      <path fill="#4CAF50" d="M24 43.5c5 0 9.6-1.7 13.2-4.7l-6.1-5.2c-2 1.4-4.4 2.2-7.1 2.2-5.3 0-9.7-3-11.3-7.5l-6.5 5C9.5 39.3 16.2 43.5 24 43.5z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.1 5.2c-.4.4 6.8-5 6.8-14.8 0-1.3-.1-2.3-.4-3.5z"/>
    </svg>
  );
}
