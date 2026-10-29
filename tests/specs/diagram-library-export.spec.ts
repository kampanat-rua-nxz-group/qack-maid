import { test, expect } from "@playwright/test";
import { seedLibrary } from "./helpers/diagrams";

const CASES: [string, string][] = [
  ["Login flow", "login-flow.png"],
  ["  API / v2 (draft)  ", "api-v2-draft.png"],
  ["แผนภาพ ทดสอบ", "แผนภาพ-ทดสอบ.png"],
  ["!!!", "diagram.png"],
];

test.describe("export file name", () => {
  test("kebabFileName keeps Thai letters and marks", async ({ page }) => {
    await page.goto("/index.html");
    for (const [input, expected] of CASES) {
      expect(await page.evaluate((n) => kebabFileName(n), input)).toBe(expected);
    }
  });

  test("Download and Cmd/Ctrl+S name the file after the open Diagram", async ({ page }) => {
    await seedLibrary(page, [{ name: "Login flow", source: "flowchart TD\n A --> B", minutesAgo: 0 }]);
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();

    const viaKey = page.waitForEvent("download");
    await page.keyboard.press("Control+s");
    expect((await viaKey).suggestedFilename()).toBe("login-flow.png");

    const viaMenu = page.waitForEvent("download");
    await page.evaluate(() => runExport("download-png"));
    expect((await viaMenu).suggestedFilename()).toBe("login-flow.png");
  });
});
