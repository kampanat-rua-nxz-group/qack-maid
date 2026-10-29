# Named diagram library implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single autosaved Source slot with a sidebar list of named Diagrams kept in `localStorage`.

**Architecture:** Three new classic scripts under `js/diagrams/`. `names.js` holds pure naming and time helpers. `store.js` owns every `localStorage` read and write for Diagrams and returns status objects instead of throwing. `session.js` holds the open Diagram, boots the app, and autosaves; it announces list changes with a `diagrams:changed` DOM event. `sidebar.js` draws the list and handles row actions, collapse, and cross-tab `storage` events.

**Tech Stack:** Vanilla JS classic scripts, CSS, Playwright (Chromium) in `tests/`.

**Spec:** `docs/specs/diagram-library.md`

## Global Constraints

- No build step, no `type="module"`, works from `file://` (ADR-0005). Each new file at or under 300 lines.
- Script order in `index.html` is a contract. A file's load-time code uses only earlier files.
- No network calls, no external assets (ADR-0001). Browser-local `localStorage` only.
- All keys start with `qack-maid:`.
- Autosave writes Source verbatim, valid or not, on every `input` event. `render()` writes nothing.
- Duplicate names get ` YYYY-MM-DD HH:mm` (local time); if still taken, ` YYYY-MM-DD HH:mm:ss`. Names compare trimmed and case-insensitively.
- Storage-full toast text, exact: `Storage is full. Delete diagrams you no longer need.`
- Fork toast text, exact: `Changed in another tab. Saved your edits as "<name>".`
- Theme, Preview background, splitter, and laser color stay global.
- No git add or commit by agents. Each task ends by reporting changed files and a proposed conventional commit message; the user commits.
- `tests/specs/smoke.spec.ts` says not to edit it to make a refactor pass. This change alters behavior (Example removed, export file name), so editing the affected smoke tests is in scope. Edit only those tests.

## Review Focus

1. **Switching right after typing.** A user types and clicks another Diagram within 250 ms. Expected: the last keystrokes are saved. Test in Task 1 (`autosave writes on input, before the render debounce`) and Task 2 (`switching right after typing keeps the last keystrokes`).
2. **Corrupt library index** (hand-edited storage, a future format). Expected: the app loads, no `qack-maid:diagram:*` data is deleted, and each stored Diagram is listed as "Recovered". Test in Task 1 (`unreadable index is rebuilt from stored diagrams`).
3. **Empty or whitespace-only legacy Source.** Expected: migrated verbatim, not replaced by the starter flowchart. Test in Task 1 (`migrates empty legacy Source verbatim`).
4. **Very long names.** Expected: the row truncates with an ellipsis and the sidebar keeps its width. Test in Task 2 (`long names do not widen the sidebar`).
5. **Thai names.** Expected: uniqueness works and the export file keeps Thai letters including combining vowels. Test in Task 7 (`kebabFileName keeps Thai letters and marks`).

---

## Storage layout (decided here, recorded in ADR-0007 in Task 7)

| Key | Value |
|-----|-------|
| `qack-maid:diagrams` | JSON `{ "items": [{ "id": string, "name": string, "updatedAt": number }] }` |
| `qack-maid:diagram:<id>` | JSON `{ "source": string, "rev": number }` |
| `qack-maid:open` | id of the Diagram open last |
| `qack-maid:sidebar-collapsed` | `"1"` when collapsed, absent otherwise |
| `qack-maid:source` | legacy key; read once for migration, removed after a successful migration |

Ids are `Date.now().toString(36) + Math.random().toString(36).slice(2, 8)`. `crypto.randomUUID` is not used because it needs a secure context and the app must run from `file://`.

Every structural write re-reads `qack-maid:diagrams` right before writing it (read, modify, write in one synchronous call). No function caches the index.

## File map

