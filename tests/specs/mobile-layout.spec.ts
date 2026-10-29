import { test, expect } from "@playwright/test";

// Below the 720px breakpoint the app shows one pane at a time, so the visible
// pane should fill the space between the tabs and the footer.

test.describe("mobile single-pane layout", () => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 720, height: 900 },
  ]) {
    test(`Source editor fills the pane at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/index.html");
      const main = (await page.locator("main").boundingBox())!;
      const pane = (await page.locator('.pane[data-pane="source"]').boundingBox())!;
      const editor = (await page.locator("#source").boundingBox())!;

      expect(Math.abs(pane.height - main.height)).toBeLessThanOrEqual(1);
      expect(editor.y + editor.height).toBeGreaterThanOrEqual(main.y + main.height - 1);
    });
  }
});
