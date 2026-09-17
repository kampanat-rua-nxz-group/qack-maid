import { test, expect, type Page, type Locator } from "@playwright/test";

// Covers presentation-mode issue #5 (spotlight and stepping in sequence
// diagrams) per
// Obsidian/02_Projects/qack-maid/plans/2026-09-16-presentation-mode-spec.md,
// acceptance criterion 7, plus AC 4-6 holding for sequence diagrams, and
// AC 10 teardown.
//
// Verified selectors against the rendered sequence SVG (Mermaid 11.16.1,
// built-in `sequence` example — participants A="Client", B="Server", two
// messages A->>B "Request" (solid) and B-->>A "Response" (dashed)):
// - diagram type: svg[aria-roledescription="sequence"]
// - participant top copy:    rect.actor.actor-top[name="A"|"B"]
// - participant bottom copy: rect.actor.actor-bottom[name="A"|"B"]
//   Each copy's rect + label live in their own wrapping <g> (the bottom
//   copy's <g> has no id/class; the top copy's <g> has id="root-N" and
//   data-id="A"|"B"). The two copies for one participant share the same
//   `name` attribute value but are NOT otherwise correlated in markup — the
//   app groups them by that shared `name`.
// - message arrows: line.messageLine0 (solid) / line.messageLine1 (dashed),
//   each with a stable data-id ("i0", "i1" in source order) and
//   data-from/data-to attributes. Arrowhead markers and message text labels
//   are not part of the highlightable edge unit (matches the flowchart
//   edges, which don't include their labels either).

async function forceFullscreenFallback(page: Page) {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error("denied-for-test"));
  });
}

async function loadSequenceExample(page: Page) {
  await page.goto("/index.html");
  await page.selectOption("#examples", "sequence");
  await expect(page.locator("#preview svg[aria-roledescription='sequence']")).toBeVisible();
}

async function enterPresentation(page: Page) {
  await page.click("#present");
  await expect(page.locator(".preview-wrap")).toHaveClass(/presenting/);
}

// The wrapping <g> around one participant copy's rect + label — the element
// the app actually classes as dim/focus (see PRESENTATION_HIGHLIGHT_MAP).
function topGroupLocator(page: Page, name: string): Locator {
  return page.locator(`#preview rect.actor.actor-top[name="${name}"]`).locator("xpath=..");
}

function bottomGroupLocator(page: Page, name: string): Locator {
  return page.locator(`#preview rect.actor.actor-bottom[name="${name}"]`).locator("xpath=..");
}

function messageLocator(page: Page, dataId: string): Locator {
  // Excludes the hit-area clone: cloneNode(false) copies data-id too, and
  // the clone is inserted immediately after the real line (issue #3 pattern).
  return page.locator(`#preview line[data-id="${dataId}"]:not(.presentation-hit-area)`);
}

