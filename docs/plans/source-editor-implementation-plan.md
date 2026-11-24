# Source editor implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: Implemented and validated. `tests/specs/source-editor.spec.ts` covers it, and the full Playwright suite passed (221 tests, Chromium). The manual Safari checks have not been done, because agents have no Safari. Outstanding manual checks: Safari overlay alignment at the end of long lines and after horizontal scroll; Safari Tab then Cmd+Z and Cmd+Shift+Z; Safari IME Enter to commit a candidate (Japanese or Chinese input); `::selection` visibility over the transparent textarea text in Safari; caret-to-glyph alignment on the iOS mobile Source tab (WebKit on iOS may inset textarea text by about 3px).

**Goal:** Turn the Source pane into an editor with syntax colors, line numbers, Tab/Shift+Tab indent, auto-indent, an Esc escape from Tab, and an error-line mark. It stays a plain `textarea#source`.

**Architecture:** `textarea#source` stays the only editable element. Its text is transparent, and it sits on top of a `<pre>` that shows the same text as colored spans. A gutter on the left shows line numbers. Both layers follow the textarea's scroll. An instance-level `value` setter override on `sourceEl` refreshes the layers whenever code writes `.value`. Key handling lives in its own file.

**Tech Stack:** Classic browser scripts with no build step or modules, CSS custom properties, and Playwright (Chromium) for tests.

**Spec:** [docs/specs/source-editor.md](../specs/source-editor.md)

## Global constraints

- Classic `<script src>` only, never `type="module"`. Must work under `file://`. No network or external assets (ADR-0001, ADR-0005).
- Load-time code may use only files loaded earlier (see `AGENTS.md`). Every file stays at or under 300 lines.
- Source stays verbatim. The overlay never writes `sourceEl.value`. Only key handlers that edit text through `document.execCommand("insertText", …)` change it.
- Indent unit is four spaces, matching `formatMermaid()`.
- Highlight colors are CSS custom properties defined for light and dark in `css/app.css` (`:root` and its `@media (prefers-color-scheme: dark)` block).
- Existing Playwright suites must pass unchanged. Never edit `smoke.spec.ts` to make this pass.
- No `console.log`. No `TODO` comments.
- No git commands. Each task ends by handing the user a proposed Conventional Commit message, and the user commits.

Deviation from the spec (my call, noted for the reviewer): the code is split across `js/source/` (`highlight.js`, `view.js`, `keys.js`) instead of one `js/source-editor.js`, following the `js/presentation/` and `js/diagrams/` pattern and keeping each file small.

## Review focus

