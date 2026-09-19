# Split index.html Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: Implemented.

**Goal:** Split the 2,222-line `index.html` into per-feature CSS and JS files with identical behavior. The app still opens from disk with no build step.

**Architecture:** A throwaway shell script outside the repo regenerates `css/`, `js/`, and `index.html` from the pinned original `index.html` (commit `29bb7b5`), using fixed original line ranges. Every file is a verbatim copy of its ranges plus a short comment header. The script takes N and extracts the first N JS files in load order, keeping the rest inline, so every intermediate state is a runnable app. Characterization smoke tests are written first and pin today's behavior.

**Tech Stack:** Plain HTML/CSS/JS, classic `<script src>` tags, vendored `mermaid.min.js`, and Playwright (`tests/`, Chromium) for verification.

**Spec:** [docs/specs/split-index-html.md](../specs/split-index-html.md)

## Global Constraints

- No build step, bundler, transpiler, or root `package.json`. No `type="module"` scripts, because they break `file://`.
- No network calls or external assets (ADR-0001). All paths are relative (`css/…`, `js/…`).
- Function bodies and comments move byte-for-byte; the only additions are file headers and tags.
- No renames, deduplication, state restructuring, or listener merging. Log cleanup ideas for the owner; do not apply them.
- All files stay at or under 300 lines.
- Never edit existing specs under `tests/specs/` to make them pass. Fix the split instead.
- Never run `git add`, `git commit`, `git push`, or `gh pr create`; they are hook-blocked. At each checkpoint, give the owner the suggested commit message as text.
- Run test commands from `tests/`. Setup, once: `npm install && npx playwright install chromium`.

## File map

Original line ranges refer to `git show 29bb7b5:index.html`.

| File | Original lines | Responsibility |
| --- | --- | --- |
| `css/app.css` | 9–256 | Base styles: tokens, header, menus, toast, panes, editor, Preview, zoom |
| `css/presentation.css` | 257–337 | Presentation mode styles |
| `css/chrome.css` | 338–423 | Mobile overrides, color row, footer and logo badge |
| `js/shared.js` | 511–515, 589–620 | Storage keys, shared DOM lookups, presentation state |
| `js/logo.js` | 516–551 | Logo data URI, `loadQackLogo`, `tintedLogoCanvas` |
| `js/theme.js` | 625–730 | Theme settings, Preview background |
| `js/examples.js` | 731–771 | `EXAMPLES` |
| `js/render.js` | 772–832 | `render()`, error banner, `jumpToLine` |
| `js/editor.js` | 833–861, 1776–1844 | Debounced Render, shortcuts, tabs, splitter, Example select, Format |
| `js/zoom-pan.js` | 862–934, 1666–1775 | Zoom and pan |
| `js/presentation/mode.js` | 621–624, 935–987, 1183–1244, 1494–1665 | Enter/exit, fit, chrome, tools, keys |
| `js/presentation/laser.js` | 988–1182 | Laser pointer |
| `js/presentation/spotlight.js` | 1245–1493 | Spotlight and stepping |
| `js/export/stamp.js` | 552–588, 1894–1941, 2065–2091 | Attribution stamp |
| `js/export/svg.js` | 1845–1893, 1942–2014 | SVG artifact builder |
| `js/export/png.js` | 2015–2064 | PNG artifact builder |
| `js/export/menu.js` | 2092–2215 | Export menu, toast, clipboard, actions |
| `js/main.js` | 2216–2219 | Restore Source, first Render |

Together these ranges cover original lines 9–423 (CSS) and 511–2219 (JS) exactly once. Stylesheets load in table order, which is the original rule order. Scripts load in table order after `mermaid.min.js`.

Load-order facts behind this layout (verified during planning):
- `document` `keydown` listeners stay in the order editor (orig. 839), presentation (1620), Export menu (2206).
- `previewWrapEl` `pointerdown`: drag-to-pan registers at load (1712); the laser handlers register later, inside `enterPresentation` (1582). Their relative order is unchanged.
- The three stylesheets load in original line order, so the cascade is unchanged.
- Presentation-state `let`s stay in `shared.js`. This prevents a temporal-dead-zone `ReferenceError` if the `ResizeObserver` in `zoom-pan.js` fires between script loads.

---

### Task 1: Test server hardening and characterization smoke spec

