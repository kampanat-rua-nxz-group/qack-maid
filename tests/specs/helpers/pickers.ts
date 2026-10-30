import { expect, type Page } from "@playwright/test";

// Header pickers (Diagram theme, Preview background) are custom menus, not
// <select>s: open the trigger, click the option, as a user would.
type Picker = "theme" | "preview-bg";

export async function pickOption(page: Page, picker: Picker, value: string) {
  await page.click(`#${picker}-trigger`);
  await page.click(`#${picker}-menu [data-value="${value}"]`);
}

export async function expectPicked(page: Page, picker: Picker, value: string) {
  await expect(page.locator(`#${picker}-menu [aria-checked="true"]`)).toHaveAttribute("data-value", value);
}
