import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, Send, Trash2 } from "lucide-react";
import { SettingsShell, SettingsField, SettingsInput, SettingsSelect } from "@/components/settings/settings-shell";
import { useAdminContext } from "@/lib/settings/use-admin";
import { getSessionUser } from "@/lib/use-current-user";
import { deleteMailSettings, getMailSettings, saveMailSettings, sendTestEmail } from "@/lib/settings/mail.functions";
import { Button } from "@/components/ui/button";

import { friendlyError } from "@/lib/friendly-error";
import { SectionTitle } from "@/components/ui/section-title";
export const Route = createFileRoute("/_authenticated/app/settings/email")({
  head: () => ({ meta: [{ title: "Email — Settings" }] }),
  component: EmailSettingsPage,
});

// Common providers: picking one fills the server details.
const PRESETS = [
  { key: "gmail", label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: 465, security: "ssl" },
  { key: "outlook", label: "Outlook / Microsoft 365", host: "smtp.office365.com", port: 587, security: "starttls" },
  { key: "zoho", label: "Zoho Mail", host: "smtp.zoho.com", port: 465, security: "ssl" },
  { key: "custom", label: "Other (enter details)", host: "", port: 587, security: "starttls" },
] as const;

type Form = {
  host: string; port: number; security: "ssl" | "starttls"; username: string; password: string;
  fromName: string; fromEmail: string; replyTo: string;
};
const EMPTY: Form = { host: "", port: 587, security: "starttls", username: "", password: "", fromName: "", fromEmail: "", replyTo: "" };

