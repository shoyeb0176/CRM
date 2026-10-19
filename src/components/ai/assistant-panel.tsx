import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAiUsage } from "@/lib/billing/use-subscription";
import { useServerFn } from "@tanstack/react-start";
import { Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { aiAssistantSend, type AssistantEvent, type AssistantResult } from "@/lib/ai/ai.functions";
import { aiDecideAction } from "@/lib/ai/entity-ai.functions";
import { runAgent, decideAgentAction as decideAgent } from "@/lib/agents/agent-service";
import { TOOL_REGISTRY } from "@/lib/agents/tool-registry";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Sparkles, Send, MessageSquare, Plus, Loader2, X, Bot, Check, CheckCircle2, AlertTriangle } from "lucide-react";
import { Markdown } from "@/components/ai/markdown";
import { useOrgId } from "@/lib/crm/use-org";
import { useAiEntityContext } from "@/lib/ai/entity-context";
import { recentErrors } from "@/lib/recent-errors";
import { friendlyError } from "@/lib/friendly-error";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { COMMANDS } from "@/lib/ai/commands";
import { startTour } from "@/components/app/tour";

type Capability =
  | "free_chat"
  | "summarize_customer"
  | "draft_followup_email"
  | "explain_overdue_invoices"
  | "summarize_project"
  | "low_stock_review"
  | "draft_quote_notes"
  | "summarize_pipeline";

const QUICK_CAPS: Array<{ id: Capability; label: string; prompt: string; needsEntity?: boolean }> = [
  { id: "explain_overdue_invoices", label: "Explain overdue invoices", prompt: "Summarize our overdue invoices, group by customer, and suggest collection actions." },
  { id: "low_stock_review", label: "Identify low stock", prompt: "List low-stock products and recommend reorder priorities." },
  { id: "summarize_pipeline", label: "Summarize sales pipeline", prompt: "Summarize pipeline health with stage breakdown, weighted value, and risks." },
  { id: "free_chat", label: "How do I…? Ask anything, or ask me to add a lead, contact, company or task", prompt: "" },
];

type Proposal = { id: string; title: string; summary: string | null; status: string; error: string | null; result: { link?: string } | null };
type AgentTurn = { role: "user" | "assistant" | "error"; content: string; runId?: string; at: string };

