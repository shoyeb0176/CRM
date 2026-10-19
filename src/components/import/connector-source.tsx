import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tableFromRecords } from "@/lib/import/csv";
import {
  fetchImportRows, fetchNotionBodies, listImportSources, removeImportConnection, saveImportConnection,
  type ImportSource,
} from "@/lib/import/connectors.functions";

export type LoadedTable = { name: string; headers: string[]; rows: string[][]; source: string };

const MAX_ROWS = 5000;

const STEPS = {
  notion: [
    <>Open <a className="underline" href="https://www.notion.so/profile/integrations" target="_blank" rel="noreferrer">notion.so/profile/integrations</a> and click <b>New integration</b>.</>,
    <>Name it (for example "Inuberry import"), pick the workspace, keep the type <b>Internal</b>, and save.</>,
    <>Under <b>Capabilities</b>, "Read content" is enough. Copy the <b>Internal Integration Secret</b>.</>,
    <>In Notion, open each page or database you want to bring over, click <b>•••</b> › <b>Connections</b> and add the integration. Pages inside it come along.</>,
    <>Paste the secret below.</>,
  ],
  airtable: [
    <>Open <a className="underline" href="https://airtable.com/create/tokens" target="_blank" rel="noreferrer">airtable.com/create/tokens</a> and click <b>Create token</b>.</>,
    <>Add the scopes <b>data.records:read</b> and <b>schema.bases:read</b>.</>,
    <>Under <b>Access</b>, add the bases you want to import (or all of them).</>,
    <>Create the token, copy it, and paste it below. Airtable shows it only once.</>,
  ],
} as const;

