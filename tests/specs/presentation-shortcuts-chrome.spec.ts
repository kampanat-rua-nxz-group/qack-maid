import { test, expect, type Page } from "@playwright/test";

// Covers presentation-mode issue #2 (suppress app shortcuts + auto-hide
// chrome) per
// Obsidian/02_Projects/qack-maid/plans/2026-09-16-presentation-mode-spec.md,
// acceptance criteria 9 and 11. Builds on issue #1's enter/exit hooks
// (`presenting`, `enterPresentation`/`exitPresentation`/`teardownPresentation`).

// Forces the CSS-overlay fallback path so presentation mode is deterministic
// under Playwright (see presentation-mode.spec.ts for the same helper and
// rationale — native OS-level fullscreen can't be resized/driven reliably).
async function forceFullscreenFallback(page: Page) {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error("denied-for-test"));
  });
}

const MOD = process.platform === "darwin" ? "Meta" : "Control";

test.describe("presentation mode — shortcut suppression (AC 9)", () => {
  test.beforeEach(async ({ page }) => {
    await forceFullscreenFallback(page);
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
  });

  test("Cmd/Ctrl+S does nothing while presenting, works again after exit", async ({ page }) => {
    await page.click("#present");
    await expect(page.locator(".preview-wrap")).toHaveClass(/presenting/);

    const blockedDownload = page
      .waitForEvent("download", { timeout: 800 })
      .catch(() => null);
    await page.keyboard.press(`${MOD}+s`);
    expect(await blockedDownload).toBeNull();

    // sanity: exiting restores the shortcut, proving the guard (not some
    // unrelated breakage) suppressed it above
    await page.keyboard.press("Escape");
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);
    const allowedDownload = page.waitForEvent("download", { timeout: 2000 });
    await page.keyboard.press(`${MOD}+s`);
    await expect(await allowedDownload).toBeTruthy();
  });

  test("Cmd/Ctrl+Enter does not re-render while presenting, works again after exit", async ({ page }) => {
    // render() is declared at the top level of the inline (non-module)
    // script, so it hangs off window; wrap it to count invocations.
    await page.evaluate(() => {
      (window as any).__renderCalls = 0;
      const original = (window as any).render;
      (window as any).render = (...args: unknown[]) => {
        (window as any).__renderCalls++;
        return original(...args);
      };
    });

    await page.click("#present");
    await expect(page.locator(".preview-wrap")).toHaveClass(/presenting/);

    await page.keyboard.press(`${MOD}+Enter`);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as any).__renderCalls)).toBe(0);

    // sanity: exiting restores the shortcut
    await page.keyboard.press("Escape");
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);
    await page.keyboard.press(`${MOD}+Enter`);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as any).__renderCalls)).toBeGreaterThan(0);
  });

  test("arrow keys are not blocked and do not exit presentation", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.click("#present");
    await expect(page.locator(".preview-wrap")).toHaveClass(/presenting/);

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(".preview-wrap")).toHaveClass(/presenting/);
    expect(pageErrors).toEqual([]);
  });
});

test.describe("presentation mode — idle chrome and cursor (AC 11)", () => {
  test.beforeEach(async ({ page }) => {
    await forceFullscreenFallback(page);
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
    // Install fake timers before entering presentation so the idle timer
    // scheduled on enter is under our control from the start.
    await page.clock.install();
  });

  test("exit control and cursor are visible on enter, hide after ~2s idle, reappear on move", async ({ page }) => {
    await page.click("#present");
    const wrap = page.locator(".preview-wrap");
    await expect(wrap).toHaveClass(/presenting/);

    // Visible immediately on enter.
    await expect(wrap).toHaveClass(/chrome-visible/);
    await expect(wrap).not.toHaveClass(/idle/);
    await expect(page.locator("#presentation-exit")).toBeVisible();
    let cursor = await wrap.evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).not.toBe("none");

    // Idle after ~2s with no movement.
    await page.clock.fastForward(2500);
    await expect(wrap).not.toHaveClass(/chrome-visible/);
    await expect(wrap).toHaveClass(/idle/);
    cursor = await wrap.evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).toBe("none");

    // Reappears on mouse move.
    const box = (await wrap.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(wrap).toHaveClass(/chrome-visible/);
    await expect(wrap).not.toHaveClass(/idle/);
    cursor = await wrap.evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).not.toBe("none");
  });

  test("clicking the exit control exits presentation mode", async ({ page }) => {
    await page.click("#present");
    const wrap = page.locator(".preview-wrap");
    await expect(wrap).toHaveClass(/presenting/);
    await expect(wrap).toHaveClass(/chrome-visible/);

    await page.locator("#presentation-exit").click();
    await expect(wrap).not.toHaveClass(/presenting/);
  });

  test("idle timer, chrome and idle classes, and mousemove listener are cleaned up on exit", async ({ page }) => {
    await page.click("#present");
    const wrap = page.locator(".preview-wrap");
    await expect(wrap).toHaveClass(/presenting/);

    await page.keyboard.press("Escape");
    await expect(wrap).not.toHaveClass(/presenting/);
    await expect(wrap).not.toHaveClass(/chrome-visible/);
    await expect(wrap).not.toHaveClass(/idle/);

    // Advancing the clock well past the idle window must not resurrect the
    // idle/chrome-visible classes — the timer from presentation mode should
    // have been cleared, not merely fired into a torn-down state.
    await page.clock.fastForward(5000);
    await expect(wrap).not.toHaveClass(/idle/);
    await expect(wrap).not.toHaveClass(/chrome-visible/);

    // Moving the mouse post-exit must not be wired to presentation chrome
    // anymore (listener removed).
    const box = (await wrap.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(wrap).not.toHaveClass(/chrome-visible/);
    await expect(wrap).not.toHaveClass(/idle/);
  });
});
