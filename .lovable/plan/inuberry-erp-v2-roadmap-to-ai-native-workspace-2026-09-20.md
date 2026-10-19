# Inuberry ERP v2 — Roadmap to AI-Native Workspace

A phased roadmap mapping the v2.0 PRD onto what already exists. No code is written until you approve a phase; each phase below becomes its own build.

## Where we stand today

Already built and working: organizations + memberships with role-based access, CRM (companies, contacts, leads, deals, activities), sales (quotes, orders, payments, taxes), invoicing, products, inventory, purchasing, projects and timesheets, accounting, HR, reports, customer portal, notifications, billing/plans/subscriptions, platform admin with demo provisioning and audited support access, marketing site, legal pages, transactional email.

Gaps versus the PRD: no page/block workspace layer, no user-defined databases, no MCP server, no model choice or bring-your-own AI keys, assistant is single-provider and not context-aware, no semantic search, no command bar, no visual workflow builder, no forms, no knowledge base, no public REST API or webhooks, no import/migration tooling.

## Phase order

```text
Phase 1  AI foundation      → model registry, BYO keys, AI gateway, permissions
Phase 2  MCP server         → external AI agents act as the signed-in user
Phase 3  Context + assistant→ entity context engine, AI blocks, approval modes
Phase 4  Search + command   → keyword + semantic search, Cmd+K palette
Phase 5  Workspace layer    → workspaces, pages, blocks, templates
Phase 6  Custom databases   → user-defined tables, fields, views, relations
Phase 7  Automation + forms → visual rule builder, public forms, triggers
Phase 8  Developer platform → REST API, API keys, webhooks, OAuth apps
Phase 9  Knowledge + import → docs, SOPs, CSV/Notion/Airtable import
Phase 10 Comms timeline     → email/calendar integrations on the record timeline
```

Phases 1–3 are the differentiation the PRD is built around, so they come first. 5–6 are the largest and benefit from the search and context work landing before them.

---

## Phase 1 — AI foundation (model-agnostic gateway)

Each organization chooses how AI runs: the built-in managed AI, or their own provider keys.

- Settings → AI page: pick a default model, set per-purpose overrides (assistant, summaries, classification, agents), and see usage/cost.
- Bring-your-own keys for OpenAI, Anthropic, Google, Azure OpenAI, and any OpenAI-compatible endpoint (covers local/Ollama). Keys are entered once, stored encrypted server-side, never returned to the browser.
- Data-sensitivity policy: an org can require that specific modules only use its own/local provider.
- Every AI call is logged with purpose, model, tokens, cost, actor, and outcome.

Replaces today's single hardcoded OpenAI path used by the agent runtime.

## Phase 2 — MCP server

Expose the ERP to external AI assistants (Claude, ChatGPT, Cursor, custom agents) over Model Context Protocol.

- Tool set matching the PRD: customers, contacts, leads, opportunities, projects, tasks, invoices, documents, analytics, plus write tools behind the approval policy.
- Sign-in is per user: the connecting assistant acts as that person with exactly their permissions. No broader access via MCP.
- Every MCP call recorded in the audit trail and visible to org admins.
- Connection page with copy-paste setup for common clients.

## Phase 3 — Context engine, assistant upgrade, approval layer

- Context engine assembles an authorized snapshot of any record (customer, project, invoice) — related contacts, activity, open work, money — for AI to reason over.
- Assistant becomes contextual: opened inside a customer or project, it already knows which one.
- AI blocks that can sit on any page: summary, live query, narrative report, classification, extraction from documents.
- Autonomy policy per action type: read-only, draft, confirm, autonomous. Sending email, creating invoices, issuing refunds default to confirmation or manual.
- AI-performed actions labelled in the audit log with the requesting human and the model used.

## Phase 4 — Search and command bar

- Cross-entity keyword search with filters.
- Semantic search over records, documents and knowledge, tenant-isolated.
- Cmd/Ctrl+K palette: find anything, create records, navigate, run AI, trigger workflows.

## Phase 5 — Workspace layer (pages and blocks)

- Organization → workspaces → pages hierarchy alongside today's module navigation; the existing modules stay exactly where they are.
- Block editor: text, headings, files, embeds, checklists, record views, dashboards, AI blocks.
- Entity pages: every customer/project/invoice gets a customizable page view over its structured data.
- Starter templates per business type (consulting, agency, software, professional services).

## Phase 6 — Custom databases

- User-defined databases with the PRD's field types including relations, formulas, rollups and AI-generated properties.
- Views: table, board, list, calendar, timeline, gallery, chart — with saved filters, grouping and sorting.
- Custom fields on existing core objects (customers, deals, projects, invoices) without touching their protected schema.

## Phase 7 — Automation and forms

- Visual when/if/then builder replacing the current rules screen: triggers on record events, dates, webhooks, form submissions, payments, AI classification.
- Actions: create/update records, email, tasks, webhooks, AI prompt, MCP tool, run another workflow.
- Public and internal forms bound to any database, with submissions firing workflows.

## Phase 8 — Developer platform

- REST API over authorized resources, org-scoped API keys, rate limits.
- Outbound webhooks with retries and delivery logs.
- OAuth app authorization for third-party integrations.

## Phase 9 — Knowledge base and import

- Documents, SOPs, policies with AI natural-language answers grounded in authorized content only.
- Import from CSV, Excel, Notion export, Airtable-style tables, with column mapping and dry-run preview.

## Phase 10 — Communications timeline

- Gmail/Outlook and calendar connections; email and meetings land on the customer timeline.
- Slack/Teams notification delivery.

---

## Technical notes

- **Data model.** New tables for `ai_provider_configs`, `ai_model_routes`, `ai_call_logs`, `workspaces`, `pages`, `blocks`, `custom_databases`, `custom_fields`, `custom_records`, `database_views`, `api_keys`, `webhook_endpoints`, `form_definitions`, `knowledge_docs`, `embeddings`. Every table carries `org_id`, RLS via the existing `is_org_member` / `has_org_role` helpers, and explicit grants — same pattern as the rest of the app.
- **AI gateway.** A single server-side gateway module owns provider selection, key decryption, prompt assembly, tool execution, permission checks, cost accounting and logging. Application code calls a logical capability, never a vendor SDK. Built-in managed AI stays the default; BYO keys are stored via the platform secret store per organization and are never exposed to the client.
- **MCP.** Implemented as the app's own MCP server with per-user OAuth sign-in, so tool calls run under the caller's identity and RLS. Tools are thin wrappers over existing server functions, not new data paths.
- **Semantic search** uses pgvector with org-scoped indexes; embeddings generated through the same gateway so BYO-key orgs embed with their own provider.
- **Custom databases** store user rows in a typed JSONB record table with per-database field definitions, keeping core business objects on their real schemas.
- **Performance.** Page/database views paginate and virtualize; AI work runs asynchronously with streamed progress.

## Open decisions for later phases

- Self-hosting and Docker packaging are in the PRD but out of scope on this hosting platform; treat as a separate distribution track.
- Licensing model and Talent-by-Inuberry cross-sell placement need business sign-off before UI work.
