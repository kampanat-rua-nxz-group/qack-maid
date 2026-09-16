import { test, expect, type Page, type Locator } from "@playwright/test";

// Covers presentation-mode issue #4 (step through flowchart nodes with arrow
// keys) per
// Obsidian/02_Projects/qack-maid/plans/2026-09-16-presentation-mode-spec.md,
// acceptance criterion 6, plus assumptions called out in the issue draft:
// - a pinned edge counts as "nothing pinned" for stepping purposes.
// - a hovered-but-unpinned element counts as nothing pinned.
// - arrows are a no-op while not presenting.
// - unmatched diagram types (no highlight map entry) no-op on arrows.
// - Esc after stepping still unpins-then-exits (issue #3 behavior unchanged).
// - teardown leaves no pin state on re-entry.
//
// Default flowchart example (index.html EXAMPLES.flowchart) DOM node order:
// A -> B -> {C, D} -> E, i.e. A, B, C, D, E in source order.

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

test.describe("presentation mode — arrow-key stepping (AC 6)", () => {
  test.beforeEach(async ({ page }) => {
    await forceFullscreenFallback(page);
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
    await enterPresentation(page);
  });

  test("ArrowRight from unpinned pins the first node", async ({ page }) => {
    await page.keyboard.press("ArrowRight");
    await expect(nodeLocator(page, "A")).toHaveClass(/presentation-focus/);
  });

  test("repeated ArrowRight steps forward through nodes in DOM order and stops on the last node", async ({ page }) => {
    await page.keyboard.press("ArrowRight"); // A
    await page.keyboard.press("ArrowRight"); // B
    await expect(nodeLocator(page, "B")).toHaveClass(/presentation-focus/);
    await page.keyboard.press("ArrowRight"); // C
    await expect(nodeLocator(page, "C")).toHaveClass(/presentation-focus/);
    await page.keyboard.press("ArrowRight"); // D
    await expect(nodeLocator(page, "D")).toHaveClass(/presentation-focus/);
    await page.keyboard.press("ArrowRight"); // E (last)
    await expect(nodeLocator(page, "E")).toHaveClass(/presentation-focus/);
    // one more — stays on E, no wrap
    await page.keyboard.press("ArrowRight");
    await expect(nodeLocator(page, "E")).toHaveClass(/presentation-focus/);
  });

  test("ArrowLeft from unpinned pins the last node", async ({ page }) => {
    await page.keyboard.press("ArrowLeft");
    await expect(nodeLocator(page, "E")).toHaveClass(/presentation-focus/);
  });

  test("repeated ArrowLeft steps backward and stops on the first node, no wrap", async ({ page }) => {
    await page.keyboard.press("ArrowLeft"); // E
    await page.keyboard.press("ArrowLeft"); // D
    await expect(nodeLocator(page, "D")).toHaveClass(/presentation-focus/);
    await page.keyboard.press("ArrowLeft"); // C
    await page.keyboard.press("ArrowLeft"); // B
    await page.keyboard.press("ArrowLeft"); // A (first)
    await expect(nodeLocator(page, "A")).toHaveClass(/presentation-focus/);
    await page.keyboard.press("ArrowLeft");
    await expect(nodeLocator(page, "A")).toHaveClass(/presentation-focus/);
  });

  test("edges are never stepped to", async ({ page }) => {
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("ArrowRight");
    }
    const litEdgeCount = await page.locator("#preview .edgePaths > path.presentation-focus").count();
    expect(litEdgeCount).toBe(0);
  });

  test("stepping pins like a click: applies spotlight and clears hover", async ({ page }) => {
    await nodeLocator(page, "C").hover();
    await expect(nodeLocator(page, "C")).toHaveClass(/presentation-focus/);

    await page.keyboard.press("ArrowRight"); // pins A, not hover-driven anymore
    await expect(nodeLocator(page, "A")).toHaveClass(/presentation-focus/);
    await expect(nodeLocator(page, "C")).toHaveClass(/presentation-dim/);

    // hovering C again should not relight it now that A is pinned (pinned beats hover)
    await nodeLocator(page, "C").hover();
    await expect(nodeLocator(page, "A")).toHaveClass(/presentation-focus/);
    await expect(nodeLocator(page, "C")).not.toHaveClass(/presentation-focus/);
  });

  test("a hovered-but-unpinned element counts as nothing pinned: ArrowRight still pins the first node", async ({ page }) => {
    await nodeLocator(page, "D").hover();
    await expect(nodeLocator(page, "D")).toHaveClass(/presentation-focus/);

    await page.keyboard.press("ArrowRight");
    await expect(nodeLocator(page, "A")).toHaveClass(/presentation-focus/);
    await expect(nodeLocator(page, "D")).toHaveClass(/presentation-dim/);
  });

  test("a pinned edge counts as nothing pinned: ArrowRight pins the first node, ArrowLeft pins the last", async ({ page }) => {
    const edgeAB = edgeLocator(page, "A", "B");
    const box = (await edgeAB.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2 + 5, box.y + box.height / 2);
    await expect(edgeAB).toHaveClass(/presentation-focus/);

    await page.keyboard.press("ArrowRight");
    await expect(nodeLocator(page, "A")).toHaveClass(/presentation-focus/);
    await expect(edgeAB).not.toHaveClass(/presentation-focus/);
  });

  test("a pinned edge + ArrowLeft pins the last node", async ({ page }) => {
    const edgeAB = edgeLocator(page, "A", "B");
    const box = (await edgeAB.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2 + 5, box.y + box.height / 2);
    await expect(edgeAB).toHaveClass(/presentation-focus/);

    await page.keyboard.press("ArrowLeft");
    await expect(nodeLocator(page, "E")).toHaveClass(/presentation-focus/);
    await expect(edgeAB).not.toHaveClass(/presentation-focus/);
  });

  test("arrow keys do not scroll the page while presenting", async ({ page }) => {
    const before = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    const after = await page.evaluate(() => window.scrollY);
    expect(after).toBe(before);
  });

  test("Esc after stepping still unpins-then-exits", async ({ page }) => {
    await page.keyboard.press("ArrowRight");
    await expect(nodeLocator(page, "A")).toHaveClass(/presentation-focus/);

    await page.keyboard.press("Escape");
    await expect(page.locator(".preview-wrap")).toHaveClass(/presenting/); // still presenting
    await expect(nodeLocator(page, "A")).not.toHaveClass(/presentation-focus/);

    await page.keyboard.press("Escape");
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);
  });

  test("teardown leaves no pin state on re-entry: arrow key after re-entering pins the first node again", async ({ page }) => {
    await page.keyboard.press("ArrowRight"); // A
    await page.keyboard.press("ArrowRight"); // B
    await expect(nodeLocator(page, "B")).toHaveClass(/presentation-focus/);

    await page.keyboard.press("Escape"); // unpin
    await page.keyboard.press("Escape"); // exit
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);

    await enterPresentation(page);
    await page.keyboard.press("ArrowRight");
    await expect(nodeLocator(page, "A")).toHaveClass(/presentation-focus/);
  });
});

test.describe("presentation mode — arrow keys inactive outside presenting/unmatched diagrams", () => {
  test("arrow keys are a no-op while not presenting", async ({ page }) => {
    await forceFullscreenFallback(page);
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();

    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#preview svg .presentation-focus")).toHaveCount(0);
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#preview svg .presentation-focus")).toHaveCount(0);
  });

  test("unmatched diagram type: arrows do nothing, no console errors", async ({ page }) => {
    await forceFullscreenFallback(page);
    const errors: string[] = [];
    await page.goto("/index.html");
    page.on("pageerror", (err) => errors.push(String(err)));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    // class diagram has no PRESENTATION_HIGHLIGHT_MAP entry (out of scope)
    await page.selectOption("#examples", "class");
    await expect(page.locator("#preview svg")).toBeVisible();

    await enterPresentation(page);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");

    expect(errors).toEqual([]);
  });
});
