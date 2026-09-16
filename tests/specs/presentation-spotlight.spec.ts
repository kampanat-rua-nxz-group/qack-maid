import { test, expect, type Page, type Locator } from "@playwright/test";

// Covers presentation-mode issue #3 (spotlight nodes and edges in
// flowcharts) per
// Obsidian/02_Projects/qack-maid/plans/2026-09-16-presentation-mode-spec.md,
// acceptance criteria 4, 5, 10, plus the Esc two-step behavior and
// pinned-beats-hover. Builds on issue #1/#2's enter/exit/teardown hooks.
//
// Verified selectors against the rendered flowchart SVG (Mermaid 11.16.1):
// - node group:  svg .nodes > g.node   (id contains "-flowchart-<Letter>-")
// - edge path:   svg .edgePaths > path (id contains "-L_<From>_<To>_")
// - diagram type: svg[aria-roledescription="flowchart-v2"]

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

function edgeLocator(page: Page, from: string, to: string): Locator {
  return page.locator(`#preview .edgePaths > path[id*="-L_${from}_${to}_"]`);
}

test.describe("presentation mode — flowchart spotlight (AC 4, 5)", () => {
  test.beforeEach(async ({ page }) => {
    await forceFullscreenFallback(page);
    await page.goto("/index.html");
    // default example on load is the flowchart (A -> B -> {C,D} -> E)
    await expect(page.locator("#preview svg")).toBeVisible();
    await enterPresentation(page);
  });

  test("hovering a node dims every other node and edge, and outlines the hovered node (AC 4)", async ({ page }) => {
    const nodeA = nodeLocator(page, "A");
    const nodeB = nodeLocator(page, "B");
    const edgeAB = edgeLocator(page, "A", "B");

    await nodeA.hover();
    await expect(nodeA).not.toHaveClass(/presentation-dim/);
    await expect(nodeA).toHaveClass(/presentation-focus/);
    await expect(nodeB).toHaveClass(/presentation-dim/);
    await expect(nodeB).not.toHaveClass(/presentation-focus/);
    // incident edge dims too — strictly one element lit
    await expect(edgeAB).toHaveClass(/presentation-dim/);
  });

  test("hovering an edge dims everything else including its own endpoints", async ({ page }) => {
    const edgeAB = edgeLocator(page, "A", "B");
    const nodeA = nodeLocator(page, "A");
    const nodeB = nodeLocator(page, "B");

    // The edge is a straight, ~zero-width line, so its own bounding box is
    // too thin for locator.hover()'s auto-centering; move the mouse directly
    // over the (wide, transparent) hit-area clone instead, same as AC 5.
    const box = (await edgeAB.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2);

    await expect(edgeAB).toHaveClass(/presentation-focus/);
    await expect(edgeAB).not.toHaveClass(/presentation-dim/);
    await expect(nodeA).toHaveClass(/presentation-dim/);
    await expect(nodeB).toHaveClass(/presentation-dim/);
  });

  test("click pins a node; hovering elsewhere afterward does not change the lit element (pinned beats hover)", async ({ page }) => {
    const nodeA = nodeLocator(page, "A");
    const nodeB = nodeLocator(page, "B");

    await nodeA.click();
    await expect(nodeA).toHaveClass(/presentation-focus/);
    await expect(nodeB).toHaveClass(/presentation-dim/);

    await nodeB.hover();
    // still A lit, not B — hover while pinned is a no-op
    await expect(nodeA).toHaveClass(/presentation-focus/);
    await expect(nodeB).toHaveClass(/presentation-dim/);
    await expect(nodeB).not.toHaveClass(/presentation-focus/);
  });

  test("clicking background unpins", async ({ page }) => {
    const nodeA = nodeLocator(page, "A");
    await nodeA.click();
    await expect(nodeA).toHaveClass(/presentation-focus/);

    // Click far corner of the preview pane, away from any node/edge.
    const box = (await page.locator("#preview").boundingBox())!;
    await page.mouse.click(box.x + 4, box.y + 4);

    await expect(nodeA).not.toHaveClass(/presentation-focus/);
    await expect(nodeA).not.toHaveClass(/presentation-dim/);
  });

  test("a 2px edge is pinnable by clicking within ~6px of the line (AC 5)", async ({ page }) => {
    const edgeAB = edgeLocator(page, "A", "B");
    const box = (await edgeAB.boundingBox())!;
    // click near the vertical segment's midpoint, offset a few px to the side
    // of the actual (thin) path — still inside the 12-unit-wide hit area.
    const x = box.x + box.width / 2 + 5;
    const y = box.y + box.height / 2;
    await page.mouse.click(x, y);

    await expect(edgeAB).toHaveClass(/presentation-focus/);
  });
});

