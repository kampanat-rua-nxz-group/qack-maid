# Source editor: highlighting, gutter and indent keys

Status: Implemented and validated. `tests/specs/source-editor.spec.ts` covers it, and the full Playwright suite passed (221 tests, Chromium). The manual Safari checks have not been done, because agents have no Safari. Outstanding manual checks: Safari overlay alignment at the end of long lines and after horizontal scroll; Safari Tab then Cmd+Z and Cmd+Shift+Z; Safari IME Enter to commit a candidate (Japanese or Chinese input); `::selection` visibility over the transparent textarea text in Safari; caret-to-glyph alignment on the iOS mobile Source tab (WebKit on iOS may inset textarea text by about 3px).

## Intent

The Source pane should read and behave like a code editor instead of a bare `<textarea>`. Mermaid text becomes easier to scan, and the error banner's line number points at something visible.

## Approaches

1. **Overlay on the existing textarea (chosen).** Keep `textarea#source` as the only editable element. Make its text transparent and leave the caret and selection visible. A `<pre>` behind it shows the same text as colored spans, and a gutter beside it shows line numbers. Chosen because it adds no dependency, works under `file://`, and keeps every `sourceEl.value` caller and Playwright `fill`/`toHaveValue` assertion unchanged.
2. **CodeMirror 6, bundled once into a classic script.** This would give folding, search and multiple cursors. It was rejected because it ships only as ES modules, so a one-time bundling step would be needed, and it has no official Mermaid mode. Every `sourceEl.value` caller and about 25 test assertions would need rewriting.
3. **CodeMirror 5 or Monaco.** CodeMirror 5 costs as much migration as option 2 and is in maintenance mode. Monaco needs web workers and an AMD loader, and both fail under `file://`.

## Behavior

- **Syntax colors.** A small tokenizer colors diagram-type keywords (`flowchart`, `graph`, `sequenceDiagram`, `classDiagram`, `stateDiagram-v2`, `erDiagram`, `gantt`, `pie`, `journey`, `mindmap`, `timeline` and the rest), structural keywords (`subgraph`, `end`, `participant`, `actor`, `loop`, `alt`, `else`, `opt`, `note`, `direction` and similar), arrows and links (`-->`, `---`, `-.->`, `==>`, `->>`, `-->>`, `--x`, `--o`, labelled `-- text -->`), bracketed node labels, quoted strings, and `%%` comments. Anything unrecognized renders as plain text. The highlighter never validates or reports errors.
- **Line numbers.** A gutter left of the text shows one number per Source line and scrolls vertically with it.
- **No wrapping.** Long lines scroll horizontally. The textarea, the colored layer and the gutter stay aligned while scrolling in both directions.
- **Tab indent.** With no selection, Tab inserts four spaces at the caret. With a multi-line selection, Tab indents and Shift+Tab outdents every selected line by four spaces. Four spaces match `formatMermaid()`.
- **Keyboard escape.** Pressing Esc inside Source makes the next Tab move focus out of the pane as normal. Any other key restores Tab indenting.
- **Auto-indent.** Enter starts the new line with the previous line's leading whitespace, plus four extra spaces if the previous line ends with `{`.
- **Undo.** Edits made by Tab, Shift+Tab and Enter go through `document.execCommand("insertText")` (or an equivalent that keeps the native undo stack), so Cmd/Ctrl+Z undoes them. Format keeps its current behavior.
- **Error line.** When Render fails with a line number, that line's gutter number turns red. The mark clears on the next successful Render or when Source is cleared.

## Constraints

- Source stays verbatim. The overlay only displays text and never changes `sourceEl.value`. Autosave, Render debounce, Format, Diagram switching and Cmd/Ctrl+Enter and Cmd/Ctrl+S keep working unchanged.
- Programmatic `.value` writes (`session.js`, Format) must refresh the colored layer and gutter. Those writes fire no `input` event.
- `jumpToLine()` keeps working. Its hardcoded `13 * 1.5` line height should come from one shared value used by the CSS and the overlay.
- Highlight colors work in light and dark themes and come from CSS custom properties in the existing theme tokens.
- Classic script, no network, file at or under 300 lines. The proposed home is a new `js/source-editor.js` loaded after `js/editor.js`, with styles beside the existing `textarea` rule in `css/app.css` or in a new `css/source-editor.css`.
- The mobile Source tab works the same way. Touch typing must not be blocked by the overlay (it takes no pointer events).

## Non-goals

Folding, find and replace, autocomplete, multiple cursors, bracket matching, and validation or linting.

## Left to the builder

The exact token color assignments, the gutter width and style, whether highlighting is incremental or a full re-highlight on each `input` (a full pass is fine at typical Diagram sizes), and how the overlay syncs scroll position.

## Verification

- Existing Playwright suites pass unchanged.
- New spec: Tab, Shift+Tab on a multi-line selection, auto-indent after `{`, Esc then Tab leaves the pane, Cmd/Ctrl+Z undoes a Tab insert, the gutter line count matches the Source lines, and an invalid Source marks the reported line in the gutter.
- Manual check in Chromium and Safari: overlay alignment at the end of long lines, after horizontal scroll, and with the mobile tab layout.
