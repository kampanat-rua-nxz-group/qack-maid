import { test, expect, type Page, type Locator } from "@playwright/test";

// Covers presentation-mode issue #6 (zoom and pan while presenting) per
// Obsidian/02_Projects/qack-maid/plans/2026-09-16-presentation-mode-spec.md,
// acceptance criteria 13, and confirms AC 1 and AC 9 still pass per the
// issue's "Done when". Builds on issue #1/#2/#3's enter/exit/shortcut-guard/
// spotlight hooks.
//
// Ctrl/Cmd+wheel is simulated by holding the modifier via page.keyboard.down()
// around page.mouse.wheel() — Playwright applies whatever modifier keys are
// currently held to subsequent low-level input, the same way a real trackpad
// pinch or Ctrl+wheel would report ctrlKey/metaKey on the wheel event.

async function forceFullscreenFallback(page: Page) {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error("denied-for-test"));
  });
}

async function enterPresentation(page: Page) {
  await page.click("#present");
  await expect(page.locator(".preview-wrap")).toHaveClass(/presenting/);
}

function nodeLocator(page: Page, letter: string): Locator {
  return page.locator(`#preview g.node[id*="-flowchart-${letter}-"]`);
}

async function ctrlWheel(page: Page, ticks: number, deltaYPerTick: number) {
  await page.keyboard.down("Control");
  for (let i = 0; i < ticks; i++) await page.mouse.wheel(0, deltaYPerTick);
  await page.keyboard.up("Control");
}

const MOD = process.platform === "darwin" ? "Meta" : "Control";