test.describe("presentation mode — Esc two-step (owner decision 2026-09-16)", () => {
  test.beforeEach(async ({ page }) => {
    await forceFullscreenFallback(page);
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
    await enterPresentation(page);
  });

  test("Esc while pinned unpins only; Esc again with nothing pinned exits", async ({ page }) => {
    const nodeA = nodeLocator(page, "A");
    await nodeA.click();
    await expect(nodeA).toHaveClass(/presentation-focus/);

    await page.keyboard.press("Escape");
    await expect(page.locator(".preview-wrap")).toHaveClass(/presenting/); // still presenting
    await expect(nodeA).not.toHaveClass(/presentation-focus/);

    await page.keyboard.press("Escape");
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);
  });

  test("Esc with nothing pinned exits immediately", async ({ page }) => {
    await page.keyboard.press("Escape");
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);
  });
});

test.describe("presentation mode — spotlight teardown (AC 10)", () => {
  test("after exit, SVG and PNG exports contain no dim classes or hit-area paths", async ({ page }) => {
    await forceFullscreenFallback(page);
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();

    const preSvg: string = await page.evaluate(async () => {
      return await (window as any).buildExportSvgMarkup();
    });

    await enterPresentation(page);
    await nodeLocator(page, "A").hover();
    await nodeLocator(page, "B").click();
    await page.keyboard.press("Escape"); // unpin
    await page.keyboard.press("Escape"); // exit
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);

    // Live DOM is clean: no hit-area clones, no dim/focus classes left.
    const liveState = await page.evaluate(() => {
      const svg = document.querySelector("#preview svg")!;
      return {
        hitAreas: svg.querySelectorAll(".presentation-hit-area").length,
        dim: svg.querySelectorAll(".presentation-dim").length,
        focus: svg.querySelectorAll(".presentation-focus").length,
      };
    });
    expect(liveState).toEqual({ hitAreas: 0, dim: 0, focus: 0 });

    const postSvg: string = await page.evaluate(async () => {
      return await (window as any).buildExportSvgMarkup();
    });
    expect(postSvg).toBe(preSvg);
    expect(postSvg).not.toContain("presentation-dim");
    expect(postSvg).not.toContain("presentation-focus");
    expect(postSvg).not.toContain("presentation-hit-area");

    const postPngHasNoExtras = await page.evaluate(async () => {
      const blob: Blob = await (window as any).buildExportPngBlob();
      return blob.size > 0;
    });
    expect(postPngHasNoExtras).toBe(true);
  });
});

test.describe("presentation mode — highlight only active while presenting", () => {
  test("hover/click before entering presentation does not add spotlight classes", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();

    const nodeA = nodeLocator(page, "A");
    await nodeA.hover();
    await nodeA.click();
    await expect(nodeA).not.toHaveClass(/presentation-focus/);
    await expect(nodeA).not.toHaveClass(/presentation-dim/);
    const hitAreaCount = await page.locator("#preview .presentation-hit-area").count();
    expect(hitAreaCount).toBe(0);
  });
});