- Create `js/diagrams/names.js`, `js/diagrams/store.js`, `js/diagrams/session.js`, `js/diagrams/sidebar.js`, `css/diagrams.css`.
- Create `tests/specs/helpers/diagrams.ts` (seeding and query helpers), `tests/specs/diagram-library.spec.ts`, `tests/specs/diagram-library-actions.spec.ts`, `tests/specs/diagram-library-tabs.spec.ts`.
- Modify `index.html`, `js/shared.js`, `js/render.js`, `js/editor.js`, `js/main.js`, `js/export/menu.js`, `css/chrome.css`.
- Delete `js/examples.js`.
- Modify tests `smoke.spec.ts`, `presentation-mode.spec.ts`, `presentation-sequence.spec.ts`, `presentation-stepping.spec.ts`.
- Docs: create `docs/adr/0007-named-diagram-library.md`; modify `CONTEXT.md`, `docs/adr/0003-localstorage-only-autosave.md` (status line), `docs/specs/diagram-library.md` (status line).

Final script order in `index.html`:

```
mermaid.min.js, js/shared.js, js/logo.js, js/theme.js, js/render.js,
js/diagrams/names.js, js/diagrams/store.js, js/diagrams/session.js,
js/editor.js, js/zoom-pan.js, js/presentation/mode.js, js/presentation/laser.js,
js/presentation/spotlight.js, js/export/stamp.js, js/export/png.js,
js/export/menu.js, js/diagrams/sidebar.js, js/main.js
```

---

### Task 1: Library storage, boot, and autosave

**Files:**
- Create: `js/diagrams/names.js`, `js/diagrams/store.js`, `js/diagrams/session.js`, `tests/specs/helpers/diagrams.ts`, `tests/specs/diagram-library.spec.ts`
- Modify: `js/shared.js` (keys), `js/render.js:9` (remove write), `js/editor.js` (input handler, Format), `js/main.js`, `index.html` (script tags only)

**Interfaces:**
- Produces, in `js/shared.js`: `LIBRARY_KEY = "qack-maid:diagrams"`, `DIAGRAM_KEY_PREFIX = "qack-maid:diagram:"`, `OPEN_KEY = "qack-maid:open"`, `SIDEBAR_KEY = "qack-maid:sidebar-collapsed"`, `LEGACY_SOURCE_KEY = "qack-maid:source"`. `STORAGE_KEY` is removed.
- Produces, in `names.js`:
  - `formatStamp(date: Date, withSeconds: boolean): string` → `"2026-10-29 14:32"` or `"2026-10-29 14:32:05"`, local time, zero-padded.
  - `uniqueName(desired: string, takenNames: string[], now: Date): string` → trimmed `desired` if free; else `desired + " " + formatStamp(now, false)`; else with seconds; else append ` 2`, ` 3`, … to the seconds form. Comparison trims and lowercases both sides. Empty `desired` becomes `"Untitled"`.
- Produces, in `store.js` (every write catches quota errors; `isQuotaError(err)` is true for `err.name` `QuotaExceededError` or `NS_ERROR_DOM_QUOTA_REACHED`):
  - `STARTER_SOURCE: string` — the flowchart text currently in `EXAMPLES.flowchart`, copied verbatim.
  - `ensureLibrary(now?: Date): { status: "ok" } | { status: "quota", legacySource: string }`
  - `listDiagrams(): { id: string, name: string, updatedAt: number }[]` — newest `updatedAt` first.
  - `readDiagram(id: string): { id, name, source, rev, updatedAt } | null`
  - `createDiagram(name: string, source: string, now?: Date): { status: "ok", id: string, name: string } | { status: "quota" }` — applies `uniqueName`.
  - `saveSource(open: { id: string, name: string, rev: number }, source: string, now?: Date): { status: "saved", rev: number } | { status: "quota" }` — writes `{source, rev: rev + 1}` and bumps `updatedAt`. (Task 5 adds `"forked"`.)
  - `getOpenId(): string | null`, `setOpenId(id: string): void` (swallows quota errors).
