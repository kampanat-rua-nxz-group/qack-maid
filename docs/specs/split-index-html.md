# Split index.html into static feature files

Status: Implemented and validated — smoke and full Playwright suites pass. See [the implementation plan](../plans/split-index-html-implementation-plan.md).

## Goal

Make the app easier to navigate and edit by splitting the 2,222-line `index.html` into per-feature CSS and JS files. Behavior stays identical. The app still opens directly from disk (`file://`), needs no build step, makes no network calls, and deploys as static files to GitHub Pages.

## Non-goals

- No behavior, UI, or storage-key changes.
- No renames, deduplication, state restructuring, or merging of the three `document` `keydown` listeners. Record cleanup opportunities for the owner instead of applying them.
- No ES modules (`type="module"`): browsers block module loads over `file://`.
- No bundler, transpiler, or root `package.json`.

## File layout

```
index.html          markup + <link>/<script> tags only
css/
  app.css           tokens, header, menus, toast, panes, editor, Preview, zoom
  presentation.css  fullscreen, toolbar, spotlight, laser cursor rules
  chrome.css        mobile overrides, color row, footer and logo badge
js/
  shared.js         storage keys, DOM lookups and presentation state used by several features
  logo.js           QACK_LOGO_PNG data URI, loadQackLogo, tintedLogoCanvas
  theme.js          theme settings, applyMermaidTheme, syncThemeUI, Preview background
  examples.js       EXAMPLES map
  render.js         render(), error banner, jumpToLine
  editor.js         Autosave input, Format, Example select, mobile tabs, splitter
  zoom-pan.js       applyZoom, wheel zoom, drag-to-pan, pan clamping
  presentation/
    mode.js         enter/exit/teardown, fit, idle chrome, tool switch, shortcuts
    laser.js        laser canvas, dot, trail, Laser color
    spotlight.js    highlight map, spotlight, stepping
  export/
    stamp.js        stampMetrics, stampColor, SVG and canvas stamp drawing
    svg.js          buildExportSvgMarkup, background stripping, label flattening
    png.js          buildExportPngBlob
    menu.js         Export menu, toast, clipboard, runExport, EXPORT_ACTIONS
  main.js           restore saved Source, initial render()
```

`index.html` loads `mermaid.min.js`, then the JS files in the order listed above, using classic `<script src>` tags. Classic scripts share one global scope, so existing top-level `const`, `let`, and function declarations stay visible across files.

All files stay at or under 300 lines. The largest are `presentation/mode.js` (about 291 lines) and `presentation/spotlight.js` (about 249).

## Move rules

1. Function bodies and comments move byte-for-byte. The only additions are:
   - a header of two to four lines in each file, stating what the file owns and which globals it expects from earlier files;
   - the `<link>` and `<script>` tags in `index.html`.
2. Every file's load-time code depends only on files loaded before it. Listeners on the same target keep their original relative order. In particular, the three `document` `keydown` listeners stay in the order editor, presentation, Export menu. Load-time statements on independent targets may change relative order. For example, the splitter setup moves ahead of the zoom setup when it joins `editor.js`.
3. Top-level declarations shared by several features stay together, verbatim, in `shared.js`: the storage keys, the DOM lookup block, and the presentation state `let`s. Otherwise, a top-level declaration may move to the file that owns its feature only when its initializer has no load-time dependency: constants, `document.getElementById`/`querySelector` lookups, and `let x = null`-style state. Anything that calls app code at load time stays in order.
4. CSS rules keep their original relative order. The stylesheets load in original line order (`app.css`, `presentation.css`, `chrome.css`), so the cascade stays the same.

## Documentation changes

- Add `docs/adr/0005-split-static-files-no-build.md`. It records the decision that the app may span multiple static CSS/JS files loaded with classic tags, with no build step, no root `package.json`, and no ES modules because of `file://`. It also makes load order a documented contract.
- ADR-0002: set Status to "Superseded by ADR-0005". Leave the body unchanged.
- ADR-0004: add a one-line note that the single-file constraint it references is superseded by ADR-0005.
- `AGENTS.md`: replace "Keep application markup, styles, and logic in `index.html`" with the file layout pointer, the load-order rule, and "new code goes in the feature file that owns it".
- `README.md`: change "Single static HTML file" to describe static HTML/CSS/JS files with no build step.
- `CONTEXT.md`: no change.

## Verification

1. Before any move, raise the Playwright static server's listen backlog (see the plan: `python3 -m http.server`'s default backlog of 5 resets connections once pages load 18 files under parallel workers). Then add `tests/specs/smoke.spec.ts` and confirm it passes against the current single-file app:
   - Autosave: typed Source, including invalid input, survives a reload verbatim.
   - Choosing an Example replaces Source and renders a Preview.
   - Format reindents Source.
   - Changing the diagram theme and Preview background updates Preview.
   - Download SVG produces a file containing the attribution stamp.
   - Download PNG produces a non-empty file with a valid PNG signature. The stamp is not checked at pixel level.
   - Copy SVG places SVG markup on the clipboard, using Chromium clipboard permissions.
   - `index.html` opened via `file://` renders the default Example with no page errors.
2. Extract one feature file at a time. After each extraction, run the smoke spec plus the specs relevant to that feature.
3. At the end:
   - Run the full suite.
   - Confirm `git diff --color-moved` shows only moved code, file headers, and tags.
   - Confirm the console shows no errors on load.
4. Never edit existing specs to make them pass.
