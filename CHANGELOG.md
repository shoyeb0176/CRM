# Changelog

All notable changes to Inuberry. Versions follow [semantic versioning](https://semver.org/):
`MAJOR.MINOR.PATCH`. A patch release (1.1.x) only fixes bugs and is always safe to install.

## 1.21.1 (16 Oct 2026)

No database update needed.

### Fixed
- Building an agent in the assistant: the approval card could show an error instead of the agent
  ("…filter is not a function") when the AI described the data access in a slightly different shape.
  It now reads those shapes, and approving the card works.
- The assistant no longer asks for a time zone or exact minute when setting up a scheduled agent; it
  uses the workspace's time zone (Settings › Organization) and 09:00 unless you say otherwise.
- Phone tour: the card now spans the screen width and sits fully on screen at the bottom.

## 1.21.0 (16 Oct 2026)

Needs database update DB-29 before Publish (after DB-28). Without it the new onboarding answers aren't
saved, scheduled agents don't start on their own and the report fixes wait; everything else works.

### Added
- AI agents that run by themselves: on a schedule (every hour, day, weekday or week at a set time,
  in your time zone) or when something happens (an invoice becomes overdue, a deal goes quiet, stock
  runs low, a new lead, a form, a support ticket, a quote answered, an invoice paid, a leave request).
  The database starts due agents every 5 minutes (DB-29); changes and emails still wait for approval.
- Build an agent by chatting: tell the assistant what you want done ("chase overdue invoices every
  Monday") or type /new-agent. It asks up to four questions, then shows the agent for you to approve.
  AI apps can do the same through MCP (create_agent).
- Agent tools: Send email (from the company mailbox, always approved first), Post to team chat (Slack
  or Teams), Find quotes, List payments, List projects. Agents › Connections shows what's ready.
- New commands: /quotes, /payments, /projects, /agents, /new-agent, /setup, /tour, /insights.
- Help menu (the ? in the top bar): take the tour, bring back Getting started or Your first sale,
  guides, report a problem, my reports. Closing a checklist says where to find it again.
- Onboarding asks how you heard about Inuberry and what your business does, and ticks the modules
  that suit it, so the sidebar starts simple. Platform › Insights shows both answers.
- "A new version of Inuberry is ready" with Refresh when a release goes out while a tab is open; a tab
  that can't load a page from an older release reloads once by itself.
- Screenshot tests of the public pages at laptop and phone sizes in CI.

### Changed
- The assistant and AI apps know every feature: the guide now covers the tour, the checklists, your
  sidebar, onboarding, agents, connections, cookies and Platform admin, and a test fails if a page is
  missing from it.
- Platform admin has a grouped menu like Settings (Customers, Pricing, Insights and logs, Feedback)
  and an overview with a tile for each section and what needs a look.
- The tour runs on phones too, counts only the stops your screen has, and never goes off the edge.
- The main file is 712 KB instead of 860 KB (208 KB compressed): the app frame and the Stripe loader
  load when needed.
- The dashboard checks its numbers every time you open it, so a step you just finished ticks off at once.
- The agent wizard: real schedules and events instead of free-text triggers, readable module names,
  only tools that work, the model note instead of free-text model fields, and an agent is created
  in one step (nothing half-made if a part fails). Templates updated to match.
- Sales and Purchasing lists share their queries, and pointing at a tab loads its first page.

### Fixed
- Settings › AI: pressing Test as a non-admin no longer locks the page; the monthly budget shows its
  saved value; removing a provider asks first; clearing a key is logged.
- Reports: the reporter's view never shows internal notes; reviewers who aren't owners can assign
  reports; a link to an older report opens that report; a reporter's reply has its own notification;
  a report's kind, version and browser can't be changed afterwards (DB-29).
- Screenshots for reports must be PNG, JPEG or WebP, now also checked by the database (DB-29).
- Vendor bills are marked overdue once per session instead of on every page view.

## 1.20.0 (16 Oct 2026)

Needs database update DB-28 before Publish, for Platform › Insights only. Without it that page asks
for the update and everything else works.

### Added
- Platform › Insights (platform owners): people with their email, sign-up and last sign-in dates,
  and workspaces; sign-ups per week; workspaces by plan and last activity; module use in the last 30
  days; CSV export. All in one database call (DB-28).
- Product analytics, only after a visitor accepts optional cookies: PostHog (EU) in the app (pages,
  the signed-in user and the workspace's name and plan, no business records, typed text masked),
  and anonymous Google Analytics on the public website. Both stay off until their IDs are set
  (VITE_POSTHOG_KEY, VITE_GA_MEASUREMENT_ID). The privacy policy names both.
- The cookie banner also shows in the app for anyone who never saw it on the website.

### Changed
- The tour dims the rest of the page around the control it explains, follows that control when
  the window resizes, the page scrolls or the sidebar folds, and keeps its card on screen at any
  window size.
- Ask AI opens at once: the assistant is loaded a few seconds after the app opens, or when you
  point at the button, with its conversation list ready.
- Settings menu: pages are indented under their group names.
- New agent › Data access: the column-wide ticks have their own shaded row and every cell has room,
  so no checkbox sits on a table line.
- The assistant can read deals (open, won or lost, with stage, amount and the total of every match).
  It used to answer a question about deals by listing leads.
- Fewer calls: the Projects and Expenses pages load their form pickers when the form opens, and
  Accounting checks its starter accounts once per session instead of on every visit.

## 1.19.0 (16 Oct 2026)

Needs database update DB-27 before Publish (after DB-26). Without it the new parts stay hidden and
everything else works.

### Added
- Your first sale: a five-step checklist on the dashboard (customer, quote, send, invoice, payment)
  that ticks itself off and opens the right page for each step.
- Startup eligibility: onboarding and Settings › Organization ask how many people work in the
  business and its yearly revenue. Billing says so if a Startup workspace is over both limits.
- Sponsor offers on the free Startup plan: up to three partner offers on the dashboard, managed in
  Platform › Sponsors. Never shown anywhere else, and no workspace data goes to sponsors.
- Your sidebar (Settings › Notifications): each person can hide modules they never use.
- /ai-stats lists the latest failure reason for each model, which explains a fallback model's calls.

### Changed
- AI: OpenAI's reasoning models (GPT-6 Luna and others) now go through the Responses API, so they
  can think while they use tools; if that's refused, the call goes through Chat Completions as before.
- Settings › AI: choosing your own provider starts it on that provider's default model (it used to
  keep a built-in model name that OpenAI or Anthropic rejected); the model box suggests current
  models; the built-in row says Inuberry picks the model; default models updated (GPT-6 Luna,
  Claude Haiku 5.5, Gemini 3.8 Flash).
- Pay runs are worked out on the server: drafting a run and recalculating lines.
- Purchase orders, Bills, Expenses and CRM Activities load 25 at a time with paging, filters and
  search in the database.
- The sidebar badges come from one call instead of three every minute (DB-27).
- Every button uses the shared Button component, so they all show the same keyboard focus ring and
  disabled look; section titles inside pages have one size.

### Tests
- Browser tests for the money flows (invoice to payment, pay run), run on a test workspace with
  E2E_WRITE=1. Database self-tests for the overview, sponsor and approvals changes.

## 1.18.0 (16 Oct 2026)

Needs database update DB-26 before Publish. Without it the pages work the old way.

### Changed
- Each module overview (CRM, Sales, Purchasing, Projects, Accounting, HR) and the dashboard now
  loads with one call to the database instead of 4 to 9. The numbers on the cards are added up
  in the database: Sales and Accounting used to download every quote, invoice or journal line to
  add them up in the browser (DB-26).
- Pointing at a module in the sidebar starts loading its numbers, not just its page.
- Reopening the app shows your workspace and last numbers straight away, then refreshes them.
  They are kept in this browser for your account only and removed when you sign out.
- The app opens with your saved sign-in while the server checks it in the background; if the
  server rejects it, you are signed out and taken to the sign-in page.
- The search box is ready a moment after the app opens, so the first click opens it at once.
  The assistant starts loading when you point at Ask AI.
- All icons now come in one shared file: about 35 fewer files to download.
- CRM › Activities shows All by default (was Open), and All is first in the list.

## 1.17.2 (16 Oct 2026)

### Changed
- Opening the app is about 0.6 s faster. The check for pending invitations used to run before your
  workspaces were read; now it runs beside it, and only someone with no workspace yet waits for it.
- While the workspace loads, the screen shows the app's outline (sidebar, top bar, cards) instead
  of "Loading workspace…" on a blank page.

## 1.17.1 (16 Oct 2026)

### Changed
- The code for every page in your sidebar loads quietly in the background a few seconds after the
  app opens. On the live site those downloads took 0.8 to 1.5 s on a first click; now a first visit
  to a module only waits for its data.

### Fixed
- Report a problem only accepts PNG, JPEG or WebP images. The storage bucket's file-type limit
  can't be set from Lovable, so the check is in the app.

## 1.17.0 (15 Oct 2026)

Needs database update DB-25 before Publish. Without it everything still works the old way.

### Added
- A five-stop tour of the sidebar, search, Ask AI, the bell and Report a problem. It runs once for
  each person on a computer screen, and "Take the tour" on the dashboard's Getting started runs it again.

### Changed
- The sidebar, search and dashboard show only the modules your role can use (Settings › Roles).
  A sales rep no longer sees Accounting, HR or Purchasing. The database still decides who can read what.
- Quotes and Sales orders load 25 at a time with paging and search in the database, like Invoices.
  Quotes, sales orders, purchase orders, bills, suppliers and payments fetch only the columns they show.

### Fixed
- Turning a quote into an order or invoice, an order into an invoice, or duplicating an invoice is
  now one database step (DB-25). Before, a failure while copying the lines was ignored and left an
  empty document behind, with a "Converted" message. Until DB-25 is applied, the old steps run and
  remove the empty document if the lines fail.
- Feedback screenshots are limited to PNG, JPEG and WebP up to 10 MB again (DB-25).
- Deleting a sales order that can't be deleted now says why, instead of saying "Deleted".
- Getting started no longer mentions the old "10 people on the free year".

## 1.16.0 (15 Oct 2026)

### Changed
- Moving between pages is faster. Each page change used to wait about 0.3 s for a sign-in check
  with the auth server before anything else started. That check now runs once every few minutes
  per session, and the database still checks every request.
- Pointing at a link loads that page's code before you click, so the click only waits for the
  page's data. Going back to a page you've seen in the last 30 s is instant.
- A thin bar slides along under the top bar as soon as you click, until the new page and its first
  data are in, so it's clear the click worked. The loading skeleton also shows sooner (0.4 s, was 1 s).
- Your workspace, plan and membership are kept for 5 minutes instead of being fetched again on
  almost every page.

### Fixed
- Error messages from the database now reach the screen. Hitting a plan limit (for example a second
  automation on Startup) said "Could not create workflow"; it now says which limit and how to raise it.
  43 places had the same problem.

## 1.15.1 (15 Oct 2026)

### Fixed
- Lines over time show a dot on each month, so it's clear they join monthly figures.
- Chart labels write "AI" in capitals (lead source "AI agent"), and the stock card says "1 item".

## 1.15.0 (15 Oct 2026)

### Changed
- Each chart now fits its data instead of everything being a bar chart:
  - money over time (cash in and out, invoiced and paid, spending, income and costs, revenue and
    expenses in Reports) is a smooth line with a soft fill, with the comparison dashed;
  - parts of a whole (invoices, quotes, tasks and purchase orders by status, leads by source, small
    departments) is a donut with the total in the middle and each part's value and share listed;
  - deal pipelines are one bar split by stage, with each stage's number of deals, value and share
    listed. One stage no longer shows as a single huge bar;
  - rankings (top customers, suppliers, warehouses, larger departments) are a numbered list with
    values and a thin bar, readable with one row and with long names;
  - stock in and out per week is drawn up (in, green) and down (out, red); profit by month is green
    above zero and red below;
  - deals won and lost are stacked green and red per month; hours logged are columns with the
    billable hours as a line.
- Status colours mean the same thing on every chart: done green, waiting amber, in motion blue,
  gone wrong red, not started grey. Charts with more than one series have a legend, count charts
  no longer show fractional ticks, and chart colours are lighter in dark mode.
- The dashboard's cash chart shows an empty state instead of a flat line when nothing has moved.

## 1.14.1 (15 Oct 2026)

### Fixed
- 25 icon-only buttons had no name for screen readers (delete a tax rate, remove a line, previous
  and next week, edit or delete a category, and others). Each now says what it does, and the
  remove and delete ones show red like the rest. The design check now fails on any new icon-only
  button without a label.
- Owed and outstanding amounts on number cards are amber instead of the same green as revenue.

## 1.14.0 (15 Oct 2026)

### Changed
- Collapsing or pinning the sidebar now resizes the page smoothly with it, on the same curve as the
  hover reveal, instead of the page jumping. The phone menu slides in.
- Number tiles across the app (CRM, Sales, Projects, Stock, Purchasing, Accounting, Payroll,
  Reports, Platform, the portal) use the dashboard card design: a coloured icon, the figure, and a
  small chart where the page already has the history (sales revenue and expenses by month, stock
  levels).
- Form fields are white with a firmer border, so they stand out from the page. Panels and form
  sections sit on white cards with a soft shadow; the page stays tinted behind them.
- Action colours: delete and remove buttons are red, a close (×) turns red on hover, ticks are
  green, and toasts get a coloured edge and icon (green done, red failed, amber warning, blue info).

## 1.13.0 (15 Oct 2026)

### Added
- `/ai-stats [days]` in the assistant (owners and admins): model calls and how many failed, median
  response time, tokens in and out, how much came from the provider's cache, estimated cost per
  model, how often each tool call worked, and how the changes the assistant and agents proposed
  ended (done, turned down, failed, waiting). Like the other quick commands it uses no AI.
- Every assistant and agent tool call now records whether it worked, for `/ai-stats`.
- Cost estimates for GPT-6 Luna, with cached input at its lower price.
- Assistant and agent chats show when each message was sent ("14:32", or the date for older ones),
  "Still writing…" under a reply that is still coming in, and "Finished" (or "Stopped" on an error)
  under each finished reply, so a slow answer is never mistaken for a finished one.
- Dashboard cards: a coloured icon, the figure, a small chart (six-month trend for cash in and
  spending; invoices by status, deals by stage, low against out-of-stock for the others) and a badge
  with the change since last month (green when it's the good direction) or the count that needs you.

### Changed
- The collapsed sidebar opens on hover with a short slide from the icon rail (about a quarter of a
  second, easing to a stop) and closes a little faster; a brief pause before opening stops it popping
  open when the pointer only passes over it. With reduced motion turned on, it fades instead.
- The assistant shows how many AI actions were used this month on plans without a limit too.

### Fixed
- Settings › AI crashed: two different usage counts were cached under the same name.
- Pages could crash with "cannot add postgres_changes callbacks" when the notification bell
  reconnected while moving between pages.
- `/low-stock` missed tracked products that were never stocked; it now uses the same stock status as
  the Products list.

## 1.12.1 (15 Oct 2026)

### Fixed
- With OpenAI's GPT-6 Luna or Sol as the model, assistant and agent calls that can use tools are
  sent with reasoning effort "none", the only setting OpenAI accepts for tools on this API. Calls
  without tools (summaries, labels, the assistant's final answer) keep their effort level.

## 1.12.0 (14 Oct 2026)
Database update: migration 0044 (`bun run db:migrate` applies it; self-hosted images do it on start).

### Added
- Quick commands in the assistant: type / to pick one. `/sales`, `/cash`, `/overdue`, `/low-stock`,
  `/leads`, `/crm <name>`, `/project <name>` and `/help` answer at once from your data without the
  AI, so they don't use AI actions. Docs › AI agents lists them.
- Reasoning models (OpenAI gpt-5 and gpt-6 families) get an effort level per job: low for the
  assistant, summaries and labels, medium for agents. The server's secrets can change it
  (OPENAI_REASONING_EFFORT, or per job, e.g. OPENAI_REASONING_EFFORT_AGENTS).
- Hover or tab to any button with a hint and it shows as a proper tooltip at once, instead of the
  browser's slow grey box (which keyboard users never saw).
- Empty lists for agent runs, stock movements, payments and support tickets now say what to do next,
  with a button that goes there.

### Changed
- Products list pages in the database (25 at a time, with search and every filter, stock included)
  instead of loading every product; Export still saves all matching products.
- Buttons on toasts ("Set up", "Undo", "Open", "My reports") work while a dialog or side panel is
  open. When emailing a quote or invoice fails because no mailbox is set up, the panel closes and
  "Set up" goes to Settings › Email.
- The app's first download is a sixth smaller (312 KB to 260 KB compressed): form checks, help text
  and edit panels load with the page that uses them.
- The AI tools have clearer descriptions with an example each, and the four tools that had no
  argument list now have one, so the assistant and agents call them correctly more often.
- One empty-state and one status-badge component across the app, the customer portal and reports;
  the design kit's buttons are now variants of the shared Button.

## 1.11.0 (14 Oct 2026)
Database update: migration 0043 (`bun run db:migrate` applies it; self-hosted images do it on start).

### Added
- Import straight from Notion or Airtable. Paste a token (the Import page explains how to make one),
  pick a Notion database, the pages shared with the integration, or an Airtable base and table, and
  the rows go through the usual column matching. Notion page text comes along as Markdown. Owners
  and admins can save the token for the workspace; it's stored encrypted and never sent back to
  the browser.
- Import a Notion export (.zip, "Markdown & CSV"): each database in it can be imported, with every
  row's page text in a Body column, and pages that aren't in a database come in as one table.
- When some rows fail to import, "Download the list" saves the problems as a CSV.

### Changed
- The assistant remembers long conversations better: the latest 10 messages go to the AI word for
  word and older ones as a running summary. Before, a long chat sent the oldest messages and lost
  the newest.
- The assistant reuses the workspace snapshot for 5 minutes within a conversation instead of
  rebuilding it for every message, and puts the parts of its instructions that never change first,
  so AI providers can cache them (cheaper and faster).
- An agent remembers the last 6 messages of your earlier runs with it, so follow-up questions work.
- Streamed AI answers now record their token use, including cached tokens.
- CSV import: files that use semicolons or tabs are read correctly; numbers like "1.234,56",
  "€12,50" or "(45)" are understood; changing the target keeps the columns you already matched;
  contacts link to existing companies whatever the case of the name, in workspaces with more than
  1,000 companies too; and one bad row no longer fails the 99 rows next to it.
- Imported documents and import runs record where they came from (CSV, Notion export, Notion,
  Airtable).

## 1.10.0 (14 Oct 2026)
Database update: migration 0042 (`bun run db:migrate` applies it; self-hosted images do it on start).

### Added
- The plans on the pricing page now apply in the app: Startup, Startup Plus, Core, Growth, Business
  and Enterprise, each with its limits (contacts, open leads and deals, active projects, employees,
  invoices a month, automations, storage and AI actions). Going over a limit shows a plain message
  saying which limit and how to raise it.
- New workspaces start on Startup, free and with no end date. A workspace on the free first year
  keeps it until the year ends, then moves to Startup instead of becoming read-only.
- AI actions: one per message to the assistant or an agent, AI summary or knowledge answer,
  counted per calendar month (Startup 25, Startup Plus 100, Core 250, Growth 1,000, Business 3,000,
  Enterprise set per company). Actions on your own AI key don't count. The assistant shows how many
  are left, owners and admins get a notice at 80%, and Settings › AI shows the month so far.
- Settings › Billing: your plan with a meter for every limit, and the plans with monthly or yearly
  prices. Until online payment opens, "Ask to upgrade" sends the request to the Inuberry team.
- Platform admin › Plans: edit each plan's monthly price and limits. Organizations: put a workspace
  on any plan; a custom offering can still override single limits.

### Changed
- Storage limits follow the plan (Startup 1 GB, Startup Plus 5 GB, Core and above 10 GB).
- AI call logs record which provider source answered (workspace key, Inuberry, or fallback).

## 1.9.0 (14 Oct 2026)
Database update: migration 0041 (`bun run db:migrate` applies it; self-hosted images do it on start).

### Added
- Report a problem: the bug button in the top bar (or "Report a problem" in search) sends a report
  to the Inuberry team. Take a screenshot and drag over the area that shows the problem (retake or
  remove it before sending), or just write a ticket. The page, version and browser go with it.
  "My reports" shows what you've sent and the team's replies; you get a notification and an email
  when a report changes or someone answers.
- Platform admin › Feedback: every report with its screenshot, status, priority, assignee, replies
  and internal notes. Platform admin › Reviewers: give developers access to Feedback only, without
  billing, plans or impersonation.
- The sidebar can collapse to icons. While collapsed, hovering opens it over the page and moving
  away closes it again; the pin keeps it open.
- Chosen and uploaded files show as cards with a file-type icon (or a thumbnail for images), size
  and a remove button. On Import, the file can be removed or replaced before anything is read.
  Attachments upload several files at once with progress for each, and each upload can be undone
  for 10 seconds.

### Changed
- The search box sits on the right of the top bar at a fixed width, so a long page title no
  longer pushes it around. The shortcut hint says Ctrl K on Windows.
- Sidebar pages are indented under their group, with a guide line.
- On phones, the menu closes with Escape and when you open a page.

## 1.8.0 (14 Oct 2026)
Database update: migration 0040 (`bun run db:migrate` applies it; self-hosted images do it on start).

### Added
- US payroll in HR › Payroll. Add W-4 details, a flat state tax rate and pre-tax 401(k) or health
  deductions to each employee's payroll profile, then run pay for a period: federal income tax
  (IRS Publication 15-T 2026), Social Security (up to the $184,500 wage base), Medicare (plus the
  extra 0.9% over $200,000) and FUTA are worked out for every employee. Change hours or gross pay
  on any line before approving. Approving records wages, taxes owed and net pay owed in
  Accounting; marking paid records the payment. Printable pay slips. Tax filing (941, W-2), tax
  deposits, direct deposit and state tax tables are not included.
- Automatic tests on every push: unit tests (money maths, the role matrix, the payroll
  calculator, release notes, AI tool schemas, help search), browser smoke tests on phone and
  laptop sizes, and every database migration plus self-test on an empty database.

### Changed
- When the AI looks something up and then proposes a change in the same reply, it now also answers
  the question instead of only listing the change.
- Agent requests in Inbox › Approvals are titled with the action and its subject ("Create lead:
  Acme"), with the agent's name underneath.
- The MCP help tool matches different forms of a word ("approve", "approvals") and weighs what a
  question is about over action words like "create".

## 1.7.0 (14 Oct 2026)
Database update: migration 0039 (`bun run db:migrate` applies it; self-hosted images do it on start).

### Added
- The assistant's answers appear as they're written, with a line saying what it's doing ("Looking
  that up…") while it uses tools.
- AI agents can now send invoices, record payments, adjust stock (after approval), summarise a
  project, update tasks, look people up in HR (no pay details), produce sales and cash summaries,
  and notify a teammate. Outside connections (email, Slack, webhooks) say clearly that they aren't
  set up yet.
- Limits on how often public pages and connections can be called: public forms, the contact form,
  the REST API, MCP and the assistant. Normal use never reaches them.
- An automatic check in CI that every MCP tool stays inside the caller's workspace.

### Changed
- The AI uses the provider's own tool calling instead of reading instructions out of its text,
  which is more reliable. Models without tool calling still work the old way.
- Agent runs, approvals and their audit log run on the server. Approving an agent's action now
  runs it in the same step, so nothing is left approved but not done.
- Leads, companies, contacts and invoices load one page at a time and search in the database, so
  long lists stay fast. Invoice search still finds the customer's name.
- Opening the invoices list no longer runs the overdue check; the nightly job does it.
- Saving numbering settings sends all document types at once.
- The MCP help tool ranks answers better: rare words count more than common ones like "create".
- Money code (invoices, payments, purchasing) and the agent data hooks are fully typed.

## 1.6.0 (14 Oct 2026)
Database update: migration 0038 (`bun run db:migrate` applies it; self-hosted images do it on start).

### Added
- Inbox (sidebar, under Home): AI requests waiting for approval from the assistant, AI agents and
  connected AI apps in one list, open support tickets (unassigned first) and your notifications. The
  sidebar badge counts what's waiting. Old approval and notification links open the Inbox.
- Charts on every module overview: CRM, Sales, Inventory, Purchasing, Projects, Accounting and HR.
- The home page fits the role: sales reps, accountants, warehouse and HR managers see their own
  charts first; owners and admins see the business overview.
- "New lead", "New invoice" and 12 more under Create in the search box (Ctrl+K). Each opens the blank
  form; links ending in ?new=1 do the same.
- Pick the modules you use when you create a workspace, or later in Settings › Organization. The
  others leave the sidebar, search and dashboard (nothing is deleted).
- A guide for each part of the app at /docs, and a line under each module's title saying what it's
  for, with a Learn more link. The assistant and AI apps answer from these guides too.
- Icon-only buttons show their name on hover or keyboard focus.

### Changed
- Customers is a tab inside CRM. Sales › Taxes moved to Settings › Taxes. Automations links to the
  daily alerts.
- Settings has a side menu in four groups (Workspace, People and access, Money, AI and
  integrations) instead of 15 numbered tabs.
- What the AI may do on its own is set in Settings › AI.
- Dashboard totals are added up in the database, so the home page loads less data and stays fast as
  the business grows.
- One style for number tiles, status colours and square corners across the app; a check in CI keeps
  rounded corners, raw colours and text under 12px out.
- The email check for notifications runs every 5 minutes instead of 2.

### Fixed
- Timesheets: the totals row no longer runs off the screen on phones.

## 1.5.0 (14 Oct 2026)
No database update.

### Added
- New pricing: Startup (free for businesses with 15 or fewer employees or under $100,000 revenue),
  Startup Plus $12, Core $49, Growth $149, Business $349 a month, Enterprise from $999. Yearly
  prices cost ten months. Self-hosting is now a yearly licence, with an optional install service.
  The pricing page, landing page, guides and FAQ show the new plans; checkout still sells the older
  packages until the new plans are set up for payment.
- Code and data in the app (AI approvals, agent changes, the audit log, API examples, AI replies,
  the guides) show as code blocks with syntax colours and a copy button.
- New agent, Data access step: an All column ticks every action for a module, and each column
  header ticks that action for every module.

### Changed
- The sidebar, top bar and assistant stay loaded while you move between pages: faster page changes,
  and the assistant keeps its conversation.
- The first download is a third smaller (1.5 MB to 1.0 MB): the assistant, search box and update
  pop-up load when first opened.
- Data isn't refetched every time you come back to the browser tab.
- Error messages are in plain words everywhere (signed out, no connection, a required field is
  empty, no permission) instead of raw database text.
- The smallest text in the app is now 12px.
- The AI gives up on a provider after 30 seconds and skips a failing one for 5 minutes, and the
  assistant loads what it needs in parallel, so replies start sooner.
- The sidebar still scrolls but no longer shows a scrollbar.

## 1.4.0 (11 Oct 2026)
Database update: migration 0037 (`bun run db:migrate` applies it; self-hosted images do it on start).

### Added
- Notifications for everything that needs you: AI requests waiting for approval (and their result),
  AI apps connecting or being disconnected, new or expiring developer keys, plan payments, your plan
  ending, support asking for access, customers signing in to the portal or answering a quote, invoices
  paid in full, your role changing, and a welcome for new workspaces.
- Clicking a notification opens the exact record (the approval, deal, task or leave request), and its
  button says what you can do there.
- The bell updates live, shows the true unread count, pops up urgent items, and groups Today and
  Earlier. The notifications page has filters, Mark all read and paging.
- Settings › Notifications: choose per type what reaches your bell and your inbox. Important ones are
  emailed (from the install's mailbox or your workspace's).
- Reminders: plans ending in 14, 7 and 1 days, developer keys expiring, approvals waiting over a day.
- Guides at /docs: install on your own server, updating, connecting AI apps, and common questions. The
  pricing page's Self-host button opens the install guide.
- AI apps can ask Inuberry how it works (new MCP tool inuberry_help).
- Self-hosted image: one image for every install, set up from .env, updates its database on start.
  The admin gets a pop-up when a new version is out and installs it with one click; if the new
  version doesn't start, the previous one keeps running.
- Dashboard with charts: cash in and out, pipeline by stage, invoices by status, top customers, and six
  key numbers with the change since last month. New workspaces get a getting-started checklist.

### Changed
- The sidebar has six groups you can fold, one icon per module, and counts for approvals and support
  tickets waiting. Search (Ctrl+K) lists every page.
- Settings tabs and the Settings overview list the same sections with the same numbers.
- Clearer wording on the public pages; removed features the app doesn't have.

## 1.3.2 (11 Oct 2026)
### Fixed
- An AI app disconnected in Settings › Developer (or whose user left the workspace) now gets a clear
  "reconnect" answer (401) instead of a server error, so the app offers to sign in again.

## 1.3.1 (11 Oct 2026)
### Fixed
- Personal developer keys: every MCP call made with a valid key failed with a server error.

## 1.3.0 (11 Oct 2026)
Database update: migration 0036 (`bun run db:migrate` applies it).

### Added
- Connect your AI: Claude Code, Codex, opencode, ChatGPT, Claude.ai and other MCP apps connect to a
  workspace at `/mcp`. The app opens an Inuberry sign-in where you pick the workspace and click Allow
  (`/oauth/consent`); or use a personal developer key (Settings › Developer) for scripts and CI.
- 19 MCP tools: look up customers, leads (and lead counts), deals, invoices, products, low stock,
  projects and tasks; propose new leads, companies, contacts, tasks and notes. Proposals follow the
  workspace's AI approval rules, like the in-app assistant. Everything is limited to the chosen workspace
  and the user's role.
- Settings › Developer › Connect your AI: server URL, connected apps (disconnect), personal keys.
- Public setup guide at `/developers/mcp`, with steps an AI agent can follow.

### Changed
- MCP tools always filter by workspace (people in two workspaces could see both) and their changes now
  need approval like the assistant's (they used to write directly).

## 1.2.7 (11 Oct 2026)
### Fixed
- Pages that still scrolled sideways: Settings › Portal users and Email (desktop), Accounting, AI Agents
  and Settings › Billing (phone). Grid columns now shrink and let wide content scroll in its own box.

## 1.2.6 (11 Oct 2026)
### Changed
- Platform tables: the rows-per-page and Previous/Next bar stays visible while the rows scroll sideways
  on phones.
- Thinner, quieter scrollbars across the app.
- The original design kit is in the repo (`docs/design/inuberry-design-kit.webp`) as the UI reference.

## 1.2.5 (11 Oct 2026)
### Fixed
- Wide tables pushed whole pages sideways on phones and tablets; they now scroll sideways inside their own
  box (platform, settings, accounting, agents and portal-user tables).
- The landing page hero showed "v1.0"; it now shows the current version.

## 1.2.4 (11 Oct 2026)
Database update: migration 0035 (`bun run db:migrate` applies it).

### Fixed
- Customer portal stayed empty for every customer: an invited portal user was never linked to their login
  (the browser wasn't allowed to do it). They are now linked on sign-in when the email is confirmed, and
  "last login" is recorded. A customer whose account isn't linked to a company sees why.

### Added
- Platform › Organizations, Subscriptions, Billing events, Audit and Impersonation: search, filters, and
  25 / 50 / 100 rows per page with Previous / Next (older rows were cut off or everything loaded at once).
- Customer portal tabs on phones.

## 1.2.3 (9 Oct 2026)
### Fixed
- Support access: Approve, Deny and Revoke said "recorded" but changed nothing (org admins can only read
  the requests table), so a request stayed pending and could be approved again and again. The server now
  saves the decision after checking the admin's role, refuses expired requests, and expired requests show
  as EXPIRED.

## 1.2.2 (9 Oct 2026)
Database update: migration 0034 (`bun run db:migrate` applies it).

### Fixed
- The platform owner was locked out of Accounting, HR and other owner-only actions in their own Platform workspace.
- "Request a demo" on /contact showed "Received" but saved nothing; requests now arrive as leads in the
  Platform workspace (CRM › Leads) with a notification.
- Platform and settings tables (subscriptions, organizations, offerings, support access, demo, members,
  taxes) had columns that didn't line up.

### Changed
- Settings › Portal users: "Send invite" is now "Add portal user" and copies the portal sign-up link
  (no email is sent). Platform › Impersonation explains how to request support access.

## 1.2.1 (9 Oct 2026)
Database update: migration 0033 (`bun run db:migrate` applies it).

### Fixed
- The platform owner got no owner alerts (low stock, overdue invoices, payments, leave, support tickets,
  new members) in their own Platform workspace.

## 1.2.0 (9 Oct 2026)
Database updates: migrations 0030, 0031 and 0032 (`bun run db:migrate` applies them).

### Added
- AI assistant can act, with approval: it proposes leads, companies, contacts, tasks and activities as
  cards you approve or reject in the chat; several at once, each with an "Open it" link when done.
- Talk to your own AI agents from the assistant panel ("Talk to"); their proposals are approved inline.
- The assistant guides people: it knows where everything is in the app, the page you're on and the last
  errors you saw, and answers with numbered steps and links.
- Chat replies are formatted: tables, lists, code and math formulas.
- Notifications that reach people: overdue invoices, low or out-of-stock products, stale deals and
  overdue tasks every day at 06:00 UTC (or "Run now"), plus alerts when a task is assigned or commented,
  a payment arrives, leave is requested or decided, an AI agent needs approval, a support ticket or
  customer reply comes in, or a member joins. Clicking a notification opens the record.
- Support inbox for staff (sidebar › Support): tickets from the customer portal, replies, internal notes,
  status, priority and assignee.
- Account card at the bottom of the sidebar: name, email, role and a Platform owner tag; sign-out icon.
- Clickable breadcrumbs, a wide search box, and a drop zone for imports and attachments.
- Pricing: landing page and /pricing show Self-host (free), the plans on sale and Enterprise (talk to us).

### Changed
- The sidebar and the page scroll separately; Sign out is always visible.
- Small headings use Inter semibold instead of Anton, so they're readable.
- Settings › AI usage shows why an AI call failed.

### Fixed
- A platform owner's workspace switcher listed every company in the system.
- Notifications sent to a role or to everyone couldn't be marked read, and owners missed role alerts.
- Companies created after June had no alert rules.
- The assistant could create a duplicate of an existing company.
- AI agents could run a write tool without an approved action (now checked on the server).
- Deprecation warnings for `createServerFn().inputValidator()`.

## 1.1.0 (7 Oct 2026)
### Added
- Runs outside Lovable: Node/Docker build (`bun run build:node`, `Dockerfile`, `docker-compose.yml`).
- Database tooling: `db:migrate` applies every migration in order on a fresh Supabase database;
  `db:bootstrap` makes the first platform owner.
- Version endpoint `/api/public/version`, version shown in the app header, and an
  "Update available" notice for the platform owner (`UPDATE_FEED_URL`).
- `.env.example` listing every setting, and `docs/self-hosting.md`.
- Billing without per-user pricing: every new company gets a free first year (10 users, 12 months,
  every module); then prepaid packages (users × months) or yearly storage plans with unlimited users.
  Prices and limits are set in Platform → Plans. When a plan ends, data stays readable but is read-only.
- File attachments on companies, contacts, quotes, invoices, bills, suppliers, employees, projects and
  tasks, counted against the plan's storage.
- Company mailbox: quotes and invoices are emailed from each company's own SMTP mailbox (Settings → Email).
- AI: a company's own provider first, then the install's default (`OPENAI_API_KEY`, then `OPENROUTER_API_KEY`), then Lovable AI;
  each one falls back to the next if it fails.
  Saved AI keys and mailbox passwords are encrypted (`APP_ENCRYPTION_KEY`).
- Stripe: use your own Stripe account with `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`.
- Off-Lovable sign-in: Google through your own Supabase (`VITE_OAUTH_MODE=native`), and the sign-in
  emails exported for Supabase (`bun run email:templates`).

### Changed
- The public pricing page shows the plans actually on sale.
- Docker image uses an Alpine base (smaller).

## 1.0.0
- First release: CRM, sales, invoicing, inventory, purchasing, accounting, projects, HR,
  workspace, forms, automations, AI agents, customer portal, REST API, webhooks and MCP.