1. **Source ending in a newline.** A `<pre>` collapses a trailing `\n`, so the colored layer ends up a line short and the caret on the last empty line drifts. Expect the layers to line up and the gutter to count the empty last line. Tested in Task 1.
2. **HTML-special characters in Source** (`A["<b>x</b> & y"]`). Expect them shown literally, with no markup injected into the colored layer. Tested in Task 1.
3. **IME composition** (Thai, Japanese and similar input). Enter or Tab pressed while `e.isComposing` is true must not be intercepted. Tested in Task 2.
4. **Horizontal scroll on a long line.** The colored layer must shift with `scrollLeft` while the gutter stays fixed horizontally. Tested in Task 1.
5. **Programmatic `.value` writes** (Diagram switch, Format, another tab's change, boot). The gutter and colors must refresh with no `input` event. Tested in Task 1 through `+ New` and `page.evaluate`.

---

### Task 1: Colored layer, gutter and scroll sync

**Files:**
- Create: `js/source/highlight.js`, `js/source/view.js`, `css/source-editor.css`
- Modify: `index.html` (wrap the textarea, add `wrap="off"`, add the stylesheet link after `css/app.css`, add scripts after `js/editor.js`), `css/app.css` (token colors for light and dark; the `textarea` rule moves or narrows so the overlay styling lives in `css/source-editor.css`), `css/chrome.css` (only if the mobile Source pane loses its height)
- Test: `tests/specs/source-editor.spec.ts`

**Interfaces:**
- Produces `highlightMermaid(text: string) -> string` in `js/source/highlight.js`. It returns HTML-escaped markup in which recognized tokens are wrapped in `<span class="tok-…">`. The classes are `tok-diagram` (diagram-type keyword at line start), `tok-keyword` (structural keywords from the spec), `tok-arrow` (links and arrows from the spec), `tok-label` (bracketed node text `[…]`, `(…)`, `{…}`, `((…))`, `>…]`), `tok-string` (`"…"`) and `tok-comment` (`%%` to end of line). Unrecognized text is escaped plain text. The function is pure, with no DOM access.
- Produces `refreshSourceView() -> void` in `js/source/view.js`. It re-renders the colored layer and gutter from `sourceEl.value`. It runs on `input`, from the `value` setter override, and once at load.
- Produces the markup contract:

  ```html
  <div class="source-editor">
    <div class="source-gutter" aria-hidden="true"><div class="source-gutter-lines"></div></div>
    <div class="source-body">
      <pre class="source-highlight" aria-hidden="true"><code></code></pre>
      <textarea id="source" wrap="off" spellcheck="false" autocomplete="off"></textarea>
    </div>
  </div>
  ```

  Gutter lines are `<div class="source-line-no">N</div>`, one per Source line.

- [ ] **Step 1: Write failing tests in `tests/specs/source-editor.spec.ts`** (describe `"source editor view"`, `beforeEach` goes to `/index.html` and waits for `#preview svg`)
  - `"gutter shows one number per line, counting a trailing empty line"`: fill `"flowchart TD\n  A --> B\n"` and expect `.source-line-no` to have count 3 with the last text `"3"`.
  - `"colors keywords, arrows and comments"`: fill `"flowchart TD\n  subgraph S\n  A --> B %% note\n  end"` and expect `.source-highlight .tok-diagram` to have text `"flowchart"`, `.tok-keyword` first text `"subgraph"`, `.tok-arrow` text `"-->"` and `.tok-comment` text `"%% note"`.
  - `"shows HTML characters literally"`: fill `'flowchart TD\n  A["<b>x</b> & y"]'` and expect `.source-highlight b` count 0 and `.source-highlight` to contain the text `<b>x</b> & y`.
  - `"layers follow scroll"`: fill one line of 400 `x` characters plus 80 lines, set `sourceEl.scrollLeft = 200; sourceEl.scrollTop = 300` through `evaluate` and dispatch `scroll`. Expect the `.source-highlight` computed `transform` to be `matrix(1, 0, 0, 1, -200, -300)` and `.source-gutter-lines` to be `matrix(1, 0, 0, 1, 0, -300)`.
  - `"refreshes on programmatic value writes"`: `evaluate(() => { sourceEl.value = "a\nb\nc\nd"; })` and expect 4 `.source-line-no`. Then click `#diagram-new` and expect the count to match the new Source's line count (read through `sourceEl.value.split("\n").length`).
  - `"textarea text is transparent, caret visible"`: expect the computed `color` of `#source` to be `rgba(0, 0, 0, 0)` and `caret-color` not to be transparent.

- [ ] **Step 2: Run** `npm test -- specs/source-editor.spec.ts` from `tests/`. Expected: all six FAIL (elements missing).

- [ ] **Step 3: Implement `highlightMermaid(text)` in `js/source/highlight.js`.** Escape `&`, `<` and `>` before wrapping (or escape each token as it is emitted, never after wrapping). Tokenize line by line with one ordered alternation regex. Comment wins first, then string, then arrow, then label, then keyword. Keywords match on word boundaries only.

- [ ] **Step 4: Implement the markup, CSS and `refreshSourceView()` in `js/source/view.js`.**
  - `.source-body` is `position: relative`. `<pre>` and textarea share the font, size, line-height, padding, `tab-size` and `white-space: pre` exactly. `<pre>` is absolutely positioned with `pointer-events: none`. The textarea has `background: transparent`, `color: transparent` and `caret-color: var(--text)`. Keep `::selection` visible.
  - When the text ends with `\n`, append one space inside `<code>` so the last line keeps its height (Review focus 1).
  - On textarea `scroll`, set `transform: translate(-scrollLeft px, -scrollTop px)` on `<pre>` and `translate(0, -scrollTop px)` on `.source-gutter-lines`.
  - Install the setter override at load. Take `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")` and use `Object.defineProperty(sourceEl, "value", { get, set(v) { proto.set.call(this, v); refreshSourceView(); } })`. Call `refreshSourceView()` once at load, because `session.js` may already have set the value.
  - `.source-editor` takes `flex: 1` and `min-height: 0` in both the desktop and mobile layouts.

- [ ] **Step 5: Run** the focused spec (expected all PASS), then `npm test`. Expected: whole suite PASS, including `smoke.spec.ts` and `mobile-layout.spec.ts`.

- [ ] **Step 6: Manual check under `file://`** in Chromium and Safari. Type at the end of a long line, scroll horizontally, and check that the caret sits on its glyph. Toggle the OS dark mode and check that the colors are readable.

- [ ] **Step 7: Hand the user a commit message:** `feat(editor): syntax colors and line numbers in Source`.

### Task 2: Tab, Shift+Tab, auto-indent and the Esc escape

**Files:**
- Create: `js/source/keys.js` (loaded after `js/source/view.js`)
- Test: `tests/specs/source-editor.spec.ts` (new describe `"source editor keys"`)

**Interfaces:**
- Consumes `sourceEl` (shared.js) and `refreshSourceView()`, which runs on its own through `input`.
- Produces no globals beyond the module-level listener. The internal helper is `insertText(text: string) -> void`, a wrapper over `document.execCommand("insertText", false, text)`.

- [ ] **Step 1: Write failing tests**
  - `"Tab inserts four spaces at the caret"`: fill `"flowchart TD"`, press `End`, then `Tab`. Expect the value `"flowchart TD    "` and `#source` still focused.
  - `"Tab and Shift+Tab indent and outdent selected lines"`: fill `"a\nb\nc"` and select from offset 0 to 3 (lines a and b) through `setSelectionRange`. Press `Tab` and expect `"    a\n    b\nc"`. Press `Shift+Tab` and expect `"a\nb\nc"`.
  - `"Shift+Tab removes fewer than four spaces when that is all there is"`: fill `"  a"`, caret at the end, press `Shift+Tab`, expect `"a"`.
  - `"Enter keeps indent and adds one level after {"`: fill `"flowchart TD\n    A"`, `End`, `Enter`, type `B`, and expect `"flowchart TD\n    A\n    B"`. Then fill `"classDiagram\n    class X {"`, `End`, `Enter`, and expect the value to end with `"{\n        "`.
  - `"Esc then Tab leaves the Source pane"`: focus `#source`, press `Escape`, then `Tab`. Expect `#source` not focused and the value unchanged.
  - `"another key after Esc restores Tab indent"`: focus, `Escape`, type `x`, `Tab`, and expect the value to end with `"x    "`.
  - `"undo reverts a Tab insert"`: fill `"a"`, `End`, `Tab`, `ControlOrMeta+z`, expect `"a"`.
  - `"Cmd/Ctrl+Enter still renders and inserts nothing"`: fill a valid Source, press `ControlOrMeta+Enter`, expect the value unchanged and `#preview svg` visible.
  - `"composition keys are not intercepted"`: in `evaluate`, dispatch `new KeyboardEvent("keydown", { key: "Enter", isComposing: true, cancelable: true })` on `sourceEl` and return `defaultPrevented`. Expect `false`. Repeat with `Tab`.
  - `"key edits autosave"`: press `Tab`, wait 400 ms, reload, and expect the four spaces to persist.

- [ ] **Step 2: Run** the focused spec. Expected: the new key tests FAIL. The view tests still PASS.

- [ ] **Step 3: Implement the `keydown` listener on `sourceEl` in `js/source/keys.js`.** Return early on `e.isComposing`, on `e.metaKey`, `e.ctrlKey` or `e.altKey`, or on any key other than Tab and Enter (Escape only sets the flag). Track `tabEscapes`: set it on `Escape`, and clear it on any other `keydown`, after the Tab check. Indent and outdent select whole lines with `setSelectionRange`, then call `insertText` with the rewritten block and restore a selection covering the same lines. Enter calls `insertText("\n" + indent)`.

- [ ] **Step 4: Run** the focused spec, then `npm test`. Expected: all PASS.

- [ ] **Step 5: Manual check in Safari:** Tab insert, then Cmd+Z, then Cmd+Shift+Z.

- [ ] **Step 6: Hand the user a commit message:** `feat(editor): Tab indent, auto-indent and Esc focus escape in Source`.

### Task 3: Error-line mark and the shared line height

**Files:**
- Modify: `js/source/view.js` (add `markSourceErrorLine`), `js/render.js` (call it; `jumpToLine` reads the computed line height), `docs/specs/source-editor.md` (Status), `CONTEXT.md` (the Source entry mentions the editor overlay)
- Test: `tests/specs/source-editor.spec.ts` (new describe `"source editor error line"`)

**Interfaces:**
- Produces `markSourceErrorLine(line: number | null) -> void` in `js/source/view.js`. It adds the class `error` to the matching `.source-line-no`, or clears every mark when `line` is null. The mark survives `refreshSourceView()` until the next call.
- `render.js` calls it at runtime only. That is allowed because `render()` first runs from `main.js`, after `view.js` has loaded. The success branch and the empty-Source branch call it with `null`. The catch branch passes the parsed `line` or `null`.

- [ ] **Step 1: Write failing tests**
  - `"failed render marks the reported line"`: fill `"flowchart TD\n  A --> B\n  B -->"` and wait for `#error-banner.show.jumpable`. Read `data-line` and expect exactly one `.source-line-no.error`, with text equal to that number.
  - `"successful render clears the mark"`: after the above, fill a valid Source and expect `.source-line-no.error` count 0.
  - `"clearing Source clears the mark"`: after an error, fill `""` and expect count 0.
  - `"jumping to the error line scrolls it into view"`: fill 60 valid lines with an error on line 55, click `#error-banner`, and expect `sourceEl.scrollTop > 0` and the selection start at line 55's offset.

- [ ] **Step 2: Run** the focused spec. Expected: the new tests FAIL.

- [ ] **Step 3: Implement.** Add `markSourceErrorLine` and the three call sites in `render()`. In `jumpToLine`, replace `13 * 1.5` with `parseFloat(getComputedStyle(sourceEl).lineHeight)`, so the CSS stays the one source of the value.

- [ ] **Step 4: Run** the focused spec, then `npm test`. Expected: all PASS.

- [ ] **Step 5: Close the paperwork.** Set the spec Status to "Implemented and validated", naming the spec file and the suites that passed. Set this plan's Status to match. Update the Source entry in `CONTEXT.md`: it is still `textarea#source`, now shown through a highlighting overlay with a line gutter.

- [ ] **Step 6: Hand the user a commit message:** `feat(editor): mark the failing line in the Source gutter`.
