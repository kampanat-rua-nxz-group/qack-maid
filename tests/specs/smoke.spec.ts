import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Characterization smoke tests for the non-presentation features (editor,
// theme, Preview background, export) plus a load check over http and file://.
// Written against the single-file app before the split described in
// docs/specs/split-index-html.md, so they pin today's behavior. Never edit
// them to make a refactor pass.

const RENDER_SETTLE_MS = 400; // Render debounce (250ms) + mermaid.render

async function runExportAction(page: Page, action: string) {
  await page.click("#export-trigger");
  await page.click(`[data-export="${action}"]`);
}

// Mermaid names each render "graph-N", so strip ids before comparing styles.
async function previewStyleText(page: Page) {
  const text = await page.locator("#preview svg style").first().textContent();
  return (text ?? "").replace(/graph-\d+/g, "");
}

test.describe("smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
  });

  test("Autosave keeps invalid Source verbatim across a reload", async ({ page }) => {
    const invalid = "flowchart TD\n  A --> \n  %% not finished";
    await page.fill("#source", invalid);
    await page.waitForTimeout(RENDER_SETTLE_MS);
    await page.reload();
    await expect(page.locator("#source")).toHaveValue(invalid);
  });

  test("choosing an Example replaces Source and renders it", async ({ page }) => {
    await page.selectOption("#examples", "sequence");
    await expect(page.locator("#source")).toHaveValue(/^sequenceDiagram/);
    await expect(page.locator('#preview svg[aria-roledescription="sequence"]')).toBeVisible();
    await expect(page.locator("#examples")).toHaveValue("");
  });

  test("Format reindents Source and drops blank lines", async ({ page }) => {
    await page.fill("#source", "flowchart TD\n\n      A --> B\nB --> C\n");
    await page.click("#format");
    await expect(page.locator("#source")).toHaveValue("flowchart TD\n    A --> B\n    B --> C");
  });

  test("diagram theme re-renders Preview and persists", async ({ page }) => {
    const before = await previewStyleText(page);
    await page.selectOption("#theme-select", "dark");
    await expect.poll(() => previewStyleText(page)).not.toBe(before);
    await page.reload();
    await expect(page.locator("#theme-select")).toHaveValue("dark");
  });

  test("Preview background is independent of theme and persists", async ({ page }) => {
    const wrap = page.locator(".preview-wrap");
    expect(await wrap.getAttribute("data-preview")).toBeNull();
    await page.selectOption("#preview-bg-select", "dark");
    await expect(wrap).toHaveAttribute("data-preview", "dark");
    await expect(page.locator("#theme-select")).toHaveValue("auto");
    await page.reload();
    await expect(wrap).toHaveAttribute("data-preview", "dark");
    await page.selectOption("#preview-bg-select", "auto");
    expect(await wrap.getAttribute("data-preview")).toBeNull();
  });

  test("Download SVG saves stamped markup", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download");
    await runExportAction(page, "download-svg");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("diagram.svg");
    const markup = fs.readFileSync(await download.path(), "utf8");
    expect(markup).toContain("<svg");
    expect(markup).toContain("Powered by");
    await expect(page.locator("#toast")).toHaveText("SVG downloaded");
  });

  test("Download PNG saves a valid PNG file", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download");
    await runExportAction(page, "download-png");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("diagram.png");
    const bytes = fs.readFileSync(await download.path());
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  test("Copy SVG puts stamped markup on the clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await runExportAction(page, "copy-svg");
    await expect(page.locator("#toast")).toHaveText("SVG markup copied");
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain("<svg");
    expect(text).toContain("Powered by");
  });
});

// A split that breaks load order surfaces as an uncaught ReferenceError; a bad
// script/stylesheet path surfaces as a console "Failed to load resource" error.
for (const [label, url] of [
  ["http", "/index.html"],
  ["file://", pathToFileURL(path.resolve(__dirname, "../../index.html")).href],
] as const) {
  test(`loads over ${label} and renders the default Example with no errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto(url);
    await expect(page.locator('#preview svg[aria-roledescription="flowchart-v2"]')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