- Produces, in `session.js`:
  - `openDiagram: { id: string | null, name: string, rev: number }` — `id` null means temporary legacy mode (Task 6).
  - `bootDiagrams(): void` — `ensureLibrary()`, opens `getOpenId()` if listed, else the newest, fills `sourceEl`.
  - `openDiagramById(id: string): void` — fills `sourceEl`, updates `openDiagram`, `setOpenId`, dispatches `diagrams:changed`, calls `render()`.
  - `autosaveSource(): void` — `saveSource(openDiagram, sourceEl.value)`; on `"saved"` stores the new rev and dispatches `diagrams:changed`.
  - Event: `document.dispatchEvent(new CustomEvent("diagrams:changed"))` after any change to the list or the open Diagram.

`ensureLibrary` rules, in order:
1. Index parses and has an `items` array → done.
2. Index key present but unreadable → rebuild `items` from every `qack-maid:diagram:*` key, each named via `uniqueName("Recovered", …)`, `updatedAt` now. Never delete a diagram key.
3. No index, `qack-maid:source` present (any string, `""` included) → create "Untitled" with that string verbatim, then remove the legacy key.
4. No index, no legacy key → create "Untitled" with `STARTER_SOURCE`.

- [ ] **Step 1: Write the test helpers** in `tests/specs/helpers/diagrams.ts`:
  - `seedLibrary(page, diagrams: { name: string; source: string; minutesAgo: number }[], openIndex = 0)` — `page.addInitScript` that writes the index, diagram keys (rev 1), and `qack-maid:open`, only when `qack-maid:diagrams` is absent, so reloads keep state.
  - `seedLegacySource(page, source: string)` — same guard, writes `qack-maid:source` only.
  - `storedLibrary(page)` — returns parsed `qack-maid:diagrams` via `page.evaluate`.
  - `RENDER_SETTLE_MS = 400`.

- [ ] **Step 2: Write failing tests** in `tests/specs/diagram-library.spec.ts`, `test.describe("library storage")`:
  - `uniqueName appends a minute stamp, then seconds` — `page.evaluate` with `now = new Date(2026, 9, 29, 14, 32, 5)`: `uniqueName("Login flow", ["login flow"], now)` → `"Login flow 2026-10-29 14:32"`; with that name also taken → `"Login flow 2026-10-29 14:32:05"`; `uniqueName("  ", [], now)` → `"Untitled"`.
  - `new user gets one Untitled starter flowchart` — fresh page: `listDiagrams()` has one item named `"Untitled"`; `#preview svg[aria-roledescription="flowchart-v2"]` visible.
  - `migrates legacy Source verbatim and removes the key` — `seedLegacySource(page, "flowchart TD\n  A --> \n  %% broken")`: `#source` has that value; `qack-maid:source` is null; one item `"Untitled"`. Reload: still one item.
  - `migrates empty legacy Source verbatim` — `seedLegacySource(page, "")`: `#source` value is `""`.
  - `unreadable index is rebuilt from stored diagrams` — init script sets `qack-maid:diagrams` to `"{oops"` and `qack-maid:diagram:a1` to `{"source":"graph TD\n X","rev":3}`: page loads with no `pageerror`; `listDiagrams()` names `["Recovered"]`; `#source` is `"graph TD\n X"`.
  - `autosave writes on input, before the render debounce` — `seedLibrary` one Diagram; `page.fill("#source", "flowchart LR\n Q")`, then immediately (no wait) read `qack-maid:diagram:<id>` → `source` equals the typed text.
  - `render and theme change do not bump updatedAt` — seed two Diagrams (0 and 60 minutes ago, open the older); record its `updatedAt`; `selectOption("#theme-select", "dark")`; wait `RENDER_SETTLE_MS`; `updatedAt` unchanged and `listDiagrams()` order unchanged.
  - `reload opens the Diagram open last` — seed two, open index 1; reload; `#source` equals Diagram 1's source.

- [ ] **Step 3: Run to verify failure**
  Run (from `tests/`): `npm test -- specs/diagram-library.spec.ts`
  Expected: FAIL (`uniqueName is not defined`, missing keys).

