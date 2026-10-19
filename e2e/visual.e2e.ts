// Screenshot tests (@visual): the public pages at laptop and phone sizes, compared with the reference
// images in e2e/__screenshots__. They run in Playwright's own Linux image so fonts render the same
// everywhere (CI: "Screenshot tests"). After a deliberate design change, refresh the references with:
//   docker run --rm --network host -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.63.0-noble \
//     npx playwright test --grep @visual --update-snapshots
import { expect, test } from "@playwright/test";

const PAGES: [string, string][] = [["landing", "/"], ["pricing", "/pricing"], ["sign-in", "/auth"]];

for (const [name, path] of PAGES) {
  test(`${name} looks right @visual`, async ({ page }) => {
    // No cookie banner, no moving parts, no blinking caret.
    await page.addInitScript(() => {
      try { localStorage.setItem("inuberry.cookie.consent", JSON.stringify({ choice: "necessary", at: "2026-01-01" })); } catch { /* ignore */ }
    });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${name}.png`, {
      maxDiffPixelRatio: 0.01,
      // The version number changes with every release.
      mask: [page.getByText(/v\d+\.\d+\.\d+/)],
    });
  });
}
