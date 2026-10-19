// Consent screen for AI apps connecting to Inuberry over MCP (Supabase OAuth 2.1 server).
// Supabase sends the browser here with ?authorization_id=…; the user (already signed in by the
// _authenticated layout) picks the workspace the app may use, then allows or denies.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { useCurrentOrgId, useMyMemberships } from "@/lib/use-memberships";
import { ROLE_LABELS } from "@/lib/settings/use-admin";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/oauth/consent")({
  validateSearch: (s: Record<string, unknown>): { authorization_id?: string } =>
    typeof s.authorization_id === "string" ? { authorization_id: s.authorization_id } : {},
  head: () => ({ meta: [{ title: "Connect an app — Inuberry" }] }),
  component: ConsentPage,
});

type Details = { client: { id: string; name: string; uri: string; logo_uri: string }; user: { email: string }; scope: string };

function ConsentPage() {
  const { authorization_id: authId } = Route.useSearch();
  const memberships = useMyMemberships();
  const current = useCurrentOrgId();
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authId) { setError("This link is missing its authorization id. Start the connection again from your AI app."); return; }
    supabase.auth.oauth.getAuthorizationDetails(authId).then(({ data, error }) => {
      if (error) return setError(error.message);
      // Already approved earlier: Supabase hands back where to send the browser.
      if (data && "redirect_url" in data) { window.location.assign(data.redirect_url); return; }
      setDetails(data as Details);
    });
  }, [authId]);

  const orgs = memberships.data ?? [];
  useEffect(() => {
    if (!orgId && orgs.length) setOrgId(orgs.find((m) => m.org_id === current.data)?.org_id ?? orgs[0].org_id);
  }, [orgs, current.data, orgId]);

  async function decide(allow: boolean) {
    if (!authId || !details) return;
    setBusy(true);
    try {
      if (allow) {
        const { data: u } = await getSessionUser();
        // Which workspace this app may use; the MCP server reads it on every call.
        const { error: e1 } = await supabase.from("mcp_connections").upsert(
          { user_id: u.user!.id, client_id: details.client.id, client_name: details.client.name, org_id: orgId, revoked_at: null },
          { onConflict: "user_id,client_id" },
        );
        if (e1) throw e1;
        const { error: e2 } = await supabase.auth.oauth.approveAuthorization(authId);
        if (e2) throw e2;
      } else {
        const { error: e3 } = await supabase.auth.oauth.denyAuthorization(authId);
        if (e3) throw e3;
      }
      // Supabase redirects the browser back to the app.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 font-sans text-foreground">
      <div className="w-full max-w-md border border-border bg-card">
        <div className="border-b border-border px-6 py-4 font-display text-xl uppercase tracking-tight">Inuberry</div>
        <div className="space-y-5 p-6">
          {error && <p role="alert" className="border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
          {!error && !details && <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</p>}
          {details && (
            <>
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <h1 className="font-heading text-lg">{details.client.name || "An app"} wants to use your Inuberry workspace</h1>
                  {details.client.uri && <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{details.client.uri}</div>}
                </div>
              </div>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>• It can read the records your role can see (customers, leads, deals, invoices, stock, projects).</li>
                <li>• Changes it asks for follow your workspace's AI rules: usually someone approves them in Inuberry first.</li>
                <li>• You can disconnect it any time in Settings › Developer.</li>
              </ul>
              <label className="block">
                <span className="mb-1.5 block font-mono text-xs uppercase tracking-widest text-muted-foreground">Workspace</span>
                <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="h-10 w-full border border-input bg-card shadow-xs px-3 text-sm">
                  {orgs.map((m) => (
                    <option key={m.org_id} value={m.org_id}>{m.organizations?.name} · {ROLE_LABELS[m.role] ?? m.role}</option>
                  ))}
                </select>
              </label>
              <div className="font-mono text-xs text-muted-foreground">Signed in as {details.user.email}</div>
              <div className="flex gap-2">
                <Button variant="kitSolid" size="kit" disabled={busy || !orgId} onClick={() => decide(true)} className="h-10 flex-1 bg-primary text-primary-foreground hover:opacity-90">Allow</Button>
                <Button variant="kit" size="kit" disabled={busy} onClick={() => decide(false)} className="h-10 flex-1 hover:bg-accent">Deny</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