test.describe("presentation mode — zoom (AC 13)", () => {
  test.beforeEach(async ({ page }) => {
    await forceFullscreenFallback(page);
    await page.goto("/index.html");
    // default example on load is the flowchart (A -> B -> {C,D} -> E)
    await expect(page.locator("#preview svg")).toBeVisible();
  });

  test("presentation starts at fit regardless of the pre-presentation zoom level", async ({ page }) => {
    await enterPresentation(page);
    const fitBox = (await page.locator("#preview svg").boundingBox())!;
    await page.keyboard.press("Escape");
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);

    // Zoom the editor's own view well away from 100% before presenting again.
    await page.click("#zoom-in");
    await page.click("#zoom-in");
    await page.click("#zoom-in");
    await expect(page.locator("#zoom-level")).not.toHaveText("100%");

    await enterPresentation(page);
    const fitBoxAgain = (await page.locator("#preview svg").boundingBox())!;
    expect(Math.abs(fitBoxAgain.width - fitBox.width)).toBeLessThan(2);
    expect(Math.abs(fitBoxAgain.height - fitBox.height)).toBeLessThan(2);
  });

  test("Ctrl/Cmd+wheel zooms in and out, clamped to 0.25x–3x of fit", async ({ page }) => {
    await enterPresentation(page);
    const fit = (await page.locator("#preview svg").boundingBox())!;

    await ctrlWheel(page, 5, -100); // zoom in: 5 * 0.1 = +0.5 -> 1.5x
    const zoomedIn = (await page.locator("#preview svg").boundingBox())!;
    expect(zoomedIn.width).toBeGreaterThan(fit.width * 1.3);

    // Zoom out far past the lower bound; must clamp at 0.25x fit.
    await ctrlWheel(page, 60, 100);
    const zoomedOutMin = (await page.locator("#preview svg").boundingBox())!;
    expect(zoomedOutMin.width / fit.width).toBeCloseTo(0.25, 1);

    // Zoom in far past the upper bound; must clamp at 3x fit.
    await ctrlWheel(page, 60, -100);
    const zoomedInMax = (await page.locator("#preview svg").boundingBox())!;
    expect(zoomedInMax.width / fit.width).toBeCloseTo(3, 1);
  });

  test("+/= zooms in, - zooms out, both clamped to 0.25x–3x of fit", async ({ page }) => {
    await enterPresentation(page);
    const fit = (await page.locator("#preview svg").boundingBox())!;

    await page.keyboard.press("=");
    const zoomedIn = (await page.locator("#preview svg").boundingBox())!;
    expect(zoomedIn.width).toBeGreaterThan(fit.width);

    await page.keyboard.press("-");
    await page.keyboard.press("-");
    const zoomedOut = (await page.locator("#preview svg").boundingBox())!;
    expect(zoomedOut.width).toBeLessThan(fit.width);

    for (let i = 0; i < 30; i++) await page.keyboard.press("-");
    const zoomedOutMin = (await page.locator("#preview svg").boundingBox())!;
    expect(zoomedOutMin.width / fit.width).toBeCloseTo(0.25, 1);

    for (let i = 0; i < 30; i++) await page.keyboard.press("=");
    const zoomedInMax = (await page.locator("#preview svg").boundingBox())!;
    expect(zoomedInMax.width / fit.width).toBeCloseTo(3, 1);
  });

  test("'0' resets zoom to fit", async ({ page }) => {
    await enterPresentation(page);
    const fit = (await page.locator("#preview svg").boundingBox())!;

    await page.keyboard.press("+");
    await page.keyboard.press("+");
    const zoomed = (await page.locator("#preview svg").boundingBox())!;
    expect(zoomed.width).toBeGreaterThan(fit.width);

    await page.keyboard.press("0");
    const reset = (await page.locator("#preview svg").boundingBox())!;
    expect(Math.abs(reset.width - fit.width)).toBeLessThan(2);
    expect(Math.abs(reset.height - fit.height)).toBeLessThan(2);
  });

  test("resize refit re-measures the fit base and keeps the current zoom multiplier", async ({ page }) => {
    await enterPresentation(page);
    await ctrlWheel(page, 5, -100); // 1.5x fit

    await page.setViewportSize({ width: 900, height: 650 });
    await page.waitForTimeout(150);
    const zoomedAfterResize = (await page.locator("#preview svg").boundingBox())!;

    await page.keyboard.press("0"); // fit at the new viewport size
    const fitAfterResize = (await page.locator("#preview svg").boundingBox())!;

    expect(zoomedAfterResize.width / fitAfterResize.width).toBeCloseTo(1.5, 1);
  });

  test("Esc restores the pre-presentation zoom level even after zooming while presenting", async ({ page }) => {
    await page.click("#zoom-in");
    const zoomedLabel = await page.locator("#zoom-level").textContent();
    expect(zoomedLabel).not.toBe("100%");

    await enterPresentation(page);
    await ctrlWheel(page, 5, -100);

    await page.keyboard.press("Escape");
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);
    await expect(page.locator("#zoom-level")).toHaveText(zoomedLabel!);
  });

  test("zoom keys have no effect when not presenting", async ({ page }) => {
    await page.click("body");
    const before = (await page.locator("#preview svg").boundingBox())!;
    await page.keyboard.press("+");
    await page.keyboard.press("=");
    await page.keyboard.press("-");
    await page.keyboard.press("0");
    await page.waitForTimeout(100);
    const after = (await page.locator("#preview svg").boundingBox())!;
    expect(after.width).toBeCloseTo(before.width, 0);
    expect(after.height).toBeCloseTo(before.height, 0);
  });

  test("zoom keys typed into the editor insert characters instead of zooming", async ({ page }) => {
    await page.click("#source");
    await page.keyboard.press("End");
    await page.keyboard.type("+-=0");
    await page.waitForTimeout(500);
    const value = await page.locator("#source").inputValue();
    expect(value.endsWith("+-=0")).toBe(true);
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);
  });

  test("Cmd/Ctrl+S and Cmd/Ctrl+Enter still do nothing while presenting (AC 9)", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__renderCalls = 0;
      const original = (window as any).render;
      (window as any).render = (...args: unknown[]) => {
        (window as any).__renderCalls++;
        return original(...args);
      };
    });

    await enterPresentation(page);

    const blockedDownload = page.waitForEvent("download", { timeout: 800 }).catch(() => null);
    await page.keyboard.press(`${MOD}+s`);
    expect(await blockedDownload).toBeNull();

    await page.keyboard.press(`${MOD}+Enter`);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as any).__renderCalls)).toBe(0);

    // Zoom keys must still work alongside the still-suppressed shortcuts.
    const fit = (await page.locator("#preview svg").boundingBox())!;
    await page.keyboard.press("+");
    const zoomed = (await page.locator("#preview svg").boundingBox())!;
    expect(zoomed.width).toBeGreaterThan(fit.width);
  });
});

