import { test, expect } from "@playwright/test";

declare const sourceEl: HTMLTextAreaElement;

test.describe("source editor view", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForSelector("#preview svg");
  });

  test("gutter shows one number per line, counting a trailing empty line", async ({ page }) => {
    await page.fill("#source", "flowchart TD\n  A --> B\n");
    await expect(page.locator(".source-line-no")).toHaveCount(3);
    await expect(page.locator(".source-line-no").last()).toHaveText("3");
  });

  test("colors keywords, arrows and comments", async ({ page }) => {
    await page.fill("#source", "flowchart TD\n  subgraph S\n  A --> B %% note\n  end");
    await expect(page.locator(".source-highlight .tok-diagram")).toHaveText("flowchart");
    await expect(page.locator(".source-highlight .tok-keyword").first()).toHaveText("subgraph");
    await expect(page.locator(".source-highlight .tok-arrow")).toHaveText("-->");
    await expect(page.locator(".source-highlight .tok-comment")).toHaveText("%% note");
  });

  test("colors arrows written without surrounding spaces", async ({ page }) => {
    await page.fill("#source", "flowchart TD\n  A-->B\n  A---B\n  A-.->B\n  A==>B\n  A--xB\n  my-node-->B");
    const arrows = page.locator(".source-highlight .tok-arrow");
    await expect(arrows).toHaveText(["-->", "---", "-.->", "==>", "--x", "-->"]);
  });

  test("colored layer height matches the textarea for text ending in a newline", async ({ page }) => {
    const text = Array.from({ length: 80 }, (_, i) => `  N${i}`).join("\n") + "\n";
    await page.fill("#source", text);
    const h = await page.evaluate(() => ({
      pre: document.querySelector(".source-highlight")!.scrollHeight,
      ta: sourceEl.scrollHeight,
    }));
    expect(h.pre).toBe(h.ta);
  });

  test("shows HTML characters literally", async ({ page }) => {
    await page.fill("#source", 'flowchart TD\n  A["<b>x</b> & y"]');
    await expect(page.locator(".source-highlight b")).toHaveCount(0);
    await expect(page.locator(".source-highlight")).toContainText("<b>x</b> & y");
  });

  test("layers follow scroll", async ({ page }) => {
    const text = ["x".repeat(400), ...Array.from({ length: 80 }, (_, i) => `line ${i}`)].join("\n");
    await page.fill("#source", text);
    await page.evaluate(() => {
      sourceEl.scrollLeft = 200;
      sourceEl.scrollTop = 300;
      sourceEl.dispatchEvent(new Event("scroll"));
    });
    const transform = (sel: string) =>
      page.locator(sel).evaluate((el) => getComputedStyle(el).transform);
    expect(await transform(".source-highlight")).toBe("matrix(1, 0, 0, 1, -200, -300)");
    expect(await transform(".source-gutter-lines")).toBe("matrix(1, 0, 0, 1, 0, -300)");
  });

  test("refreshes on programmatic value writes", async ({ page }) => {
    await page.evaluate(() => {
      sourceEl.value = "a\nb\nc\nd";
    });
    await expect(page.locator(".source-line-no")).toHaveCount(4);
    await page.click("#diagram-new");
    const n = await page.evaluate(() => sourceEl.value.split("\n").length);
    await expect(page.locator(".source-line-no")).toHaveCount(n);
  });

  test("textarea text is transparent, caret visible", async ({ page }) => {
    const s = await page.locator("#source").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, caret: cs.caretColor };
    });
    expect(s.color).toBe("rgba(0, 0, 0, 0)");
    expect(s.caret).not.toBe("rgba(0, 0, 0, 0)");
  });
});

