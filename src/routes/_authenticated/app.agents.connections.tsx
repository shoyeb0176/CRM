import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AgentsShell } from "@/components/agents/agents-shell";
import { useOrgId } from "@/lib/crm/use-org";
import { supabase } from "@/integrations/supabase/client";
import { useCommChannels } from "@/lib/comms/use-comms";
import { StatusBadge } from "@/components/crm/status-badge";
import { SectionTitle } from "@/components/ui/section-title";

export const Route = createFileRoute("/_authenticated/app/agents/connections")({
  head: () => ({ meta: [{ title: "Connections — Inuberry" }] }),
  component: ConnectionsPage,
});

// Services agents can't reach yet. Shown so people know what's planned; nothing to switch on.
const COMING_SOON = [
  { name: "Gmail and Google Calendar", note: "Read mail and create events (agents can already send email from your company mailbox)." },
  { name: "Outlook and Microsoft 365 calendar", note: "Read mail and create events." },
  { name: "HubSpot", note: "Sync contacts, deals and activities." },
  { name: "QuickBooks", note: "Sync accounting and tax records." },
  { name: "Zapier and Make", note: "Start a Zap or scenario from an agent." },
  { name: "Custom REST API and webhooks", note: "Call any HTTPS endpoint from an agent." },
  { name: "MCP servers", note: "Let agents use tools from another MCP server. (AI apps can already connect to Inuberry: Settings › Developer.)" },
];

/** What agents can reach outside Inuberry today, read from the real settings, and what's coming. */
function ConnectionsPage() {
  const orgId = useOrgId();
  const channels = useCommChannels(orgId ?? undefined);
  // Members who aren't admins can't read the mailbox row; then "ask an admin" is the honest answer.
  const mailbox = useQuery({
    queryKey: ["agent-conn-mailbox", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("org_mail_settings").select("from_email,verified_at,last_error").eq("org_id", orgId!).maybeSingle();
      if (error) return { visible: false as const };
      return { visible: true as const, row: data };
    },
  });
  const active = (kind: string) => (channels.data ?? []).filter((c) => c.kind === kind && c.is_active);
  const box = mailbox.data;
  const ready = [
    {
      name: "Email (your company mailbox)",
      tool: "Send email",
      state: !box ? "…" : !box.visible ? "Ask an admin" : box.row ? (box.row.last_error ? "Needs attention" : "Ready") : "Not set up",
      detail: box?.visible && box.row ? `Sends as ${box.row.from_email}${box.row.last_error ? `. Last error: ${box.row.last_error}` : ""}` : "Agents send email only from the mailbox in Settings › Email, and every email waits for your approval.",
      to: "/app/settings/email", cta: box?.visible && box.row ? "Mailbox settings" : "Set up the mailbox",
    },
    {
      name: "Slack",
      tool: "Post to team chat",
      state: active("slack").length ? "Ready" : "Not set up",
      detail: active("slack").length ? `${active("slack").length} channel${active("slack").length === 1 ? "" : "s"}` : "Add a Slack incoming webhook in Communications.",
      to: "/app/comms/settings", cta: "Channels",
    },
    {
      name: "Microsoft Teams",
      tool: "Post to team chat",
      state: active("teams").length ? "Ready" : "Not set up",
      detail: active("teams").length ? `${active("teams").length} channel${active("teams").length === 1 ? "" : "s"}` : "Add a Teams incoming webhook in Communications.",
      to: "/app/comms/settings", cta: "Channels",
    },
  ];
  const tone = (s: string) => (s === "Ready" ? "success" : s === "Needs attention" ? "warning" : "default");

  return (
    <AgentsShell title="Connections">
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        What your agents can reach outside Inuberry. Give an agent the matching tool (New agent › Tools) and it can use the
        connection; anything it sends waits in Inbox › Approvals first.
      </p>
      <SectionTitle>Ready to use</SectionTitle>
      <div className="mb-8 mt-3 grid gap-3 md:grid-cols-3">
        {ready.map((c) => (
          <div key={c.name} className="flex flex-col gap-2 border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium">{c.name}</div>
              <StatusBadge tone={tone(c.state)}>{c.state}</StatusBadge>
            </div>
            <p className="text-xs text-muted-foreground">Agent tool: {c.tool}</p>
            <p className="text-sm text-muted-foreground">{c.detail}</p>
            <Link to={c.to} className="mt-auto text-sm text-primary underline-offset-4 hover:underline">{c.cta} →</Link>
          </div>
        ))}
      </div>
      <SectionTitle>Coming soon</SectionTitle>
      <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {COMING_SOON.map((c) => (
          <div key={c.name} className="flex flex-col gap-1 border border-dashed border-border p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium">{c.name}</div>
              <StatusBadge tone="default">Coming soon</StatusBadge>
            </div>
            <p className="text-sm text-muted-foreground">{c.note}</p>
          </div>
        ))}
      </div>
    </AgentsShell>
  );
}
