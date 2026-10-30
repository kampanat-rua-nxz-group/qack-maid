import { test, expect, type Page } from "@playwright/test";
import { seedLibrary } from "./helpers/diagrams";

const SEED = [
  { name: "Login flow", source: "flowchart TD\n L1 --> L2", minutesAgo: 0 },
  { name: "Order ER", source: "erDiagram\n  A ||--o{ B : has", minutesAgo: 60 },
];

const row = (page: Page, name: string) =>
  page.locator(".diagram-row").filter({ has: page.locator(".diagram-name", { hasText: new RegExp(`^${name}$`) }) });

test.describe("row menu popover", () => {
  test.beforeEach(async ({ page }) => {
    await seedLibrary(page, SEED);
    await page.goto("/index.html");
  });

  test("opens as a floating menu without changing the row height", async ({ page }) => {
    const target = row(page, "Login flow");
    const before = (await target.boundingBox())!.height;
    await target.locator(".diagram-row-menu").click();
    const menu = page.getByRole("menu", { name: "Diagram actions" });
    await expect(menu.getByRole("menuitem")).toHaveText(["Duplicate", "Rename", "Delete…"]);
    expect((await target.boundingBox())!.height).toBe(before);
    await expect(target.locator(".diagram-row-menu")).toHaveAttribute("aria-expanded", "true");
    await expect(menu.getByRole("menuitem", { name: "Duplicate" })).toBeFocused();
  });

  test("arrow keys move between items and Escape returns focus to the trigger", async ({ page }) => {
    await row(page, "Order ER").locator(".diagram-row-menu").click();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Rename" })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(page.getByRole("menuitem", { name: "Delete…" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(".diagram-row-actions")).toHaveCount(0);
    await expect(row(page, "Order ER").locator(".diagram-row-menu")).toBeFocused();
  });

  test("delete confirmation keeps both choices on one line and focuses Cancel", async ({ page }) => {
    await row(page, "Order ER").locator(".diagram-row-menu").click();
    await page.locator('[data-action="delete"]').click();
    const cancel = page.locator('[data-action="cancel-delete"]');
    const confirm = page.locator('[data-action="confirm-delete"]');
    await expect(cancel).toBeFocused();
    const [a, b] = [(await cancel.boundingBox())!, (await confirm.boundingBox())!];
    expect(a.y).toBe(b.y);
    expect(a.x).toBeLessThan(b.x);
    await page.keyboard.press("Escape");
    await expect(page.locator(".diagram-row-actions")).toHaveCount(0);
  });
});
