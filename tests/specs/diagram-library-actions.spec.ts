import { test, expect, type Page } from "@playwright/test";
import { seedLibrary } from "./helpers/diagrams";

const LOGIN = "flowchart TD\n L1 --> L2";
const SEED = [
  { name: "Login flow", source: LOGIN, minutesAgo: 0 },
  { name: "Order ER", source: "erDiagram\n  A ||--o{ B : has", minutesAgo: 60 },
];
const STAMPED = /^Login flow \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

const names = (page: Page) => page.locator(".diagram-row .diagram-name").allTextContents();
const row = (page: Page, name: string) =>
  page.locator(".diagram-row").filter({ has: page.locator(".diagram-name", { hasText: new RegExp(`^${name}$`) }) });

async function openMenu(page: Page, name: string) {
  await row(page, name).locator(".diagram-row-menu").click();
}

async function startRename(page: Page, name: string, next: string) {
  await openMenu(page, name);
  await row(page, name).locator('[data-action="rename"]').click();
  const input = page.locator(".diagram-rename-input");
  await input.fill(next);
  return input;
}

test.describe("row actions", () => {
  test.beforeEach(async ({ page }) => {
    await seedLibrary(page, SEED);
    await page.goto("/index.html");
  });

  test("Duplicate copies Source under a stamped name and opens it", async ({ page }) => {
    await openMenu(page, "Login flow");
    await page.locator('[data-action="duplicate"]').click();
    const current = page.locator('.diagram-row[aria-current="true"] .diagram-name');
    await expect(current).toHaveText(STAMPED);
    await expect(page.locator("#source")).toHaveValue(LOGIN);
    expect(await names(page)).toHaveLength(3);
  });

  test("Rename changes the name in place without reordering", async ({ page }) => {
    const input = await startRename(page, "Order ER", "Orders");
    await input.press("Enter");
    await expect.poll(() => names(page)).toEqual(["Login flow", "Orders"]);
    await expect(page.locator(".diagram-rename-input")).toHaveCount(0);
  });

  test("Rename to a taken name appends a stamp", async ({ page }) => {
    const input = await startRename(page, "Order ER", " login FLOW ");
    await input.press("Enter");
    await expect(page.locator(".diagram-name").nth(1)).toHaveText(/^login FLOW \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  test("Rename to blank keeps the old name", async ({ page }) => {
    const input = await startRename(page, "Order ER", "   ");
    await input.press("Enter");
    await expect.poll(() => names(page)).toEqual(["Login flow", "Order ER"]);
  });

  test("Escape cancels rename", async ({ page }) => {
    const input = await startRename(page, "Order ER", "Nope");
    await input.press("Escape");
    await expect.poll(() => names(page)).toEqual(["Login flow", "Order ER"]);
  });

  test("blur commits rename", async ({ page }) => {
    await startRename(page, "Order ER", "Orders");
    await page.locator("#source").click();
    await expect.poll(() => names(page)).toEqual(["Login flow", "Orders"]);
  });

  test("renaming the open Diagram survives later autosaves", async ({ page }) => {
    const input = await startRename(page, "Login flow", "Signin");
    await input.press("Enter");
    await page.fill("#source", "flowchart TD\n Z");
    await expect.poll(() => names(page)).toEqual(["Signin", "Order ER"]);
  });

  test("rename input survives list changes while editing", async ({ page }) => {
    const input = await startRename(page, "Order ER", "Ord");
    await page.evaluate(() => document.dispatchEvent(new CustomEvent("diagrams:changed")));
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("Ord");
    await input.press("Enter");
    await expect.poll(() => names(page)).toEqual(["Login flow", "Ord"]);
  });

  test("only one row menu is open and an outside click closes it", async ({ page }) => {
    await openMenu(page, "Login flow");
    await openMenu(page, "Order ER");
    await expect(page.locator(".diagram-row-actions")).toHaveCount(1);
    await page.locator("#source").click();
    await expect(page.locator(".diagram-row-actions")).toHaveCount(0);
  });

  test("Delete asks first and Cancel keeps the row", async ({ page }) => {
    await openMenu(page, "Order ER");
    await page.locator('[data-action="delete"]').click();
    await expect(page.locator(".diagram-row-actions")).toContainText('Delete "Order ER"?');
    await page.locator('[data-action="cancel-delete"]').click();
    expect(await names(page)).toEqual(["Login flow", "Order ER"]);
  });

  test("Deleting a non-open Diagram keeps the open one", async ({ page }) => {
    await openMenu(page, "Order ER");
    await page.locator('[data-action="delete"]').click();
    await page.locator('[data-action="confirm-delete"]').click();
    await expect.poll(() => names(page)).toEqual(["Login flow"]);
    await expect(page.locator("#source")).toHaveValue(LOGIN);
  });

  test("Deleting the open Diagram opens the next newest", async ({ page }) => {
    await openMenu(page, "Login flow");
    await page.locator('[data-action="delete"]').click();
    await page.locator('[data-action="confirm-delete"]').click();
    await expect.poll(() => names(page)).toEqual(["Order ER"]);
    await expect(page.locator('.diagram-row[aria-current="true"] .diagram-name')).toHaveText("Order ER");
    expect(await page.evaluate(() => localStorage.getItem("qack-maid:diagram:seed0"))).toBeNull();
  });

  test("Storage full on Rename shows the toast and changes nothing", async ({ page }) => {
    const input = await startRename(page, "Order ER", "Orders");
    await page.evaluate(() => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function () {
        Storage.prototype.setItem = orig;
        throw new DOMException("full", "QuotaExceededError");
      };
    });
    await input.press("Enter");
    await expect(page.locator("#toast")).toHaveText("Storage is full. Delete diagrams you no longer need.");
    await expect.poll(() => names(page)).toEqual(["Login flow", "Order ER"]);
  });
});

test("Deleting the last Diagram leaves an empty Untitled", async ({ page }) => {
  await seedLibrary(page, [SEED[0]]);
  await page.goto("/index.html");
  await openMenu(page, "Login flow");
  await page.locator('[data-action="delete"]').click();
  await page.locator('[data-action="confirm-delete"]').click();
  await expect.poll(() => names(page)).toEqual(["Untitled"]);
  await expect(page.locator("#source")).toHaveValue("");
});
