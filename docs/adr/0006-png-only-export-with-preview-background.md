# 0006. PNG-only export, filled with the Preview background

## Status

Accepted. Amends the transparent-background export behavior recorded in `AGENTS.md`.

## Context

Exports were transparent SVG and PNG. A dark-theme diagram has light text, so a transparent export pasted or opened over a light backdrop was unreadable. A fixed white fill or JPEG (flat black fill) would fix one theme and break the other.

## Decision

- PNG is the only export format. The SVG download and copy actions are removed.
- The PNG canvas is filled with the Preview background before the diagram is drawn, so the export matches what is on screen. The stamp color already follows that background.
- Cmd/Ctrl+S downloads the PNG.
- Transparent export is no longer offered.

## Consequences

- Dark and light diagrams are both readable wherever the PNG is placed.
- Users who need vector output or a transparent background no longer have it from the app.
- `js/export/svg.js` is deleted; the label-flattening helpers PNG rasterization needs now live in `js/export/png.js`.
