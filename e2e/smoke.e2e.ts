import { expect, test, type Page } from "@playwright/test";

/** Fails the test on any uncaught page error or console error. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  return errors;
}

async function noSidewaysScroll(page: Page) {
  const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(scroll, "page scrolls sideways").toBeLessThanOrEqual(client + 1);
}

const PUBLIC = [
  ["/", /Inuberry/],
  ["/pricing", /Startup/],
  ["/features", /Inuberry/],
  ["/docs", /Docs|Guides/i],
  ["/contact", /Talk|Contact/i],
  ["/auth", /Sign in/],
  ["/legal/privacy", /Privacy/],
] as const;

for (const [path, text] of PUBLIC) {
  test(`public page ${path}`, async ({ page }) => {
    const errors = watchErrors(page);
    const res = await page.goto(path);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("body")).toContainText(text);
    await noSidewaysScroll(page);
    expect(errors).toEqual([]);
  });
}

test("pricing switches between monthly and yearly", async ({ page }) => {
  await page.goto("/pricing");
  const before = await page.locator("main").innerText();
  await page.getByRole("button", { name: /yearly/i }).first().click();
  await expect.poll(() => page.locator("main").innerText()).not.toBe(before);
});

test("the version endpoint answers", async ({ request }) => {
  const res = await request.get("/api/public/version");
  expect(res.ok()).toBe(true);
  expect((await res.json()).version).toMatch(/^\d+\.\d+\.\d+$/);
});

test("signed-out visitors are sent to sign in, and the API refuses them", async ({ page, request }) => {
  await page.goto("/app/invoices");
  await expect(page).toHaveURL(/\/auth/);
  expect((await request.post("/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list" } })).status()).toBe(401);
  expect((await request.get("/api/public/v1/leads")).status()).toBe(401);
});

test.describe("signed in", () => {
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, "E2E_EMAIL and E2E_PASSWORD aren't set");

  test.beforeEach(async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("Email").fill(process.env.E2E_EMAIL!);
    await page.getByLabel("Password").fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL(/\/app/, { timeout: 20_000 });
  });

  // Read-only on purpose: these run against a real workspace, so they open forms but never save.
  for (const path of ["/app", "/app/invoices", "/app/crm/leads", "/app/inbox", "/app/hr/payroll", "/app/settings"]) {
    test(`opens ${path}`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/something went wrong/i);
      await noSidewaysScroll(page);
      expect(errors).toEqual([]);
    });
  }

  test("New invoice opens a blank form", async ({ page }) => {
    await page.goto("/app/invoices?new=1");
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