- [ ] **Step 4: Implement** `names.js`, `store.js`, `session.js` per the Interfaces block. Add the three script tags in the order above. In `render.js` delete the `localStorage.setItem` line. In `editor.js`, the `input` handler calls `autosaveSource()` before scheduling the debounced render; the Format handler calls `autosaveSource()` after setting `sourceEl.value`. `main.js` becomes `bootDiagrams(); render();` with its comment updated. Keep `js/examples.js` and the dropdown working for now (Task 2 removes them); the `examplesEl` change handler also calls `autosaveSource()`.

- [ ] **Step 5: Run to verify pass**
  Run: `npm test -- specs/diagram-library.spec.ts` then `npm test`
  Expected: all pass. The smoke test `Autosave keeps invalid Source verbatim across a reload` passes unchanged.

- [ ] **Step 6: Report** changed files and proposed message `feat(diagrams): store named diagrams in localStorage with migration`.

---

### Task 2: Desktop sidebar, switching, New, collapse; remove Example

**Files:**
- Create: `js/diagrams/sidebar.js`, `css/diagrams.css`
- Modify: `index.html`, `js/shared.js` (drop `examplesEl`), `js/editor.js` (drop Example handler, header comment), `tests/specs/smoke.spec.ts`, `tests/specs/presentation-mode.spec.ts`, `tests/specs/presentation-sequence.spec.ts`, `tests/specs/presentation-stepping.spec.ts`, `tests/specs/diagram-library.spec.ts`
- Delete: `js/examples.js`

**Interfaces:**
- Consumes: `listDiagrams`, `createDiagram`, `openDiagramById`, `openDiagram`, `diagrams:changed`, `SIDEBAR_KEY`, `showToast` (runtime).
- Produces, in `names.js`: `relativeTime(then: number, now: number): string` → `"just now"` (< 60 s), `"5m ago"`, `"2h ago"`, `"yesterday"` (24–48 h), `"3 days ago"` (< 7 days), else `formatStamp(new Date(then), false).slice(0, 10)`.
- Produces, in `sidebar.js`: `renderDiagramList(): void` (listens to `diagrams:changed`).
- Markup contract (later tasks and tests use these):

```html
<div class="workspace">
  <aside id="diagram-list" class="pane" data-pane="diagrams">
    <div class="pane-label">Diagrams <button id="diagram-collapse" type="button" aria-expanded="true" title="Collapse">«</button></div>
    <button id="diagram-new" type="button">+ New</button>
    <ul id="diagram-items"></ul>
  </aside>
  <main>…unchanged…</main>
</div>
```

Each row: `<li class="diagram-row" data-id="…" aria-current="true|false"><button type="button" class="diagram-open"><span class="diagram-name">…</span><span class="diagram-time">…</span></button><button type="button" class="diagram-row-menu" aria-label="Diagram actions">⋯</button></li>`.

The sidebar sits outside `main` so the splitter math in `editor.js` stays unchanged. Collapsed: `#diagram-list.collapsed` shows only the collapse button (label `»`, `aria-expanded="false"`); state saved in `SIDEBAR_KEY`. Sidebar width and styling are the implementer's choice; names truncate with `text-overflow: ellipsis`. Presentation needs no code: `.preview-wrap.presenting` is a fixed full-screen layer at `z-index: 9999` (`css/presentation.css`).

- [ ] **Step 1: Replace Example usage in existing specs.** In each of the four specs, replace `page.selectOption("#examples", key)` with `page.fill("#source", SOURCE)` and the same render wait, where `SOURCE` is a constant holding the matching text copied verbatim from `js/examples.js` (`sequence`, `class`, and whichever keys `presentation-mode.spec.ts` passes to `selectExample`). In `smoke.spec.ts`, delete the test `choosing an Example replaces Source and renders it`.

