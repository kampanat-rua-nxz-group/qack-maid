import { test, expect, type Page } from "@playwright/test";
import { RENDER_SETTLE_MS, seedLegacySource, seedLibrary, storedLibrary } from "./helpers/diagrams";

test.describe("library storage", () => {
  test("uniqueName appends a minute stamp, then seconds", async ({ page }) => {
    await page.goto("/index.html");
    const names = await page.evaluate(() => {
      const now = new Date(2026, 9, 29, 14, 32, 5);
      return [
        uniqueName("Login flow", ["login flow"], now),
        uniqueName("Login flow", ["login flow", "Login flow 2026-10-29 14:32"], now),
        uniqueName("  ", [], now),
      ];
    });
    expect(names).toEqual([
      "Login flow 2026-10-29 14:32",
      "Login flow 2026-10-29 14:32:05",
      "Untitled",
    ]);
  });

  test("new user gets one Untitled starter flowchart", async ({ page }) => {
    await page.goto("/index.html");
    const items = await page.evaluate(() => listDiagrams());
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Untitled");
    await expect(page.locator('#preview svg[aria-roledescription="flowchart-v2"]')).toBeVisible();
  });

  test("migrates legacy Source verbatim and removes the key", async ({ page }) => {
    const legacy = "flowchart TD\n  A --> \n  %% broken";
    await seedLegacySource(page, legacy);
    await page.goto("/index.html");
    await expect(page.locator("#source")).toHaveValue(legacy);
    expect(await page.evaluate(() => localStorage.getItem("qack-maid:source"))).toBeNull();
    expect((await storedLibrary(page)).items.map((i: { name: string }) => i.name)).toEqual(["Untitled"]);
    await page.reload();
    expect((await storedLibrary(page)).items).toHaveLength(1);
  });

  test("migrates empty legacy Source verbatim", async ({ page }) => {
    await seedLegacySource(page, "");
    await page.goto("/index.html");
    await expect(page.locator("#source")).toHaveValue("");
  });

  test("unreadable index is rebuilt from stored diagrams", async ({ page }) => {
    const errors: Error[] = [];
    page.on("pageerror", (e) => errors.push(e));
    await page.addInitScript(() => {
      localStorage.setItem("qack-maid:diagrams", "{oops");
      localStorage.setItem("qack-maid:diagram:a1", JSON.stringify({ source: "graph TD\n X", rev: 3 }));
    });
    await page.goto("/index.html");
    await expect(page.locator("#source")).toHaveValue("graph TD\n X");
    expect(errors).toEqual([]);
    const items = await page.evaluate(() => listDiagrams());
    expect(items.map((i: { name: string }) => i.name)).toEqual(["Recovered"]);
  });

  test("autosave writes on input, before the render debounce", async ({ page }) => {
    await seedLibrary(page, [{ name: "One", source: "flowchart TD\n A --> B", minutesAgo: 0 }]);
    await page.goto("/index.html");
    await page.fill("#source", "flowchart LR\n Q");
    const stored = await page.evaluate(() => {
      const id = getOpenId();
      return JSON.parse(localStorage.getItem("qack-maid:diagram:" + id)!).source;
    });
    expect(stored).toBe("flowchart LR\n Q");
  });

  test("render and theme change do not bump updatedAt", async ({ page }) => {
    await seedLibrary(
      page,
      [
        { name: "New", source: "flowchart TD\n A --> B", minutesAgo: 0 },
        { name: "Old", source: "flowchart TD\n C --> D", minutesAgo: 60 },
      ],
      1,
    );
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
    const before = await storedLibrary(page);
    await page.selectOption("#theme-select", "dark");
    await page.waitForTimeout(RENDER_SETTLE_MS);
    const after = await storedLibrary(page);
    expect(after).toEqual(before);
    expect((await page.evaluate(() => listDiagrams())).map((i: { name: string }) => i.name)).toEqual(["New", "Old"]);
  });

  test("reload opens the Diagram open last", async ({ page }) => {
    await seedLibrary(
      page,
      [
        { name: "A", source: "flowchart TD\n A --> B", minutesAgo: 0 },
        { name: "B", source: "flowchart TD\n C --> D", minutesAgo: 5 },
      ],
      1,
    );
    await page.goto("/index.html");
    await expect(page.locator("#source")).toHaveValue("flowchart TD\n C --> D");
    await page.reload();
    await expect(page.locator("#source")).toHaveValue("flowchart TD\n C --> D");
  });

  test("empty index opens a new starter Diagram and autosave persists", async ({ page }) => {
    await page.addInitScript(() => {
      if (localStorage.getItem("qack-maid:diagrams") === null) {
        localStorage.setItem("qack-maid:diagrams", JSON.stringify({ items: [] }));
      }
    });
    await page.goto("/index.html");
    await expect(page.locator("#source")).not.toHaveValue("");
    await page.fill("#source", "flowchart LR\n Z");
    const stored = await page.evaluate(() => {
      const id = getOpenId();
      return JSON.parse(localStorage.getItem("qack-maid:diagram:" + id)!).source;
    });
    expect(stored).toBe("flowchart LR\n Z");
  });

  test("unreadable body is skipped, kept in storage, and the next Diagram opens", async ({ page }) => {
    await page.addInitScript(() => {
      if (localStorage.getItem("qack-maid:diagrams") !== null) return;
      const now = Date.now();
      localStorage.setItem("qack-maid:diagrams", JSON.stringify({
        items: [{ id: "bad", name: "Bad", updatedAt: now }, { id: "good", name: "Good", updatedAt: now - 1000 }],
      }));
      localStorage.setItem("qack-maid:diagram:bad", "{oops");
      localStorage.setItem("qack-maid:diagram:good", JSON.stringify({ source: "graph TD\n G", rev: 1 }));
      localStorage.setItem("qack-maid:open", "bad");
    });
    await page.goto("/index.html");
    await expect(page.locator("#source")).toHaveValue("graph TD\n G");
    expect(await page.evaluate(() => localStorage.getItem("qack-maid:diagram:bad"))).toBe("{oops");
  });
});

