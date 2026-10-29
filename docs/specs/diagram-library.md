# Named diagram library

Status: Implemented. See [the implementation plan](../plans/diagram-library-implementation-plan.md).

## Why

Users work on several diagrams and switch between them. The app has one Source slot (`qack-maid:source`), so today they copy Source out to Notes or `.mmd` files and paste it back when they want to edit a different diagram. That is tedious, and typing into the slot before copying the old content out loses it.

The fix is a list of named diagrams kept in the browser. Each one holds only its latest Source. Opening a diagram shows it exactly as it was left.

## Goals

- Keep many named diagrams in `localStorage`, browser-local only.
- Switch between them in one click, with no save step and no "unsaved changes" prompt.
- Create, duplicate, rename and delete diagrams.
- Keep the existing user's Source when they first load the new version.

## Non-goals

- Undo across sessions, version history, or snapshots. Each diagram stores its current Source only. Edits overwrite it.
- Sync across devices or browsers, accounts, backend storage.
- Export or import of the whole library as a backup file. A likely follow-up, not in this change.
- A cap on the number of diagrams.

## Anti-goals

These would make the feature a failure even if it works:

- Losing a diagram's Source silently, for example when storage is full or on first load after the upgrade.
- Any network call, external asset or telemetry (ADR-0001).
- A save button or a prompt when switching. Autosave stays the only persistence mechanism.

## Behavior

### Diagram model

A **Diagram** has a unique name, its Source, and a last-edited time. Autosave writes the open Diagram's Source on every `input` event, valid or not. Format counts as an edit.

Today the write sits inside `render()` (`js/render.js`), which also runs on load, Format, Cmd+Enter and theme changes, so any of those would rewrite Source and bump the edit time. Move the write out of `render()` into the Source `input` handler, written immediately rather than debounced, and have Format write explicitly. `render()` becomes write-free. Only real edits change the last-edited time, and switching Diagrams right after typing cannot drop the last keystrokes. *(Design call.)*

On load, the app opens the Diagram that was open last.

### Sidebar (desktop)

- A narrow column on the left of the Source pane lists every Diagram, most recently edited first. Each row shows the name and a relative edit time ("just now", "2h ago", "3 days ago").
- The open Diagram's row is highlighted.
- Clicking a row opens that Diagram. Source and Preview switch to it immediately.
- A "+ New" control sits at the top of the list.
- Duplicate, Rename and Delete live in a small per-row menu (a ⋯ button). *(Design call: per-row menu. The exact trigger, hover or always visible, is left to the builder.)*
- The sidebar can be collapsed. Its collapsed state persists in `localStorage`, like the splitter position. *(Design call.)*
- The sidebar is hidden in presentation mode. *(Design call.)*

### Mobile

- The existing tab bar gains a third tab, "Diagrams", next to Source and Preview. It shows the same list and actions.
- Tapping a Diagram opens it and switches to the Source tab.

### Actions

- **New** creates a Diagram named "Untitled" with empty Source and opens it.
- **Duplicate** copies the Diagram's Source into a new Diagram with the same name, which the duplicate-name rule then suffixes. The copy opens.
- **Rename** edits the name in place. An empty or whitespace-only name reverts to the previous name. Renaming does not change the last-edited time. *(Design call.)*
- **Delete** asks for confirmation, then removes the Diagram. Deletion is permanent. If the deleted Diagram was open, the next most recent one opens. Deleting the last Diagram creates a fresh empty "Untitled" so there is always one to edit. *(Design call.)*

### Duplicate-name rule (user's decision)

Names are unique. When a new, duplicated or renamed Diagram would take a name already in use, append the local date and time, `YYYY-MM-DD HH:mm`. Example: a second "Login flow" becomes "Login flow 2026-10-29 14:32". If that still collides, append seconds (`HH:mm:ss`). Names compare after trimming and case-insensitively. *(Design call: trim and case rule.)*

### First run and upgrade

- **New user** (nothing in storage): create one Diagram named "Untitled" whose Source is the starter flowchart (`STARTER_SOURCE` in `js/diagrams/store.js`).
- **Existing user** (a value under `qack-maid:source`): migrate it into a Diagram named "Untitled", verbatim, including invalid or empty Source. Migration runs once. Remove the old key only after the new data is written. *(Design call: name and key removal.)*

### Several tabs open

