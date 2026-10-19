// Browser smoke tests (e2e/*.e2e.ts). Against the Node build on :3000 by default, or any site with
// E2E_BASE_URL. Signed-in tests run only when E2E_EMAIL and E2E_PASSWORD are set.
//   bun run build:node && bunx playwright test
import { defineConfig, devices } from "@playwright/test";

const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  timeout: 45_000,
  // One reference image per page and size, shared by every OS (the screenshot tests run in Docker).
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}-{projectName}{ext}",
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: external ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "laptop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: external ? undefined : {
    command: "node .output/server/index.mjs",
    url: "http://localhost:3000/api/public/version",
    env: { PORT: "3000" },
    reuseExistingServer: true,
  },
});