**Files:**
- Modify: `tests/playwright.config.ts` (`webServer.command`)
- Create: `tests/specs/smoke.spec.ts`

**Interfaces:**
- Consumes: the current single-file app, served by `tests/playwright.config.ts` at `/index.html`.
- Produces: `smoke.spec.ts`, which every later task runs as its regression gate.

These tests describe existing behavior, so they should pass immediately against the unchanged app. If one fails on the baseline, the test is wrong: fix the test, not `index.html`, and note what you learned.

- [ ] **Step 0: Raise the static server's listen backlog**

Found during planning: `python3 -m http.server` keeps socketserver's default listen backlog of 5. Once the app loads 18 files per page, parallel Playwright workers overflow the backlog, and the server resets connections (`net::ERR_CONNECTION_RESET`). The page then misses a script and throws, for example, `EXAMPLES is not defined`. Measured on a dry run of the split: 4 to 12 random failures per full run with the default server, and 116/116 passing in 3 of 3 runs with this change. It is still the zero-dependency stdlib server (ADR-0004), and it does not change the app.

In `tests/playwright.config.ts`, replace:
```ts
    command: `python3 -m http.server ${PORT} --directory ${APP_ROOT}`,
```
with:
```ts
    // Same stdlib server as `python3 -m http.server`, but with a listen
    // backlog of 128 instead of socketserver's default 5: parallel workers
    // each request every css/ and js/ file at once, and an overflowing
    // backlog resets connections (ERR_CONNECTION_RESET -> missing script).
    command: `python3 -c "import functools, http.server as s; s.ThreadingHTTPServer.request_queue_size = 128; s.test(HandlerClass=functools.partial(s.SimpleHTTPRequestHandler, directory='${APP_ROOT}'), ServerClass=s.ThreadingHTTPServer, port=${PORT}, bind='127.0.0.1')"`,
```
Run from `tests/`: `npm test`
Expected: 106 passed, the same as before the change.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Characterization smoke tests for the non-presentation features (editor,
// theme, Preview background, export) plus a load check over http and file://.
// Written against the single-file app before the split described in
// docs/specs/split-index-html.md, so they pin today's behavior. Never edit
// them to make a refactor pass.

const RENDER_SETTLE_MS = 400; // Render debounce (250ms) + mermaid.render

async function runExportAction(page: Page, action: string) {
  await page.click("#export-trigger");
  await page.click(`[data-export="${action}"]`);
}

// Mermaid names each render "graph-N", so strip ids before comparing styles.
async function previewStyleText(page: Page) {
  const text = await page.locator("#preview svg style").first().textContent();
  return (text ?? "").replace(/graph-\d+/g, "");
}

test.describe("smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.locator("#preview svg")).toBeVisible();
  });

  test("Autosave keeps invalid Source verbatim across a reload", async ({ page }) => {
    const invalid = "flowchart TD\n  A --> \n  %% not finished";
    await page.fill("#source", invalid);
    await page.waitForTimeout(RENDER_SETTLE_MS);
    await page.reload();
    await expect(page.locator("#source")).toHaveValue(invalid);
  });

  test("choosing an Example replaces Source and renders it", async ({ page }) => {
    await page.selectOption("#examples", "sequence");
    await expect(page.locator("#source")).toHaveValue(/^sequenceDiagram/);
    await expect(page.locator('#preview svg[aria-roledescription="sequence"]')).toBeVisible();
    await expect(page.locator("#examples")).toHaveValue("");
  });

  test("Format reindents Source and drops blank lines", async ({ page }) => {
    await page.fill("#source", "flowchart TD\n\n      A --> B\nB --> C\n");
    await page.click("#format");
    await expect(page.locator("#source")).toHaveValue("flowchart TD\n    A --> B\n    B --> C");
  });

  test("diagram theme re-renders Preview and persists", async ({ page }) => {
    const before = await previewStyleText(page);
    await page.selectOption("#theme-select", "dark");
    await expect.poll(() => previewStyleText(page)).not.toBe(before);
    await page.reload();
    await expect(page.locator("#theme-select")).toHaveValue("dark");
  });

  test("Preview background is independent of theme and persists", async ({ page }) => {
    const wrap = page.locator(".preview-wrap");
    expect(await wrap.getAttribute("data-preview")).toBeNull();
    await page.selectOption("#preview-bg-select", "dark");
    await expect(wrap).toHaveAttribute("data-preview", "dark");
    await expect(page.locator("#theme-select")).toHaveValue("auto");
    await page.reload();
    await expect(wrap).toHaveAttribute("data-preview", "dark");
    await page.selectOption("#preview-bg-select", "auto");
    expect(await wrap.getAttribute("data-preview")).toBeNull();
  });

  test("Download SVG saves stamped markup", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download");
    await runExportAction(page, "download-svg");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("diagram.svg");
    const markup = fs.readFileSync(await download.path(), "utf8");
    expect(markup).toContain("<svg");
    expect(markup).toContain("Powered by");
    await expect(page.locator("#toast")).toHaveText("SVG downloaded");
  });

  test("Download PNG saves a valid PNG file", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download");
    await runExportAction(page, "download-png");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("diagram.png");
    const bytes = fs.readFileSync(await download.path());
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  test("Copy SVG puts stamped markup on the clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await runExportAction(page, "copy-svg");
    await expect(page.locator("#toast")).toHaveText("SVG markup copied");
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain("<svg");
    expect(text).toContain("Powered by");
  });
});

