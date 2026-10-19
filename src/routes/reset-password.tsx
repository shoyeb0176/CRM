import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LedgerLines } from "@/components/marketing/marketing-shell";
import { Button } from "@/components/ui/button";

import { friendlyError } from "@/lib/friendly-error";
export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Inuberry" },
      { name: "description", content: "Set a new password for your Inuberry account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  // Which account this form changes. updateUser() acts on whoever is signed in, so an
  // expired invite/reset link used in a signed-in browser would silently change that
  // other account's password. Show the account, and stop if the link failed.
  const [account, setAccount] = useState<{ email: string | null; linkError: string | null } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
    const linkError = params.get("error_description");
    supabase.auth.getSession().then(({ data }) => {
      setAccount({ email: data.session?.user.email ?? null, linkError });
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. Welcome back.");
      navigate({ to: "/app" });
    } catch (err) {
      toast.error(friendlyError(err, "Could not reset password"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-background font-sans text-foreground">
      <LedgerLines />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="border-b border-border">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
            <Link to="/" className="font-display text-2xl uppercase">Inuberry</Link>
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center px-6 py-12">
          <form onSubmit={handleSubmit} className="w-full max-w-md border border-border bg-card shadow-sm p-8">
            <div className="mb-6 border-b border-border pb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              RESET / NEW_PASSWORD
            </div>
            <h1 className="mb-2 font-display text-3xl uppercase">Set new password</h1>
            {account && (account.linkError || !account.email) ? (
              <div className="space-y-4 text-sm">
                <p className="text-destructive">{account.linkError ?? "This link is invalid or has expired."}</p>
                <p className="text-muted-foreground">Ask for a new invitation, or request a new reset link from the sign-in page.</p>
                <Link to="/auth" className="inline-block font-mono text-xs uppercase tracking-wider underline">Go to sign in</Link>
              </div>
            ) : (<>
            <p className="mb-6 text-sm text-muted-foreground">
              {account?.email ? <>Setting the password for <strong className="text-foreground">{account.email}</strong>. </> : null}
              Choose a strong password (8+ characters).
            </p>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">New password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full border border-input bg-card shadow-xs px-3 py-2.5 text-sm focus:border-foreground focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">Confirm password</span>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  className="w-full border border-input bg-card shadow-xs px-3 py-2.5 text-sm focus:border-foreground focus:outline-none"
                />
              </label>
              <Button variant="kitSolid" size="kit"
                type="submit"
                disabled={loading || !account?.email}
                className="w-full px-4 py-3 tracking-wider"
              >
                {loading ? "Saving…" : "Update password"}
              </Button>
            </div>
            </>)}
          </form>
        </main>
      </div>
    </div>
  );
}
