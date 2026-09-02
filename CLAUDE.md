# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Offline Mermaid diagram renderer, single static HTML file (`index.html`) with `mermaid.min.js` vendored locally. No build step, no server, no network calls — everything (including autosave) stays in the browser. Deployed as a static page (GitHub Pages, per README).

Read `CONTEXT.md` (domain glossary) and `docs/adr/` (accepted decisions) before making changes — they cover terminology and constraints not repeated below.

## Running it

No build/install/test commands exist. Open `index.html` directly in a browser (or `open qack-maid/index.html`) to work on it — edit and reload.

## Architecture

Everything lives in `index.html:1-493` — markup, styles, and app logic inline, split by the standard doc regions:

- **Styles** (`index.html:8-163`): CSS custom properties (`--bg`, `--text`, etc.) define the palette; a `prefers-color-scheme: dark` media query overrides them for dark mode. `.preview-wrap[data-preview="light"|"dark"]` force-pins the preview pane's background independent of the page theme. No other JS-driven theming.
- **App script** (`index.html:218-490`): all logic in one `<script>` block, no modules/bundler.
  - `render()` — debounced (250ms) on textarea `input`; calls `mermaid.render()`, swaps in the resulting SVG, shows/hides `#error-banner` on failure. Also persists the raw source to `localStorage` (`STORAGE_KEY = "qack-maid:source"`) on every keystroke, even invalid ones.
  - Diagram theme (`THEME_KEY = "qack-maid:theme"`): `<select id="theme-select">` picks `auto` (follows OS light/dark), a built-in Mermaid theme (`default`/`dark`/`forest`/`neutral`), or `custom`. `applyMermaidTheme()` calls `mermaid.initialize()` accordingly; `custom` uses Mermaid's `base` theme with `themeVariables` from four color pickers (`#color-primary`/`#color-text`/`#color-line`/`#color-secondary`, shown only in custom mode via `#color-row.show`). Settings persist as one JSON blob (`{ mode, colors }`) and re-apply + re-render on every change.
  - Preview background (`PREVIEW_BG_KEY = "qack-maid:preview-bg"`): `<select id="preview-bg-select">` sets `auto`/`light`/`dark`, toggling `data-preview` on `.preview-wrap` to force a background independent of the diagram theme — lets a dark-themed diagram be checked against a light backdrop and vice versa.
  - `EXAMPLES` — object of built-in diagram snippets (sequence/er/flowchart/class/gantt/state) keyed by the `<select id="examples">` values; selecting one overwrites the textarea and re-renders.
  - `formatMermaid()` — naive reformatter: trims/drops blank lines, then indents by brace depth (`{`/`}`) at 4 spaces per level. Diagram-type line (first line) always stays at depth 0. Not a real Mermaid parser — don't expect it to handle every syntax.
  - Export buttons: both exports append a "Powered by QACK" attribution band below the diagram (`stampMetrics()` sizes it off the diagram width; `stampColor()` picks black or white from the preview background's luminance, since a pinned preview background can disagree with the page theme). SVG export clones the SVG, grows `viewBox`/`width`/`height` *and* the inline `style.height` Mermaid pins on the root, then appends `<text>` + a tinted `<image>`. PNG export rasterizes the SVG via an offscreen `<img>` + `<canvas>` at 2x scale, then draws the same stamp into the reserved band. Both exports have a **transparent background**: the PNG canvas is deliberately left unfilled, and `stripBackgroundForExport()` drops any background Mermaid or a theme painted on the SVG root (inline style, the root rule of the inlined stylesheet, a root-level `rect.background`) — background declarations elsewhere in that stylesheet are left alone, since they are what makes edge labels legible over lines. The stamp color still keys off the preview background, so a dark-theme diagram exports a light stamp. A stamp failure is caught and swallowed so the export still downloads.
  - QACK Skills logo: `QACK_LOGO_PNG` is a base64 PNG holding the glyph in its **alpha channel only** (flat black RGB), declared once in the script and pushed to CSS as `--qack-logo`. The footer badge paints it with a CSS mask over `var(--text)`; exports repaint it via `tintedLogoCanvas()` (`source-in` composite) because SVG `<mask>` alpha semantics vary across viewers. One asset therefore serves light and dark. Source PNGs live in `assets/` and are unreferenced by the app.
  - Favicon is an inline data-URI SVG emoji (`index.html:7`) — no external asset file.
  - On load: restores from `localStorage`, falling back to `EXAMPLES.flowchart` if nothing saved.

`mermaid.min.js` is a vendored third-party build — treat as opaque, don't hand-edit; replace wholesale to upgrade Mermaid versions.

## Constraints to preserve

- No fetch/XHR/WebSocket calls, no external asset references (fonts, CDNs) — the offline/privacy guarantee in the README is the point of this project.
- Keep it a single-file deployable app (`index.html` + vendored `mermaid.min.js`); avoid introducing a build step unless explicitly requested.

## Agent skills

### Issue tracker

GitHub Issues on `kampanat-rua-nxz-group/qack-maid`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` (glossary) and `docs/adr/` (3 ADRs: offline-only, single-file deployment, localStorage-only autosave) at repo root. See `docs/agents/domain.md`.