test.describe("presentation mode — sequence spotlight (AC 7, AC 4-5 for sequence)", () => {
  test.beforeEach(async ({ page }) => {
    await forceFullscreenFallback(page);
    await loadSequenceExample(page);
    await enterPresentation(page);
  });

  test("hovering the top copy of a participant lights both the top and bottom copies (AC 7)", async ({ page }) => {
    const topA = topGroupLocator(page, "A");
    const bottomA = bottomGroupLocator(page, "A");
    const topB = topGroupLocator(page, "B");

    await topA.hover();
    await expect(topA).toHaveClass(/presentation-focus/);
    await expect(bottomA).toHaveClass(/presentation-focus/);
    await expect(topA).not.toHaveClass(/presentation-dim/);
    await expect(bottomA).not.toHaveClass(/presentation-dim/);
    await expect(topB).toHaveClass(/presentation-dim/);
  });

  test("hovering the bottom copy of a participant lights both copies (AC 7)", async ({ page }) => {
    const topB = topGroupLocator(page, "B");
    const bottomB = bottomGroupLocator(page, "B");

    await bottomB.hover();
    await expect(topB).toHaveClass(/presentation-focus/);
    await expect(bottomB).toHaveClass(/presentation-focus/);
  });

  test("hovering a participant dims message arrows too (strictly one element lit)", async ({ page }) => {
    const topA = topGroupLocator(page, "A");
    const msg0 = messageLocator(page, "i0");
    const msg1 = messageLocator(page, "i1");

    await topA.hover();
    await expect(msg0).toHaveClass(/presentation-dim/);
    await expect(msg1).toHaveClass(/presentation-dim/);
  });

  test("hovering a message arrow highlights it and dims participants (AC 4 for sequence)", async ({ page }) => {
    const msg0 = messageLocator(page, "i0");
    const topA = topGroupLocator(page, "A");
    const topB = topGroupLocator(page, "B");

    const box = (await msg0.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 3);

    await expect(msg0).toHaveClass(/presentation-focus/);
    await expect(topA).toHaveClass(/presentation-dim/);
    await expect(topB).toHaveClass(/presentation-dim/);
  });

  test("clicking either copy pins both; clicking background unpins (AC 4 for sequence)", async ({ page }) => {
    const topA = topGroupLocator(page, "A");
    const bottomA = bottomGroupLocator(page, "A");

    await bottomA.click();
    await expect(topA).toHaveClass(/presentation-focus/);
    await expect(bottomA).toHaveClass(/presentation-focus/);

    const box = (await page.locator("#preview").boundingBox())!;
    await page.mouse.click(box.x + 4, box.y + 4);
    await expect(topA).not.toHaveClass(/presentation-focus/);
    await expect(bottomA).not.toHaveClass(/presentation-focus/);
  });

  test("a message arrow is pinnable by clicking within ~6px of the line (AC 5 for sequence)", async ({ page }) => {
    const msg0 = messageLocator(page, "i0");
    const box = (await msg0.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2 + 5;
    await page.mouse.click(x, y);
    await expect(msg0).toHaveClass(/presentation-focus/);
  });
});

test.describe("presentation mode — sequence stepping (AC 6 for sequence)", () => {
  test.beforeEach(async ({ page }) => {
    await forceFullscreenFallback(page);
    await loadSequenceExample(page);
    await enterPresentation(page);
  });

  test("ArrowRight from unpinned pins the first participant (both copies)", async ({ page }) => {
    await page.keyboard.press("ArrowRight");
    await expect(topGroupLocator(page, "A")).toHaveClass(/presentation-focus/);
    await expect(bottomGroupLocator(page, "A")).toHaveClass(/presentation-focus/);
  });

  test("repeated ArrowRight steps one participant at a time (not per copy) and stops at the last, no wrap", async ({ page }) => {
    await page.keyboard.press("ArrowRight"); // A
    await expect(topGroupLocator(page, "A")).toHaveClass(/presentation-focus/);
    await page.keyboard.press("ArrowRight"); // B
    await expect(topGroupLocator(page, "B")).toHaveClass(/presentation-focus/);
    await expect(bottomGroupLocator(page, "B")).toHaveClass(/presentation-focus/);
    await expect(topGroupLocator(page, "A")).not.toHaveClass(/presentation-focus/);
    // only 2 participants — one more ArrowRight stays on B (no wrap)
    await page.keyboard.press("ArrowRight");
    await expect(topGroupLocator(page, "B")).toHaveClass(/presentation-focus/);
  });

  test("ArrowLeft from unpinned pins the last participant", async ({ page }) => {
    await page.keyboard.press("ArrowLeft");
    await expect(topGroupLocator(page, "B")).toHaveClass(/presentation-focus/);
    await expect(bottomGroupLocator(page, "B")).toHaveClass(/presentation-focus/);
  });

  test("repeated ArrowLeft steps backward and stops on the first participant, no wrap", async ({ page }) => {
    await page.keyboard.press("ArrowLeft"); // B
    await page.keyboard.press("ArrowLeft"); // A
    await expect(topGroupLocator(page, "A")).toHaveClass(/presentation-focus/);
    await page.keyboard.press("ArrowLeft");
    await expect(topGroupLocator(page, "A")).toHaveClass(/presentation-focus/);
  });

  test("message arrows are never stepped to", async ({ page }) => {
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("ArrowRight");
    }
    const litMessageCount = await page.locator("#preview line[data-et='message'].presentation-focus").count();
    expect(litMessageCount).toBe(0);
  });

  test("a pinned message arrow counts as nothing pinned: ArrowRight pins the first participant", async ({ page }) => {
    const msg0 = messageLocator(page, "i0");
    const box = (await msg0.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + 5);
    await expect(msg0).toHaveClass(/presentation-focus/);

    await page.keyboard.press("ArrowRight");
    await expect(topGroupLocator(page, "A")).toHaveClass(/presentation-focus/);
    await expect(msg0).not.toHaveClass(/presentation-focus/);
  });
});

