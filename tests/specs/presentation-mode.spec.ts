import { test, expect, type Page } from "@playwright/test";

// Covers presentation-mode issue #1 (enter/exit + fit-to-viewport) per
// Obsidian/02_Projects/qack-maid/plans/2026-09-16-presentation-mode-spec.md,
// acceptance criteria 1, 2, 3, 8, 12, plus fit/resize behavior.
//
// Headless Chromium commonly rejects `.requestFullscreen()` outside a real
// display (no user-activation-backed fullscreen surface). These tests assert
// on the app's own state (the `.presenting` class, disabled zoom controls,
// svg sizing) rather than `document.fullscreenElement`, so they pass whether
// the native Fullscreen API engages or the CSS fallback overlay takes over.

async function selectExample(page: Page, key: string) {
  await page.selectOption("#examples", key);
  await page.waitForTimeout(400); // debounce (250ms) + render
}

// Forces the CSS-overlay fallback path by making requestFullscreen() reject,
// the way a browser that refuses fullscreen (no user-activation surface,
// permission policy, etc.) would. Needed because headless Chromium here
// actually grants native fullscreen (see report), so without this override
// the fallback path goes untested, and an OS-level fullscreen window can't
// be resized by Playwright (setViewportSize errors on it).
async function forceFullscreenFallback(page: Page) {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error("denied-for-test"));
  });
}

