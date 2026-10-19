// Lets `bun test` load Vite-style "file?raw" imports (e.g. CHANGELOG.md in src/lib/releases.ts).
import { plugin } from "bun";
import { dirname, resolve } from "node:path";

plugin({
  name: "vite-raw",
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (a) => ({ path: resolve(dirname(a.importer), a.path.slice(0, -4)), namespace: "raw" }));
    build.onLoad({ filter: /.*/, namespace: "raw" }, async (a) => ({ contents: `export default ${JSON.stringify(await Bun.file(a.path).text())};`, loader: "js" }));
  },
});
