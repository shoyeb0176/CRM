// Public guides at /docs/<slug>. One source for the pages, the MCP help tool (inuberry_help) and the
// in-app assistant, so all three give the same answer.
//
// Body format (kept tiny on purpose): blank line = new paragraph, "- " = bullet, "1. " = numbered step,
// `code`, **bold**, [label](/path or https://…).
import { pricingSummary } from "@/lib/billing/pricing";
import { MODULE_DOCS } from "./modules";

/** Where self-hosters download the app. The registry isn't chosen yet: change it here once it is. */
export const SELF_HOST_IMAGE = "ghcr.io/YOUR-ORG/inuberry";
export const SELF_HOST_IMAGE_READY = false;
export const MCP_URL = "https://crm.inuberry.com/mcp";

export type DocSection = { id: string; heading: string; body: string; code?: string; codeLabel?: string };
export type Doc = { slug: string; title: string; summary: string; audience: string; sections: DocSection[] };

const COMPOSE = `services:
  app:
    image: \${INUBERRY_IMAGE}:\${INUBERRY_VERSION:-latest}
    env_file: .env
    ports:
      - "\${PORT:-3000}:3000"
    labels:
      - inuberry.role=app
    restart: unless-stopped

  # Installs updates when the platform owner clicks "Update now". Optional.
  updater:
    image: \${INUBERRY_IMAGE}:\${INUBERRY_VERSION:-latest}
    command: ["node", "/app/deploy/updater.mjs"]
    user: "0"
    environment:
      UPDATER_TOKEN: \${UPDATER_TOKEN}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
    restart: unless-stopped`;

const ENV = `# Which image and version to run
INUBERRY_IMAGE=${SELF_HOST_IMAGE}
INUBERRY_VERSION=latest

# Your address (used in emails and links)
SITE_URL=https://erp.yourcompany.com
PORT=3000

# Supabase: Project Settings › API, and Project Settings › Database › Connection string
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<anon key>
SUPABASE_PROJECT_ID=<project-ref>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres

# Encrypts saved AI keys and mailbox passwords. Make it once, never change it:
#   openssl rand -base64 32
APP_ENCRYPTION_KEY=

# One-click updates: any long random string, the same for the app and the updater
UPDATER_TOKEN=
UPDATER_URL=http://updater:8080
UPDATE_FEED_URL=https://crm.inuberry.com/api/public/releases

# Optional: a mailbox for notification emails
PLATFORM_SMTP_HOST=
PLATFORM_SMTP_PORT=587
PLATFORM_SMTP_USER=
PLATFORM_SMTP_PASS=
PLATFORM_SMTP_FROM=

# Optional: AI for every workspace that hasn't added its own key
OPENAI_API_KEY=`;

