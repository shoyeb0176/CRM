// Inuberry ERP MCP server ("Connect your AI").
//
// Lets AI apps (Claude Code, Codex, opencode, ChatGPT, Claude.ai, …) work with one Inuberry workspace
// for one user, with that user's role. Two ways in (see src/routes/mcp.ts):
// - OAuth: Supabase Auth is the authorization server; the user signs in and picks the workspace on
//   /oauth/consent. This default export is that server (the Vite plugin reads it).
// - Personal developer key (`inbp_…`, Settings › Developer): keyMcp(), for scripts and CI.
// Setup guide: /docs/mcp (src/lib/docs/content.ts).
import { auth, defineMcp } from "@lovable.dev/mcp-js";
import { oauthContext, type McpAppContext } from "./context";
import { supabaseForUser } from "./supabase.server";
import { TOOLS } from "./tools";

const supabaseUrl = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "").replace(/\/+$/, "");

const base = {
  name: "inuberry-erp",
  title: "Inuberry ERP",
  version: "1.0.0",
  instructions:
    "Tools for one Inuberry ERP workspace: customers (companies, contacts), leads, deals, invoices, products and stock, projects and tasks. " +
    "Call list_workspaces to see which workspace and role you have. Use search_customers to turn names into ids. " +
    "For questions about how Inuberry works (where things are, plans, approvals, notifications, self-hosting), call inuberry_help. " +
    "create_* and log_activity propose changes: by default a person approves them in Inuberry first, so tell the user it is pending and check later with get_action_status.",
  tools: TOOLS,
};

export default defineMcp<McpAppContext>({
  ...base,
  auth: auth.oauth.issuer({
    issuer: `${supabaseUrl}/auth/v1`,
    acceptedAudiences: "authenticated",
    resourceDocumentation: "https://crm.inuberry.com/docs/mcp",
  }),
  createAppContext: async ({ auth }) => {
    const token = auth.getToken();
    const userId = auth.getUserId();
    if (!token || !userId) throw new Error("Authenticated caller required");
    return oauthContext(supabaseForUser(token), userId, auth.getClientId());
  },
});

/** The same server for a caller already identified by a personal key (no OAuth). mcp-js only allows
 *  createAppContext together with OAuth, so each tool gets the key's context handed in directly
 *  (tools only read ctx.appContext). */
export function keyMcp(ctx: McpAppContext) {
  const tools = TOOLS.map(({ requiresAppContext: _, handler, ...t }) => ({
    ...t,
    handler: (args: never) => handler(args, { appContext: ctx } as never),
  }));
  return defineMcp({ ...base, tools: tools as never });
}