- [ ] **Step 2: Write failing tests** in `diagram-library.spec.ts`, `test.describe("sidebar")`:
  - `lists Diagrams newest first with relative times` — seed `A` (0 min), `B` (120), `C` (4320): `.diagram-name` texts `["A", "B", "C"]`; `.diagram-time` texts `["just now", "2h ago", "3 days ago"]`; row `A` has `aria-current="true"`.
  - `clicking a row opens that Diagram` — click `B`'s `.diagram-open`: `#source` equals B's source; Preview re-renders; `B` row `aria-current="true"`; order unchanged.
  - `editing moves a Diagram to the top` — open `C`, type `"\n%% x"` at the end: names `["C", "A", "B"]`.
  - `switching right after typing keeps the last keystrokes` — open `A`, `page.type("#source", "Z")`, click `B` with no wait, reload, click `A`: `#source` ends with `"Z"`.
  - `New creates an empty Untitled and opens it` — with the A/B/C seed, click `#diagram-new`: a current row named `"Untitled"`, `#source` is `""`. Click again: the new current row matches `/^Untitled \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/`.
  - `collapse persists across reload` — click `#diagram-collapse`: `#diagram-list` has class `collapsed`; reload: still collapsed; `#diagram-items` hidden.
  - `long names do not widen the sidebar` — record `#diagram-list` width; seed a 200-character name; width equal (±1 px).
  - `presentation covers the sidebar` — click `#present`; `document.elementFromPoint` at the sidebar's centre is inside `.preview-wrap`.
  - `Example control is gone` — `#examples` count 0; no `pageerror`.

- [ ] **Step 3: Run to verify failure** — `npm test -- specs/diagram-library.spec.ts`; Expected: the sidebar tests FAIL (`#diagram-items` not found).

- [ ] **Step 4: Implement.** Add the markup and `css/diagrams.css` (linked after `chrome.css`), `sidebar.js` (script tag after `export/menu.js`), `relativeTime`. Remove the `#examples` `<select>`, `examplesEl`, the Example handler, and `js/examples.js` with its script tag; `STARTER_SOURCE` already lives in `store.js`. Re-render times when the list redraws; no timer.

- [ ] **Step 5: Run to verify pass** — `npm test -- specs/diagram-library.spec.ts`, then `npm test`. Expected: all pass, including `mobile-layout.spec.ts` (Task 4 handles mobile; at ≤720 px the aside is a `.pane` without `active-pane`, so it is hidden by the existing rule).

- [ ] **Step 6: Report** with proposed message `feat(diagrams): add diagram sidebar and remove Example picker`.

---

### Task 3: Row actions (Duplicate, Rename, Delete)

**Files:**
- Modify: `js/diagrams/store.js`, `js/diagrams/sidebar.js`, `css/diagrams.css`
- Create: `tests/specs/diagram-library-actions.spec.ts`

**Interfaces:**
- Produces, in `store.js`:
  - `duplicateDiagram(id: string, now?: Date): { status: "ok", id, name } | { status: "quota" } | { status: "missing" }` — name via `uniqueName(original.name, …)`, so it always gets a stamp.
  - `renameDiagram(id: string, name: string, now?: Date): { status: "ok", name } | { status: "unchanged" } | { status: "quota" }` — whitespace-only → `"unchanged"`; the Diagram's own name is excluded from `takenNames`; `updatedAt` not changed.
  - `deleteDiagram(id: string): { status: "ok", nextId: string } | { status: "quota" }` — removes the index entry, then the diagram key; if none remain, creates an empty `"Untitled"` and returns its id; otherwise `nextId` is the newest remaining.
- `sidebar.js` sets `openDiagram.name` when the open Diagram is renamed.
- Markup: clicking `.diagram-row-menu` toggles a `.diagram-row-actions` block inside the row with `<button data-action="duplicate">Duplicate</button>`, `rename`, `delete`. Rename swaps `.diagram-name` for `<input class="diagram-rename-input">`; Enter or blur commits, Escape cancels. Delete swaps the actions for `Delete "<name>"?` with `data-action="confirm-delete"` and `data-action="cancel-delete"`. Only one row menu open at a time; a click outside closes it. No `window.confirm`.

