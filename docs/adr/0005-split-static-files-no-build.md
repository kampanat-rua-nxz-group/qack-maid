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
