import type { Page } from "@playwright/test";

export const RENDER_SETTLE_MS = 400; // Render debounce (250ms) + mermaid.render

type SeedDiagram = { name: string; source: string; minutesAgo: number };

// Seeds only when the index is absent, so reloads keep state.
export async function seedLibrary(page: Page, diagrams: SeedDiagram[], openIndex = 0) {
  await page.addInitScript(
    ({ diagrams, openIndex }) => {
      if (localStorage.getItem("qack-maid:diagrams") !== null) return;
      const now = Date.now();
      const items = diagrams.map((d, i) => ({
        id: "seed" + i,
        name: d.name,
        updatedAt: now - d.minutesAgo * 60000,
      }));
      items.forEach((item, i) => {
        localStorage.setItem(
          "qack-maid:diagram:" + item.id,
          JSON.stringify({ source: diagrams[i].source, rev: 1 }),
        );
      });
      localStorage.setItem("qack-maid:diagrams", JSON.stringify({ items }));
      localStorage.setItem("qack-maid:open", items[openIndex].id);
    },
    { diagrams, openIndex },
  );
}

export async function seedLegacySource(page: Page, source: string) {
  await page.addInitScript((source) => {
    if (localStorage.getItem("qack-maid:diagrams") !== null) return;
    localStorage.setItem("qack-maid:source", source);
  }, source);
}

export async function storedLibrary(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("qack-maid:diagrams") || "null"));
}
