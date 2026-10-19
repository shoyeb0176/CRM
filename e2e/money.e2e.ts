import { expect, test } from "@playwright/test";

// The money flows end to end. These SAVE records, so they only run against a test workspace:
// set E2E_EMAIL and E2E_PASSWORD for a test account (as for the read-only tests) and E2E_WRITE=1.
test.describe("money flows (writes to a test workspace)", () => {
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD || process.env.E2E_WRITE !== "1",
    "needs E2E_EMAIL, E2E_PASSWORD and E2E_WRITE=1 (a test workspace)");

  test.beforeEach(async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("Email").fill(process.env.E2E_EMAIL!);
    await page.getByLabel("Password").fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL(/\/app/, { timeout: 20_000 });
  });

  test("invoice: add a line, send it, record the full payment", async ({ page }) => {
    await page.goto("/app/invoices");
    await page.getByRole("button", { name: /new invoice/i }).first().click();
    await page.waitForURL(/\/app\/invoices\/[0-9a-f-]{36}/);

    await page.getByRole("button", { name: /add line/i }).click();
    await page.getByPlaceholder("Description").last().fill("E2E test line");
    const numbers = page.locator("tbody tr").last().locator('input[type="number"]');
    await numbers.nth(0).fill("2"); // quantity
    await numbers.nth(1).fill("50"); // unit price
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText("Saved").first()).toBeVisible();
    await expect(page.locator("main")).toContainText("$100.00");

    await page.getByRole("button", { name: /mark sent/i }).click();
    await page.getByRole("button", { name: /record payment/i }).click();
    const sheet = page.getByRole("dialog");
    await sheet.locator('input[type="number"]').fill("100");
    await sheet.getByRole("button", { name: /^record$/i }).click();
    await expect(page.getByText("Payment recorded").first()).toBeVisible();
    await expect(page.locator("main")).toContainText(/paid/i);
  });

  test("pay run: draft one with lines worked out on the server, then delete it", async ({ page }) => {
    await page.goto("/app/hr/payroll");
    await page.getByRole("button", { name: /new pay run/i }).first().click();
    await page.getByRole("button", { name: /draft pay run/i }).click();
    // Either a draft opens, or the workspace has no payroll profiles yet (then there is nothing to test).
    const opened = await Promise.race([
      page.waitForURL(/\/app\/hr\/payroll\/[0-9a-f-]{36}/, { timeout: 15_000 }).then(() => true),
      page.getByText(/no active employees have payroll details/i).waitFor({ timeout: 15_000 }).then(() => false),
    ]);
    test.skip(!opened, "the test workspace has no employees with payroll details");
    await expect(page.locator("main")).toContainText(/draft/i);
    await page.getByRole("button", { name: /^delete$/i }).first().click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^delete$/i }).click();
    await page.waitForURL(/\/app\/hr\/payroll$/);
  });
});