test.describe("presentation mode — pan (AC 13)", () => {
  test.beforeEach(async ({ page }) => {
    await forceFullscreenFallback(page);
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
    await enterPresentation(page);
  });

  test("wheel scroll does not pan at fit (not overflowing)", async ({ page }) => {
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/can-pan/);
    const before = await page.locator("#preview").evaluate((el) => (el as HTMLElement).style.transform);
    await page.mouse.wheel(0, 150);
    await page.waitForTimeout(100);
    const after = await page.locator("#preview").evaluate((el) => (el as HTMLElement).style.transform);
    expect(after).toBe(before);
  });

  test("wheel scroll pans once the zoomed diagram overflows the viewport", async ({ page }) => {
    await ctrlWheel(page, 5, -100); // 1.5x fit -> overflows
    await expect(page.locator(".preview-wrap")).toHaveClass(/can-pan/);

    const before = await page.locator("#preview").evaluate((el) => (el as HTMLElement).style.transform);
    await page.mouse.wheel(0, 150);
    await page.waitForTimeout(100);
    const after = await page.locator("#preview").evaluate((el) => (el as HTMLElement).style.transform);
    expect(after).not.toBe(before);
  });

  test("drag pans a zoomed, overflowing diagram", async ({ page }) => {
    await ctrlWheel(page, 5, -100); // 1.5x fit -> overflows
    await expect(page.locator(".preview-wrap")).toHaveClass(/can-pan/);

    const vp = page.viewportSize()!;
    const before = (await page.locator("#preview svg").boundingBox())!;
    await page.mouse.move(vp.width / 2, vp.height / 2);
    await page.mouse.down();
    await page.mouse.move(vp.width / 2 + 60, vp.height / 2 + 40, { steps: 8 }); // well past the ~4px threshold
    await page.mouse.up();
    await page.waitForTimeout(50);
    const after = (await page.locator("#preview svg").boundingBox())!;
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(10);
  });

  test("a drag never pins or unpins, even over a node", async ({ page }) => {
    await ctrlWheel(page, 5, -100); // 1.5x fit -> overflows
    await expect(page.locator(".preview-wrap")).toHaveClass(/can-pan/);

    const nodeA = nodeLocator(page, "A");
    const nodeBox = (await nodeA.boundingBox())!;
    const cx = nodeBox.x + nodeBox.width / 2, cy = nodeBox.y + nodeBox.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy + 40, { steps: 8 }); // well past the ~4px threshold
    await page.mouse.up();
    await page.waitForTimeout(50);

    // Move off any highlightable element — a hover preview clears, but a real
    // pin from the drag would persist regardless of hover.
    const wrapBox = (await page.locator(".preview-wrap").boundingBox())!;
    await page.mouse.move(wrapBox.x + 5, wrapBox.y + 5);
    await page.waitForTimeout(50);
    expect(await page.locator(".presentation-focus").count()).toBe(0);
  });

  test("a click below the drag threshold still pins (AC 4 unaffected)", async ({ page }) => {
    await ctrlWheel(page, 5, -100); // 1.5x fit -> overflows, exercises the drag/click branch
    await expect(page.locator(".preview-wrap")).toHaveClass(/can-pan/);

    const nodeA = nodeLocator(page, "A");
    const nodeBox = (await nodeA.boundingBox())!;
    const cx = nodeBox.x + nodeBox.width / 2, cy = nodeBox.y + nodeBox.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 1, cy + 1, { steps: 2 }); // well below the ~4px threshold
    await page.mouse.up();
    await page.waitForTimeout(50);

    await expect(nodeA).toHaveClass(/presentation-focus/);
  });

  test("drag-to-pan is inactive at fit — a small move still resolves as a pin click", async ({ page }) => {
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/can-pan/);
    const nodeA = nodeLocator(page, "A");
    const nodeBox = (await nodeA.boundingBox())!;
    const cx = nodeBox.x + nodeBox.width / 2, cy = nodeBox.y + nodeBox.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 2, cy + 2, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(50);
    await expect(nodeA).toHaveClass(/presentation-focus/);
  });
});

