import { test, expect, type Page, type Locator } from "@playwright/test";

// Covers presentation-mode issue #7 (laser trail pointer while presenting)
// per Obsidian/02_Projects/qack-maid/plans/2026-09-16-presentation-mode-spec.md,
// acceptance criteria 14, 15, and docs/specs/laser-pointer.md (persistent dot,
// left-button-drag trail, eligible-area/boundary rules, saved color). The
// owner decision resolving the original spec's open question also still
// applies: while Laser is active, moving over the diagram must NOT reveal the
// toolbar (exit control + tool buttons) — it only reappears when the pointer
// moves near/over the toolbar's own region, then fades on the normal ~2s idle
// timer. Pointer mode's chrome behavior is unchanged (any move reveals).
// Builds on issue #2/#3's chrome/spotlight hooks.

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

// Sums the alpha channel of the whole laser canvas — useful only for "nothing
// at all is drawn" assertions (tool switch, teardown). A whole-canvas sum
// can't tell a persistent dot apart from a lingering trail, so trail/dot
// behavior itself is asserted with laserRegionAlpha() below instead.
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

// Sums the alpha channel in a small square region around a viewport (CSS
// pixel) position, scaled for devicePixelRatio. Lets tests check "is
// something drawn here" / "is this old spot now clear" without depending on
// exact pixel colors, and without the ambiguity of a whole-canvas sum.
async function laserRegionAlpha(page: Page, cx: number, cy: number, half = 12): Promise<number> {
  return page.evaluate(
    ({ cx, cy, half }) => {
      const canvas = document.getElementById("laser-canvas") as HTMLCanvasElement | null;
      if (!canvas) return 0;
      const ctx = canvas.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;
      const x = Math.max(0, Math.round((cx - half) * dpr));
      const y = Math.max(0, Math.round((cy - half) * dpr));
      const w = Math.min(canvas.width - x, Math.round(half * 2 * dpr));
      const h = Math.min(canvas.height - y, Math.round(half * 2 * dpr));
      if (w <= 0 || h <= 0) return 0;
      const data = ctx.getImageData(x, y, w, h).data;
      let sum = 0;
      for (let i = 3; i < data.length; i += 4) sum += data[i];
      return sum;
    },
    { cx, cy, half },
  );
}

// The RGB of the single pixel at a viewport position, for color-control
// assertions (which channel dominates after picking a new laser color).
async function laserPixelAt(page: Page, cx: number, cy: number) {
  return page.evaluate(
    ({ cx, cy }) => {
      const canvas = document.getElementById("laser-canvas") as HTMLCanvasElement;
      const ctx = canvas.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;
      const x = Math.round(cx * dpr);
      const y = Math.round(cy * dpr);
      const d = ctx.getImageData(x, y, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] };
    },
    { cx, cy },
  );
}

