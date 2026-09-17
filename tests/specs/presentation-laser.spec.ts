import { test, expect, type Page, type Locator } from "@playwright/test";

// Covers presentation-mode issue #7 (laser trail pointer while presenting)
// per Obsidian/02_Projects/qack-maid/plans/2026-09-16-presentation-mode-spec.md,
// acceptance criteria 14, 15, plus the owner decision resolving the spec's
// open question: while Laser is active, moving over the diagram must NOT
// reveal the toolbar (exit control + tool buttons) — it only reappears when
// the pointer moves near/over the toolbar's own region, then fades on the
// normal ~2s idle timer. Pointer mode's chrome behavior is unchanged (any
// move reveals). Builds on issue #2/#3's chrome/spotlight hooks.

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

async function switchToLaser(page: Page) {
  await page.click("#tool-laser");
  await expect(page.locator("#tool-laser")).toHaveAttribute("aria-pressed", "true");
}

// Sums the alpha channel of the laser canvas so tests can assert "a trail is
// visible" / "the trail has fully faded" without depending on exact pixel
// colors or positions.
async function laserCanvasAlphaSum(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.getElementById("laser-canvas") as HTMLCanvasElement | null;
    if (!canvas) return 0;
    const ctx = canvas.getContext("2d")!;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    for (let i = 3; i < data.length; i += 4) sum += data[i];
    return sum;
  });
}