export const DOCS: Doc[] = [
  {
    slug: "self-hosting",
    title: "Install Inuberry on your own server",
    summary: "Self-hosting step by step with Docker. Your server, your database, your data. Needs a yearly licence.",
    audience: "IT admins and developers",
    sections: [
      {
        id: "what-you-get",
        heading: "What you get",
        body: `The same app as Inuberry Cloud (CRM, sales, invoicing, inventory, purchasing, accounting, HR, projects, the AI assistant and agents) running on a server you control.

Self-hosting needs a yearly licence: $590 for Core, $1,790 for Growth, $4,190 for Business, custom for Enterprise. You also pay for your own server and database. To get a licence, or to have us install it for you (from $750), [talk to us](/contact). Prices are on the [pricing page](/pricing#self-hosted).

You get Inuberry as a ready-made Docker image, not as source code. When a new version is out, the app tells your admin, and installing it takes one click.`,
      },
      {
        id: "requirements",
        heading: "What you need",
        body: `- A Linux server with Docker 24 or newer and Docker Compose (2 vCPU and 4 GB of memory is enough for most teams). Any cloud works: AWS, Google Cloud, Azure, DigitalOcean, Hetzner, or a machine in your office.
- A domain or subdomain for the app, for example \`erp.yourcompany.com\`, pointing at the server.
- A Supabase project for the database and sign-in. The free tier of [Supabase Cloud](https://supabase.com) works, or you can run [Supabase yourself](https://supabase.com/docs/guides/self-hosting/docker).
- Optional: a mailbox (SMTP) for notification emails, and an OpenAI key for the AI features.`,
      },
      {
        id: "get-the-image",
        heading: "1. Get the image",
        body: SELF_HOST_IMAGE_READY
          ? `The image is \`${SELF_HOST_IMAGE}\`. You don't need to download it by hand: Docker pulls it in step 4.`
          : `**The public download link isn't published yet.** [Contact us](/contact) and we'll send you access. The steps below use \`${SELF_HOST_IMAGE}\` as the image name: replace it with the one we give you.`,
      },
      {
        id: "database",
        heading: "2. Create the database",
        body: `1. Create a Supabase project and wait until it's ready.
2. Copy four values from **Project Settings › API**: the project URL, the project ref, the \`anon\` key and the \`service_role\` key.
3. Copy the connection string from **Project Settings › Database** (use the direct connection, port 5432).

You don't create any tables yourself. Inuberry sets up the database the first time it starts, and updates it with every new version.`,
      },
      {
        id: "configure",
        heading: "3. Configure",
        body: `On the server, make a folder (for example \`/opt/inuberry\`) and create two files in it. The first is \`.env\` with your values. Keep this file private: it holds keys that give full access to your data.`,
        code: ENV,
        codeLabel: ".env",
      },
      {
        id: "compose",
        heading: "The second file: docker-compose.yml",
        body: `This runs the app, plus a small updater that installs new versions when your admin clicks "Update now". If you'd rather update by hand, delete the \`updater\` part.`,
        code: COMPOSE,
        codeLabel: "docker-compose.yml",
      },
      {
        id: "start",
        heading: "4. Start it",
        body: `Run this in the folder. The first start takes a minute while the database is set up.`,
        code: `docker compose up -d
docker compose logs -f app     # wait for "Listening on", then Ctrl+C
curl http://localhost:3000/api/public/version`,
      },
      {
        id: "https",
        heading: "5. Put it behind HTTPS",
        body: `Browsers need HTTPS for sign-in. The simplest way is [Caddy](https://caddyserver.com), which gets a certificate for you. Install it on the server and use this Caddyfile, then run \`systemctl reload caddy\`. A cloud load balancer, nginx or Traefik work too.`,
        code: `erp.yourcompany.com {
  reverse_proxy localhost:3000
}`,
        codeLabel: "/etc/caddy/Caddyfile",
      },
      {
        id: "sign-in",
        heading: "6. Set up sign-in in Supabase",
        body: `- **Authentication › URL configuration:** set Site URL to your address and add \`https://erp.yourcompany.com/**\` to the redirect URLs.
- **Authentication › SMTP:** add a mailbox, so sign-up and password emails come from your domain.
- **Authentication › Email templates:** paste the Inuberry templates. Copy them out of the image with \`docker compose cp app:/app/deploy/email-templates ./email-templates\`; the README in that folder says which file goes where.
- Optional, **Authentication › Providers › Google:** add a Google OAuth client so people can sign in with Google.
- Optional, to let AI apps connect: **Authentication › OAuth Server:** turn it on, allow dynamic client registration, and set the authorization path to \`/oauth/consent\`.`,
      },
      {
        id: "admin",
        heading: "7. Make yourself the admin",
        body: `Open your address, click **Start free**, and sign up with your work email. Confirm the email, then run this on the server with that address. It makes your account the admin of this install, with the **Platform** console for plans, workspaces and updates.`,
        code: `docker compose exec app inuberry make-admin you@yourcompany.com`,
      },
      {
        id: "backups",
        heading: "Backups",
        body: `Everything lives in the Supabase database and its file storage. On Supabase Cloud, daily backups are included on paid plans; on the free tier, or when you run Supabase yourself, schedule a dump:`,
        code: `pg_dump "$DATABASE_URL" -Fc -f inuberry-$(date +%F).dump`,
      },
      {
        id: "help",
        heading: "If something goes wrong",
        body: `- \`docker compose logs app\` shows what the app is doing. Problems with the database or keys are reported there in plain words.
- The app doesn't start: check every Supabase value in \`.env\`, and that \`DATABASE_URL\` uses port 5432.
- Sign-up emails don't arrive: set up SMTP in Supabase (step 6).
- Still stuck? [Contact us](/contact) with the log lines.`,
      },
    ],
  },
  {
    slug: "updates",
    title: "Updating a self-hosted install",
    summary: "How you hear about new versions, the one-click update, updating by hand, and going back.",
    audience: "IT admins",
    sections: [
      {
        id: "notice",
        heading: "How you hear about a new version",
        body: `While the admin uses the app, it checks [our release feed](/api/public/releases) every few hours. Nothing about your install or your data is sent. When a newer version is out, the admin sees a pop-up with what changed, gets a notification in the bell, and an email if a mailbox is set up.`,
      },
      {
        id: "one-click",
        heading: "Update with one click",
        body: `In the pop-up (or **Platform › Overview**), click **Update now**. The updater downloads the new version and restarts the app. The database is updated on start. It takes a minute or two; the page tells you when the new version is running.

This needs the \`updater\` service from the install guide, with the same \`UPDATER_TOKEN\` for the app and the updater, and \`INUBERRY_VERSION=latest\`.`,
      },
      {
        id: "manual",
        heading: "Update by hand",
        body: `Without the updater, run these two commands in the install folder:`,
        code: `docker compose pull
docker compose up -d`,
      },
      {
        id: "pin",
        heading: "Stay on a version, or go back",
        body: `Set \`INUBERRY_VERSION\` in \`.env\` to a version number (for example \`1.4.0\`) and run \`docker compose up -d\`. While a number is set, the app stays on that version.

Database changes only add things, so going back one version usually works. Take a backup before every update anyway (see the install guide): if you need to go back further, restore the backup that matches the version.`,
      },
      {
        id: "notes",
        heading: "What changed",
        body: `Every version's changes are listed in [the release feed](/api/public/releases) and in the update pop-up.`,
      },
    ],
  },
  {
    slug: "mcp",
    title: "Connect your AI to Inuberry",
    summary: "Add Inuberry to Claude, ChatGPT, Codex, Cursor and other AI apps, then ask about your business or have the AI propose changes.",
    audience: "Everyone using an AI app",
    sections: [
      {
        id: "intro",
        heading: "How it works",
        body: `Inuberry has an MCP server (Model Context Protocol, the standard AI apps use for tools). Add it to your AI app, sign in, pick a workspace and click Allow. The app can then answer questions like "how many leads do we have?" or "what's low on stock?", and propose new leads, contacts, companies, tasks and notes. A person approves those in Inuberry first: you get a notification with a **Review** button.

Server URL (streamable HTTP): \`${MCP_URL}\``,
      },
      {
        id: "agents",
        heading: "For AI agents reading this page",
        body: `To connect the user's Inuberry workspace, add the remote MCP server \`${MCP_URL}\` (transport: streamable HTTP, auth: OAuth 2.1 with dynamic client registration) using the commands for your client below. The user's browser then opens an Inuberry sign-in and consent screen: they sign in, choose the workspace and click Allow. Never ask the user for their password. If your client can't do OAuth, ask the user to create a personal developer key in Inuberry (Settings › Developer › Personal developer keys) and send it as \`Authorization: Bearer inbp_…\`. Call \`list_workspaces\` first to confirm the workspace and role, and \`inuberry_help\` for questions about how Inuberry works.`,
      },
      { id: "claude-code", heading: "Claude Code", body: `Run this, then type \`/mcp\` in Claude Code, choose **inuberry** and **Authenticate**.`, code: `claude mcp add --transport http inuberry ${MCP_URL}

# with a personal key instead of signing in:
claude mcp add --transport http inuberry ${MCP_URL} --header "Authorization: Bearer inbp_YOUR_KEY"` },
      { id: "codex", heading: "Codex (CLI and IDE)", body: `Add this to \`~/.codex/config.toml\`, then sign in with \`codex mcp login inuberry\`. With a personal key, add \`bearer_token_env_var = "INUBERRY_KEY"\` to the block and set that environment variable.`, code: `[mcp_servers.inuberry]
url = "${MCP_URL}"` },
      { id: "opencode", heading: "opencode", body: `In \`opencode.json\` (project) or \`~/.config/opencode/opencode.json\`. opencode starts the sign-in when it first connects. With a personal key, add \`"headers": { "Authorization": "Bearer inbp_YOUR_KEY" }\` to the server.`, code: `{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "inuberry": { "type": "remote", "url": "${MCP_URL}" }
  }
}` },
      { id: "claude-ai", heading: "Claude.ai and Claude Desktop", body: `Settings › Connectors › **Add custom connector**. Name it Inuberry, paste \`${MCP_URL}\`, click Connect and sign in.` },
      { id: "chatgpt", heading: "ChatGPT", body: `Settings › Apps & Connectors › Advanced: turn on **Developer mode**, then **Create** a connector with the URL \`${MCP_URL}\` and OAuth sign-in. Sign in when asked.` },
      { id: "cursor", heading: "Cursor, VS Code and other MCP apps", body: `Most apps take a JSON entry like this (VS Code calls the list \`"servers"\`, Cursor \`"mcpServers"\`).`, code: `{
  "mcpServers": {
    "inuberry": { "url": "${MCP_URL}" }
  }
}` },
      { id: "scripts", heading: "Scripts and CI (personal key)", body: `Make a key in Inuberry › Settings › Developer › Personal developer keys. It acts as you, in one workspace, with your role, and expires after 30, 90 or 365 days. Then call the server over plain HTTP:`, code: `curl ${MCP_URL} \\
  -H "Authorization: Bearer inbp_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"leads_summary","arguments":{}}}'` },
      {
        id: "tools",
        heading: "What the AI can do",
        body: `- **Look things up:** list_workspaces, search_customers, list_companies, list_contacts, list_leads, leads_summary, list_deals, list_quotes, list_invoices, get_invoice, list_payments, list_products, low_stock, list_projects, list_project_tasks, list_agents.
- **Answer questions about Inuberry:** inuberry_help (how to do something, what a setting means, how plans and approvals work).
- **Propose changes:** create_lead, create_company, create_contact, create_task, log_activity, create_agent (an AI agent that runs by hand, on a schedule or when something happens; always approved by a person first). Each one waits for a person to approve it (Inbox › Approvals), unless an owner changed that in the AI actions page. get_action_status tells the AI the outcome.
- Everything stays inside the workspace you picked, and the AI can only see or change what your role allows. When a plan has ended, the workspace is read-only.
- Disconnect an app or revoke a key any time in Settings › Developer. You get a notification whenever an app connects or is disconnected.`,
      },
    ],
  },
  {
    slug: "faq",
    title: "Questions people ask",
    summary: "Plans, approvals, notifications, data and security, in short answers.",
    audience: "Everyone",
    sections: [
      { id: "plans", heading: "What does Inuberry cost?", body: `There are no per-user fees. You pay for what your business needs:

${pricingSummary()}

A year costs the same as ten months. Online checkout for these plans opens soon; until then new workspaces start on Startup, and you can [talk to us](/contact) to move to a paid plan. Full details on the [pricing page](/pricing).` },
      { id: "startup-free", heading: "Who can use Startup for free?", body: `Businesses with 15 or fewer employees, or under $100,000 a year in revenue. Startup is paid for by sponsors: you see offers for business tools on the dashboard and in the marketplace, never inside your records, invoices, reports or HR data, and we never sell your data. Startup Plus ($12 a month) removes the offers and raises the limits.` },
      { id: "plan-ends", heading: "What happens when a plan ends?", body: `The workspace becomes read-only. You can still sign in, see everything and read it through the API, but nothing can be changed until an owner renews in Settings › Billing. Owners get reminders 14, 7 and 1 day before.` },
      { id: "self-host-cost", heading: "What does self-hosting cost?", body: `A yearly licence: $590 for Core, $1,790 for Growth, $4,190 for Business, custom for Enterprise. You run the servers. We can install it for you from $750. [Talk to us](/contact) or read the [install guide](/docs/self-hosting).` },
      { id: "approvals", heading: "How do AI approvals work?", body: `When the assistant, an AI agent or a connected AI app wants to change something, it waits in **Inbox › Approvals** and you get a notification with a Review button. Owners choose per action how much the AI may do: Never, Draft only, Ask me first (the default) or Do it automatically. Requests waiting more than a day send a reminder.` },
      { id: "notifications", heading: "What will I be notified about?", body: `Approvals waiting for you, payments and paid invoices, overdue invoices, low stock, tasks assigned to you, leave requests, support tickets, quotes your customers answer, people joining, AI apps connecting, new keys, support access requests, and your plan ending. Click a notification to open the exact record. Choose what reaches your bell and your inbox in **Settings › Notifications**; security notices can't be turned off.` },
      { id: "connect-ai", heading: "Can I use Inuberry from ChatGPT or Claude?", body: `Yes. Add \`${MCP_URL}\` as a connector, sign in and pick a workspace. Steps for each app are in [Connect your AI](/docs/mcp).` },
      { id: "who-sees", heading: "Who can see my data?", body: `Only members of your workspace, and each role sees only its modules (Settings › Roles). Inuberry support can't open your workspace unless an owner approves a support-access request, and you can end that access any time. Every workspace's data is separated in the database itself, not only in the app.` },
      { id: "export", heading: "Can I get my data out?", body: `Yes. Products export to CSV from the Products page, the REST API (Settings › Developer › API keys) reads customers, leads, deals, invoices, products and more, and a connected AI app can pull lists for you. On a self-hosted install, the whole database is yours.` },
      { id: "team", heading: "How do I add teammates?", body: `Settings › Members › Invite. They get an email, set a password and land in your workspace with the role you picked.` },
      { id: "portal", heading: "Can my customers sign in?", body: `Yes, to the customer portal, where they see their quotes, invoices and projects and open support tickets. Add them in Settings › Portal users, then send them the portal link. They sign up with the same email address.` },
      { id: "updates", heading: "How do updates reach a self-hosted install?", body: `The admin gets a pop-up and a notification when a new version is out, and installs it with one click. See [Updating](/docs/updates).` },
    ],
  },
];

/** Setup guides, then the guide to each part of the app. */
export const ALL_DOCS: Doc[] = [...DOCS, ...MODULE_DOCS];
export { MODULE_DOCS };

export const docBySlug = (slug: string) => ALL_DOCS.find((d) => d.slug === slug);

/** Plain-text sections for search (MCP inuberry_help, assistant). */
export function docSections() {
  return ALL_DOCS.flatMap((d) => d.sections.map((s) => ({
    title: `${d.title}: ${s.heading}`,
    text: `${s.body}${s.code ? `\n\n${s.code}` : ""}`,
    url: `/docs/${d.slug}#${s.id}`,
  })));
}