// Toolbar entry and blank-background eligibility can be driven with real
// mouse movement (it stays within the viewport). Presentation-area exit,
// window blur, and pointer cancellation cannot be reliably produced by the
// headless mouse API (the fullscreen overlay covers the whole viewport, and
// there's no real second window to blur to) — those are dispatched directly,
// per the plan's guidance to use browser events for these cases and verify
// the real window transitions manually.
async function dispatchLaserInterrupt(page: Page, kind: "pointerleave" | "blur" | "pointercancel") {
  await page.evaluate((kind) => {
    if (kind === "blur") {
      window.dispatchEvent(new Event("blur"));
    } else if (kind === "pointercancel") {
      window.dispatchEvent(new PointerEvent("pointercancel", { pointerType: "mouse" }));
    } else {
      document.querySelector(".preview-wrap")!.dispatchEvent(
        new PointerEvent("pointerleave", { pointerType: "mouse", bubbles: false }),
      );
    }
  }, kind);
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

test.describe("presentation mode — laser dot and trail (behavior spec)", () => {
  test.beforeEach(async ({ page }) => {
    await forceFullscreenFallback(page);
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
  });

  test("hover shows a dot without a trail; the dot survives the trail fade and the idle timeout", async ({ page }) => {
    await enterPresentation(page);
    await switchToLaser(page);
    const vp = page.viewportSize()!;
    const cx = vp.width / 2, cy = vp.height / 2;
    await page.mouse.move(cx - 150, cy - 150);
    await page.mouse.move(cx, cy, { steps: 10 }); // plain hover, no button held
    await page.waitForTimeout(100);

    expect(await laserRegionAlpha(page, cx, cy, 14)).toBeGreaterThan(0);
    expect(await laserRegionAlpha(page, cx - 150, cy - 150, 10)).toBe(0); // no trail left behind

    // Past both the 950ms trail lifetime and the 2s presentation idle
    // timeout: the stationary dot isn't a trail sample and isn't tied to the
    // idle timer, so it must still be visible.
    await page.waitForTimeout(2200);
    expect(await laserRegionAlpha(page, cx, cy, 14)).toBeGreaterThan(0);
  });

  test("left-button dragging draws a fading trail; it disappears after release while the dot remains", async ({ page }) => {
    await enterPresentation(page);
    await switchToLaser(page);
    const vp = page.viewportSize()!;
    const startX = vp.width / 2 - 200, y = vp.height / 2;
    const endX = vp.width / 2 + 200;

    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(startX + 60, y, { steps: 6 });
    await page.waitForTimeout(1100); // let the earliest samples age out mid-drag
    await page.mouse.move(endX, y, { steps: 12 });
    await page.waitForTimeout(50);

    // Older portions of a sufficiently long drag have already faded while
    // the drag is still in progress; the fresh end of the trail hasn't.
    expect(await laserRegionAlpha(page, startX, y, 10)).toBe(0);
    expect(await laserRegionAlpha(page, endX, y, 14)).toBeGreaterThan(0);

    await page.mouse.up();
    await page.waitForTimeout(1200); // past the 950ms fade

    expect(await laserRegionAlpha(page, endX, y, 14)).toBeGreaterThan(0); // dot remains
    expect(await laserRegionAlpha(page, (startX + endX) / 2, y, 10)).toBe(0); // trail is gone
  });

  test("right- and middle-button drags draw no trail", async ({ page }) => {
    await enterPresentation(page);
    await switchToLaser(page);
    const vp = page.viewportSize()!;
    const cx = vp.width / 2, cy = vp.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(cx + 80, cy, { steps: 6 });
    await page.mouse.up({ button: "right" });
    expect(await laserRegionAlpha(page, cx + 40, cy, 10)).toBe(0);

    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(cx + 80, cy, { steps: 6 });
    await page.mouse.up({ button: "middle" });
    expect(await laserRegionAlpha(page, cx + 40, cy, 10)).toBe(0);
  });

  test("a left-button press begun outside the eligible area draws no trail, even when dragged inward", async ({ page }) => {
    await enterPresentation(page);
    await switchToLaser(page);
    const toolbarBox = (await page.locator("#presentation-toolbar").boundingBox())!;
    const startX = toolbarBox.x + toolbarBox.width / 2, startY = toolbarBox.y + toolbarBox.height / 2;
    const vp = page.viewportSize()!;
    const endX = vp.width / 2, endY = vp.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down(); // press begins on the toolbar — not eligible
    await page.mouse.move(endX, endY, { steps: 12 });
    await page.waitForTimeout(50);

    // The dot follows the eligible move, but no trail formed along the way.
    expect(await laserRegionAlpha(page, endX, endY, 14)).toBeGreaterThan(0);
    const midX = (startX + endX) / 2, midY = (startY + endY) / 2;
    expect(await laserRegionAlpha(page, midX, midY, 10)).toBe(0);
    await page.mouse.up();
  });

  test("toolbar entry ends drawing and hides the dot; returning with the button held resumes only the dot", async ({ page }) => {
    await enterPresentation(page);
    await switchToLaser(page);
    const vp = page.viewportSize()!;
    const cx = vp.width / 2, cy = vp.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 40, cy, { steps: 6 });
    expect(await laserRegionAlpha(page, cx + 40, cy, 14)).toBeGreaterThan(0);

    const toolbarBox = (await page.locator("#presentation-toolbar").boundingBox())!;
    const tx = toolbarBox.x + toolbarBox.width / 2, ty = toolbarBox.y + toolbarBox.height / 2;
    await page.mouse.move(tx, ty, { steps: 10 });
    expect(await laserRegionAlpha(page, tx, ty, 10)).toBe(0); // dot hidden over the toolbar

    // Let any trail drawn en route to the toolbar (the stroke was still
    // active until it actually crossed the toolbar boundary) finish fading,
    // so it can't be mistaken for a resumed trail below.
    await page.waitForTimeout(1100);

    // Returning to the eligible area with the button still (virtually) held
    // shows only the dot again — the interrupted stroke does not resume.
    await page.mouse.move(cx, cy, { steps: 10 });
    await page.waitForTimeout(30);
    expect(await laserRegionAlpha(page, cx, cy, 14)).toBeGreaterThan(0);
    expect(await laserRegionAlpha(page, (cx + tx) / 2, (cy + ty) / 2, 10)).toBe(0); // no fresh trail on the way back
    await page.mouse.up();
  });

  for (const kind of ["pointerleave", "blur", "pointercancel"] as const) {
    test(`${kind} ends drawing and hides the dot`, async ({ page }) => {
      await enterPresentation(page);
      await switchToLaser(page);
      const vp = page.viewportSize()!;
      const cx = vp.width / 2, cy = vp.height / 2;

      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 30, cy, { steps: 4 });
      expect(await laserRegionAlpha(page, cx + 30, cy, 14)).toBeGreaterThan(0);

      await dispatchLaserInterrupt(page, kind);
      // The dot hides immediately; a trail sample already dropped at this
      // exact spot before the interrupt is left to finish its own fade
      // (per spec), so wait past that before asserting the spot is clear —
      // that's what proves the dot itself isn't still being drawn here.
      await page.waitForTimeout(1100);
      expect(await laserRegionAlpha(page, cx + 30, cy, 14)).toBe(0);

      await page.mouse.up(); // release the still-down virtual button
    });
  }

  test("a fresh left-button press after an interruption begins a new stroke", async ({ page }) => {
    await enterPresentation(page);
    await switchToLaser(page);
    const vp = page.viewportSize()!;
    const cx = vp.width / 2, cy = vp.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 30, cy, { steps: 4 });
    await dispatchLaserInterrupt(page, "pointercancel");
    await page.mouse.up();

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 30, cy, { steps: 6 });
    await page.waitForTimeout(30);
    expect(await laserRegionAlpha(page, cx + 15, cy, 12)).toBeGreaterThan(0);
    await page.mouse.up();
  });

  test("blank background is eligible for the dot; the toolbar excludes it; the toolbar's reveal padding still shows it", async ({ page }) => {
    await enterPresentation(page);
    await switchToLaser(page);
    const vp = page.viewportSize()!;

    // Blank presentation background, away from the diagram itself.
    await page.mouse.move(20, vp.height - 20);
    expect(await laserRegionAlpha(page, 20, vp.height - 20, 14)).toBeGreaterThan(0);

    // Strictly inside the actual toolbar rectangle: excluded.
    const toolbarBox = (await page.locator("#presentation-toolbar").boundingBox())!;
    const tCenterX = toolbarBox.x + toolbarBox.width / 2, tCenterY = toolbarBox.y + toolbarBox.height / 2;
    await page.mouse.move(tCenterX, tCenterY, { steps: 5 });
    expect(await laserRegionAlpha(page, tCenterX, tCenterY, 10)).toBe(0);

    // Just outside the toolbar rect but inside its 24px reveal padding:
    // still eligible ground for the dot.
    const padX = toolbarBox.x - 10, padY = tCenterY;
    await page.mouse.move(padX, padY, { steps: 5 });
    expect(await laserRegionAlpha(page, padX, padY, 10)).toBeGreaterThan(0);
  });

  test("switching tools mid-stroke, exiting, and re-entering leave no stale dot or trail", async ({ page }) => {
    await enterPresentation(page);
    await switchToLaser(page);
    const vp = page.viewportSize()!;
    const cx = vp.width / 2, cy = vp.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 30, cy, { steps: 6 });
    await page.mouse.up();
    expect(await laserCanvasAlphaSum(page)).toBeGreaterThan(0);

    await page.click("#tool-pointer");
    await page.waitForTimeout(50); // let a frame repaint the now-cleared canvas
    expect(await laserCanvasAlphaSum(page)).toBe(0);

    await page.click("#tool-laser"); // switch back, no movement yet
    await page.waitForTimeout(50);
    expect(await laserCanvasAlphaSum(page)).toBe(0);

    await page.keyboard.press("Escape"); // exit presentation
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);

    await enterPresentation(page);
    await switchToLaser(page);
    expect(await laserCanvasAlphaSum(page)).toBe(0); // fresh session, no stale state
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