// Regression coverage for the `dragSuppressClick` leak: the flag is only
// cleared by onHighlightClick consuming it or by pointercancel. If a drag's
// pointerup lands outside #preview (the element onHighlightClick listens on)
// — e.g. released past the diagram, in the empty space `.preview-wrap` still
// covers — no click ever reaches onHighlightClick to consume the flag, so it
// used to stay stuck and swallow the very next genuine click. Uses a wide/
// short `flowchart LR` (same node ids as the default example) so a mild
// zoom-in leaves a large, reliable empty gap below the diagram at the
// standard 1280x720 viewport, without needing to drag far enough to disturb
// panning invariants.
test.describe("presentation mode — drag-release edge cases (issue #6 leak fix)", () => {
  const wideFlowchartSource =
    "flowchart LR\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Do thing]\n    B -->|No| D[Skip]\n    C --> E[End]\n    D --> E";

  test.beforeEach(async ({ page }) => {
    await forceFullscreenFallback(page);
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
    await page.fill("#source", wideFlowchartSource);
    await page.waitForTimeout(400); // let the debounced (250ms) re-render land
    await expect(page.locator("#preview svg")).toBeVisible();
  });

  test("a drag released outside #preview doesn't leave a stuck flag — the next click still pins", async ({ page }) => {
    await enterPresentation(page);
    await ctrlWheel(page, 1, -100); // mild zoom-in: overflows via width, big gap remains below
    await expect(page.locator(".preview-wrap")).toHaveClass(/can-pan/);

    const wrap = (await page.locator(".preview-wrap").boundingBox())!;
    const preview = (await page.locator("#preview").boundingBox())!;
    const nodeA = nodeLocator(page, "A");
    const boxA = (await nodeA.boundingBox())!;
    const cx = boxA.x + boxA.width / 2, cy = boxA.y + boxA.height / 2;
    // Just past the diagram's bottom edge, still comfortably inside the wrap.
    const releaseY = Math.min(preview.y + preview.height + 30, wrap.y + wrap.height - 5);

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 20, { steps: 4 }); // cross PAN_DRAG_THRESHOLD
    await page.mouse.move(cx, releaseY, { steps: 8 }); // release beyond #preview's box
    await page.mouse.up();
    await page.waitForTimeout(100); // let the deferred clear (if any) run

    // Still presenting — this drag must not have exited or pinned anything
    // (move off any highlightable element first — a lingering hover at the
    // release point would otherwise still show presentation-focus).
    await expect(page.locator(".preview-wrap")).toHaveClass(/presenting/);
    await page.mouse.move(10, 10);
    await page.waitForTimeout(50);
    expect(await page.locator(".presentation-focus").count()).toBe(0);

    // Recentre (0 resets zoom+pan) so the dragged node is back in view, then
    // issue a genuine, independent click on it.
    await page.keyboard.press("0");
    await page.waitForTimeout(50);
    const freshBoxA = (await nodeA.boundingBox())!;
    const fcx = freshBoxA.x + freshBoxA.width / 2, fcy = freshBoxA.y + freshBoxA.height / 2;
    await page.mouse.move(fcx, fcy);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(50);

    // Move off any highlightable element — a hover preview clears, but a real
    // pin from this click would persist regardless of hover.
    await page.mouse.move(10, 10);
    await page.waitForTimeout(50);
    await expect(nodeA).toHaveClass(/presentation-focus/);
  });

  test("a stuck flag from a drag never survives exiting and re-entering presentation", async ({ page }) => {
    await enterPresentation(page);
    await ctrlWheel(page, 1, -100);
    await expect(page.locator(".preview-wrap")).toHaveClass(/can-pan/);

    const wrap = (await page.locator(".preview-wrap").boundingBox())!;
    const preview = (await page.locator("#preview").boundingBox())!;
    const nodeA = nodeLocator(page, "A");
    const boxA = (await nodeA.boundingBox())!;
    const cx = boxA.x + boxA.width / 2, cy = boxA.y + boxA.height / 2;
    const releaseY = Math.min(preview.y + preview.height + 30, wrap.y + wrap.height - 5);

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 20, { steps: 4 });
    await page.mouse.move(cx, releaseY, { steps: 8 });
    await page.mouse.up();

    // Exit immediately (no time given for any deferred clear) and re-enter —
    // teardownPresentation() must reset the flag on its own.
    await page.keyboard.press("Escape");
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);
    await enterPresentation(page);

    const freshNodeA = nodeLocator(page, "A");
    const freshBoxA = (await freshNodeA.boundingBox())!;
    const fcx = freshBoxA.x + freshBoxA.width / 2, fcy = freshBoxA.y + freshBoxA.height / 2;
    await page.mouse.move(fcx, fcy);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(50);
    await page.mouse.move(10, 10);
    await page.waitForTimeout(50);
    await expect(freshNodeA).toHaveClass(/presentation-focus/);
  });
});