function EmailSettingsPage() {
  const { orgId, isAdmin } = useAdminContext();
  const qc = useQueryClient();
  const getFn = useServerFn(getMailSettings);
  const saveFn = useServerFn(saveMailSettings);
  const deleteFn = useServerFn(deleteMailSettings);
  const testFn = useServerFn(sendTestEmail);
  const [form, setForm] = useState<Form>(EMPTY);
  const [preset, setPreset] = useState("");
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState<null | "save" | "test" | "delete">(null);

  const settings = useQuery({
    queryKey: ["mail-settings", orgId],
    enabled: !!orgId && isAdmin,
    queryFn: () => getFn({ data: { orgId: orgId! } }),
  });
  const saved = settings.data ?? null;

  useEffect(() => {
    if (saved) {
      setForm({
        host: saved.host, port: saved.port, security: saved.security, username: saved.username, password: "",
        fromName: saved.from_name ?? "", fromEmail: saved.from_email, replyTo: saved.reply_to ?? "",
      });
      setPreset(PRESETS.find((p) => p.host && p.host === saved.host)?.key ?? "custom");
    }
  }, [saved]);
  useEffect(() => {
    getSessionUser().then(({ data }) => setTestTo((t) => t || data.user?.email || ""));
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const refresh = () => qc.invalidateQueries({ queryKey: ["mail-settings", orgId] });

  function applyPreset(key: string) {
    const p = PRESETS.find((x) => x.key === key);
    if (p) setForm((f) => ({ ...f, host: p.host, port: p.port, security: p.security }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setBusy("save");
    try {
      await saveFn({ data: { orgId, ...form, password: form.password || undefined, fromName: form.fromName || undefined } });
      toast.success("Mailbox saved. Send a test email to check it works.");
      set("password", "");
      refresh();
    } catch (err) {
      toast.error(friendlyError(err, "Could not save"));
    } finally { setBusy(null); }
  }

  async function test() {
    if (!orgId) return;
    setBusy("test");
    try {
      const r = await testFn({ data: { orgId, to: testTo.trim() } });
      if ("error" in r) toast.error(r.error); else toast.success(`Test email sent to ${testTo.trim()}`);
      refresh();
    } catch (err) {
      toast.error(friendlyError(err, "Test failed"));
    } finally { setBusy(null); }
  }

  async function remove() {
    if (!orgId || !confirm("Disconnect this mailbox? Emailing quotes and invoices will stop until you connect one again.")) return;
    setBusy("delete");
    try {
      await deleteFn({ data: { orgId } });
      setForm(EMPTY);
      setPreset("");
      toast.success("Mailbox disconnected");
      refresh();
    } catch (err) {
      toast.error(friendlyError(err, "Could not disconnect"));
    } finally { setBusy(null); }
  }

  return (
    <SettingsShell title="Email" breadcrumb="settings / email">
      {!isAdmin ? (
        <div className="border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Only owners and admins can manage the company mailbox.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <section className="border border-border bg-background">
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Mail className="size-4 text-primary" />
              <SectionTitle>Company mailbox (SMTP)</SectionTitle>
            </header>
            <form onSubmit={save} className="space-y-4 p-4">
              <p className="text-sm text-muted-foreground">
                Quotes and invoices are emailed from your own mailbox, so customers see your address and replies come to you.
                Inuberry doesn't send business email on your behalf.
              </p>
              <SettingsField label="Provider" hint="Fills in the server details. You can still change them.">
                <SettingsSelect value={preset} onChange={(e) => { setPreset(e.target.value); applyPreset(e.target.value); }}>
                  <option value="" disabled>Choose…</option>
                  {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </SettingsSelect>
              </SettingsField>
              <div className="grid gap-3 sm:grid-cols-[1fr_110px_150px]">
                <SettingsField label="SMTP server">
                  <SettingsInput required value={form.host} onChange={(e) => set("host", e.target.value)} placeholder="smtp.example.com" />
                </SettingsField>
                <SettingsField label="Port">
                  <SettingsInput required type="number" min={1} max={65535} value={form.port} onChange={(e) => set("port", Number(e.target.value))} />
                </SettingsField>
                <SettingsField label="Security">
                  <SettingsSelect value={form.security} onChange={(e) => set("security", e.target.value as Form["security"])}>
                    <option value="ssl">SSL (port 465)</option>
                    <option value="starttls">STARTTLS (port 587)</option>
                  </SettingsSelect>
                </SettingsField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SettingsField label="Username" hint="Usually the full email address.">
                  <SettingsInput required autoComplete="off" value={form.username} onChange={(e) => set("username", e.target.value)} />
                </SettingsField>
                <SettingsField label="Password" hint={saved ? "Leave empty to keep the saved password." : "For Gmail and Outlook, create an app password."}>
                  <SettingsInput type="password" autoComplete="new-password" required={!saved} value={form.password} onChange={(e) => set("password", e.target.value)} placeholder={saved ? "••••••••" : ""} />
                </SettingsField>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <SettingsField label="From name">
                  <SettingsInput value={form.fromName} onChange={(e) => set("fromName", e.target.value)} placeholder="Your company" />
                </SettingsField>
                <SettingsField label="From email">
                  <SettingsInput required type="email" value={form.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} placeholder="billing@yourcompany.com" />
                </SettingsField>
                <SettingsField label="Reply-to (optional)">
                  <SettingsInput type="email" value={form.replyTo} onChange={(e) => set("replyTo", e.target.value)} />
                </SettingsField>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="kitSolid" size="kit" type="submit" disabled={busy !== null} className="bg-primary px-4 py-2 text-primary-foreground">
                  {busy === "save" ? "Saving…" : "Save mailbox"}
                </Button>
                {saved && (
                  <Button variant="kit" size="kit" type="button" onClick={remove} disabled={busy !== null} className="flex gap-1 px-4 py-2 hover:text-destructive">
                    <Trash2 className="size-3" /> Disconnect
                  </Button>
                )}
              </div>
            </form>
          </section>

          <section className="h-fit border border-border bg-background">
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Send className="size-4 text-primary" />
              <SectionTitle>Status</SectionTitle>
            </header>
            <div className="space-y-3 p-4 text-sm">
              {!saved ? (
                <p className="text-muted-foreground">Not connected. Emailing quotes and invoices is off until you save a mailbox.</p>
              ) : saved.last_error ? (
                <p role="alert" className="text-destructive">Last test failed: {saved.last_error}</p>
              ) : saved.verified_at ? (
                <p>Working. Last successful test {new Date(saved.verified_at).toLocaleString()}.</p>
              ) : (
                <p className="text-muted-foreground">Saved but not tested yet.</p>
              )}
              {saved && (
                <>
                  <SettingsField label="Send a test email to">
                    <SettingsInput type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                  </SettingsField>
                  <Button variant="kit" size="kit" onClick={test} disabled={busy !== null || !testTo.trim()} className="w-full px-4 py-2 hover:bg-muted">
                    {busy === "test" ? "Sending…" : "Send test email"}
                  </Button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </SettingsShell>
  );
}