test.describe("source editor keys", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForSelector("#preview svg");
  });

  const value = (page: import("@playwright/test").Page) => page.locator("#source").inputValue();

  test("Tab inserts four spaces at the caret", async ({ page }) => {
    await page.fill("#source", "flowchart TD");
    await page.press("#source", "End");
    await page.press("#source", "Tab");
    expect(await value(page)).toBe("flowchart TD    ");
    await expect(page.locator("#source")).toBeFocused();
  });

  test("Tab and Shift+Tab indent and outdent selected lines", async ({ page }) => {
    await page.fill("#source", "a\nb\nc");
    await page.evaluate(() => {
      sourceEl.focus();
      sourceEl.setSelectionRange(0, 3);
    });
    await page.press("#source", "Tab");
    expect(await value(page)).toBe("    a\n    b\nc");
    await page.press("#source", "Shift+Tab");
    expect(await value(page)).toBe("a\nb\nc");
  });

  test("Shift+Tab removes fewer than four spaces when that is all there is", async ({ page }) => {
    await page.fill("#source", "  a");
    await page.press("#source", "End");
    await page.press("#source", "Shift+Tab");
    expect(await value(page)).toBe("a");
  });

  test("Enter keeps indent and adds one level after {", async ({ page }) => {
    await page.fill("#source", "flowchart TD\n    A");
    await page.press("#source", "End");
    await page.press("#source", "Enter");
    await page.keyboard.type("B");
    expect(await value(page)).toBe("flowchart TD\n    A\n    B");
    await page.fill("#source", "classDiagram\n    class X {");
    await page.press("#source", "End");
    await page.press("#source", "Enter");
    expect((await value(page)).endsWith("{\n        ")).toBe(true);
  });

  test("Esc then Tab leaves the Source pane", async ({ page }) => {
    await page.fill("#source", "flowchart TD");
    await page.focus("#source");
    const before = await value(page);
    await page.press("#source", "Escape");
    await page.keyboard.press("Tab");
    await expect(page.locator("#source")).not.toBeFocused();
    expect(await value(page)).toBe(before);
  });

  test("another key after Esc restores Tab indent", async ({ page }) => {
    await page.fill("#source", "");
    await page.focus("#source");
    await page.press("#source", "Escape");
    await page.keyboard.type("x");
    await page.keyboard.press("Tab");
    expect((await value(page)).endsWith("x    ")).toBe(true);
  });

  test("Tab indents again after Esc, Tab and refocus", async ({ page }) => {
    await page.fill("#source", "flowchart TD");
    await page.focus("#source");
    await page.press("#source", "Escape");
    await page.keyboard.press("Tab");
    await expect(page.locator("#source")).not.toBeFocused();
    await page.evaluate(() => {
      sourceEl.focus();
      sourceEl.setSelectionRange(sourceEl.value.length, sourceEl.value.length);
    });
    await page.keyboard.press("Tab");
    expect(await value(page)).toBe("flowchart TD    ");
  });

  test("undo reverts a Tab insert", async ({ page }) => {
    await page.fill("#source", "a");
    await page.press("#source", "End");
    await page.press("#source", "Tab");
    await page.press("#source", "ControlOrMeta+z");
    expect(await value(page)).toBe("a");
  });

  test("Cmd/Ctrl+Enter still renders and inserts nothing", async ({ page }) => {
    await page.fill("#source", "flowchart TD\n  A --> B");
    await page.press("#source", "ControlOrMeta+Enter");
    expect(await value(page)).toBe("flowchart TD\n  A --> B");
    await expect(page.locator("#preview svg")).toBeVisible();
  });

  test("composition keys are not intercepted", async ({ page }) => {
    for (const key of ["Enter", "Tab"]) {
      const prevented = await page.evaluate((k) => {
        const e = new KeyboardEvent("keydown", { key: k, isComposing: true, cancelable: true });
        sourceEl.dispatchEvent(e);
        return e.defaultPrevented;
      }, key);
      expect(prevented).toBe(false);
    }
  });

  test("Enter with keyCode 229 is not intercepted", async ({ page }) => {
    await page.fill("#source", "abc");
    const prevented = await page.evaluate(() => {
      const e = new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, cancelable: true });
      if (e.keyCode !== 229) Object.defineProperty(e, "keyCode", { get: () => 229 });
      sourceEl.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prevented).toBe(false);
    expect(await value(page)).toBe("abc");
  });

  test("Shift+Tab on an unindented line fires no input", async ({ page }) => {
    await page.fill("#source", "a");
    await page.press("#source", "End");
    await page.evaluate(() => {
      (window as any).__inputs = 0;
      sourceEl.addEventListener("input", () => { (window as any).__inputs++; });
    });
    await page.press("#source", "Shift+Tab");
    expect(await page.evaluate(() => (window as any).__inputs)).toBe(0);
    expect(await value(page)).toBe("a");
  });

  test("key edits autosave", async ({ page }) => {
    await page.fill("#source", "flowchart TD");
    await page.press("#source", "End");
    await page.press("#source", "Tab");
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForSelector("#preview svg");
    expect(await value(page)).toBe("flowchart TD    ");
  });
});

