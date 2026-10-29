import { test, expect, type Page } from "@playwright/test";
import { seedLibrary, storedLibrary } from "./helpers/diagrams";

const LOGIN = "flowchart TD\n L1 --> L2";
const SEED = [
  { name: "Login flow", source: LOGIN, minutesAgo: 0 },
  { name: "Order ER", source: "erDiagram\n  A ||--o{ B : has", minutesAgo: 60 },
];
const STAMPED = /^Login flow \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

const names = (page: Page) => page.locator(".diagram-row .diagram-name").allTextContents();
const row = (page: Page, name: string) =>
  page.locator(".diagram-row").filter({ has: page.locator(".diagram-name", { hasText: new RegExp(`^${name}$`) }) });

async function twoTabs(context: import("@playwright/test").BrowserContext) {
  const tab1 = await context.newPage();
  await seedLibrary(tab1, SEED);
  await tab1.goto("/index.html");
  const tab2 = await context.newPage();
  await seedLibrary(tab2, SEED);
  await tab2.goto("/index.html");
  return { tab1, tab2 };
}

const storedSource = (page: Page, id: string) =>
  page.evaluate((id) => JSON.parse(localStorage.getItem("qack-maid:diagram:" + id) || "null")?.source, id);

test.describe("several tabs open", () => {
  test("second tab's edit to the same Diagram becomes a stamped copy", async ({ context }) => {
    const { tab1, tab2 } = await twoTabs(context);
    await tab1.locator("#source").press("End");
    await tab1.locator("#source").pressSequentially("1");
    await expect.poll(() => storedSource(tab2, "seed0")).toBe(LOGIN + "1");
    await tab2.locator("#source").press("End");
    await tab2.locator("#source").pressSequentially("2");
    await expect(tab2.locator('.diagram-row[aria-current="true"] .diagram-name')).toHaveText(STAMPED);
    await expect(tab2.locator("#toast")).toContainText('Changed in another tab. Saved your edits as "Login flow ');
    const original = await storedSource(tab2, "seed0");
    expect(original.endsWith("1")).toBe(true);
    expect(original.endsWith("2")).toBe(false);
    await expect(tab2.locator("#source")).toHaveValue(LOGIN + "2");
  });

  test("a Diagram created in one tab appears in the other", async ({ context }) => {
    const { tab1, tab2 } = await twoTabs(context);
    await tab1.locator("#diagram-new").click();
    await expect(row(tab2, "Untitled")).toHaveCount(1);
  });

  test("rename in a stale tab keeps the other tab's new Diagram", async ({ context }) => {
    const { tab1, tab2 } = await twoTabs(context);
    await tab1.locator("#diagram-new").click();
    await expect(row(tab2, "Untitled")).toHaveCount(1);
    await tab2.evaluate(() => (window as any).renameDiagram("seed1", "Order ER v2"));
    const lib = await storedLibrary(tab2);
    expect(lib.items.map((i: any) => i.name).sort()).toEqual(["Login flow", "Order ER v2", "Untitled"]);
  });

  test("rename through the UI in a stale tab keeps the other tab's new Diagram", async ({ context }) => {
    const { tab1, tab2 } = await twoTabs(context);
    await tab1.locator("#diagram-new").click();
    await expect(row(tab2, "Untitled")).toHaveCount(1);
    await row(tab2, "Order ER").locator(".diagram-row-menu").click();
    await row(tab2, "Order ER").locator('[data-action="rename"]').click();
    await tab2.locator(".diagram-rename-input").fill("Order ER v2");
    await tab2.locator(".diagram-rename-input").press("Enter");
    const lib = await storedLibrary(tab2);
    expect(lib.items.map((i: any) => i.name).sort()).toEqual(["Login flow", "Order ER v2", "Untitled"]);
  });

  test("deleting the open Diagram elsewhere switches this tab", async ({ context }) => {
    const { tab1, tab2 } = await twoTabs(context);
    await row(tab1, "Login flow").locator(".diagram-row-menu").click();
    await row(tab1, "Login flow").locator('[data-action="delete"]').click();
    await row(tab1, "Login flow").locator('[data-action="confirm-delete"]').click();
    await expect(tab2.locator('.diagram-row[aria-current="true"] .diagram-name')).toHaveText("Order ER");
    await expect(tab2.locator("#source")).toHaveValue(/erDiagram/);
  });

  test("a change arriving during an open rename is applied after it closes", async ({ context }) => {
    const { tab1, tab2 } = await twoTabs(context);
    await row(tab2, "Order ER").locator(".diagram-row-menu").click();
    await row(tab2, "Order ER").locator('[data-action="rename"]').click();
    await tab1.locator("#diagram-new").click();
    await expect.poll(async () => (await storedLibrary(tab2)).items.length).toBe(3);
    await tab2.locator(".diagram-rename-input").press("Escape");
    await expect(row(tab2, "Untitled")).toHaveCount(1);
  });

  test("rename open for a Diagram deleted elsewhere does not break", async ({ context }) => {
    const { tab1, tab2 } = await twoTabs(context);
    await row(tab2, "Order ER").locator(".diagram-row-menu").click();
    await row(tab2, "Order ER").locator('[data-action="rename"]').click();
    await tab2.locator(".diagram-rename-input").fill("Gone");
    await row(tab1, "Order ER").locator(".diagram-row-menu").click();
    await row(tab1, "Order ER").locator('[data-action="delete"]').click();
    await row(tab1, "Order ER").locator('[data-action="confirm-delete"]').click();
    await tab2.locator(".diagram-rename-input").press("Enter");
    await expect(tab2.locator(".diagram-rename-input")).toHaveCount(0);
    expect(await names(tab2)).toEqual(["Login flow"]);
  });

  test("editing a Diagram whose stored copy vanished saves a copy", async ({ page }) => {
    await seedLibrary(page, SEED);
    await page.goto("/index.html");
    await page.evaluate(() => localStorage.removeItem("qack-maid:diagram:seed0"));
    await page.locator("#source").press("End");
    await page.locator("#source").pressSequentially("Q");
    const current = page.locator('.diagram-row[aria-current="true"] .diagram-name');
    await expect(current).toHaveText(STAMPED);
    const lib = await storedLibrary(page);
    const copy = lib.items.find((i: any) => STAMPED.test(i.name));
    expect((await storedSource(page, copy.id)).endsWith("Q")).toBe(true);
  });

  test("a same-rev write by another tab forks instead of overwriting", async ({ page }) => {
    await seedLibrary(page, SEED);
    await page.goto("/index.html");
    await page.locator("#source").press("End");
    await page.locator("#source").pressSequentially("a");
    // Another tab wrote the same next rev (a lost race): same rev, different writer.
    const rev = await page.evaluate(() => {
      const key = "qack-maid:diagram:seed0";
      const body = JSON.parse(localStorage.getItem(key)!);
      localStorage.setItem(key, JSON.stringify({ ...body, source: "other tab text", tab: "other" }));
      return body.rev;
    });
    await page.locator("#source").pressSequentially("b");
    await expect(page.locator('.diagram-row[aria-current="true"] .diagram-name')).toHaveText(STAMPED);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("qack-maid:diagram:seed0")!));
    expect(stored).toEqual({ source: "other tab text", rev, tab: "other" });
  });

  test("bodies without a writer id do not fork on first edit", async ({ page }) => {
    await seedLibrary(page, SEED);
    await page.goto("/index.html");
    await page.locator("#source").press("End");
    await page.locator("#source").pressSequentially("xy");
    expect(await names(page)).toEqual(["Login flow", "Order ER"]);
    expect(await storedSource(page, "seed0")).toBe(LOGIN + "xy");
  });

  test("an index write failing after a save does not fork the next edit", async ({ page }) => {
    await seedLibrary(page, SEED);
    await page.goto("/index.html");
    await page.evaluate(() => {
      const orig = Storage.prototype.setItem;
      (window as any).__orig = orig;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === "qack-maid:diagrams") throw new DOMException("full", "QuotaExceededError");
        return orig.call(this, k, v);
      };
    });
    await page.locator("#source").press("End");
    await page.locator("#source").pressSequentially("a");
    await page.evaluate(() => (Storage.prototype.setItem = (window as any).__orig));
    await page.locator("#source").pressSequentially("b");
    expect(await names(page)).toEqual(["Login flow", "Order ER"]);
    expect(await storedSource(page, "seed0")).toBe(LOGIN + "ab");
  });
});
