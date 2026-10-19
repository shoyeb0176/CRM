import { CodeBlock } from "@/components/ui/code-block";
import { createFileRoute } from "@tanstack/react-router";
import { SettingsShell } from "@/components/settings/settings-shell";
import { useAdminContext } from "@/lib/settings/use-admin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Bot, Copy, KeyRound, Plus, Send, Trash2, Webhook } from "lucide-react";
import {
  useApiKeys,
  useApiRequestLogs,
  useWebhookDeliveries,
  useWebhookEndpoints,
} from "@/lib/api/use-developer";
import {
  createApiKey,
  createPersonalKey,
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  revokeApiKey,
  sendTestWebhook,
  updateWebhookEndpoint,
} from "@/lib/api/developer.functions";
import { Button } from "@/components/ui/button";

import { friendlyError } from "@/lib/friendly-error";
import { SectionTitle } from "@/components/ui/section-title";
export const Route = createFileRoute("/_authenticated/app/settings/developer")({
  head: () => ({
    meta: [
      { title: "Developer — Settings" },
      { name: "description", content: "API keys, webhooks and request history for your workspace." },
    ],
  }),
  component: DeveloperPage,
});

const RESOURCES = ["companies", "contacts", "leads", "deals", "products", "invoices", "projects", "tasks"];