Same Diagram edited in two tabs *(user's decision)*: never overwrite. When a tab is about to autosave a Diagram whose stored Source another tab has changed since this tab last read or wrote it, save this tab's text as a new Diagram instead, named by the duplicate-name rule ("Login flow" → "Login flow 2026-10-29 14:32"), and switch this tab to the new Diagram. The other tab's version stays under the original name. A short message tells the user a copy was made.

Other cross-tab cases *(design call)*:

- New, Duplicate, Rename and Delete re-read the stored list right before writing, so a stale tab never writes an old list over a newer one.
- Each tab listens for `storage` events and refreshes its list. If the Diagram it has open was deleted in another tab and this tab has no unsaved edit, it opens the next most recent Diagram. If it does have an edit, the next autosave saves it as a new Diagram under the deleted name.

### Storage full

There is no count limit. `localStorage` holds about 5 MB per origin, shared with any other app served from the same `<user>.github.io` origin. A typical Diagram is 1 to 5 KB.

When a write fails (`QuotaExceededError`), show a message telling the user storage is full and to delete Diagrams they no longer need. The text in the Source pane stays as typed. The next edit retries the write. Never clear or truncate Source because a write failed. The existing `#toast` element is a candidate for the message. *(Left to builder.)*

Writes other than typing *(design call)*:

- **New, Duplicate, Rename**: if the write fails, do not apply the action. Show the storage-full message and leave the list and the open Diagram as they were. The in-memory list never shows a Diagram that is not stored.
- **Delete** frees space, so it is not expected to fail; if it does, show the message and keep the row.
- **Migration**: if writing the migrated Diagram fails, keep `qack-maid:source` untouched, open its text as a temporary Diagram, show the message, and retry the migration on the next load.

All keys keep the existing `qack-maid:` prefix.

### Export file name (user's decision)

Download PNG names the file after the open Diagram in kebab case: "Login flow" → `login-flow.png`. Lowercase, runs of characters other than letters and digits become one `-`, leading and trailing `-` are trimmed. Non-Latin letters such as Thai are kept. If nothing remains, use `diagram.png`. *(Design call: Unicode handling and fallback.)* Cmd/Ctrl+S uses the same name. Copy PNG is unchanged.

### Example dropdown removed (user's decision)

Remove the Example `<select>` from the header and the other five examples. Keep only the flowchart text, used as the new-user starter Diagram. Tests that load Source through the Example dropdown (`smoke`, `presentation-sequence`, `presentation-mode`, `presentation-stepping`) must set Source another way.

## Constraints

- Classic scripts, no build step, works from `file://` (ADR-0005). New feature code goes in its own file(s) under `js/`, at or under 300 lines each, with script order in `index.html` respected.
- Browser-local only (ADR-0001, ADR-0003).
- Autosave preserves Source verbatim; Render stays separate and debounced.
- Existing settings (theme, Preview background, splitter, laser color) stay global, not per Diagram.

## Documentation to update

- **New ADR (0007)**: ADR-0003 says multi-document support is out of scope under it and needs a storage model beyond one flat key. This change is that model. Write ADR-0007 recording the named-Diagram library and the storage layout chosen, and mark it as amending ADR-0003.
- **CONTEXT.md**: add **Diagram** and **Diagram list** (the sidebar). Update **Source** and **Autosave**, which name the `qack-maid:source` key. Remove **Example**.

## Left to the builder

- Storage layout. One suggestion is an index key (ids, names, edit times, open id) plus one key per Diagram's Source, so a keystroke writes only that Diagram's Source and its edit time. Any layout that keeps writes per keystroke small and survives a failed write without losing data is fine.
- Sidebar width, styling, collapse control, relative-time wording, and the delete confirmation's form.
- Whether the sidebar is resizable.

## Verification

- Create, switch, duplicate, rename and delete Diagrams; each keeps its own Source across reloads.
- The list orders by last edit; opening a Diagram without editing does not reorder it.
- Duplicate names get a timestamp suffix on New, Duplicate and Rename.
- Reload opens the Diagram open last.
- An existing `qack-maid:source` value, including invalid Mermaid, becomes one Diagram unchanged; the migration does not run twice.
- A new user sees one "Untitled" flowchart Diagram.
- Deleting the last Diagram leaves one empty "Untitled".
- A simulated `QuotaExceededError` shows the storage-full message and leaves Source text intact.
- Mobile: the Diagrams tab lists Diagrams; tapping one opens it in the Source tab.
- Download PNG and Cmd/Ctrl+S save `<kebab-name>.png`.
- Two tabs editing the same Diagram: the second tab's edit becomes "<name> <timestamp>"; the first tab's Source is unchanged.
- A Diagram created in one tab appears in the other tab's list, and a rename in a stale tab does not remove it.
- Changing theme or Preview background does not reorder the list.
- The Example dropdown is gone; existing export, presentation and theme suites pass.
