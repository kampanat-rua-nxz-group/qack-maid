import { test, expect } from "@playwright/test";

// Export menu keyboard model (matches the diagram row menu), drawn icons in
// place of text glyphs, and accessible names for icon-only and select controls.

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
});

test.describe("Export menu", () => {
  test("opening focuses the first item; arrows cycle; Escape returns to the trigger", async ({ page }) => {
    const trigger = page.locator("#export-trigger");
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const items = page.getByRole("menu").getByRole("menuitem");
    await expect(items.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(items.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
  });

  test("trigger draws its caret instead of a text glyph", async ({ page }) => {
    await expect(page.locator("#export-trigger")).toHaveText("Export");
  });
});

test.describe("zoom controls", () => {
  test("zoom buttons are named icons and keep working", async ({ page }) => {
    const zoomIn = page.getByRole("button", { name: "Zoom in" });
    const zoomOut = page.getByRole("button", { name: "Zoom out" });
    await expect(zoomIn.locator("svg")).toHaveCount(1);
    await expect(zoomOut.locator("svg")).toHaveCount(1);
    await zoomIn.click();
    await expect(page.locator("#zoom-level")).toHaveText("115%");
    await zoomOut.click();
    await zoomOut.click();
    await expect(page.locator("#zoom-level")).toHaveText("85%");
    await page.locator("#zoom-reset").click();
    await expect(page.locator("#zoom-level")).toHaveText("100%");
  });
});

test.describe("theme pickers", () => {
  test("open on the picked option and show the pick on the trigger", async ({ page }) => {
    const trigger = page.locator("#theme-trigger");
    await expect(trigger).toHaveText("Theme: Auto");
    await trigger.click();
    const menu = page.getByRole("menu", { name: "Diagram theme" });
    await expect(menu.getByRole("menuitemradio", { name: "Auto" })).toBeFocused();
    await menu.getByRole("menuitemradio", { name: "Forest" }).click();
    await expect(menu).toBeHidden();
    await expect(trigger).toHaveText("Theme: Forest");
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(menu.getByRole("menuitemradio", { name: "Forest" })).toHaveAttribute("aria-checked", "true");
    await expect(menu.getByRole("menuitemradio", { name: "Forest" })).toBeFocused();
    await expect(menu.getByRole("menuitemradio", { name: "Auto" })).toHaveAttribute("aria-checked", "false");
  });

  test("Custom colors reveals the color row", async ({ page }) => {
    await expect(page.locator("#color-row")).toBeHidden();
    await page.click("#theme-trigger");
    await page.getByRole("menuitemradio", { name: "Custom colors" }).click();
    await expect(page.locator("#color-row")).toBeVisible();
  });

  test("arrow keys pick by Enter; Escape closes without picking", async ({ page }) => {
    const trigger = page.locator("#preview-bg-trigger");
    await trigger.click();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveText("Preview: Auto");
    await expect(trigger).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitemradio", { name: "Auto" })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveText("Preview: Dark");
    await expect(page.locator(".preview-wrap")).toHaveAttribute("data-preview", "dark");
  });

  test("opening one menu closes another", async ({ page }) => {
    await page.click("#theme-trigger");
    await page.click("#preview-bg-trigger");
    await expect(page.locator("#theme-trigger")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#preview-bg-trigger")).toHaveAttribute("aria-expanded", "true");
  });
});
