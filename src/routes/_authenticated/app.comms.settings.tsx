import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/app-shell";
import { useAdminContext } from "@/lib/settings/use-admin";
import { MAILBOX_PROVIDERS, useCommAccounts, useCommChannelMutations, useCommChannels } from "@/lib/comms/use-comms";
import { testCommChannel } from "@/lib/comms/comms.functions";
import { ArrowLeft, Send, Trash2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

import { friendlyError } from "@/lib/friendly-error";
import { SectionTitle } from "@/components/ui/section-title";
export const Route = createFileRoute("/_authenticated/app/comms/settings")({
  head: () => ({
    meta: [
      { title: "Communication connections — Inuberry" },
      { name: "description", content: "Send alerts to Slack or Teams and connect your mailbox and calendar." },
      { property: "og:title", content: "Communication connections" },
      { property: "og:description", content: "Chat delivery and mailbox connections for your workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CommsSettings,
});

function CommsSettings() {
  const { orgId } = useAdminContext();
  const channels = useCommChannels(orgId ?? undefined);
  const accounts = useCommAccounts(orgId ?? undefined);
  const { create, update, remove } = useCommChannelMutations(orgId ?? undefined);
  const test = useServerFn(testCommChannel);

  const [kind, setKind] = useState("slack");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  async function onAdd() {
    if (!orgId || !name.trim() || !url.trim()) return;
    try {
      await create.mutateAsync({ kind, name: name.trim(), webhookUrl: url.trim() });
      setName("");
      setUrl("");
      toast.success("Channel added");
    } catch (e) {
      toast.error(friendlyError(e, "Could not add the channel"));
    }
  }

  async function onTest(id: string) {
    try {
      const res = await test({ data: { channelId: id } });
      channels.refetch();
      if (res.ok) toast.success("Test message sent");
      else toast.error(`Delivery failed (${res.status})`);
    } catch (e) {
      toast.error(friendlyError(e, "Could not send the test"));
    }
  }

  return (
    <AppShell title="Connections" breadcrumb="comms / connections">
      <Link to="/app/comms" className="mb-4 inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Back to communications
      </Link>

      <section className="mb-8 border border-border bg-card">
        <header className="border-b border-border px-5 py-3">
          <SectionTitle>Slack &amp; Teams alerts</SectionTitle>
        </header>
        <div className="space-y-3 p-5">
          <p className="text-sm text-muted-foreground">
            Paste an incoming webhook address from Slack or Microsoft Teams and your automation alerts will be posted there.
          </p>
          <div className="flex flex-wrap gap-2">
            <select className="border border-input bg-card shadow-xs px-2 py-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="slack">Slack</option>
              <option value="teams">Microsoft Teams</option>
            </select>
            <input className="w-44 border border-input bg-card shadow-xs px-3 py-2 text-sm" placeholder="Name (e.g. #sales)" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="min-w-64 flex-1 border border-input bg-card shadow-xs px-3 py-2 text-sm" placeholder="https://hooks.slack.com/services/…" value={url} onChange={(e) => setUrl(e.target.value)} />
            <Button variant="kit" size="kit" className="px-4 py-2" onClick={onAdd} disabled={!name.trim() || !url.trim() || create.isPending}>
              Add
            </Button>
          </div>

          {(channels.data ?? []).length > 0 && (
            <ul className="divide-y divide-border border border-border">
              {(channels.data ?? []).map((ch) => (
                <li key={ch.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="text-sm font-medium">{ch.name}</span>
                  <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{ch.kind}</span>
                  {ch.last_error ? (
                    <span className="text-xs text-destructive">{ch.last_error}</span>
                  ) : ch.last_delivery_at ? (
                    <span className="text-xs text-muted-foreground">Last sent {new Date(ch.last_delivery_at).toLocaleString()}</span>
                  ) : null}
                  <div className="ml-auto flex items-center gap-3">
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <input type="checkbox" checked={ch.is_active} onChange={(e) => update.mutate({ id: ch.id, patch: { is_active: e.target.checked } })} />
                      Active
                    </label>
                    <Button variant="bare" size="bare" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => onTest(ch.id)}>
                      <Send className="size-3" /> Test
                    </Button>
                    <Button variant="bare" size="bare" className="text-muted-foreground hover:text-destructive" aria-label="Remove channel" onClick={() => remove.mutate(ch.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="border border-border bg-card">
        <header className="border-b border-border px-5 py-3">
          <SectionTitle>Mailbox &amp; calendar</SectionTitle>
        </header>
        <div className="space-y-3 p-5">
          <p className="text-sm text-muted-foreground">
            Bringing emails and meetings in automatically needs a one-time approval with Google or Microsoft for your
            company. Until that is set up, you can log emails, meetings and calls by hand on any record.
          </p>
          <ul className="divide-y divide-border border border-border">
            {MAILBOX_PROVIDERS.map((p) => {
              const acc = (accounts.data ?? []).find((a) => a.provider === p.key);
              return (
                <li key={p.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Mail className="size-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{p.label}</div>
                    <div className="text-xs text-muted-foreground">{p.description}</div>
                  </div>
                  <span className="ml-auto font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    {acc ? acc.status : "Setup required"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </AppShell>
  );
}