- [ ] **Step 1: Write failing tests** in `diagram-library-actions.spec.ts` (seed `Login flow` 0 min, `Order ER` 60 min):
  - `Duplicate copies Source under a stamped name and opens it` — row menu on `Login flow` → Duplicate: new row matching `/^Login flow \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/` is current; `#source` equals Login flow's source.
  - `Rename changes the name in place without reordering` — rename `Order ER` to `Orders`: names `["Login flow", "Orders"]`.
  - `Rename to a taken name appends a stamp` — rename `Order ER` to ` login FLOW `: name matches `/^login FLOW \d{4}-…$/` (trimmed).
  - `Rename to blank keeps the old name`; `Escape cancels rename`.
  - `Delete asks first and Cancel keeps the row`.
  - `Deleting the open Diagram opens the next newest` — delete `Login flow` (open): row gone; `Order ER` current; `qack-maid:diagram:<id>` is null.
  - `Deleting the last Diagram leaves an empty Untitled` — seed one Diagram, delete it: one row `"Untitled"`, `#source` is `""`.

- [ ] **Step 2: Run to verify failure** — `npm test -- specs/diagram-library-actions.spec.ts`; Expected: FAIL.

- [ ] **Step 3: Implement** the three store functions and the row UI. After each `"ok"`, open the resulting Diagram where the spec says so (Duplicate opens the copy; Delete of the open Diagram opens `nextId`) and dispatch `diagrams:changed`. On `"quota"`, call `showToast` with the storage-full text and change nothing.

- [ ] **Step 4: Run to verify pass** — the spec file, then `npm test`.

- [ ] **Step 5: Report** with proposed message `feat(diagrams): duplicate, rename and delete diagrams`.

---

### Task 4: Mobile Diagrams tab

**Files:**
- Modify: `index.html` (tab button), `js/diagrams/sidebar.js`, `css/chrome.css` or `css/diagrams.css`, `tests/specs/diagram-library.spec.ts`

**Interfaces:**
- Consumes: the generic `.tab-btn` handler in `editor.js` (it toggles `.active-pane` on `.pane[data-pane=…]` anywhere in the document).
- Produces: `<button type="button" class="tab-btn" data-pane="diagrams">Diagrams</button>` as the first button in `.mobile-tabs`. *(Placement is a plan call: leftmost, matching the desktop sidebar.)*

Below 720 px: `.workspace` stacks; when `#diagram-list` has `active-pane`, it fills the space and `main` is hidden (`.workspace:has(> #diagram-list.active-pane) > main { display: none; }`). Collapse is not shown on mobile. After a row's `.diagram-open` is tapped, `sidebar.js` calls `document.querySelector('.tab-btn[data-pane="source"]').click()`; on desktop this has no visible effect.

- [ ] **Step 1: Write failing tests**, `test.describe("mobile diagrams tab")` at 390×844:
  - `Diagrams tab lists Diagrams and fills the space` — tap the tab: `#diagram-list` visible, `main` hidden, list height equals the space between tabs and footer (±1 px, same method as `mobile-layout.spec.ts`).
  - `tapping a Diagram opens it in the Source tab` — tap `B`: Source tab active, `#source` equals B's source.
  - `Source and Preview tabs still work` — existing behavior with the extra tab.

- [ ] **Step 2: Run to verify failure**, **Step 3: Implement**, **Step 4: Run** the spec, `mobile-layout.spec.ts`, then `npm test`.

- [ ] **Step 5: Report** with proposed message `feat(diagrams): add Diagrams tab on mobile`.

---

### Task 5: Several tabs open

**Files:**
- Modify: `js/diagrams/store.js` (`saveSource`), `js/diagrams/session.js`, `js/diagrams/sidebar.js`
- Create: `tests/specs/diagram-library-tabs.spec.ts`