const SEED = [
  { name: "A", source: "flowchart TD\n A1 --> A2", minutesAgo: 0 },
  { name: "B", source: "flowchart TD\n B1 --> B2", minutesAgo: 120 },
  { name: "C", source: "flowchart TD\n C1 --> C2", minutesAgo: 4320 },
];

const rowNames = (page: Page) => page.locator(".diagram-name").allTextContents();

test.describe("sidebar", () => {
  test("lists Diagrams newest first with relative times", async ({ page }) => {
    await seedLibrary(page, SEED);
    await page.goto("/index.html");
    expect(await rowNames(page)).toEqual(["A", "B", "C"]);
    expect(await page.locator(".diagram-time").allTextContents()).toEqual(["just now", "2h ago", "3 days ago"]);
    await expect(page.locator('.diagram-row[data-id="seed0"]')).toHaveAttribute("aria-current", "true");
  });

  test("clicking a row opens that Diagram", async ({ page }) => {
    await seedLibrary(page, SEED);
    await page.goto("/index.html");
    await page.locator('.diagram-row[data-id="seed1"] .diagram-open').click();
    await expect(page.locator("#source")).toHaveValue(SEED[1].source);
    await expect(page.locator("#preview svg")).toContainText("B1");
    await expect(page.locator('.diagram-row[data-id="seed1"]')).toHaveAttribute("aria-current", "true");
    expect(await rowNames(page)).toEqual(["A", "B", "C"]);
  });

  test("editing moves a Diagram to the top", async ({ page }) => {
    await seedLibrary(page, SEED);
    await page.goto("/index.html");
    await page.locator('.diagram-row[data-id="seed2"] .diagram-open').click();
    await page.locator("#source").press("Control+End");
    await page.type("#source", "\n%% x");
    expect(await rowNames(page)).toEqual(["C", "A", "B"]);
  });

  test("switching right after typing keeps the last keystrokes", async ({ page }) => {
    await seedLibrary(page, SEED);
    await page.goto("/index.html");
    await page.locator("#source").press("Control+End");
    await page.type("#source", "Z");
    await page.locator('.diagram-row[data-id="seed1"] .diagram-open').click();
    await page.reload();
    await page.locator('.diagram-row[data-id="seed0"] .diagram-open').click();
    expect(await page.inputValue("#source")).toMatch(/Z$/);
  });

  test("New creates an empty Untitled and opens it", async ({ page }) => {
    await seedLibrary(page, SEED);
    await page.goto("/index.html");
    await page.click("#diagram-new");
    const current = page.locator('.diagram-row[aria-current="true"] .diagram-name');
    await expect(current).toHaveText("Untitled");
    await expect(page.locator("#source")).toHaveValue("");
    await page.click("#diagram-new");
    await expect(current).toHaveText(/^Untitled \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  test("collapse persists across reload", async ({ page }) => {
    await page.goto("/index.html");
    await page.click("#diagram-collapse");
    await expect(page.locator("#diagram-list")).toHaveClass(/collapsed/);
    await page.reload();
    await expect(page.locator("#diagram-list")).toHaveClass(/collapsed/);
    await expect(page.locator("#diagram-items")).toBeHidden();
    await expect(page.locator("#diagram-collapse")).toHaveAttribute("aria-expanded", "false");
  });

  test("long names do not widen the sidebar", async ({ page }) => {
    await page.goto("/index.html");
    const before = (await page.locator("#diagram-list").boundingBox())!.width;
    await page.evaluate(() => createDiagram("W".repeat(200), "flowchart TD\n A --> B"));
    await page.reload();
    await expect(page.locator(".diagram-name", { hasText: "WWWW" })).toBeVisible();
    const after = (await page.locator("#diagram-list").boundingBox())!.width;
    expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
  });

  test("presentation covers the sidebar", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
    await page.click("#present");
    await expect(page.locator(".preview-wrap")).toHaveClass(/presenting/);
    const inside = await page.evaluate(() => {
      const box = document.getElementById("diagram-list")!.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return !!hit && !!hit.closest(".preview-wrap");
    });
    expect(inside).toBe(true);
  });

  test("Example control is gone", async ({ page }) => {
    const errors: Error[] = [];
    page.on("pageerror", (e) => errors.push(e));
    await page.goto("/index.html");
    await expect(page.locator("#examples")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
