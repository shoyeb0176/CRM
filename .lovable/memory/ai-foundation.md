---
name: AI gateway, model routing and the assistant
description: How AI calls are made in Inuberry — always through the org-scoped gateway, never a vendor SDK directly; how the assistant and agents propose actions
type: feature
---
All AI calls go through `src/lib/ai/gateway.server.ts` (`runAiChat({orgId, userId, purpose, messages})`).
Purposes: assistant, summaries, classification, agents, embeddings.
Resolution order: `ai_model_routes` for (org, purpose) → `ai_org_policies.default_provider_config_id` → built-in AI.
Built-in AI is a chain (`instanceTargets()`), tried in order, next one on failure: `OPENAI_API_KEY` (model `OPENAI_MODEL` or gpt-4o-mini) → `OPENROUTER_API_KEY` (+ `OPENROUTER_MODEL`) → Lovable AI gateway. A company's own provider never falls back. As of 9 Oct 2026 the OpenAI key has no credit and the OpenRouter key was removed (openrouter/free picked random models that broke the action format), so Lovable's Gemini answers.
Providers per org live in `ai_provider_configs`; API keys live in `ai_provider_secrets` (service_role only, no RLS policies, never returned to the browser).
Every call is logged to `ai_call_logs` with tokens, cost estimate, duration, status and the failure reason (shown in Settings › AI › Usage).
Never call OpenAI/Anthropic SDKs directly from feature code.

Assistant and agents (shared tool loop, `src/lib/agents/tool-loop.server.ts`):
- The model asks for tools with fenced ```action { "tool", "args", "reason" }``` blocks, one per call, several per reply allowed; it answers the rest of the message as normal text.
- Read tools run at once (max 3 rounds). Write tools never run directly: the assistant files `ai_proposed_actions` (via `proposeAction`, respecting `ai_action_policies`), agents file `ai_agent_actions`; the user approves each card in the panel.
- `runAgentTool` refuses write tools unless given an `actionId` of an approved `ai_agent_actions` row of the same org/agent/tool, and uses the stored arguments.
- Assistant writes: create_lead, create_company (reuses a same-name company), create_contact, create_task (needs a project), log_activity. Executors live in `src/lib/agents/tool-exec.server.ts`.
- The assistant prompt includes `src/lib/ai/app-guide.ts` (where things are, common problems), the current page, the last 5 error toasts and the org's agents; history tells the model which proposals were done or rejected.
- The panel can "Talk to" an org agent (runs `runAgent`, approval cards inline). Chat text renders through `src/components/ai/markdown.tsx` (GFM tables, KaTeX math; `\[..\]`/`\(..\)` are normalised).
- Self-check: `bun scripts/selftest-assistant-actions.ts`.
