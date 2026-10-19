// One-click updates for self-hosted installs. Runs as the "updater" service next to the app
// (same image, `node /app/deploy/updater.mjs`, Docker socket mounted).
//
// POST /update with "Authorization: Bearer <UPDATER_TOKEN>" (202, runs in the background):
//   pulls the app container's image again, and if it changed, recreates the container with the
//   same settings on the new image. If the new one doesn't start, the old one is put back.
// GET /status (same token) → {state: idle|running|done|current|failed, message, at}
// GET /health → {"ok":true}
// Talks to the Docker Engine API over /var/run/docker.sock; nothing else is needed.
import http from "node:http";

const TOKEN = process.env.UPDATER_TOKEN ?? "";
const PORT = Number(process.env.UPDATER_PORT ?? 8080);
const LABEL = process.env.UPDATER_LABEL ?? "inuberry.role=app";
const SOCKET = "/var/run/docker.sock";

if (TOKEN.length < 16) {
  console.error("[updater] UPDATER_TOKEN must be set (16+ characters), the same value the app has.");
  process.exit(1);
}

function docker(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({ socketPath: SOCKET, path: `/v1.43${path}`, method,
      headers: data ? { "content-type": "application/json", "content-length": Buffer.byteLength(data) } : {} }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => {
        if (res.statusCode >= 400) return reject(new Error(`Docker ${method} ${path}: ${res.statusCode} ${buf.slice(0, 300)}`));
        try { resolve(buf ? JSON.parse(buf) : null); } catch { resolve(buf); }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

let busy = false;

/** Waits until the new container is healthy (its health check passes). Any restart or exit, or
 *  "unhealthy", counts as a failed update. Without a health check: running for 20 s is enough. */
async function waitHealthy(id, name) {
  const until = Date.now() + 150_000;
  const started = Date.now();
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 3000));
    const c = await docker("GET", `/containers/${id}/json`);
    const st = c.State;
    if (st.Restarting || c.RestartCount > 0 || (!st.Running && st.Status !== "created")) {
      throw new Error(`The new version stopped (exit ${st.ExitCode}). Check: docker logs ${name}`);
    }
    if (st.Health?.Status === "healthy") return;
    if (st.Health?.Status === "unhealthy") throw new Error(`The new version isn't healthy. Check: docker logs ${name}`);
    if (!st.Health && Date.now() - started > 20_000) return;
  }
  throw new Error(`The new version didn't become healthy in time. Check: docker logs ${name}`);
}

async function update() {
  const filters = encodeURIComponent(JSON.stringify({ label: [LABEL] }));
  const list = await docker("GET", `/containers/json?all=1&filters=${filters}`);
  if (!list?.length) throw new Error(`No container with the label ${LABEL}. Add it to the app service (see the install guide).`);
  const old = await docker("GET", `/containers/${list[0].Id}/json`);
  const ref = old.Config.Image;
  const [repo, tag = "latest"] = ref.includes("@") ? [ref, ""] : ref.split(/:(?=[^/:]+$)/);

  // What the current image itself provides, read before the pull moves the tag to the new image.
  const oldImage = (await docker("GET", `/images/${encodeURIComponent(ref)}/json`)
    .catch(() => docker("GET", `/images/${old.Image}/json`)).catch(() => ({}))).Config ?? {};

  // Pull (the stream must be read to the end before the image exists).
  await docker("POST", `/images/create?fromImage=${encodeURIComponent(repo)}&tag=${encodeURIComponent(tag)}`);
  const img = await docker("GET", `/images/${encodeURIComponent(ref)}/json`);
  if (img.Id === old.Image) return { updated: false, message: "Already on the newest image." };

  // Keep only what the install set (compose: env, labels, ports…); everything the old image
  // provided (command, health check, its env and labels) comes from the new image instead.
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const config = { ...old.Config, Image: ref };
  for (const k of ["Cmd", "Entrypoint", "Healthcheck", "WorkingDir", "User", "ExposedPorts", "Volumes", "StopSignal"]) {
    if (same(config[k], oldImage[k])) delete config[k];
  }
  const imageEnv = new Set(oldImage.Env ?? []);
  config.Env = (config.Env ?? []).filter((e) => !imageEnv.has(e));
  config.Labels = Object.fromEntries(Object.entries(config.Labels ?? {}).filter(([k, v]) => oldImage.Labels?.[k] !== v));

  const name = old.Name.replace(/^\//, "");
  const networks = Object.fromEntries(Object.entries(old.NetworkSettings.Networks ?? {}).map(([n, v]) => [n, { Aliases: v.Aliases ?? [] }]));
  const backup = `${name}-previous`;
  await docker("POST", `/containers/${old.Id}/stop?t=20`).catch(() => {});
  await docker("POST", `/containers/${old.Id}/rename?name=${encodeURIComponent(backup)}`);
  try {
    const created = await docker("POST", `/containers/create?name=${encodeURIComponent(name)}`, {
      ...config, HostConfig: old.HostConfig, NetworkingConfig: { EndpointsConfig: networks },
    });
    await docker("POST", `/containers/${created.Id}/start`);
    await waitHealthy(created.Id, name);
    await docker("DELETE", `/containers/${old.Id}?force=1`);
    return { updated: true, message: "Updated. The app is starting on the new version." };
  } catch (e) {
    const failed = await docker("GET", `/containers/json?all=1&filters=${encodeURIComponent(JSON.stringify({ name: [`^/${name}$`] }))}`).catch(() => []);
    for (const c of failed ?? []) await docker("DELETE", `/containers/${c.Id}?force=1`).catch(() => {});
    await docker("POST", `/containers/${old.Id}/rename?name=${encodeURIComponent(name)}`).catch(() => {});
    await docker("POST", `/containers/${old.Id}/start`).catch(() => {});
    throw new Error(`Update failed, the previous version is running again. ${e instanceof Error ? e.message : e}`);
  }
}

// The app asks for an update and then gets restarted by it, so answer straight away and run the
// update in the background; the app shows progress from GET /status and /api/public/version.
let last = { state: "idle", message: "", at: null };

http.createServer(async (req, res) => {
  const send = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.method === "GET" && req.url === "/health") return send(200, { ok: true });
  if ((req.headers.authorization ?? "") !== `Bearer ${TOKEN}`) return send(401, { error: "unauthorized" });
  if (req.method === "GET" && req.url === "/status") return send(200, last);
  if (req.method !== "POST" || req.url !== "/update") return send(404, { error: "not found" });
  if (busy) return send(409, { error: "An update is already running." });
  busy = true;
  last = { state: "running", message: "Downloading the new version…", at: new Date().toISOString() };
  send(202, { accepted: true });
  update()
    .then((r) => { last = { state: r.updated ? "done" : "current", message: r.message, at: new Date().toISOString() }; console.log("[updater]", r.message); })
    .catch((e) => { last = { state: "failed", message: e instanceof Error ? e.message : String(e), at: new Date().toISOString() }; console.error("[updater]", e); })
    .finally(() => { busy = false; });
}).listen(PORT, () => console.log(`[updater] ready on :${PORT}, watching containers labelled ${LABEL}`));