test.describe("presentation mode — laser color (behavior spec: Color)", () => {
  test.beforeEach(async ({ page }) => {
    await forceFullscreenFallback(page);
  });

  test("defaults to red with nothing stored", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
    await expect(page.locator("#laser-color")).toHaveValue("#dc2626");
  });

  test("changing the color updates the rendered dot and persists it across reload", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
    await enterPresentation(page);
    await switchToLaser(page);

    await page.locator("#laser-color").evaluate((el) => {
      (el as HTMLInputElement).value = "#00ff00";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const vp = page.viewportSize()!;
    const cx = vp.width / 2, cy = vp.height / 2;
    await page.mouse.move(cx, cy);
    await page.waitForTimeout(50);
    const px = await laserPixelAt(page, cx, cy);
    expect(px.g).toBeGreaterThan(px.r);
    expect(px.g).toBeGreaterThan(px.b);

    const stored = await page.evaluate(() => localStorage.getItem("qack-maid:laser-color"));
    expect(stored).toBe("#00ff00");

    await page.reload();
    await expect(page.locator("#preview svg")).toBeVisible();
    await expect(page.locator("#laser-color")).toHaveValue("#00ff00");
  });

  test("tolerates an invalid stored value and falls back to red", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("qack-maid:laser-color", "not-a-color");
    });
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
    await expect(page.locator("#laser-color")).toHaveValue("#dc2626");
  });

  test("selecting a color does not enable Laser or begin drawing", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
    await enterPresentation(page);
    // Still Pointer mode — only the color is being chosen.
    await page.locator("#laser-color").evaluate((el) => {
      (el as HTMLInputElement).value = "#00ff00";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(page.locator("#tool-laser")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/laser-active/);
  });

  test("keyboard interaction with the color control does not step the diagram or exit presentation", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
    await enterPresentation(page);
    await switchToLaser(page);

    await page.locator("#laser-color").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Escape");
    await expect(page.locator(".preview-wrap")).toHaveClass(/presenting/);
    await expect(page.locator(".presentation-focus")).toHaveCount(0);
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

  test("focusing the laser color control keeps the toolbar visible, then resumes idle behavior on blur", async ({ page }) => {
    await enterPresentation(page);
    const wrap = page.locator(".preview-wrap");
    await page.clock.fastForward(2500); // idle out first
    await expect(wrap).not.toHaveClass(/chrome-visible/);

    await page.locator("#laser-color").focus();
    await expect(wrap).toHaveClass(/chrome-visible/);
    await page.clock.fastForward(2500); // stays visible while focused
    await expect(wrap).toHaveClass(/chrome-visible/);

    await page.locator("#laser-color").blur();
    await expect(wrap).toHaveClass(/chrome-visible/); // still visible right after blur
    await page.clock.fastForward(2500); // then resumes the normal idle timer
    await expect(wrap).not.toHaveClass(/chrome-visible/);
  });
});