test.describe("source editor error line", () => {
  // Mermaid reports an unfinished last line as the line after the end, which
  // has no gutter number, so the fixture breaks a line inside the text.
  const broken = "flowchart TD\n  A --> B\n  B ??? C\n  C --> D";

  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForSelector("#preview svg");
  });

  test("failed render marks the reported line", async ({ page }) => {
    await page.fill("#source", broken);
    await page.waitForSelector("#error-banner.show.jumpable");
    const line = await page.locator("#error-banner").getAttribute("data-line");
    const mark = page.locator(".source-line-no.error");
    await expect(mark).toHaveCount(1);
    await expect(mark).toHaveText(line!);
  });

  test("unfinished last line marks the final line", async ({ page }) => {
    await page.fill("#source", "flowchart TD\n  A --> B\n  B -->");
    await page.waitForSelector("#error-banner.show.jumpable");
    await expect(page.locator("#error-banner")).toHaveAttribute("data-line", "4");
    const mark = page.locator(".source-line-no.error");
    await expect(mark).toHaveCount(1);
    await expect(mark).toHaveText("3");
  });

  test("successful render clears the mark", async ({ page }) => {
    await page.fill("#source", broken);
    await page.waitForSelector("#error-banner.show.jumpable");
    await expect(page.locator(".source-line-no.error")).toHaveCount(1);
    await page.fill("#source", "flowchart TD\n  A --> B");
    await expect(page.locator("#error-banner.show")).toHaveCount(0);
    await expect(page.locator(".source-line-no.error")).toHaveCount(0);
  });

  test("clearing Source clears the mark", async ({ page }) => {
    await page.fill("#source", broken);
    await page.waitForSelector("#error-banner.show.jumpable");
    await expect(page.locator(".source-line-no.error")).toHaveCount(1);
    await page.fill("#source", "");
    await expect(page.locator(".source-line-no.error")).toHaveCount(0);
  });

  test("jumping to the error line scrolls it into view", async ({ page }) => {
    const lines = ["flowchart TD"];
    for (let i = 1; i < 54; i++) lines.push(`  N${i} --> N${i + 1}`);
    lines.push("  N54 ??? N55");
    for (let i = 55; i < 60; i++) lines.push(`  N${i} --> N${i + 1}`);
    const text = lines.join("\n");
    await page.fill("#source", text);
    await page.waitForSelector("#error-banner.show.jumpable");
    await expect(page.locator("#error-banner")).toHaveAttribute("data-line", "55");
    // A real pointer press on the banner starts a pan in zoom-pan.js, which
    // captures the pointer, so the click never reaches the banner. Dispatch
    // the click directly to test the jump itself.
    await page.locator("#error-banner").dispatchEvent("click");
    const r = await page.evaluate(() => ({ top: sourceEl.scrollTop, start: sourceEl.selectionStart }));
    expect(r.top).toBeGreaterThan(0);
    const offset = text.split("\n").slice(0, 54).join("\n").length + 1;
    expect(r.start).toBe(offset);
  });
});