**Interfaces:**
- Changes `saveSource` result to also allow `{ status: "forked", id: string, name: string, rev: number }`. It forks when the stored diagram is missing or its `rev` differs from `open.rev`: it creates a new Diagram named `uniqueName(open.name, …)` holding `source`, and leaves the original untouched.
- Produces, in `session.js`: `handleExternalLibraryChange(): void` — re-reads the list; if `openDiagram.id` is no longer listed, opens the newest; if it is listed under a new name, updates `openDiagram.name`; dispatches `diagrams:changed`.
- `sidebar.js` adds `window.addEventListener("storage", (e) => { if (e.key === LIBRARY_KEY || e.key === null) handleExternalLibraryChange(); })`.
- On `"forked"`, `autosaveSource` switches `openDiagram` to the fork (no `sourceEl` change), `setOpenId`, and shows `Changed in another tab. Saved your edits as "<name>".`

A tab does not reload text when another tab edits its open Diagram; its next edit forks. This is the spec's rule.

- [ ] **Step 1: Write failing tests** with two pages from one `context` (shared `localStorage`, real `storage` events):
  - `second tab's edit to the same Diagram becomes a stamped copy` — both open `Login flow`; tab 1 types `"1"`; tab 2 types `"2"`: tab 2's current row matches `/^Login flow \d{4}-…$/` and its toast shows the fork text; `Login flow`'s stored source ends with `"1"` and not `"2"`.
  - `a Diagram created in one tab appears in the other` — tab 1 clicks New; tab 2's list gains `Untitled` without reload.
  - `rename in a stale tab keeps the other tab's new Diagram` — tab 1 New; tab 2 renames `Order ER`: stored index holds both the new `Untitled` and the renamed item.
  - `deleting the open Diagram elsewhere switches this tab` — tab 1 deletes `Login flow`; tab 2 opens `Order ER`.
  - `editing a Diagram whose stored copy vanished saves a copy` — one page with `Login flow` open; `page.evaluate` removes only `qack-maid:diagram:<id>` (a same-tab write fires no `storage` event, so this stands in for a missed event); type `"Q"`: a new current row matching `/^Login flow \d{4}-…$/` holds the text ending in `"Q"`.

- [ ] **Step 2: Run to verify failure**, **Step 3: Implement**, **Step 4: Run** the spec, then `npm test`.

- [ ] **Step 5: Report** with proposed message `feat(diagrams): fork concurrent edits across tabs`.

---

### Task 6: Storage full

**Files:**
- Modify: `js/diagrams/session.js`, `js/diagrams/sidebar.js`, `js/diagrams/store.js` (only if a path is missing a quota catch)
- Modify: `tests/specs/diagram-library-actions.spec.ts`

**Interfaces:**
- Consumes: `{ status: "quota" }` from every store write (Tasks 1, 3, 5).
- `bootDiagrams()` on `ensureLibrary()` → `"quota"`: sets `openDiagram = { id: null, name: "Untitled", rev: 0 }`, fills `sourceEl` with `legacySource`, shows the storage-full toast. While `openDiagram.id` is null, `autosaveSource()` writes `sourceEl.value` to `LEGACY_SOURCE_KEY` (swallowing quota errors), so nothing is lost and the next load retries the migration.
- `autosaveSource()` on `"quota"`: shows the storage-full toast, leaves `sourceEl` untouched, keeps the old rev, so the next input retries.

Test hook: an init script wraps `Storage.prototype.setItem` to throw `new DOMException("full", "QuotaExceededError")` while `window.__failWrites === true`, and calls through otherwise.

- [ ] **Step 1: Write failing tests:**
  - `typing when storage is full keeps Source and warns` — set the flag; type `"X"`: `#toast` has the exact storage-full text; `#source` still contains `"X"`; clear the flag; type `"Y"`: stored source ends with `"XY"`.
  - `New, Duplicate and Rename do nothing when storage is full` — with the flag set, each action leaves the row names unchanged and shows the toast.
  - `migration that cannot write keeps the legacy key and retries` — init script sets `qack-maid:source` and the flag before the app loads: `#source` holds the legacy text; `qack-maid:source` still present; `qack-maid:diagrams` absent. New page without the flag: migration completes.