test.describe("presentation mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
  });

  test("Present button and F enter presentation mode; Esc exits and restores zoom (AC 1)", async ({ page }) => {
    await page.click("#zoom-in");
    await page.click("#zoom-in");
    const zoomedLabel = await page.locator("#zoom-level").textContent();
    expect(zoomedLabel).not.toBe("100%");

    // Enter via the button.
    await page.click("#present");
    await page.waitForTimeout(200);
    await expect(page.locator(".preview-wrap")).toHaveClass(/presenting/);
    await expect(page.locator("#zoom-in")).toBeDisabled();

    // Esc exits and restores the prior zoom level.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);
    await expect(page.locator("#zoom-in")).toBeEnabled();
    await expect(page.locator("#zoom-level")).toHaveText(zoomedLabel!);

    // Enter again via the F key.
    await page.click("body");
    await page.keyboard.press("f");
    await page.waitForTimeout(200);
    await expect(page.locator(".preview-wrap")).toHaveClass(/presenting/);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);
  });

  test("F typed in the editor inserts text and does not enter presentation mode (AC 2)", async ({ page }) => {
    await page.click("#source");
    await page.keyboard.press("End");
    await page.keyboard.type("f");
    await page.waitForTimeout(100);
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);
    const value = await page.locator("#source").inputValue();
    expect(value.endsWith("f")).toBe(true);
  });

  test("Present is disabled with a tooltip on error/empty, re-enabled after fixing it (AC 3)", async ({ page }) => {
    await page.fill("#source", "not a valid diagram {{{");
    await page.waitForTimeout(400);
    await expect(page.locator("#preview")).toHaveClass(/has-error/);
    await expect(page.locator("#present")).toBeDisabled();
    await expect(page.locator("#present")).toHaveAttribute("title", "Fix the error to present");

    await page.fill("#source", "");
    await page.waitForTimeout(400);
    await expect(page.locator("#present")).toBeDisabled();
    await expect(page.locator("#present")).toHaveAttribute("title", "Fix the error to present");

    await page.fill("#source", "flowchart TD\n    A --> B");
    await page.waitForTimeout(400);
    await expect(page.locator("#present")).toBeEnabled();
    await expect(page.locator("#present")).toHaveAttribute("title", "F present · Esc exit");
  });

  for (const key of ["class", "er", "state", "gantt"]) {
    test(`${key} diagram enters presentation mode and fits without page errors (AC 8)`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(String(err)));

      await selectExample(page, key);
      await expect(page.locator("#present")).toBeEnabled();

      await page.click("#present");
      await page.waitForTimeout(250);
      await expect(page.locator(".preview-wrap")).toHaveClass(/presenting/);

      const svgBox = await page.locator("#preview svg").boundingBox();
      const viewport = page.viewportSize()!;
      expect(svgBox).not.toBeNull();
      expect(svgBox!.width).toBeLessThanOrEqual(viewport.width + 2);
      expect(svgBox!.height).toBeLessThanOrEqual(viewport.height + 2);
      const fillsWidth = svgBox!.width >= viewport.width * 0.6;
      const fillsHeight = svgBox!.height >= viewport.height * 0.6;
      expect(fillsWidth || fillsHeight).toBe(true);

      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
      expect(pageErrors).toEqual([]);
    });
  }

  test("CSS fallback: presenting works and fits when requestFullscreen is rejected", async ({ page }) => {
    await forceFullscreenFallback(page);
    await page.reload();
    await expect(page.locator("#preview svg")).toBeVisible();

    await page.click("#present");
    await page.waitForTimeout(200);
    await expect(page.locator(".preview-wrap")).toHaveClass(/presenting/);
    await expect(page.evaluate(() => document.fullscreenElement)).resolves.toBeNull();

    const svgBox = (await page.locator("#preview svg").boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(svgBox.width).toBeLessThanOrEqual(viewport.width + 2);
    expect(svgBox.height).toBeLessThanOrEqual(viewport.height + 2);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);
  });

  test("refits the diagram on viewport resize while presenting", async ({ page }) => {
    // Use the CSS fallback path for this test: a real OS-level fullscreen
    // window can't be resized by Playwright's setViewportSize.
    await forceFullscreenFallback(page);
    await page.reload();
    await expect(page.locator("#preview svg")).toBeVisible();

    await page.click("#present");
    await page.waitForTimeout(200);
    const before = (await page.locator("#preview svg").boundingBox())!;

    // Stay above the app's own 720px mobile-layout breakpoint (unrelated to
    // presentation mode) so the preview pane doesn't get hidden by that
    // separate responsive rule.
    await page.setViewportSize({ width: 900, height: 650 });
    await page.waitForTimeout(200);
    const after = (await page.locator("#preview svg").boundingBox())!;

    expect(after.width).toBeLessThanOrEqual(900 + 2);
    expect(after.height).toBeLessThanOrEqual(650 + 2);
    expect(Math.abs(after.width - before.width)).toBeGreaterThan(5);
  });

  test("Present button is hidden when hover is unavailable, e.g. touch devices (AC 12)", async ({ browser }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto("/index.html");
    // Confirm the environment actually evaluates (hover: none) — the app's
    // own mobile Source/Preview tab layout (a separate, pre-existing
    // responsive rule unrelated to presentation mode) is not this test's
    // concern.
    const hoverNone = await page.evaluate(() => matchMedia("(hover: none)").matches);
    expect(hoverNone).toBe(true);
    await expect(page.locator("#present")).toBeHidden();
    await context.close();
  });
});

test.describe("preview sizing when the preview pane starts hidden", () => {
  // Below 720px the app shows one pane at a time and loads on the Source tab,
  // so the first render happens while the Preview pane is display:none.
  test("diagram has a real size after switching to the Preview tab", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto("/index.html");
    await page.waitForTimeout(400);
    await page.click('.tab-btn[data-pane="preview"]');
    const box = await page.locator("#preview svg").boundingBox();
    expect(box && box.width).toBeGreaterThan(50);
    expect(box && box.height).toBeGreaterThan(50);
  });

  test("diagram has a real size after widening past the single-pane breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto("/index.html");
    await page.waitForTimeout(400);
    await page.setViewportSize({ width: 1280, height: 800 });
    const box = await page.locator("#preview svg").boundingBox();
    expect(box && box.width).toBeGreaterThan(50);
    expect(box && box.height).toBeGreaterThan(50);
  });
});
