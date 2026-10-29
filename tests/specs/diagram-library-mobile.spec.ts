import { test, expect } from "@playwright/test";
import { seedLibrary } from "./helpers/diagrams";

test.describe("mobile diagrams tab", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const seed = [
    { name: "A", source: "flowchart TD\n  a1 --> a2", minutesAgo: 1 },
    { name: "B", source: "flowchart TD\n  b1 --> b2", minutesAgo: 2 },
  ];

  test("Diagrams tab lists Diagrams and fills the space", async ({ page }) => {
    await seedLibrary(page, seed);
    await page.goto("/index.html");
    await expect(page.locator(".mobile-tabs .tab-btn").first()).toHaveAttribute("data-pane", "diagrams");
    await page.click('.tab-btn[data-pane="diagrams"]');
    await expect(page.locator('.tab-btn[data-pane="diagrams"]')).toHaveClass(/active/);
    await expect(page.locator("#diagram-list")).toBeVisible();
    await expect(page.locator("main")).toBeHidden();
    await expect(page.locator(".diagram-row")).toHaveCount(2);
    await expect(page.locator("#diagram-collapse")).toBeHidden();
    const tabs = (await page.locator(".mobile-tabs").boundingBox())!;
    const footer = (await page.locator("footer").boundingBox())!;
    const list = (await page.locator("#diagram-list").boundingBox())!;
    expect(Math.abs(list.y - (tabs.y + tabs.height))).toBeLessThanOrEqual(1);
    expect(Math.abs(list.y + list.height - footer.y)).toBeLessThanOrEqual(1);
  });

  test("a stored collapsed flag does not empty the Diagrams tab", async ({ page }) => {
    await seedLibrary(page, seed);
    await page.addInitScript(() => localStorage.setItem("qack-maid:sidebar-collapsed", "1"));
    await page.goto("/index.html");
    await page.click('.tab-btn[data-pane="diagrams"]');
    await expect(page.locator(".diagram-row")).toHaveCount(2);
    await expect(page.locator("#diagram-new")).toBeVisible();
    const list = (await page.locator("#diagram-list").boundingBox())!;
    expect(list.width).toBeGreaterThan(300);
  });

  test("tapping a Diagram opens it in the Source tab", async ({ page }) => {
    await seedLibrary(page, seed);
    await page.goto("/index.html");
    await page.click('.tab-btn[data-pane="diagrams"]');
    await page.locator('.diagram-row:has-text("B") .diagram-open').click();
    await expect(page.locator('.tab-btn[data-pane="source"]')).toHaveClass(/active/);
    await expect(page.locator('.pane[data-pane="source"]')).toBeVisible();
    await expect(page.locator("#diagram-list")).toBeHidden();
    await expect(page.locator("#source")).toHaveValue(seed[1].source);
  });

  test("Source and Preview tabs still work", async ({ page }) => {
    await seedLibrary(page, seed);
    await page.goto("/index.html");
    await expect(page.locator("#diagram-list")).toBeHidden();
    await expect(page.locator("#source")).toBeVisible();
    await page.click('.tab-btn[data-pane="preview"]');
    await expect(page.locator("#preview svg")).toBeVisible();
    await expect(page.locator("#source")).toBeHidden();
    await page.click('.tab-btn[data-pane="source"]');
    await expect(page.locator("#source")).toBeVisible();
    await expect(page.locator("#diagram-list")).toBeHidden();
  });
});
