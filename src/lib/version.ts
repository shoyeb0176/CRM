// App version shown in the UI and served at /api/public/version.
// Keep in sync with package.json "version" (CI checks this on release tags).
export const APP_VERSION = "1.21.1";

/** True when `latest` (e.g. "v1.2.0" or "1.2.0") is newer than `current`. */
export function isNewerVersion(latest: string, current: string = APP_VERSION): boolean {
  const parse = (v: string) => v.replace(/^v/i, "").split(/[.-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
