# AGENTS.md

Shared instructions for agents working on qack-maid. `CLAUDE.md` imports this file.

## Project and constraints

qack-maid is an offline Mermaid diagram editor deployed as static files to GitHub Pages.

- `index.html` holds markup only. Styles live in `css/`, and logic lives in classic scripts under `js/`, one file per feature, loaded by `<script src>` tags after the local `mermaid.min.js` (see [ADR-0005](docs/adr/0005-split-static-files-no-build.md)). The app must work without a build step or application server, including when opened via `file://`, so never use `type="module"`.
- Script order in `index.html` is a contract: a file's load-time code may use only files loaded before it. Globals shared by several features belong in `js/shared.js`. New code goes in the feature file that owns it. Keep files at or under 300 lines.
- Keep diagram data in the browser. No application network calls, external assets, telemetry, or backend persistence.
- Treat `mermaid.min.js` as an opaque dependency; replace it wholesale when upgrading rather than editing it.
- Keep development tooling under `tests/`, separate from the deployed app's runtime dependencies. See [ADR-0004](docs/adr/0004-dev-only-e2e-tooling.md) for the testing exception to the single-file constraint.

## Before making changes

1. Read [CONTEXT.md](CONTEXT.md) and use its domain vocabulary and the [ADRs](docs/adr/) relevant to the change. Surface any conflict with an accepted decision explicitly.
2. For feature work, read the relevant specification in `docs/specs/` and implementation plan in `docs/plans/`. Check their status: planned behavior may not yet exist in code.
3. Inspect the relevant functions in `js/` (and markup in `index.html`) and existing tests. Use symbols rather than fixed line ranges to locate code.

## Running and validating

Open `index.html` directly in a browser for manual use; the app needs no dependency installation.

Browser tests use the separate Playwright harness in `tests/`. Its configuration starts a local static server and runs Chromium. For initial setup, run these commands from `tests/`:

```sh
npm install
npx playwright install chromium
```

Run a relevant spec first, then the full suite when the change affects shared behavior:

```sh
npm test -- specs/presentation-laser.spec.ts
npm test
```

These commands also run from `tests/`; select the spec appropriate to the change. Report what was checked and any validation limits. Documentation-only edits need link and diff checks, not browser tests.

## Behavior to preserve

### Editing and persistence

- Autosave preserves Source verbatim, including invalid input. Rendering is separate, so Preview may be stale or absent while Source changes.
- Keep persistence browser-local through `localStorage`.
- `formatMermaid()` is a simple indentation transform, not a parser or validator.
- Diagram theme and Preview background are independent settings.

### Exports and clipboard

When changing export, clipboard, or branding code, preserve these details:

- Export uses Preview. Download and Copy share the same artifact builders; delivery is their only difference.
- SVG and PNG exports have transparent backgrounds and include the attribution stamp. Remove diagram-level backgrounds while preserving backgrounds needed for readable labels.
- A stamp failure must not prevent export. Stamp color follows Preview background contrast, independently of the diagram theme.
- Copy PNG passes the pending blob promise to `ClipboardItem` during the click handler. Awaiting rasterization first loses Safari's clipboard user-activation window.
- Preserve Copy SVG's fallback for environments without the Clipboard API.
- The embedded logo stores its shape in the PNG alpha channel. Keep CSS masking for the footer and canvas tinting for exports; SVG mask behavior differs across viewers.

## Task-specific references

- For domain documentation work, keep vocabulary in `CONTEXT.md`, decisions in `docs/adr/`, specifications in `docs/specs/`, and implementation plans in `docs/plans/`. Record new terms when their meaning is settled.
