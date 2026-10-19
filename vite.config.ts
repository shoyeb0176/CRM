// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.

import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    // /mcp and its OAuth metadata route are hand-owned in src/routes, so the mcp-js Vite plugin is not used.
    
    // Cloudflare-only modules ("cloudflare:workers" in mcp-js, "cloudflare:sockets" in worker-mailer)
    // are imported lazily and only on Workers. Leave them to the runtime so non-Cloudflare builds
    // (`build:node`, Docker) bundle; on Node those code paths are never taken.
    build: { rollupOptions: { external: [/^cloudflare:/] } },
    // Browser files only: every icon in one shared file instead of one tiny file per icon (about 40
    // fewer requests when pages load). Grouping Radix or src/components/ui too made the first
    // download much bigger (those groups pull in pieces only some pages use), so they stay split.
    environments: {
      client: {
        build: {
          rollupOptions: {
            output: {
              manualChunks(id: string) {
                if (id.includes("node_modules/lucide-react")) return "icons";
              },
            },
          },
        },
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