/** Import straight from Notion or Airtable with a token. Hands the rows to the normal mapping step. */
export function ConnectorSource({
  provider, orgId, isAdmin, onLoaded,
}: {
  provider: "notion" | "airtable";
  orgId: string;
  isAdmin: boolean;
  onLoaded: (t: LoadedTable) => void;
}) {
  const qc = useQueryClient();
  const name = provider === "notion" ? "Notion" : "Airtable";
  const save = useServerFn(saveImportConnection);
  const remove = useServerFn(removeImportConnection);
  const list = useServerFn(listImportSources);
  const fetchRows = useServerFn(fetchImportRows);
  const fetchBodies = useServerFn(fetchNotionBodies);

  const [token, setToken] = useState("");
  const [remember, setRemember] = useState(isAdmin);
  const [busy, setBusy] = useState<string | null>(null);
  const [sources, setSources] = useState<ImportSource[] | null>(null);
  const [bases, setBases] = useState<ImportSource[] | null>(null);
  const [baseId, setBaseId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [withText, setWithText] = useState(true);

  const saved = useQuery({
    queryKey: ["import-connections", orgId],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_import_connections", { _org: orgId });
      if (error) return []; // before database update 0043 there is nothing saved
      return data ?? [];
    },
  });
  const connection = (saved.data ?? []).find((c) => c.provider === provider);
  // The typed token wins; without one the server uses the saved token.
  const typed = token.trim() || undefined;

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    try {
      return await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function connect() {
    await run("Connecting…", async () => {
      if (typed && remember && isAdmin) {
        await save({ data: { orgId, provider, token: typed } });
        setToken("");
        await qc.invalidateQueries({ queryKey: ["import-connections", orgId] });
        toast.success(`${name} token saved for this workspace`);
      }
      const tokenArg = typed && !(remember && isAdmin) ? typed : undefined;
      const { sources: found } = await list({ data: { orgId, provider, token: tokenArg } });
      if (provider === "airtable") { setBases(found); setSources(null); setBaseId(""); }
      else setSources(found);
      setSourceId("");
      if (!found.length) toast.message(`Nothing shared yet. ${provider === "notion" ? "Add the integration to a page in Notion (••• › Connections)." : "Add a base to the token under Access."}`);
    });
  }

  // When the token was only typed (not saved), keep sending it.
  const tokenArg = () => (connection && !token.trim() ? undefined : typed);

  async function pickBase(id: string) {
    setBaseId(id);
    setSourceId("");
    if (!id) return setSources(null);
    await run("Loading tables…", async () => {
      const { sources: tables } = await list({ data: { orgId, provider, token: tokenArg(), baseId: id } });
      setSources(tables);
    });
  }

  async function load() {
    const source = sources?.find((s) => s.id === sourceId);
    if (!source) return;
    await run("Reading rows…", async () => {
      const records: Record<string, string>[] = [];
      const pageIds: string[] = [];
      let cursor: string | undefined;
      do {
        setBusy(`Reading rows… ${records.length}`);
        const r = await fetchRows({ data: { orgId, provider, token: tokenArg(), sourceId, baseId: baseId || undefined, cursor } });
        records.push(...r.records);
        pageIds.push(...r.pageIds);
        cursor = r.next ?? undefined;
      } while (cursor && records.length < MAX_ROWS);

      if (provider === "notion" && withText && pageIds.length) {
        for (let i = 0; i < pageIds.length; i += 10) {
          setBusy(`Reading page text… ${i} of ${pageIds.length}`);
          const { bodies } = await fetchBodies({ data: { orgId, token: tokenArg(), pageIds: pageIds.slice(i, i + 10) } });
          pageIds.slice(i, i + 10).forEach((id, k) => {
            const rec = records[i + k];
            rec[rec.Body === undefined ? "Body" : "Page body"] = bodies[id] ?? "";
          });
        }
      }
      const { headers, rows } = tableFromRecords(records);
      onLoaded({ name: `${name}: ${source.title}`, headers, rows, source: provider });
      if (cursor) toast.message(`Loaded the first ${records.length} rows. Import them, then load the rest in another run.`);
    });
  }

  const ready = !!(sources || bases);

  return (
    <div className="space-y-4">
      {connection ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border border-border bg-card shadow-sm p-3 text-sm">
          <span className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" aria-hidden />
            {name} token saved{connection.label ? ` (${connection.label})` : ""}, ending in {connection.token_last4}
          </span>
          <Button
            variant="ghost" size="sm"
            onClick={() => run("Removing…", async () => {
              await remove({ data: { orgId, provider } });
              await qc.invalidateQueries({ queryKey: ["import-connections", orgId] });
              setSources(null); setBases(null);
            })}
          >
            <Trash2 aria-hidden /> Remove
          </Button>
        </div>
      ) : (
        <details className="border border-border bg-card p-3 text-sm" open={!ready}>
          <summary className="cursor-pointer font-medium">How to get a {name} token</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            {STEPS[provider].map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </details>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-64 flex-1 text-sm">
          <span className="mb-1 block text-muted-foreground">{connection ? "Use a different token (optional)" : `${name} token`}</span>
          <Input
            type="password" autoComplete="off" spellCheck={false} value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={provider === "notion" ? "ntn_…" : "pat…"}
          />
        </label>
        <Button onClick={connect} disabled={!!busy || (!typed && !connection)}>
          {ready ? "Refresh" : "Connect"}
        </Button>
      </div>
      {isAdmin && typed && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Save it for this workspace (encrypted; only owners and admins can use it)
        </label>
      )}

      {provider === "airtable" && bases && (
        <select className="w-full border border-input bg-card shadow-xs px-3 py-2 text-sm" value={baseId} onChange={(e) => pickBase(e.target.value)}>
          <option value="">Choose a base…</option>
          {bases.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
        </select>
      )}
      {sources && sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select className="min-w-64 flex-1 border border-input bg-card shadow-xs px-3 py-2 text-sm" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">{provider === "notion" ? "Choose a database or the shared pages…" : "Choose a table…"}</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          {provider === "notion" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={withText} onChange={(e) => setWithText(e.target.checked)} />
              Include page text
            </label>
          )}
          <Button variant="outline" onClick={load} disabled={!sourceId || !!busy}>Load rows</Button>
        </div>
      )}
      {busy && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> {busy}
        </p>
      )}
    </div>
  );
}
