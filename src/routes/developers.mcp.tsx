// Old address of the MCP guide (linked from the MCP server's metadata and earlier emails).
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/developers/mcp")({
  beforeLoad: () => {
    throw redirect({ to: "/docs/$slug", params: { slug: "mcp" }, statusCode: 301 });
  },
});
