// Starts a self-hosted Inuberry container.
//  1. Puts this install's public settings into the built app. The image is built once for everyone
//     with placeholders (__INB_…__) where the browser needs the Supabase address and key; they are
//     filled in here from the environment, from a clean copy, so changing .env and restarting works.
//  2. Brings the database up to date (when DATABASE_URL is set).
//  3. Runs the server.
import { cpSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const env = process.env;
const fail = (msg) => { console.error(`\n[inuberry] ${msg}\n`); process.exit(1); };

const values = {
  __INB_SUPABASE_URL__: env.SUPABASE_URL,
  __INB_SUPABASE_KEY__: env.SUPABASE_PUBLISHABLE_KEY,
  __INB_SUPABASE_PROJECT__: env.SUPABASE_PROJECT_ID ?? "",
  __INB_STRIPE_PK__: env.STRIPE_PUBLISHABLE_KEY ?? "",
};
const missing = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !env[k]);
if (missing.length) fail(`Missing in .env: ${missing.join(", ")}. See https://crm.inuberry.com/docs/self-hosting#configure`);
if (!/^https?:\/\//.test(env.SUPABASE_URL)) fail("SUPABASE_URL must start with https:// (Supabase › Project Settings › API).");

// 1. Fresh copy of the built app, then fill in the placeholders.
const TEMPLATE = "/app/.output-template";
const OUT = "/app/.output";
rmSync(OUT, { recursive: true, force: true });
cpSync(TEMPLATE, OUT, { recursive: true });
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(m?js|html|json)$/.test(f) ? [p] : [];
});
let changed = 0;
for (const file of walk(OUT)) {
  const src = readFileSync(file, "utf8");
  if (!src.includes("__INB_")) continue;
  let out = src;
  for (const [k, v] of Object.entries(values)) out = out.split(k).join(v);
  writeFileSync(file, out);
  changed++;
}
console.log(`[inuberry] configured for ${env.SUPABASE_URL} (${changed} files)`);

// 2. Database.
if (env.DATABASE_URL) {
  console.log("[inuberry] updating the database…");
  const r = spawnSync("bash", ["/app/scripts/db-migrate.sh"], { stdio: "inherit", cwd: "/app" });
  if (r.status !== 0) fail("The database update failed (see above). Check DATABASE_URL: Supabase › Project Settings › Database, direct connection on port 5432.");
} else {
  console.warn("[inuberry] DATABASE_URL isn't set, so the database isn't updated automatically. Set it to have new versions update the database on start.");
}

// 3. Server.
await import(join(OUT, "server/index.mjs"));