/** "14:32" today, "15 Oct, 14:32" on other days. */
function msgTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString()
    ? time : `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
}

/** Who wrote it and when. */
function MsgHead({ who, at }: { who: string; at?: string | null }) {
  return (
    <div className="mb-1 flex items-baseline gap-2 font-mono text-xs uppercase text-muted-foreground">
      <span>{who}</span>
      {at && <time dateTime={at} className="normal-case tracking-normal">{msgTime(at)}</time>}
    </div>
  );
}

/** Closes a reply, so it's clear the assistant has stopped and isn't still thinking. */
function ReplyEnd({ failed }: { failed?: boolean }) {
  return (
    <div className={`mt-2 flex items-center gap-2 text-xs ${failed ? "text-destructive" : "text-muted-foreground"}`}>
      <span className="h-px w-6 bg-border" aria-hidden />
      {failed ? <AlertTriangle className="size-3.5" aria-hidden /> : <CheckCircle2 className="size-3.5 text-success" aria-hidden />}
      <span>{failed ? "Stopped" : "Finished"}</span>
    </div>
  );
}

/** Under a reply that is still coming in. */
function StillWriting({ status }: { status?: string }) {
  return (
    <div role="status" className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="size-3 animate-spin" aria-hidden /> {status ?? "Still writing…"}
    </div>
  );
}

/** One write the AI wants to make, with Approve / Reject. */
function ApprovalCard({ title, summary, status, error, link, busy, onApprove, onReject, onNavigate }: {
  title: string; summary?: string | null; status: string; error?: string | null; link?: string | null; busy?: boolean;
  onApprove: () => void; onReject: () => void; onNavigate?: () => void;
}) {
  const pending = status === "pending" || status === "pending_approval";
  return (
    <div className={`mt-2 border bg-card p-3 text-sm ${pending ? "border-primary/50" : "border-border"}`}>
      <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {pending ? "Needs your approval" : status === "executed" ? "Done" : status}
      </div>
      <div className="mt-1 font-semibold">{title}</div>
      {summary && <div className="mt-1 text-xs text-muted-foreground">{summary}</div>}
      {error && <div className="mt-1 text-xs text-destructive">{error}</div>}
      {pending ? (
        <div className="mt-3 flex gap-2">
          <Button variant="kitSolid" size="kit" type="button" disabled={busy} onClick={onApprove}
            className="gap-1 px-3 py-1.5">
            {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Approve
          </Button>
          <Button variant="kit" size="kit" type="button" disabled={busy} onClick={onReject}
            className="px-3 py-1.5 hover:bg-accent">
            Reject
          </Button>
        </div>
      ) : status === "executed" && link ? (
        <Link to={link} onClick={onNavigate} className="mt-2 inline-block text-xs font-medium text-primary underline underline-offset-2">Open it</Link>
      ) : null}
    </div>
  );
}

export function AssistantPanel({ open, onOpenChange, initialQuestion }: { open: boolean; onOpenChange: (v: boolean) => void; initialQuestion?: string }) {
  const orgId = useOrgId();
  const { entity } = useAiEntityContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();
  const send = useServerFn(aiAssistantSend);
  const decide = useServerFn(aiDecideAction);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pick, setPick] = useState(0);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [capability, setCapability] = useState<Capability>("free_chat");
  const [showList, setShowList] = useState(false);
  const [agentId, setAgentId] = useState<string>("");
  const [agentThread, setAgentThread] = useState<AgentTurn[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The answer as it streams in, until the saved message replaces it.
  const [live, setLive] = useState<{ text: string; status?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const close = () => onOpenChange(false);

  const agents = useQuery({
    enabled: !!orgId,
    queryKey: ["assistant-agents", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("ai_agents").select("id,name,status")
        .eq("org_id", orgId!).not("status", "in", "(archived,paused)").order("name");
      return data ?? [];
    },
  });
  const agentName = agents.data?.find((a) => a.id === agentId)?.name;

  const conversations = useQuery({
    enabled: !!orgId,
    queryKey: ["ai-conversations", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("ai_conversations")
        .select("id,title,updated_at,capability")
        .eq("org_id", orgId!).eq("archived", false)
        .order("updated_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  const messages = useQuery({
    enabled: !!conversationId,
    queryKey: ["ai-messages", conversationId],
    queryFn: async () => {
      const { data } = await supabase.from("ai_messages")
        .select("id,role,content,created_at,metadata")
        .eq("conversation_id", conversationId!).order("created_at");
      return data ?? [];
    },
  });

  const proposals = useQuery({
    enabled: !!conversationId,
    queryKey: ["ai-proposals", conversationId],
    queryFn: async () => {
      const { data } = await supabase.from("ai_proposed_actions")
        .select("id,title,summary,status,error,result")
        .eq("conversation_id", conversationId!).order("created_at");
      return (data ?? []) as Proposal[];
    },
  });

  // Pending actions from agent runs started in this panel.
  const runIds = agentThread.map((t) => t.runId).filter(Boolean) as string[];
  const agentActions = useQuery({
    enabled: runIds.length > 0,
    queryKey: ["assistant-agent-actions", runIds.join(",")],
    queryFn: async () => {
      const { data } = await supabase.from("ai_agent_actions")
        .select("id,run_id,action_type,proposed_changes_json,status,error_message,result_json")
        .in("run_id", runIds).order("created_at");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, conversationId, agentId]);

  useEffect(() => {
    if (open && initialQuestion) {
      setAgentId("");
      setConversationId(null);
      setCapability("free_chat");
      setInput(initialQuestion);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, initialQuestion]);

  // The message box grows with its text (one line by default; max-h then scrolls).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [input]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.data, proposals.data, agentThread, agentActions.data]);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!orgId) throw new Error("No active organization");
      if (agentId) {
        setAgentThread((t) => [...t, { role: "user", content: text, at: new Date().toISOString() }]);
        const res = await runAgent(agentId, { prompt: text });
        setAgentThread((t) => [...t, res.error
          ? { role: "error", content: res.error, runId: res.runId, at: new Date().toISOString() }
          : { role: "assistant", content: res.reply ?? "", runId: res.runId, at: new Date().toISOString() }]);
        return null;
      }
      setLive({ text: "" });
      setSentAt(new Date().toISOString());
      const body = {
        orgId, conversationId, message: text, capability,
        currentPath: pathname, recentErrors: recentErrors(),
        ...(entity ? { entityType: entity.type, entityId: entity.id } : {}),
      };
      return await streamAssistant(body, (e) => setLive((l) => {
        const cur = l ?? { text: "" };
        if (e.type === "delta") return { text: cur.text + e.text };
        if (e.type === "status") return { ...cur, status: e.text };
        if (e.type === "round") return { text: "", status: cur.status };
        return cur;
      })).catch((e) => {
        // The streaming endpoint wasn't reachable (nothing was sent yet): ask the plain way.
        if (e instanceof StreamUnavailable) return send({ data: body });
        throw e;
      });
    },
    onSuccess: async (res) => {
      setInput("");
      if (!res) return;
      setConversationId(res.conversationId);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["ai-messages", res.conversationId] }),
        qc.invalidateQueries({ queryKey: ["ai-proposals", res.conversationId] }),
        qc.invalidateQueries({ queryKey: ["ai-conversations", orgId] }),
      ]);
    },
    onSettled: () => { setLive(null); qc.invalidateQueries({ queryKey: ["ai-actions", orgId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const aiUsage = useAiUsage(open ? orgId : null);
  const left = aiUsage.data?.limit != null ? Math.max(0, aiUsage.data.limit - aiUsage.data.used) : null;

  async function decideProposal(id: string, decision: "approve" | "reject") {
    if (!orgId) return;
    setBusyId(id);
    try {
      const res = await decide({ data: { orgId, id, decision } });
      toast.success(res.status === "executed" ? "Done" : "Rejected");
    } catch (e) {
      toast.error(friendlyError(e, "Could not complete that"));
    } finally {
      setBusyId(null);
      qc.invalidateQueries({ queryKey: ["ai-proposals", conversationId] });
    }
  }

  async function decideAgentAction(id: string, decision: "approve" | "reject") {
    setBusyId(id);
    try {
      if (decision === "approve") {
        const res = await decideAgent(id, "approve");
        if (res.status === "executed") toast.success("Done");
        else toast.error(("error" in res && res.error) || "The action failed");
      } else {
        await decideAgent(id, "reject");
        toast.success("Rejected");
      }
    } catch (e) {
      toast.error(friendlyError(e, "Could not complete that"));
    } finally {
      setBusyId(null);
      qc.invalidateQueries({ queryKey: ["assistant-agent-actions"] });
    }
  }

  function newConversation() {
    setConversationId(null);
    setAgentThread([]);
    setCapability("free_chat");
    setShowList(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function quickCap(cap: typeof QUICK_CAPS[number]) {
    setCapability(cap.id);
    if (cap.prompt) {
      setConversationId(null);
      sendMutation.mutate(cap.prompt);
    } else {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  // Typing "/" in the assistant (not an agent) lists the quick commands (src/lib/ai/commands.ts).
  const typed = input.trimStart();
  const commandMatches = !agentId && /^\/[a-z-]*$/i.test(typed)
    ? COMMANDS.filter((c) => c.name.startsWith(typed.slice(1).toLowerCase()))
    : [];
  // "/tour" runs here: close the panel and start the tour, without a message.
  function runClientCommand(text: string) {
    if (!/^\/tour\s*$/i.test(text.trim())) return false;
    setInput("");
    close();
    setTimeout(startTour, 250);
    return true;
  }
  function chooseCommand(c: (typeof COMMANDS)[number]) {
    if (runClientCommand(`/${c.name}`)) return;
    if (c.arg) {
      setInput(`/${c.name} `);
      inputRef.current?.focus();
    } else {
      setInput(`/${c.name}`);
      sendMutation.mutate(`/${c.name}`);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sendMutation.isPending) return;
    if (runClientCommand(text)) return;
    sendMutation.mutate(text);
  }

  const showWelcome = agentId ? agentThread.length === 0 && !sendMutation.isPending : !conversationId && !sendMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" hideClose className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 font-heading text-lg uppercase">
              <Sparkles className="size-4 shrink-0 text-primary" /> Assistant
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {!agentId && (
                <Button variant="kit" size="kit" onClick={() => setShowList(v => !v)}
                  className="flex gap-1 px-2 py-1 hover:bg-accent">
                  <MessageSquare className="size-3" /> History
                </Button>
              )}
              <Button variant="kit" size="kit" onClick={newConversation}
                className="flex gap-1 px-2 py-1 hover:bg-accent">
                <Plus className="size-3" /> New
              </Button>
              <SheetClose aria-label="Close assistant"
                className="ml-1 flex size-7 items-center justify-center border border-border hover:bg-accent">
                <X className="size-3.5" />
              </SheetClose>
            </div>
          </SheetTitle>
          {(agents.data?.length ?? 0) > 0 && (
            <label className="mt-2 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              <Bot className="size-3.5 shrink-0" /> Talk to
              <select
                value={agentId}
                onChange={(e) => { setAgentId(e.target.value); setAgentThread([]); setShowList(false); }}
                className="min-w-0 flex-1 border border-input bg-card px-2 py-1 font-sans text-xs normal-case tracking-normal text-foreground"
              >
                <option value="">Assistant (help + quick actions)</option>
                {agents.data!.map((a) => <option key={a.id} value={a.id}>Agent: {a.name}</option>)}
              </select>
            </label>
          )}
        </SheetHeader>

        {showList && !agentId && (
          <div className="max-h-48 overflow-y-auto border-b border-border bg-muted/30">
            {!conversations.data?.length ? (
              <div className="p-4 text-xs text-muted-foreground">No conversations yet.</div>
            ) : conversations.data.map(c => (
              <Button variant="bare" size="bare" key={c.id} onClick={() => { setConversationId(c.id); setShowList(false); }}
                className={`block w-full border-b border-border/50 px-4 py-2 text-left text-sm hover:bg-accent ${conversationId === c.id ? "bg-accent" : ""}`}>
                <div className="truncate font-medium">{c.title ?? "Untitled"}</div>
                <div className="font-mono text-xs uppercase text-muted-foreground">{c.capability ?? "free_chat"}</div>
              </Button>
            ))}
          </div>
        )}

        {entity && !agentId && (
          <div className="border-b border-border bg-primary/5 px-5 py-2 font-mono text-xs uppercase tracking-widest text-primary">
            Context: {entity.type} · {entity.label}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
          {showWelcome ? (
            agentId ? (
              <div className="border border-border bg-card shadow-sm p-4 text-sm">
                <div className="font-heading text-base">{agentName}</div>
                <p className="mt-1 text-muted-foreground">
                  You&apos;re talking to this agent directly. It uses its own instructions and tools; anything it wants to change shows up here for you to approve.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border border-border bg-card shadow-sm p-4">
                  <div className="font-heading text-base">Hello — I&apos;m your Inuberry assistant.</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    I can look things up, explain how to do something in the app, and add leads, contacts, companies and tasks for you (you approve each one).
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {QUICK_CAPS.map(q => (
                    <Button variant="bare" size="bare" key={q.id} onClick={() => quickCap(q)}
                      className="border border-border bg-card px-3 py-2 text-left text-sm hover:bg-accent">
                      <Sparkles className="mr-2 inline size-3 text-primary" />
                      {q.label}
                    </Button>
                  ))}
                </div>
              </div>
            )
          ) : agentId ? (
            <div className="space-y-5">
              {agentThread.map((m, i) => (
                <div key={i} className={m.role === "user" ? "ml-6" : "mr-6"}>
                  <MsgHead who={m.role === "user" ? "You" : agentName ?? "Agent"} at={m.at} />
                  {m.role === "user" ? (
                    <div className="whitespace-pre-wrap bg-primary px-3 py-2 text-sm text-primary-foreground">{m.content}</div>
                  ) : m.role === "error" ? (
                    <>
                      <div className="text-sm text-destructive">{m.content}</div>
                      <ReplyEnd failed />
                    </>
                  ) : (
                    <>
                      <Markdown onNavigate={close}>{m.content}</Markdown>
                      {(agentActions.data ?? []).filter((a) => a.run_id === m.runId).map((a) => {
                        const args = Object.entries((a.proposed_changes_json ?? {}) as Record<string, unknown>)
                          .filter(([k]) => k !== "_reason").map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ");
                        return (
                          <ApprovalCard key={a.id} title={TOOL_REGISTRY.find((t) => t.name === a.action_type)?.label ?? a.action_type.replace(/_/g, " ")}
                            summary={args} status={a.status} error={a.error_message} busy={busyId === a.id}
                            link={(a.result_json as { link?: string } | null)?.link} onNavigate={close}
                            onApprove={() => decideAgentAction(a.id, "approve")} onReject={() => decideAgentAction(a.id, "reject")} />
                        );
                      })}
                      <ReplyEnd />
                    </>
                  )}
                </div>
              ))}
              {sendMutation.isPending && (
                <StillWriting status="Working…" />
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {messages.data?.map(m => {
                const ids = ((m.metadata as { proposal_ids?: string[] } | null)?.proposal_ids) ?? [];
                const mine = (proposals.data ?? []).filter((p) => ids.includes(p.id));
                return (
                  <div key={m.id} className={m.role === "user" ? "ml-6" : "mr-6"}>
                    <MsgHead who={m.role === "user" ? "You" : "Assistant"} at={m.created_at} />
                    {m.role === "assistant" ? (
                      <>
                        <Markdown onNavigate={close}>{m.content}</Markdown>
                        {mine.map((p) => (
                          <ApprovalCard key={p.id} title={p.title} summary={p.summary} status={p.status} error={p.error}
                            link={p.result?.link} busy={busyId === p.id} onNavigate={close}
                            onApprove={() => decideProposal(p.id, "approve")} onReject={() => decideProposal(p.id, "reject")} />
                        ))}
                        <ReplyEnd failed={m.content.startsWith("_Assistant error")} />
                      </>
                    ) : (
                      <div className="whitespace-pre-wrap bg-primary px-3 py-2 text-sm text-primary-foreground">{m.content}</div>
                    )}
                  </div>
                );
              })}
              {sendMutation.isPending && (
                <div className="ml-6">
                  <MsgHead who="You" at={sentAt} />
                  <div className="whitespace-pre-wrap bg-primary px-3 py-2 text-sm text-primary-foreground">{sendMutation.variables}</div>
                </div>
              )}
              {sendMutation.isPending && (
                <div className="mr-6">
                  <MsgHead who="Assistant" />
                  {live?.text ? (
                    <>
                      <Markdown onNavigate={close}>{live.text.replace(/```action[\s\S]*?(```|$)/g, "")}</Markdown>
                      <StillWriting status={live.status} />
                    </>
                  ) : (
                    <StillWriting status={live?.status ?? "Thinking…"} />
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <form onSubmit={onSubmit} className="border-t border-border bg-background p-3">
          {capability !== "free_chat" && !agentId && (
            <div className="mb-2 flex items-center justify-between bg-primary/10 px-2 py-1 font-mono text-xs uppercase tracking-wider text-primary">
              <span>Mode: {capability.replace(/_/g, " ")}</span>
              <Button variant="bare" size="bare" type="button" onClick={() => setCapability("free_chat")} className="hover:underline">clear</Button>
            </div>
          )}
          {commandMatches.length > 0 && (
            <ul role="listbox" aria-label="Commands" className="mb-2 max-h-56 overflow-y-auto border border-border bg-card text-sm">
              {commandMatches.map((c, i) => (
                <li key={c.name} role="option" aria-selected={i === pick}>
                  <Button type="button" variant="ghost" onMouseDown={(e) => { e.preventDefault(); chooseCommand(c); }}
                    className={`h-auto w-full items-baseline justify-start px-3 py-1.5 font-normal ${i === pick ? "bg-accent" : ""}`}>
                    <span className="font-mono">/{c.name}</span>
                    {c.arg && <span className="font-mono text-xs text-muted-foreground">{c.arg}</span>}
                    <span className="truncate text-xs text-muted-foreground">{c.description}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef} value={input} onChange={e => { setInput(e.target.value); setPick(0); }}
              onKeyDown={e => {
                if (commandMatches.length) {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setPick((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + commandMatches.length) % commandMatches.length);
                    return;
                  }
                  const chosen = commandMatches[pick];
                  if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey && chosen && input.trim() !== `/${chosen.name}`)) {
                    e.preventDefault();
                    chooseCommand(chosen);
                    return;
                  }
                  if (e.key === "Escape") { e.preventDefault(); setInput(""); return; }
                }
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(e); }
              }}
              rows={1} placeholder={agentId ? `Message ${agentName ?? "the agent"}…` : "Ask anything, or type / for quick commands"}
              disabled={sendMutation.isPending}
              className="max-h-36 min-h-9 flex-1 resize-none border border-input bg-card px-3 py-[7px] text-sm leading-5 focus:border-foreground focus:outline-none"
            />
            <Button variant="kitSolid" size="kit" type="submit" aria-label="Send" disabled={sendMutation.isPending || !input.trim()}
              className="flex size-9">
              {sendMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
          {aiUsage.data && left === null && !agentId && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {aiUsage.data.used.toLocaleString()} AI action{aiUsage.data.used === 1 ? "" : "s"} used this month · no limit on your plan
            </p>
          )}
          {left !== null && aiUsage.data && (
            <p className={`mt-1.5 text-xs ${left === 0 ? "text-destructive" : left <= Math.ceil(aiUsage.data.limit! * 0.2) ? "text-warning" : "text-muted-foreground"}`}>
              {left === 0 ? "No AI actions left this month" : `${left.toLocaleString()} of ${aiUsage.data.limit!.toLocaleString()} AI actions left this month`}
              {" · resets "}{new Date(aiUsage.data.resets_on).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              {left === 0 && <> · <Link to="/app/settings/billing" className="underline">See plans</Link></>}
            </p>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}

class StreamUnavailable extends Error {}

/** Send a message to the streaming assistant endpoint; `onEvent` sees text as it arrives. */
async function streamAssistant(body: Record<string, unknown>, onEvent: (e: AssistantEvent) => void): Promise<AssistantResult> {
  const { data: session } = await supabase.auth.getSession();
  const res = await fetch("/api/ai/assistant", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  }).catch(() => { throw new StreamUnavailable(); });
  if (res.status === 404 || res.status >= 500 || !res.body) throw new StreamUnavailable();
  if (!res.ok) {
    const j = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(j?.error ?? "The assistant didn't answer. Try again.");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, cut).replace(/^data:\s*/, "");
      buf = buf.slice(cut + 2);
      const e = JSON.parse(chunk) as AssistantEvent | { type: "error"; error: string };
      if (e.type === "error") throw new Error(e.error);
      if (e.type === "done") return e.result;
      onEvent(e);
    }
  }
  throw new Error("The assistant stopped before finishing. Try again.");
}