- [ ] **Step 2: Run to verify failure**, **Step 3: Implement**, **Step 4: Run** the spec, then `npm test`.

- [ ] **Step 5: Report** with proposed message `feat(diagrams): handle full storage without losing Source`.

---

### Task 7: Export file name and documentation

**Files:**
- Modify: `js/diagrams/names.js`, `js/export/menu.js:43`, `tests/specs/smoke.spec.ts` (two `diagram.png` assertions), `tests/specs/diagram-library.spec.ts`
- Create: `docs/adr/0007-named-diagram-library.md`
- Modify: `CONTEXT.md`, `docs/adr/0003-localstorage-only-autosave.md`, `docs/specs/diagram-library.md`

**Interfaces:**
- Produces, in `names.js`: `kebabFileName(name: string): string` → `name.toLowerCase()`, runs of characters outside `[\p{L}\p{M}\p{N}]` (with the `u` flag) become one `-`, leading and trailing `-` trimmed, `"diagram"` if empty, then `".png"` appended. `\p{M}` is required: Thai vowels and tone marks are combining marks, not letters.
- `menu.js` `download-png` uses `kebabFileName(openDiagram.name)`. Cmd/Ctrl+S already routes through it.

- [ ] **Step 1: Write failing tests:**
  - `kebabFileName` cases via `page.evaluate`: `"Login flow"` → `"login-flow.png"`; `"  API / v2 (draft)  "` → `"api-v2-draft.png"`; `"แผนภาพ ทดสอบ"` → `"แผนภาพ-ทดสอบ.png"`; `"!!!"` → `"diagram.png"`.
  - `Download and Cmd/Ctrl+S name the file after the open Diagram` — seed `Login flow`: both downloads' `suggestedFilename()` is `"login-flow.png"`.
  - In `smoke.spec.ts`, change the two `"diagram.png"` expectations to `"untitled.png"` (the new-user Diagram is `"Untitled"`).

- [ ] **Step 2: Run to verify failure**, **Step 3: Implement**, **Step 4: Run** `npm test`. Expected: full suite passes.

- [ ] **Step 5: Docs.**
  - `docs/adr/0007-named-diagram-library.md` in the format of ADR-0003 (Status, Context, Decision, Consequences). Status: Accepted, amends ADR-0003. Decision: the storage layout table above, rev-based fork on concurrent edits, per-keystroke autosave outside `render()`. Consequences: shared per-origin quota on `<user>.github.io`, no history or undo, data stays per browser.
  - ADR-0003 Status: `Accepted, amended by [ADR-0007](0007-named-diagram-library.md)`.
  - `CONTEXT.md`: add **Diagram** (a named Source with a last-edited time, one of many in the library) and **Diagram list** (the sidebar, and the Diagrams tab on mobile). Update **Source** and **Autosave** to name the per-Diagram key and the `input` handler. Remove **Example**.
  - `docs/specs/diagram-library.md` status line: `Implemented. See [the implementation plan](../plans/diagram-library-implementation-plan.md).`
  - Check links resolve: `grep -o '](\.\./[^)]*)\|](0[0-9]*-[^)]*)' docs/adr/0007-named-diagram-library.md docs/adr/0003-localstorage-only-autosave.md docs/specs/diagram-library.md` and confirm each target exists.

- [ ] **Step 6: Report** with proposed messages, one per commit: `feat(export): name PNG downloads after the open diagram` and `docs: record named diagram library (ADR-0007, CONTEXT)`.

---

## Manual checks after Task 7

- Open `index.html` via `file://` in Safari and Chrome: create, switch, reload.
- Copy PNG still works in Safari (unchanged code path, but the header changed).
- Visual pass of the sidebar in light and dark system themes and at 720 px.
