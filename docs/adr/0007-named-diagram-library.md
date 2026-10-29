# 0007. Named diagram library in localStorage

## Status

Accepted, amends [ADR-0003](0003-localstorage-only-autosave.md)

## Context

ADR-0003 kept one Source slot and said multi-document support needed a storage model beyond one flat key. Users now keep several diagrams and switch between them, so the single slot forces them to copy Source out to other apps. The model must stay browser-local (ADR-0001), work from `file://` (ADR-0005), and keep a keystroke write small. Two tabs can edit the same Diagram, and `localStorage` has no cross-process lock.

## Decision

Diagrams are stored as one index key plus one key per Diagram. All keys start with `qack-maid:`.

| Key | Value |
|-----|-------|
| `qack-maid:diagrams` | JSON `{ "items": [{ "id": string, "name": string, "updatedAt": number }] }` |
| `qack-maid:diagram:<id>` | JSON `{ "source": string, "rev": number, "tab": string }` |
| `qack-maid:open` | id of the Diagram open last |
| `qack-maid:sidebar-collapsed` | `"1"` when collapsed, absent otherwise |
| `qack-maid:source` | legacy key, also the fallback target in temporary mode |

Ids are `Date.now().toString(36)` plus six random base-36 characters. `crypto.randomUUID` needs a secure context and the app must run from `file://`.

Autosave. The editor's `input` handler writes Source verbatim on every keystroke, valid or not. `render()` writes nothing. Saving writes the index entry (the edit time) before the body, so a quota failure never leaves the tab's `rev` out of step with storage.

Concurrent edits. A body carries `rev` and `tab`, a writer id generated once per page load. A save proceeds only when the stored body's `(rev, tab)` match what this tab last read or wrote. Otherwise the edit forks into a new Diagram named by the duplicate-name rule, and the tab switches to it. `rev` alone cannot detect two tabs writing the same `rev`, because there is no lock between reading and writing. Bodies without `tab` (older data) are adopted when opened. Every structural write (new, duplicate, rename, delete) re-reads the index right before writing it, and no function caches the index.

Migration and temporary mode. A value under `qack-maid:source` is imported as an "Untitled" Diagram, verbatim. If the first-run or rebuild write fails, the app runs in temporary mode and autosave writes to `qack-maid:source`. On later loads `ensureLibrary` imports any leftover value as an extra "Untitled" Diagram whenever an index exists or was rebuilt, and removes the key only after that write succeeds.

Deleting the last Diagram writes the replacement "Untitled" before removing the old one, so the list is never empty.

Recovery. An unreadable index is rebuilt from the `qack-maid:diagram:*` keys as "Recovered" Diagrams. Recovery never deletes a diagram key.

## Consequences

- The shared per-origin quota (about 5 MB) is also used by any other app served from the same `<user>.github.io` origin. A full quota shows a toast and keeps the text in the Source pane.
- Each Diagram holds its latest Source only. There is no history and no undo across sessions.
- Data stays per browser and per device. Clearing site data or switching browsers loses the library.
- A stale tab never overwrites another tab's work, at the cost of an extra Diagram when two tabs edit the same one.
- Theme, Preview background, splitter, and laser color remain global settings.
- PNG downloads are named after the open Diagram in kebab case, for example `login-flow.png`.
