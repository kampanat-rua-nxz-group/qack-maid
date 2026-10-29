import { test, expect, type Page } from "@playwright/test";
import { seedLibrary, seedLegacySource } from "./helpers/diagrams";

const LOGIN = "flowchart TD\n L1 --> L2";
const SEED = [
  { name: "Login flow", source: LOGIN, minutesAgo: 0 },
  { name: "Order ER", source: "erDiagram\n  A ||--o{ B : has", minutesAgo: 60 },
];
const FULL = "Storage is full. Delete diagrams you no longer need.";

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

// Throws a quota error from setItem while window.__failWrites is true, or
// "new" (only keys not yet stored, like a store with no room to grow).
async function failWritesHook(page: Page) {
  await page.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, ...args: [string, string]) {
      const mode = (window as any).__failWrites;
      if (mode === true || (mode === "new" && this.getItem(args[0]) === null)) throw new DOMException("full", "QuotaExceededError");
      return orig.apply(this, args);
    };
  });
}

const setFail = (page: Page, on: boolean | "new") => page.evaluate((on) => ((window as any).__failWrites = on), on);
const storedBody = (page: Page, id: string) =>
  page.evaluate((id) => JSON.parse(localStorage.getItem("qack-maid:diagram:" + id) || "null"), id);

test.describe("storage full", () => {
  test("typing when storage is full keeps Source and warns", async ({ page }) => {
    await failWritesHook(page);
    await seedLibrary(page, SEED);
    await page.goto("/index.html");
    await setFail(page, true);
    await page.locator("#source").press("End");
    await page.locator("#source").pressSequentially("X");
    await expect(page.locator("#toast")).toHaveText(FULL);
    await expect(page.locator("#source")).toHaveValue(LOGIN + "X");
    await setFail(page, false);
    await page.locator("#source").pressSequentially("Y");
    await expect.poll(async () => (await storedBody(page, "seed0")).source).toBe(LOGIN + "XY");
  });

  test("New, Duplicate and Rename do nothing when storage is full", async ({ page }) => {
    await failWritesHook(page);
    await seedLibrary(page, SEED);
    await page.goto("/index.html");
    await setFail(page, true);
    const attempts = [
      () => page.locator("#diagram-new").click(),
      async () => {
        await openMenu(page, "Order ER");
        await row(page, "Order ER").locator('[data-action="duplicate"]').click();
      },
      async () => {
        const input = await startRename(page, "Order ER", "Orders");
        await input.press("Enter");
      },
    ];
    for (const attempt of attempts) {
      await page.evaluate(() => document.getElementById("toast")!.classList.remove("show"));
      await page.evaluate(() => (document.getElementById("toast")!.textContent = ""));
      await attempt();
      await expect(page.locator("#toast")).toHaveText(FULL);
      expect(await names(page)).toEqual(["Login flow", "Order ER"]);
      await expect(page.locator("#source")).toHaveValue(LOGIN);
      await expect(page.locator('.diagram-row[aria-current="true"] .diagram-name')).toHaveText("Login flow");
    }
  });

  test("deleting the last Diagram when storage is full keeps it", async ({ page }) => {
    await failWritesHook(page);
    await seedLibrary(page, [SEED[0]]);
    await page.goto("/index.html");
    await setFail(page, "new");
    await openMenu(page, "Login flow");
    await page.locator('[data-action="delete"]').click();
    await page.locator('[data-action="confirm-delete"]').click();
    await expect(page.locator("#toast")).toHaveText(FULL);
    expect(await names(page)).toEqual(["Login flow"]);
    await expect(page.locator("#source")).toHaveValue(LOGIN);
    await setFail(page, false);
    await page.locator("#source").press("End");
    await page.locator("#source").pressSequentially("Z");
    await expect.poll(async () => (await storedBody(page, "seed0")).source).toBe(LOGIN + "Z");
  });

  test("migration that cannot write keeps the legacy key and retries", async ({ page, context }) => {
    await failWritesHook(page);
    await seedLegacySource(page, "flowchart TD\n LEG --> ACY");
    await page.addInitScript(() => ((window as any).__failWrites = true));
    await page.goto("/index.html");
    await expect(page.locator("#source")).toHaveValue("flowchart TD\n LEG --> ACY");
    await expect(page.locator("#toast")).toHaveText(FULL);
    const keys = await page.evaluate(() => ({
      legacy: localStorage.getItem("qack-maid:source"),
      library: localStorage.getItem("qack-maid:diagrams"),
    }));
    expect(keys.legacy).toBe("flowchart TD\n LEG --> ACY");
    expect(keys.library).toBeNull();
    await setFail(page, false);
    await page.locator("#source").press("End");
    await page.locator("#source").pressSequentially("!");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("qack-maid:source")))
      .toBe("flowchart TD\n LEG --> ACY!");

    const retry = await context.newPage();
    await retry.goto("/index.html");
    await expect(retry.locator("#source")).toHaveValue("flowchart TD\n LEG --> ACY!");
    expect(await names(retry)).toEqual(["Untitled"]);
    expect(await retry.evaluate(() => localStorage.getItem("qack-maid:source"))).toBeNull();
  });

  test("unsaved edit survives the open Diagram being deleted in another tab", async ({ context }) => {
    const tab1 = await context.newPage();
    await seedLibrary(tab1, SEED);
    await tab1.goto("/index.html");
    const tab2 = await context.newPage();
    await failWritesHook(tab2);
    await seedLibrary(tab2, SEED);
    await tab2.goto("/index.html");
    await setFail(tab2, true);
    await tab2.locator("#source").press("End");
    await tab2.locator("#source").pressSequentially("Q");
    await expect(tab2.locator("#toast")).toHaveText(FULL);

    await openMenu(tab1, "Login flow");
    await row(tab1, "Login flow").locator('[data-action="delete"]').click();
    await tab1.locator('[data-action="confirm-delete"]').click();
    await expect.poll(() => names(tab1)).toEqual(["Order ER"]);
    await expect.poll(() => tab2.evaluate(() => localStorage.getItem("qack-maid:diagram:seed0"))).toBeNull();
    await tab2.waitForTimeout(300);
    await expect(tab2.locator("#source")).toHaveValue(LOGIN + "Q");

    await setFail(tab2, false);
    await tab2.locator("#source").pressSequentially("R");
    await expect.poll(() => names(tab2)).toContain("Login flow");
    const stored = await tab2.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith("qack-maid:diagram:"))
        .map((k) => JSON.parse(localStorage.getItem(k)!).source),
    );
    expect(stored).toContain(LOGIN + "QR");
  });

  test("legacy key is imported after a rebuild that could not write, not stranded", async ({ page }) => {
    await failWritesHook(page);
    await page.addInitScript(() => {
      if (localStorage.getItem("qack-maid:diagram:a1") !== null) return;
      localStorage.setItem("qack-maid:diagrams", "{oops");
      localStorage.setItem("qack-maid:diagram:a1", JSON.stringify({ source: "graph TD\n X", rev: 1 }));
      (window as any).__failWrites = true;
    });
    await page.goto("/index.html");
    await expect(page.locator("#toast")).toHaveText(FULL);
    await setFail(page, false);
    await page.locator("#source").pressSequentially("typed while full");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("qack-maid:source")))
      .toBe("typed while full");

    await page.reload();
    await expect.poll(() => names(page)).toEqual(expect.arrayContaining(["Recovered", "Untitled"]));
    expect(await page.evaluate(() => localStorage.getItem("qack-maid:source"))).toBeNull();
    const sources = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith("qack-maid:diagram:"))
        .map((k) => JSON.parse(localStorage.getItem(k)!).source),
    );
    expect(sources).toContain("typed while full");
  });

  test("leftover legacy key next to a valid index is imported once", async ({ page }) => {
    await seedLibrary(page, SEED);
    await page.addInitScript(() => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("qack-maid:source", "flowchart TD\n OLD");
    });
    await page.goto("/index.html");
    await expect.poll(() => names(page)).toEqual(["Untitled", "Login flow", "Order ER"]);
    expect(await page.evaluate(() => localStorage.getItem("qack-maid:source"))).toBeNull();
    await page.reload();
    expect(await names(page)).toHaveLength(3);
  });

  test("unsaved edit blocks switching while full, then is saved before the switch", async ({ page }) => {
    await failWritesHook(page);
    await seedLibrary(page, SEED);
    await page.goto("/index.html");
    await setFail(page, true);
    await page.locator("#source").press("End");
    await page.locator("#source").pressSequentially("X");
    await expect(page.locator("#toast")).toHaveText(FULL);
    await page.evaluate(() => document.getElementById("toast")!.classList.remove("show"));
    await page.evaluate(() => (document.getElementById("toast")!.textContent = ""));

    await row(page, "Order ER").locator(".diagram-open").click();
    await expect(page.locator("#toast")).toHaveText(FULL);
    await expect(page.locator("#source")).toHaveValue(LOGIN + "X");
    await expect(page.locator('.diagram-row[aria-current="true"] .diagram-name')).toHaveText("Login flow");

    await setFail(page, false);
    await row(page, "Order ER").locator(".diagram-open").click();
    await expect(page.locator("#source")).toHaveValue("erDiagram\n  A ||--o{ B : has");
    expect((await storedBody(page, "seed0")).source).toBe(LOGIN + "X");
  });

  test("deleting another Diagram retries the unsaved edit", async ({ page }) => {
    await failWritesHook(page);
    await seedLibrary(page, SEED);
    await page.goto("/index.html");
    await setFail(page, true);
    await page.locator("#source").press("End");
    await page.locator("#source").pressSequentially("X");
    await expect(page.locator("#toast")).toHaveText(FULL);
    await setFail(page, false); // the delete frees space
    await openMenu(page, "Order ER");
    await row(page, "Order ER").locator('[data-action="delete"]').click();
    await page.locator('[data-action="confirm-delete"]').click();
    await expect.poll(() => names(page)).toEqual(["Login flow"]);
    await expect.poll(async () => (await storedBody(page, "seed0")).source).toBe(LOGIN + "X");
    await expect(page.locator("#source")).toHaveValue(LOGIN + "X");
  });

  test("a corrupt index is rebuilt before New writes, so no Diagram is orphaned", async ({ page }) => {
    await seedLibrary(page, SEED);
    await page.goto("/index.html");
    await page.evaluate(() => localStorage.setItem("qack-maid:diagrams", "{oops"));
    await page.locator("#diagram-new").click();
    await expect.poll(() => names(page)).toHaveLength(3);
    expect(await names(page)).toContain("Untitled");
  });
});