// A split that breaks load order surfaces as an uncaught ReferenceError; a bad
// script/stylesheet path surfaces as a console "Failed to load resource" error.
for (const [label, url] of [
  ["http", "/index.html"],
  ["file://", pathToFileURL(path.resolve(__dirname, "../../index.html")).href],
] as const) {
  test(`loads over ${label} and renders the default Example with no errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto(url);
    await expect(page.locator('#preview svg[aria-roledescription="flowchart-v2"]')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
```

- [ ] **Step 2: Run the spec against the unchanged app**

Run: `npm test -- specs/smoke.spec.ts`
Expected: all 10 tests PASS. If one fails, read the failure and correct only the test's assumption: selector, toast text, or timing. Never change `index.html`.
If the `file://` or console check reports a pre-existing error on the baseline, stop and report it to the owner rather than loosening the assertion.

- [ ] **Step 3: Record the full-suite baseline**

Run: `npm test`
Expected: 116 passed (106 existing + 10 smoke). Later tasks must match it.

- [ ] **Step 4: Checkpoint (owner commits)**

Suggested messages (two commits): `test(e2e): raise static server listen backlog for parallel workers` and `test(smoke): pin editor, theme, export and load behavior before split`

---

### Task 2: Split script and CSS extraction

**Files:**
- Create (outside the repo, never committed): `/tmp/qack-maid-split/split.sh`
- Create: `css/app.css`, `css/presentation.css`, `css/chrome.css`
- Modify: `index.html` (the `<style>` block becomes three `<link>` tags)

**Interfaces:**
- Produces: `split.sh <N>`, which writes all three CSS files and the first N JS files, and regenerates `index.html` with those files as `<script src>` tags plus the not-yet-extracted code inline, in original order. `split.sh verify` checks every file body against its original ranges and checks that the ranges cover the original exactly once.

- [ ] **Step 1: Create the script**

```bash
mkdir -p /tmp/qack-maid-split
cat > /tmp/qack-maid-split/split.sh <<'SCRIPT'
#!/usr/bin/env bash
# Regenerates css/, js/ and index.html from the pinned original index.html.
# usage: split.sh <N>     write CSS + the first N JS files (0..15), rest inline
#        split.sh verify  check bodies against ranges and range coverage
set -euo pipefail
ORIG_REV=29bb7b5
ROOT=$(git rev-parse --show-toplevel)
ORIG=$(mktemp)
trap 'rm -f "$ORIG"' EXIT
git -C "$ROOT" show "$ORIG_REV:index.html" > "$ORIG"

# path|ranges — original line numbers, inclusive, written in this order.
CSS=(
  "css/app.css|9-256"
  "css/presentation.css|257-337"
  "css/chrome.css|338-423"
)
JS=(
  "js/shared.js|511-515 589-620"
  "js/logo.js|516-551"
  "js/theme.js|625-730"
  "js/examples.js|731-771"
  "js/render.js|772-832"
  "js/editor.js|833-861 1776-1844"
  "js/zoom-pan.js|862-934 1666-1775"
  "js/presentation/mode.js|621-624 935-987 1183-1244 1494-1665"
  "js/presentation/laser.js|988-1182"
  "js/presentation/spotlight.js|1245-1493"
  "js/export/stamp.js|552-588 1894-1941 2065-2091"
  "js/export/svg.js|1845-1893 1942-2014"
  "js/export/png.js|2015-2064"
  "js/export/menu.js|2092-2215"
  "js/main.js|2216-2219"
)

header() {
  case "$1" in
    css/app.css) cat <<'H'
/* Base styles: theme tokens, header, Export menu, toast, panes, splitter,
   Source editor, Preview, zoom controls. Loads first of three stylesheets;
   app.css, presentation.css, chrome.css keep the original cascade order. */
H
    ;;
    css/presentation.css) cat <<'H'
/* Presentation mode: fullscreen wrapper, idle chrome, spotlight, toolbar,
   Laser cursor and canvas. Loads after app.css, before chrome.css. */
H
    ;;
    css/chrome.css) cat <<'H'
/* Touch/mobile overrides (single-pane tabs), custom color row, footer and
   logo badge. Loads last so the mobile overrides win over app.css. */
H
    ;;
    js/shared.js) cat <<'H'
// Shared globals, loaded first: localStorage keys, DOM lookups used by several
// features, and presentation state read outside presentation/.
H
    ;;
    js/logo.js) cat <<'H'
// QACK logo glyph shared by the footer badge (CSS mask) and both exports
// (tinted canvas). Load time: sets the --qack-logo CSS variable.
H
    ;;
    js/theme.js) cat <<'H'
// Diagram theme (mermaid.initialize, custom colors) and Preview background.
// Load time needs: shared.js, mermaid.min.js. Runtime calls: render().
H
    ;;
    js/examples.js) cat <<'H'
// Built-in Examples (EXAMPLES map). Loading one overwrites Source.
H
    ;;
    js/render.js) cat <<'H'
// Render: Source -> Preview via mermaid.render(), error banner, jump-to-line.
// Runtime calls: applyZoom() (zoom-pan.js), updatePresentAvailability()
// (presentation/mode.js).
H
    ;;
    js/editor.js) cat <<'H'
// Source editing: debounced Render, Cmd/Ctrl+Enter and Cmd/Ctrl+S shortcuts,
// mobile tabs, splitter, Example select, Format.
// Load time needs: shared.js. Runtime calls: render(), runExport().
H
    ;;
    js/zoom-pan.js) cat <<'H'
// Preview zoom (buttons, Ctrl/Cmd+wheel) and drag/wheel pan.
// Runtime calls: fitPresentationSvg(), clampPresentationZoom()
// (presentation/mode.js).
H
    ;;
    js/presentation/mode.js) cat <<'H'
// Presentation mode: enter/exit/teardown, fit-to-viewport, idle chrome, tool
// switch, keyboard shortcuts. Its state lives in shared.js.
// Runtime calls: laser.js and spotlight.js setup/teardown.
H
    ;;
    js/presentation/laser.js) cat <<'H'
// Laser pointer: overlay canvas, persistent dot, fading trail, Laser color.
// Load time needs: shared.js. Runtime calls: presentation/mode.js chrome timers.
H
    ;;
    js/presentation/spotlight.js) cat <<'H'
// Spotlight highlighting and stepping for flowchart and sequence diagrams.
// Runtime reads: dragSuppressClick (zoom-pan.js).
H
    ;;
    js/export/stamp.js) cat <<'H'
// Attribution stamp for exports: geometry, contrast color, SVG band, canvas band.
// Runtime calls: loadQackLogo(), tintedLogoCanvas() (logo.js); SVG_NS (export/svg.js).
H
    ;;
    js/export/svg.js) cat <<'H'
// SVG Export artifact: stamped, background-stripped, label-flattened clone of
// Preview. Shared by Download SVG and Copy SVG.
H
    ;;
    js/export/png.js) cat <<'H'
// PNG Export artifact: rasterizes the SVG artifact at 2x with the canvas stamp.
// Shared by Download PNG and Copy PNG.
H
    ;;
    js/export/menu.js) cat <<'H'
// Export menu, toast, clipboard, and the Download/Copy actions (EXPORT_ACTIONS).
// Copy PNG hands ClipboardItem the pending blob inside the click (Safari).
H
    ;;
    js/main.js) cat <<'H'
// Boot: restore autosaved Source (else the flowchart Example) and Render once.
H
    ;;
    *) echo "no header for $1" >&2; exit 1 ;;
  esac
}

body() { # ranges...
  for r in "$@"; do sed -n "${r%-*},${r#*-}p" "$ORIG"; done
}

write_file() { # "path|ranges"
  local p=${1%%|*} ranges=${1#*|}
  mkdir -p "$ROOT/$(dirname "$p")"
  { header "$p"; echo; body $ranges; } > "$ROOT/$p"
}

verify() {
  local fail=0 entry p ranges hl
  for entry in "${CSS[@]}" "${JS[@]}"; do
    p=${entry%%|*}; ranges=${entry#*|}
    [ -f "$ROOT/$p" ] || { echo "MISSING $p"; fail=1; continue; }
    hl=$(( $(header "$p" | wc -l) + 1 ))
    if ! diff -q <(tail -n +$((hl + 1)) "$ROOT/$p") <(body $ranges) >/dev/null; then
      echo "BODY MISMATCH $p"; fail=1
    fi
    echo "$(wc -l < "$ROOT/$p") $p"
  done
  cover() { for entry in "$@"; do for r in ${entry#*|}; do seq "${r%-*}" "${r#*-}"; done; done | sort -n; }
  diff -q <(cover "${CSS[@]}") <(seq 9 423) >/dev/null || { echo "CSS RANGES != 9-423 exactly once"; fail=1; }
  diff -q <(cover "${JS[@]}") <(seq 511 2219) >/dev/null || { echo "JS RANGES != 511-2219 exactly once"; fail=1; }
  [ "$fail" = 0 ] && echo "VERIFY OK" || { echo "VERIFY FAILED"; exit 1; }
}

[ "${1:-}" = verify ] && { verify; exit; }
N=${1:?usage: split.sh <N>|verify}
(( N >= 0 && N <= ${#JS[@]} )) || { echo "N must be 0..${#JS[@]}" >&2; exit 1; }

for entry in "${CSS[@]}"; do write_file "$entry"; done
taken=""
for ((i = 0; i < ${#JS[@]}; i++)); do
  p=${JS[i]%%|*}
  if (( i < N )); then write_file "${JS[i]}"; taken+=" ${JS[i]#*|}"; else rm -f "$ROOT/$p"; fi
done

{
  sed -n '1,7p' "$ORIG"
  echo '<link rel="stylesheet" href="css/app.css" />'
  echo '<link rel="stylesheet" href="css/presentation.css" />'
  echo '<link rel="stylesheet" href="css/chrome.css" />'
  sed -n '425,509p' "$ORIG"
  for ((i = 0; i < N; i++)); do echo "<script src=\"${JS[i]%%|*}\"></script>"; done
  if (( N < ${#JS[@]} )); then
    echo '<script>'
    awk -v taken="$taken" 'BEGIN { n = split(taken, t, " ");
        for (i = 1; i <= n; i++) { split(t[i], ab, "-"); for (j = ab[1]; j <= ab[2]; j++) skip[j] = 1 } }
      NR >= 511 && NR <= 2219 && !(NR in skip)' "$ORIG"
    echo '</script>'
  fi
  sed -n '2221,2222p' "$ORIG"
} > "$ROOT/index.html"
echo "split: CSS + $N/${#JS[@]} JS files extracted"
SCRIPT
chmod +x /tmp/qack-maid-split/split.sh
```

- [ ] **Step 2: Confirm the pinned original matches the working tree**

Run from the repo root: `git diff --quiet 29bb7b5 -- index.html && echo SAME`
Expected: `SAME`. If it differs, `index.html` changed after planning. Stop: every line range in this plan is invalid.

- [ ] **Step 3: Extract CSS only**

Run from the repo root: `/tmp/qack-maid-split/split.sh 0`
Expected: `split: CSS + 0/15 JS files extracted`. `index.html` now has three `<link>` tags and no `<style>`, and still has the full inline script.

- [ ] **Step 4: Check the CSS bodies**

Run: `/tmp/qack-maid-split/split.sh verify`
Expected at this stage: the three CSS rows report no mismatch; every JS file reports `MISSING` and the result is `VERIFY FAILED`. Only the CSS lines matter until Task 7.

- [ ] **Step 5: Run the gates**

Run from `tests/`: `npm test -- specs/smoke.spec.ts specs/presentation-mode.spec.ts specs/presentation-spotlight.spec.ts specs/presentation-laser.spec.ts`
Expected: all PASS.

- [ ] **Step 6: Checkpoint (owner commits)**

Suggested message: `refactor(css): move styles into css/ (app, presentation, chrome)`

---

### Task 3: Extract shared, logo, theme, examples, render (N = 1..5)

**Files:**
- Create: `js/shared.js`, `js/logo.js`, `js/theme.js`, `js/examples.js`, `js/render.js`
- Modify: `index.html` (generated)

**Interfaces:**
- Consumes: `split.sh` from Task 2.
- Produces: these globals at load, used by later files: `STORAGE_KEY`, `THEME_KEY`, `PREVIEW_BG_KEY`, `SPLIT_KEY`, all DOM lookup `const`s from orig. 589–608, `presenting`, `presentationTool`, `savedZoomLevel`, `savedTabPane`, `savedPan`, `presentationZoom`, `loadQackLogo()`, `tintedLogoCanvas()`, `themeSettings`, `previewBg`, `EXAMPLES`, `render()`, and `jumpToLine()`.

- [ ] **Step 1: Extract one file at a time, gating each**

For each N in 1, 2, 3, 4, 5, run from the repo root:
`/tmp/qack-maid-split/split.sh <N>`
Then run from `tests/`: `npm test -- specs/smoke.spec.ts`
Expected: smoke PASS at every N. If an N fails, stop and inspect the failing file's load-time code for a dependency on a later file. Do not reorder ranges without updating this plan and the spec.

- [ ] **Step 2: Verify the headers' dependency claims**

Run from the repo root:
```bash
grep -n 'function render\b\|function applyZoom\|function updatePresentAvailability' index.html js/*.js
```
Expected: `render` is in `js/render.js`; `applyZoom` and `updatePresentAvailability` are still inline in `index.html`. They move in later tasks, and the header names their final files.

- [ ] **Step 3: Run the theme- and render-adjacent specs**

Run from `tests/`: `npm test -- specs/smoke.spec.ts specs/presentation-mode.spec.ts`
Expected: PASS.

- [ ] **Step 4: Checkpoint (owner commits)**

Suggested message: `refactor(js): extract shared globals, logo, theme, examples and render`

---

### Task 4: Extract editor and zoom-pan (N = 6..7)

**Files:**
- Create: `js/editor.js`, `js/zoom-pan.js`
- Modify: `index.html` (generated)

**Interfaces:**
- Consumes: Task 3 globals.
- Produces: `debounceTimer`, `formatMermaid()`, `applySplit()`, `zoomLevel`, `applyZoom()`, `panX`, `panY`, `applyPan()`, `clampPan()`, `resetPan()`, `panBy()`, and `dragSuppressClick`.

- [ ] **Step 1: Extract one file at a time, gating each**

For each N in 6, 7: run `/tmp/qack-maid-split/split.sh <N>` from the repo root, then `npm test -- specs/smoke.spec.ts` from `tests/`.
Expected: PASS at both N.

- [ ] **Step 2: Confirm the keydown listener order**

Run from the repo root: `grep -n 'document.addEventListener("keydown"' js/editor.js index.html`
Expected: one match in `js/editor.js` and two in the inline script of `index.html`. The editor listener registers first because `editor.js` loads before the inline remainder.

- [ ] **Step 3: Run the zoom/pan and shortcut specs**

Run from `tests/`: `npm test -- specs/smoke.spec.ts specs/presentation-zoom-pan.spec.ts specs/presentation-shortcuts-chrome.spec.ts`
Expected: PASS.

- [ ] **Step 4: Checkpoint (owner commits)**

Suggested message: `refactor(js): extract editor and zoom-pan`

---

### Task 5: Extract presentation mode, laser, spotlight (N = 8..10)

**Files:**
- Create: `js/presentation/mode.js`, `js/presentation/laser.js`, `js/presentation/spotlight.js`
- Modify: `index.html` (generated)

**Interfaces:**
- Consumes: Task 3 and Task 4 globals.
- Produces: `clampPresentationZoom()`, `enterPresentation()`, `exitPresentation()`, `teardownPresentation()`, `fitPresentationSvg()`, `updatePresentAvailability()`, `setPresentationTool()`, the laser functions, and the spotlight functions.

- [ ] **Step 1: Extract one file at a time, gating each**

For each N in 8, 9, 10: run `/tmp/qack-maid-split/split.sh <N>` from the repo root, then `npm test -- specs/smoke.spec.ts specs/presentation-mode.spec.ts` from `tests/`.
Expected: PASS at every N.

- [ ] **Step 2: Run every presentation spec**

Run from `tests/`: `npm test -- specs/presentation-*.spec.ts`
Expected: all PASS, with the same counts as the Task 1 baseline for those files.

- [ ] **Step 3: Checkpoint (owner commits)**

Suggested message: `refactor(js): extract presentation mode, laser and spotlight`

---

### Task 6: Extract export and boot (N = 11..15)

**Files:**
- Create: `js/export/stamp.js`, `js/export/svg.js`, `js/export/png.js`, `js/export/menu.js`, `js/main.js`
- Modify: `index.html` (generated; at N = 15 it has no inline `<script>`)

**Interfaces:**
- Consumes: everything above.
- Produces: the final layout. `index.html` has markup plus 3 `<link>` tags and 16 `<script src>` tags (`mermaid.min.js` + 15 app files).

- [ ] **Step 1: Extract one file at a time, gating each**

For each N in 11, 12, 13, 14, 15: run `/tmp/qack-maid-split/split.sh <N>` from the repo root, then `npm test -- specs/smoke.spec.ts` from `tests/`.
Expected: PASS at every N.

- [ ] **Step 2: Confirm no inline script remains**

Run from the repo root: `grep -c '<script>' index.html; grep -c '<script src=' index.html; wc -l index.html`
Expected: `0`, `16`, and about 112 lines.

- [ ] **Step 3: Checkpoint (owner commits)**

Suggested message: `refactor(js): extract export pipeline and boot; index.html is markup only`

---

### Task 7: Whole-split verification

**Files:**
- None created. This task only checks.

- [ ] **Step 1: Byte-level verification**

Run from the repo root: `/tmp/qack-maid-split/split.sh verify`
Expected: 18 `<lines> <path>` rows, each ≤ 300 lines, followed by `VERIFY OK`.

- [ ] **Step 2: Confirm the diff is moves only**

Run: `git diff --color-moved=dimmed-zebra --stat 29bb7b5 -- . ':!docs' ':!tests'`, then page through `git diff --color-moved=dimmed-zebra 29bb7b5 -- index.html js css`.
Expected: every removed line in `index.html` shows as moved. The only non-moved additions are file headers, the `<link>`/`<script src>` tags, and the blank line after each header.

- [ ] **Step 3: Full suite**

Run from `tests/`: `npm test`
Expected: 116 passed, equal to the Task 1 baseline. Run it twice, because parallel-load failures are intermittent.

- [ ] **Step 4: Manual `file://` check**

Run from the repo root: `open index.html`
Expected: the flowchart renders, and the DevTools console shows no errors. Also exercise, by hand:
- Export → Copy PNG, then paste into an image-capable app. Copy PNG is not covered by automated tests.
- Present, and the Laser tool.

Report what you checked to the owner.

- [ ] **Step 5: Clean up**

Run: `rm -rf /tmp/qack-maid-split`

---

### Task 8: Documentation

**Files:**
- Create: `docs/adr/0005-split-static-files-no-build.md`
- Modify: `docs/adr/0002-single-file-static-deployment.md` (Status)
- Modify: `docs/adr/0004-dev-only-e2e-tooling.md` (one-line note)
- Modify: `AGENTS.md` (Project and constraints section)
- Modify: `README.md` (first "What it does" bullet)
- Modify: `docs/specs/split-index-html.md`, this plan (Status lines)

- [ ] **Step 1: Write ADR-0005**

```markdown
# 0005. Static feature files, no build step

## Status

Accepted. Supersedes [ADR-0002](0002-single-file-static-deployment.md).

## Context

`index.html` grew to about 2,200 lines of inline CSS and one global script covering editing, theming, rendering, zoom/pan, presentation mode, and export. Finding and editing code in one file had become the main maintenance cost. ADR-0002's goals still hold: open the app directly from disk, no build step, and deploy the repository's static files as-is.

## Decision

The app may span multiple static files: `index.html` (markup only), stylesheets under `css/`, and classic scripts under `js/`, organized by feature. See `AGENTS.md` for the layout.

- Scripts load with plain `<script src>` tags in a fixed order after `mermaid.min.js`, and share one global scope. `type="module"` is not used: browsers block module loads over `file://`.
- Load order is a contract. A file's load-time code may depend only on files loaded before it. Listeners on the same target keep their relative order.
- Globals used by several features live in `js/shared.js`, which loads first.
- There is still no bundler, no transpiler, and no root `package.json`. ADR-0001 still holds: every reference is a relative path to a committed file.

## Consequences

- Each feature can be read and edited in a file of at most 300 lines.
- Adding a file means adding its tag to `index.html` in the correct position. A missing or misplaced tag shows up as a load-time `ReferenceError`, which `tests/specs/smoke.spec.ts` checks over both http and `file://`.
- Cross-file dependencies stay implicit globals. Each file's header names what it expects. Replacing globals with explicit init functions or namespaces would be a separate decision.
```

- [ ] **Step 2: Mark ADR-0002 superseded**

In `docs/adr/0002-single-file-static-deployment.md`, replace the status line `Accepted` (the line under `## Status`) with:
```
Superseded by [ADR-0005](0005-split-static-files-no-build.md).
```

- [ ] **Step 3: Note in ADR-0004**

In `docs/adr/0004-dev-only-e2e-tooling.md`, add this line directly under the `## Status` value `Accepted`, separated by a blank line:
```
Note: the single-file constraint referenced below is superseded by [ADR-0005](0005-split-static-files-no-build.md); the dev-only tooling boundary still applies.
```

- [ ] **Step 4: Update AGENTS.md**

Replace this bullet:
```
- Keep application markup, styles, and logic in `index.html`, with Mermaid loaded from the local `mermaid.min.js`. The app must work without a build step or application server.
```
with:
```
- `index.html` holds markup only. Styles live in `css/`, and logic lives in classic scripts under `js/`, one file per feature, loaded by `<script src>` tags after the local `mermaid.min.js` (see [ADR-0005](docs/adr/0005-split-static-files-no-build.md)). The app must work without a build step or application server, including when opened via `file://`, so never use `type="module"`.
- Script order in `index.html` is a contract: a file's load-time code may use only files loaded before it. Globals shared by several features belong in `js/shared.js`. New code goes in the feature file that owns it. Keep files at or under 300 lines.
```
In the same file, replace `Inspect the relevant functions in \`index.html\` and existing tests.` with `Inspect the relevant functions in \`js/\` (and markup in \`index.html\`) and existing tests.`

- [ ] **Step 5: Update README.md**

Replace:
```
- Single static HTML file, Mermaid.js vendored locally — works fully offline
```
with:
```
- Plain static HTML/CSS/JS files with no build step, Mermaid.js vendored locally — works fully offline
```

- [ ] **Step 6: Update Status lines**

- In `docs/specs/split-index-html.md`, set Status to `Implemented and validated — smoke and full Playwright suites pass. See [the implementation plan](../plans/split-index-html-implementation-plan.md).`
- In this plan, set Status to `Implemented.`, and add any manual checks that were not performed.

- [ ] **Step 7: Check links**

Run from the repo root:
```bash
grep -ho '([^)]*\.md)' AGENTS.md docs/adr/*.md docs/specs/split-index-html.md | sort -u
ls docs/adr/0005-split-static-files-no-build.md docs/adr/0002-single-file-static-deployment.md docs/plans/split-index-html-implementation-plan.md
```
Expected: every linked file exists.

- [ ] **Step 8: Checkpoint (owner commits)**

Suggested message: `docs(adr): record split into static feature files (ADR-0005)`

---

## Cleanup opportunities (log only — do not apply)

List anything noticed during the split for the owner to triage in Obsidian. Candidates already seen during planning:
- three separate `document` `keydown` listeners (editor, presentation, Export menu) that could share one dispatcher;
- CONTEXT.md says Autosave writes on every `input` event, but the code writes inside the debounced `render()`, 250 ms after the last keystroke.

Manual checks not performed: native image-app paste of copied PNG, and manual desktop/Safari checks. Automated browser checks covered rendering, Present/Laser, and Copy PNG.