function DeveloperPage() {
  const { orgId, isAdmin } = useAdminContext();
  const qc = useQueryClient();

  const keys = useApiKeys(orgId ?? undefined);
  const hooks = useWebhookEndpoints(orgId ?? undefined);
  const deliveries = useWebhookDeliveries(orgId ?? undefined);
  const logs = useApiRequestLogs(orgId ?? undefined);

  const doCreateKey = useServerFn(createApiKey);
  const doRevokeKey = useServerFn(revokeApiKey);
  const doCreateHook = useServerFn(createWebhookEndpoint);
  const doUpdateHook = useServerFn(updateWebhookEndpoint);
  const doDeleteHook = useServerFn(deleteWebhookEndpoint);
  const doTestHook = useServerFn(sendTestWebhook);

  const [keyName, setKeyName] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [hookName, setHookName] = useState("");
  const [hookUrl, setHookUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  async function addKey() {
    if (!orgId || !keyName.trim()) return;
    setBusy(true);
    try {
      const res = await doCreateKey({
        data: { orgId, name: keyName.trim(), scopes: canWrite ? ["read", "write"] : ["read"] },
      });
      setNewToken(res.token);
      setKeyName("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("Key created — copy it now, it won't be shown again");
    } catch (e) {
      toast.error(friendlyError(e, "Could not create the key"));
    } finally {
      setBusy(false);
    }
  }

  async function addHook() {
    if (!orgId || !hookName.trim() || !hookUrl.trim()) return;
    setBusy(true);
    try {
      await doCreateHook({ data: { orgId, name: hookName.trim(), url: hookUrl.trim(), events: [] } });
      setHookName("");
      setHookUrl("");
      qc.invalidateQueries({ queryKey: ["webhook-endpoints"] });
      toast.success("Endpoint added");
    } catch (e) {
      toast.error(friendlyError(e, "Could not add the endpoint"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsShell title="Developer" breadcrumb="settings / developer">
      {!isAdmin && (
        <div className="mb-6 border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          You can view this page, but only owners and admins can create keys or endpoints.
        </div>
      )}

      <ConnectAi orgId={orgId} baseUrl={baseUrl} />

      {/* API keys */}
      <Section icon={<KeyRound className="size-4" />} title="API keys" code="01">
        {newToken && (
          <div className="mb-4 border border-primary/40 bg-primary/5 p-4">
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Copy this key now — it is shown once
            </div>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate bg-background px-3 py-2 text-sm">{newToken}</code>
              <Button variant="bare" size="bare"
                className="flex items-center gap-1 border border-border px-3 py-2 text-xs hover:bg-foreground/5"
                onClick={() => {
                  navigator.clipboard.writeText(newToken);
                  toast.success("Copied");
                }}
              >
                <Copy className="size-3" /> Copy
              </Button>
              <Button variant="bare" size="bare" className="border border-border px-3 py-2 text-xs" onClick={() => setNewToken(null)}>
                Done
              </Button>
            </div>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            className="min-w-48 flex-1 border border-input bg-card shadow-xs px-3 py-2 text-sm"
            placeholder="Key name (e.g. Zapier)"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            disabled={!isAdmin}
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={canWrite} onChange={(e) => setCanWrite(e.target.checked)} disabled={!isAdmin} />
            Allow changes (write)
          </label>
          <Button variant="kit" size="kit"
            className="flex gap-1 px-3 py-2"
            onClick={addKey}
            disabled={!isAdmin || busy || !keyName.trim()}
          >
            <Plus className="size-3" /> Create key
          </Button>
        </div>

        <Table
          head={["Name", "Prefix", "Access", "Last used", "Status", ""]}
          rows={(keys.data ?? []).map((k) => [
            k.name,
            <code key="p" className="text-xs">{k.prefix}…</code>,
            (k.scopes ?? []).join(", "),
            k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never",
            k.revoked_at ? "Revoked" : "Active",
            k.revoked_at || !isAdmin ? (
              ""
            ) : (
              <Button variant="bare" size="bare"
                key="r"
                className="text-xs text-destructive hover:underline"
                onClick={async () => {
                  await doRevokeKey({ data: { id: k.id } });
                  qc.invalidateQueries({ queryKey: ["api-keys"] });
                  toast.success("Key revoked");
                }}
              >
                Revoke
              </Button>
            ),
          ])}
          empty="No keys yet."
        />
      </Section>

      {/* Webhooks */}
      <Section icon={<Webhook className="size-4" />} title="Webhooks" code="02">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            className="min-w-40 flex-1 border border-input bg-card shadow-xs px-3 py-2 text-sm"
            placeholder="Endpoint name"
            value={hookName}
            onChange={(e) => setHookName(e.target.value)}
            disabled={!isAdmin}
          />
          <input
            className="min-w-64 flex-[2] border border-input bg-card shadow-xs px-3 py-2 text-sm"
            placeholder="https://example.com/hooks/inuberry"
            value={hookUrl}
            onChange={(e) => setHookUrl(e.target.value)}
            disabled={!isAdmin}
          />
          <Button variant="kit" size="kit"
            className="flex gap-1 px-3 py-2"
            onClick={addHook}
            disabled={!isAdmin || busy || !hookName.trim() || !hookUrl.trim()}
          >
            <Plus className="size-3" /> Add endpoint
          </Button>
        </div>

        <div className="space-y-px border border-border bg-border">
          {(hooks.data ?? []).length === 0 && (
            <div className="bg-background p-4 text-sm text-muted-foreground">No endpoints yet.</div>
          )}
          {(hooks.data ?? []).map((h) => (
            <div key={h.id} className="bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{h.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{h.url}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    {h.is_active ? "Active" : "Paused"}
                  </span>
                  <Button variant="bare" size="bare"
                    className="border border-border px-3 py-1.5 text-xs hover:bg-foreground/5"
                    disabled={!isAdmin}
                    onClick={async () => {
                      await doUpdateHook({ data: { id: h.id, is_active: !h.is_active } });
                      qc.invalidateQueries({ queryKey: ["webhook-endpoints"] });
                    }}
                  >
                    {h.is_active ? "Pause" : "Resume"}
                  </Button>
                  <Button variant="bare" size="bare"
                    className="flex items-center gap-1 border border-border px-3 py-1.5 text-xs hover:bg-foreground/5"
                    disabled={!isAdmin}
                    onClick={async () => {
                      const res = await doTestHook({ data: { id: h.id } });
                      qc.invalidateQueries({ queryKey: ["webhook-deliveries"] });
                      res.ok ? toast.success("Test delivered") : toast.error(res.error ?? "Delivery failed");
                    }}
                  >
                    <Send className="size-3" /> Test
                  </Button>
                  <Button variant="bare" size="bare" aria-label="Delete webhook"
                    className="border border-border p-1.5 text-destructive hover:bg-destructive/10"
                    disabled={!isAdmin}
                    onClick={async () => {
                      await doDeleteHook({ data: { id: h.id } });
                      qc.invalidateQueries({ queryKey: ["webhook-endpoints"] });
                    }}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 font-mono text-xs text-muted-foreground">
                Signing secret: {h.secret.slice(0, 12)}…
                {h.last_delivery_at ? ` · last delivery ${new Date(h.last_delivery_at).toLocaleString()}` : ""}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Recent deliveries
          </div>
          <Table
            head={["Event", "Status", "Code", "When"]}
            rows={(deliveries.data ?? []).map((d) => [
              d.event,
              d.status,
              String(d.response_code ?? "—"),
              new Date(d.created_at).toLocaleString(),
            ])}
            empty="Nothing delivered yet."
          />
        </div>
      </Section>

      {/* Docs */}
      <Section title="Using the API" code="03">
        <p className="mb-3 text-sm text-muted-foreground">
          Send your key as a bearer token. Every request is limited to this workspace's data and the access you
          granted the key.
        </p>
        <CodeBlock language="bash" code={`curl ${baseUrl}/api/public/v1/companies \\
  -H "Authorization: Bearer YOUR_KEY"

curl -X POST ${baseUrl}/api/public/v1/leads \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Acme","email":"hi@acme.com"}'`} />
        <div className="mt-3 text-sm text-muted-foreground">
          Available collections: {RESOURCES.join(", ")}. Add <code>?q=</code>, <code>?status=</code>,{" "}
          <code>?limit=</code> and <code>?offset=</code> to list requests. Archived companies, contacts, products and projects
          are left out unless you add <code>?include_archived=true</code>.
        </div>
      </Section>

      <Section title="Recent API requests" code="04">
        <Table
          head={["Method", "Path", "Status", "Time", "When"]}
          rows={(logs.data ?? []).map((l) => [
            l.method,
            l.path,
            String(l.status),
            l.duration_ms ? `${l.duration_ms} ms` : "—",
            new Date(l.created_at).toLocaleString(),
          ])}
          empty="No API requests yet."
        />
      </Section>
    </SettingsShell>
  );
}

function Section({
  title,
  code,
  icon,
  children,
}: {
  title: string;
  code: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 border border-border bg-card shadow-sm p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{code}</span>
        {icon}
        <SectionTitle>{title}</SectionTitle>
      </div>
      {children}
    </section>
  );
}

function Table({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  if (!rows.length) return <div className="border border-border p-4 text-sm text-muted-foreground bg-card shadow-sm">{empty}</div>;
  return (
    <div className="overflow-x-auto border border-border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {head.map((h, i) => (
              <th key={i} className="p-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {r.map((c, j) => (
                <td key={j} className="p-3 align-middle">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Outside AI apps (MCP): the server URL, apps you connected, and your personal developer keys. */
function ConnectAi({ orgId, baseUrl }: { orgId: string | null; baseUrl: string }) {
  const qc = useQueryClient();
  const doCreate = useServerFn(createPersonalKey);
  const [name, setName] = useState("");
  const [days, setDays] = useState<30 | 90 | 365>(90);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mcpUrl = `${baseUrl}/mcp`;

  const apps = useQuery({
    queryKey: ["mcp-connections"],
    queryFn: async () => (await supabase.from("mcp_connections")
      .select("id, client_id, client_name, created_at, last_used_at, revoked_at, organizations:org_id(name)")
      .order("created_at", { ascending: false })).data ?? [],
  });
  const keys = useQuery({
    queryKey: ["personal-keys"],
    queryFn: async () => (await supabase.from("personal_api_keys")
      .select("id, name, prefix, expires_at, last_used_at, revoked_at, organizations:org_id(name)")
      .order("created_at", { ascending: false })).data ?? [],
  });

  async function createKey() {
    if (!orgId || !name.trim()) return;
    setBusy(true);
    try {
      const res = await doCreate({ data: { orgId, name: name.trim(), days } });
      setToken(res.token);
      setName("");
      qc.invalidateQueries({ queryKey: ["personal-keys"] });
    } catch (e) {
      toast.error(friendlyError(e, "Could not create the key"));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(id: string, clientId: string) {
    // Stop the MCP server accepting it (checked on every call), then revoke the app's sign-in.
    const { error } = await supabase.from("mcp_connections").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    await supabase.auth.oauth.revokeGrant({ clientId }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["mcp-connections"] });
    toast.success("Disconnected");
  }

  async function revokeKey(id: string) {
    const { error } = await supabase.from("personal_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["personal-keys"] });
    toast.success("Key revoked");
  }

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success("Copied"); };

  return (
    <Section icon={<Bot className="size-4" />} title="Connect your AI" code="00">
      <p className="mb-3 text-sm text-muted-foreground">
        Let Claude Code, Codex, ChatGPT, Claude.ai and other AI apps use this workspace with your role. Add this server
        to the app; it opens an Inuberry sign-in where you choose the workspace. Changes the app asks for follow your AI
        approval rules. <Link to="/docs/$slug" params={{ slug: "mcp" }} className="text-primary hover:underline">Setup guide ›</Link>
      </p>
      <div className="mb-6 flex items-center gap-2">
        <code className="flex-1 truncate border border-border bg-muted/30 px-3 py-2 text-sm">{mcpUrl}</code>
        <Button variant="bare" size="bare" className="flex items-center gap-1 border border-border px-3 py-2 text-xs hover:bg-foreground/5" onClick={() => copy(mcpUrl)}>
          <Copy className="size-3" /> Copy
        </Button>
      </div>

      <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Connected apps</div>
      <Table
        head={["App", "Workspace", "Last used", "Status", ""]}
        rows={(apps.data ?? []).map((a) => [
          a.client_name ?? a.client_id.slice(0, 8),
          (a.organizations as { name: string } | null)?.name ?? "—",
          a.last_used_at ? new Date(a.last_used_at).toLocaleString() : "Never",
          a.revoked_at ? "Disconnected" : "Connected",
          a.revoked_at ? "" : (
            <Button variant="bare" size="bare" key="d" className="text-xs text-destructive hover:underline" onClick={() => disconnect(a.id, a.client_id)}>Disconnect</Button>
          ),
        ])}
        empty="No AI apps connected yet."
      />

      <div className="mb-2 mt-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">Personal developer keys</div>
      <p className="mb-3 text-sm text-muted-foreground">
        For scripts and tools that can't open a sign-in page. A key acts as you, in the workspace you're in now, with
        your current role. Send it as <code>Authorization: Bearer inbp_…</code> to {mcpUrl}.
      </p>
      {token && (
        <div className="mb-4 border border-primary/40 bg-primary/5 p-4">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Copy this key now — it is shown once</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate bg-background px-3 py-2 text-sm">{token}</code>
            <Button variant="bare" size="bare" className="flex items-center gap-1 border border-border px-3 py-2 text-xs hover:bg-foreground/5" onClick={() => copy(token)}>
              <Copy className="size-3" /> Copy
            </Button>
            <Button variant="bare" size="bare" className="border border-border px-3 py-2 text-xs" onClick={() => setToken(null)}>Done</Button>
          </div>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className="min-w-48 flex-1 border border-input bg-card shadow-xs px-3 py-2 text-sm" placeholder="Key name (e.g. Codex on my laptop)"
          value={name} onChange={(e) => setName(e.target.value)} />
        <select aria-label="Expires after" value={days} onChange={(e) => setDays(Number(e.target.value) as 30 | 90 | 365)}
          className="border border-input bg-card shadow-xs px-2 py-2 text-sm">
          <option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>1 year</option>
        </select>
        <Button variant="kit" size="kit" className="flex gap-1 px-3 py-2"
          onClick={createKey} disabled={busy || !orgId || !name.trim()}>
          <Plus className="size-3" /> Create key
        </Button>
      </div>
      <Table
        head={["Name", "Key", "Workspace", "Expires", "Last used", ""]}
        rows={(keys.data ?? []).map((k) => {
          const expired = !!k.expires_at && new Date(k.expires_at) <= new Date();
          return [
            k.name,
            <code key="p" className="text-xs">{k.prefix}…</code>,
            (k.organizations as { name: string } | null)?.name ?? "—",
            k.revoked_at ? "Revoked" : expired ? "Expired" : k.expires_at ? new Date(k.expires_at).toLocaleDateString() : "Never",
            k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never",
            k.revoked_at || expired ? "" : (
              <Button variant="bare" size="bare" key="r" className="text-xs text-destructive hover:underline" onClick={() => revokeKey(k.id)}>Revoke</Button>
            ),
          ];
        })}
        empty="No personal keys yet."
      />
    </Section>
  );
}