test.describe("presentation mode — tool switch (AC 14)", () => {
  test.beforeEach(async ({ page }) => {
    await forceFullscreenFallback(page);
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
  });

  test("Pointer/Laser buttons appear with the exit control; Pointer is active on entry", async ({ page }) => {
    await enterPresentation(page);
    await expect(page.locator("#tool-pointer")).toBeVisible();
    await expect(page.locator("#tool-laser")).toBeVisible();
    await expect(page.locator("#presentation-exit")).toBeVisible();
    await expect(page.locator("#tool-pointer")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#tool-laser")).toHaveAttribute("aria-pressed", "false");
  });

  test("clicking Laser marks it active and Pointer inactive; clicking back restores Pointer", async ({ page }) => {
    await enterPresentation(page);
    await switchToLaser(page);
    await expect(page.locator("#tool-pointer")).toHaveAttribute("aria-pressed", "false");

    await page.click("#tool-pointer");
    await expect(page.locator("#tool-pointer")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#tool-laser")).toHaveAttribute("aria-pressed", "false");
  });

  test("no keyboard shortcut switches tool; keydown guard unchanged", async ({ page }) => {
    await enterPresentation(page);
    await page.keyboard.press("l");
    await page.keyboard.press("p");
    await expect(page.locator("#tool-pointer")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".preview-wrap")).toHaveClass(/presenting/);
  });

  test("Pointer is active again on re-entry even if Laser was left active", async ({ page }) => {
    await enterPresentation(page);
    await switchToLaser(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);

    await enterPresentation(page);
    await expect(page.locator("#tool-pointer")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#tool-laser")).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("presentation mode — laser trail and suppression (AC 15)", () => {
  test.beforeEach(async ({ page }) => {
    await forceFullscreenFallback(page);
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
  });

  test("moving draws a trail that fades to nothing within ~1s", async ({ page }) => {
    await enterPresentation(page);
    await switchToLaser(page);
    const vp = page.viewportSize()!;
    const cx = vp.width / 2, cy = vp.height / 2;
    await page.mouse.move(cx - 40, cy - 40);
    await page.mouse.move(cx, cy, { steps: 8 });
    await page.mouse.move(cx + 40, cy + 20, { steps: 8 });
    await page.waitForTimeout(100); // let rAF paint at least one frame

    const freshAlpha = await laserCanvasAlphaSum(page);
    expect(freshAlpha).toBeGreaterThan(0);

    await page.waitForTimeout(1200); // past the ~1s fade, well before the 2s idle-hide
    const fadedAlpha = await laserCanvasAlphaSum(page);
    expect(fadedAlpha).toBe(0);
  });

  test("clicks don't pin or unpin", async ({ page }) => {
    await enterPresentation(page);
    await switchToLaser(page);
    const nodeA = nodeLocator(page, "A");
    await nodeA.click({ force: true });
    await expect(page.locator(".presentation-focus")).toHaveCount(0);
    await expect(page.locator(".presentation-dim")).toHaveCount(0);
  });

  test("hover doesn't preview the spotlight", async ({ page }) => {
    await enterPresentation(page);
    await switchToLaser(page);
    const nodeA = nodeLocator(page, "A");
    await nodeA.hover({ force: true });
    await page.waitForTimeout(50);
    await expect(page.locator(".presentation-focus")).toHaveCount(0);
    await expect(page.locator(".presentation-dim")).toHaveCount(0);
  });

  test("drag doesn't pan a zoomed, overflowing diagram", async ({ page }) => {
    await enterPresentation(page);
    // Zoom in first (zoom keys/wheel are not tool-specific) to get an
    // overflowing, pannable diagram.
    await ctrlWheel(page, 5, -100); // 1.5x fit -> overflows
    await expect(page.locator(".preview-wrap")).toHaveClass(/can-pan/);
    await switchToLaser(page);

    const before = await page.locator("#preview").evaluate((el) => (el as HTMLElement).style.transform);
    const vp = page.viewportSize()!;
    await page.mouse.move(vp.width / 2, vp.height / 2);
    await page.mouse.down();
    await page.mouse.move(vp.width / 2 + 60, vp.height / 2 + 40, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(50);
    const after = await page.locator("#preview").evaluate((el) => (el as HTMLElement).style.transform);
    expect(after).toBe(before);
  });

  test("an existing pin stays lit when switching into Laser mode", async ({ page }) => {
    await enterPresentation(page);
    const nodeA = nodeLocator(page, "A");
    await nodeA.click();
    await expect(nodeA).toHaveClass(/presentation-focus/);

    await switchToLaser(page);
    await expect(nodeA).toHaveClass(/presentation-focus/);
  });

  test("arrow keys still step the pin through nodes", async ({ page }) => {
    await enterPresentation(page);
    await switchToLaser(page);
    await page.keyboard.press("ArrowRight");
    await expect(nodeLocator(page, "A")).toHaveClass(/presentation-focus/);
    await page.keyboard.press("ArrowRight");
    await expect(nodeLocator(page, "B")).toHaveClass(/presentation-focus/);
  });

  test("Esc unpins first, then exits, same as Pointer mode", async ({ page }) => {
    await enterPresentation(page);
    await switchToLaser(page);
    await page.keyboard.press("ArrowRight");
    await expect(nodeLocator(page, "A")).toHaveClass(/presentation-focus/);

    await page.keyboard.press("Escape");
    await expect(page.locator(".presentation-focus")).toHaveCount(0);
    await expect(page.locator(".preview-wrap")).toHaveClass(/presenting/);

    await page.keyboard.press("Escape");
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);
  });

  test("exit removes the canvas overlay; SVG/PNG export are unaffected (AC 10)", async ({ page }) => {
    const preSvg: string = await page.evaluate(async () => (window as any).buildExportSvgMarkup());

    await enterPresentation(page);
    await switchToLaser(page);
    await expect(page.locator("#laser-canvas")).toHaveCount(1);

    const vp = page.viewportSize()!;
    await page.mouse.move(vp.width / 2, vp.height / 2, { steps: 5 });
    const nodeA = nodeLocator(page, "A");
    await nodeA.click({ force: true }); // must not pin while lasering

    await page.keyboard.press("Escape"); // exit (nothing pinned)
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);
    await expect(page.locator("#laser-canvas")).toHaveCount(0);

    const liveState = await page.evaluate(() => {
      const svg = document.querySelector("#preview svg")!;
      return {
        hitAreas: svg.querySelectorAll(".presentation-hit-area").length,
        dim: svg.querySelectorAll(".presentation-dim").length,
        focus: svg.querySelectorAll(".presentation-focus").length,
      };
    });
    expect(liveState).toEqual({ hitAreas: 0, dim: 0, focus: 0 });

    const postSvg: string = await page.evaluate(async () => (window as any).buildExportSvgMarkup());
    expect(postSvg).toBe(preSvg);
  });
});

test.describe("presentation mode — chrome visibility while lasering (owner decision)", () => {
  test.beforeEach(async ({ page }) => {
    await forceFullscreenFallback(page);
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
    await page.clock.install();
  });

  test("Laser: moving over the diagram does not reveal the toolbar; moving near it does", async ({ page }) => {
    await enterPresentation(page);
    await switchToLaser(page); // clicking the toolbar counts as toolbar interaction
    const wrap = page.locator(".preview-wrap");
    await expect(wrap).toHaveClass(/chrome-visible/);

    await page.clock.fastForward(2500); // idle out
    await expect(wrap).not.toHaveClass(/chrome-visible/);

    // Moving over the diagram, away from the toolbar, must not reveal it.
    const vp = page.viewportSize()!;
    await page.mouse.move(vp.width / 2, vp.height / 2, { steps: 5 });
    await expect(wrap).not.toHaveClass(/chrome-visible/);

    // Moving near the toolbar's own region does reveal it.
    const toolbarBox = (await page.locator("#presentation-toolbar").boundingBox())!;
    await page.mouse.move(
      toolbarBox.x + toolbarBox.width / 2,
      toolbarBox.y + toolbarBox.height / 2,
    );
    await expect(wrap).toHaveClass(/chrome-visible/);

    // It still fades on the normal ~2s idle timer.
    await page.clock.fastForward(2500);
    await expect(wrap).not.toHaveClass(/chrome-visible/);
  });

  test("hovering the toolbar shows the normal cursor while lasering", async ({ page }) => {
    await enterPresentation(page);
    await switchToLaser(page);
    const wrap = page.locator(".preview-wrap");
    await expect(wrap).toHaveClass(/laser-active/);

    let cursor = await wrap.evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).toBe("none");

    const toolbar = page.locator("#presentation-toolbar");
    cursor = await toolbar.evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).toBe("default");
  });

  test("Pointer mode is unchanged: moving over the diagram still reveals the toolbar", async ({ page }) => {
    await enterPresentation(page);
    const wrap = page.locator(".preview-wrap");
    await expect(wrap).toHaveClass(/chrome-visible/);

    await page.clock.fastForward(2500);
    await expect(wrap).not.toHaveClass(/chrome-visible/);

    const vp = page.viewportSize()!;
    await page.mouse.move(vp.width / 2, vp.height / 2, { steps: 5 });
    await expect(wrap).toHaveClass(/chrome-visible/);
  });
});