test.describe("presentation mode — sequence teardown (AC 10 for sequence)", () => {
  test("after exit, SVG export is byte-identical to a pre-presentation export; live DOM is clean", async ({ page }) => {
    await forceFullscreenFallback(page);
    await loadSequenceExample(page);

    const preSvg: string = await page.evaluate(async () => {
      return await (window as any).buildExportSvgMarkup();
    });

    await enterPresentation(page);
    await topGroupLocator(page, "A").hover();
    await bottomGroupLocator(page, "B").click();
    const msg0 = messageLocator(page, "i0");
    const box = (await msg0.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 3);
    await page.keyboard.press("Escape"); // unpin
    await page.keyboard.press("Escape"); // exit
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);

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
  });
});

// Nested frames are separate SVG groups; their messages are not children.
test.describe("presentation mode — alt boxes", () => {
  test.beforeEach(async ({ page }) => {
    await forceFullscreenFallback(page);
    await page.goto("/index.html");
    await page.locator("#source").fill(`sequenceDiagram
participant A
participant B
alt outer
A->>B: One
alt inner
B->>A: Two
else inner fallback
A->>B: Three
end
else outer fallback
B->>A: Four
end`);
    await expect(page.locator("#preview .labelText")).toHaveCount(2);
  });

  function frame(page: Page, condition: string) {
    return page.locator('#preview g[data-et="control-structure"]')
      .filter({ has: page.locator(".loopText", { hasText: `[${condition}]` }) });
  }

  test("frame borders and branch labels highlight one whole alt box; nested boxes and messages stay independent", async ({ page }) => {
    await enterPresentation(page);
    const outer = frame(page, "outer");
    const inner = frame(page, "inner");
    for (const selector of [".labelText", ".loopText", ".sectionTitle", ".loopLine"]) {
      if (selector === ".loopLine") {
        // A horizontal SVG line has zero height, so locator.hover() rejects it.
        const border = (await outer.locator(selector).first().boundingBox())!;
        await page.mouse.move(border.x + border.width / 2, border.y);
      } else {
        await outer.locator(selector).hover();
      }
      await expect(outer).toHaveClass(/presentation-focus/);
      await expect(inner).toHaveClass(/presentation-dim/);
      await expect(topGroupLocator(page, "A")).toHaveClass(/presentation-dim/);
      await expect(page.locator("#preview line.messageLine0").first()).toHaveClass(/presentation-dim/);
    }
    await inner.locator(".labelText").hover();
    await expect(inner).toHaveClass(/presentation-focus/);
    await expect(outer).toHaveClass(/presentation-dim/);
    const message = page.locator("#preview line.messageLine0").first();
    const box = (await message.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 3);
    await expect(message).toHaveClass(/presentation-focus/);
    await expect(inner).toHaveClass(/presentation-dim/);
    await page.mouse.move(4, 4);
    await expect(page.locator("#preview .presentation-focus, #preview .presentation-dim")).toHaveCount(0);
  });

  test("alt pin survives hover, stepping stays on participants, and exit restores the SVG", async ({ page }) => {
    const original = await page.evaluate(() => (window as any).buildExportSvgMarkup());
    await enterPresentation(page);
    const outer = frame(page, "outer");
    await outer.locator(".labelText").click();
    await topGroupLocator(page, "A").hover();
    await expect(outer).toHaveClass(/presentation-focus/);
    await page.keyboard.press("ArrowRight");
    await expect(topGroupLocator(page, "A")).toHaveClass(/presentation-focus/);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(topGroupLocator(page, "B")).toHaveClass(/presentation-focus/);
    await outer.locator(".sectionTitle").click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#preview .presentation-focus")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".preview-wrap")).not.toHaveClass(/presenting/);
    expect(await page.evaluate(() => (window as any).buildExportSvgMarkup())).toBe(original);
    await expect(page.locator("#preview .presentation-focus, #preview .presentation-dim, #preview .presentation-hit-area")).toHaveCount(0);
  });
});
