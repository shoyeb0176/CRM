import { useState } from "react";
import { toast } from "sonner";
import { Mail, CalendarDays, Phone, StickyNote, Trash2, Plus } from "lucide-react";
import {
  COMM_KIND_LABELS,
  useCommEventMutations,
  useCommEvents,
  type CommDirection,
  type CommKind,
} from "@/lib/comms/use-comms";
import { Button } from "@/components/ui/button";

import { friendlyError } from "@/lib/friendly-error";
const ICONS: Record<string, typeof Mail> = {
  email: Mail,
  meeting: CalendarDays,
  call: Phone,
  note: StickyNote,
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function CommsTimeline({
  orgId,
  entityType,
  entityId,
  title = "Communications",
  limit,
}: {
  orgId?: string;
  entityType?: string;
  entityId?: string;
  title?: string;
  limit?: number;
}) {
  const events = useCommEvents(orgId, { entityType, entityId, limit });
  const { create, remove } = useCommEventMutations(orgId);

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CommKind>("email");
  const [direction, setDirection] = useState<CommDirection>("outbound");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [participants, setParticipants] = useState("");
  const [when, setWhen] = useState("");

  async function onSave() {
    if (!orgId || !subject.trim()) return;
    try {
      await create.mutateAsync({
        kind,
        direction,
        subject: subject.trim(),
        body: body.trim() || undefined,
        occurredAt: when ? new Date(when).toISOString() : undefined,
        participants: participants.split(",").map((p) => p.trim()).filter(Boolean),
        entityType: entityType ?? null,
        entityId: entityId ?? null,
      });
      setSubject("");
      setBody("");
      setParticipants("");
      setWhen("");
      setOpen(false);
      toast.success("Logged");
    } catch (e) {
      toast.error(friendlyError(e, "Could not save"));
    }
  }

  return (
    <section className="border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</h3>
        <Button variant="kit" size="kit"
          className="gap-1 px-3 py-1"
          onClick={() => setOpen((v) => !v)}
        >
          <Plus className="size-3" /> Log
        </Button>
      </header>

      {open && (
        <div className="space-y-2 border-b border-border bg-muted/20 p-4">
          <div className="flex flex-wrap gap-2">
            <select className="border border-input bg-card shadow-xs px-2 py-1 text-sm" value={kind} onChange={(e) => setKind(e.target.value as CommKind)}>
              {Object.entries(COMM_KIND_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            <select className="border border-input bg-card shadow-xs px-2 py-1 text-sm" value={direction} onChange={(e) => setDirection(e.target.value as CommDirection)}>
              <option value="outbound">We sent / hosted</option>
              <option value="inbound">They contacted us</option>
            </select>
            <input type="datetime-local" className="border border-input bg-card shadow-xs px-2 py-1 text-sm" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <input className="w-full border border-input bg-card shadow-xs px-3 py-2 text-sm" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <input className="w-full border border-input bg-card shadow-xs px-3 py-2 text-sm" placeholder="People involved (comma separated)" value={participants} onChange={(e) => setParticipants(e.target.value)} />
          <textarea className="min-h-20 w-full border border-input bg-card shadow-xs px-3 py-2 text-sm" placeholder="What was said…" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="kit" size="kit" className="px-4 py-2" onClick={onSave} disabled={!subject.trim() || create.isPending}>
              Save
            </Button>
            <Button variant="bare" size="bare" className="px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {events.isLoading ? (
        <div className="p-5 text-sm text-muted-foreground">Loading…</div>
      ) : (events.data ?? []).length === 0 ? (
        <div className="p-5 text-sm text-muted-foreground">Nothing logged yet.</div>
      ) : (
        <ul className="divide-y divide-border">
          {(events.data ?? []).map((ev) => {
            const Icon = ICONS[ev.kind] ?? StickyNote;
            const people = Array.isArray(ev.participants) ? (ev.participants as string[]) : [];
            return (
              <li key={ev.id} className="flex gap-3 px-5 py-4">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="truncate text-sm font-medium">{ev.subject}</span>
                    <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                      {ev.direction === "inbound" ? "in" : "out"} · {formatWhen(ev.occurred_at)}
                      {ev.source !== "manual" ? ` · ${ev.source}` : ""}
                    </span>
                  </div>
                  {people.length > 0 && <div className="mt-1 text-xs text-muted-foreground">{people.join(", ")}</div>}
                  {ev.body && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{ev.body}</p>}
                </div>
                <Button variant="bare" size="bare"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Delete entry"
                  onClick={() => remove.mutate(ev.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
