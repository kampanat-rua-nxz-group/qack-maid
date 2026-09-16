# 0004. Dev-only Playwright e2e tooling is exempt from the single-file constraint

## Status

Accepted

## Context

ADR-0002 fixes the *deployed artifact* as `index.html` + vendored `mermaid.min.js`, with no `package.json`, bundler, or build step. Presentation mode (and future interactive features) is hard to verify by hand alone — fullscreen transitions, keyboard focus rules, and viewport-fit math all benefit from an automated e2e check. Playwright is the natural tool for that, but it needs its own `package.json` and `node_modules`.

## Decision

Add a `tests/` folder with its own `package.json` (`@playwright/test` as the only dependency) and Playwright config. It drives the app by serving the repo root with a zero-dependency static server (`python3 -m http.server`) over `file://`/`http://localhost`, exactly as a human tester would open `index.html` in a browser — no app-side test hooks, no build step for the app itself.

`tests/` is **dev tooling, not part of the shipped artifact**:

- It is never referenced by `index.html` and never deployed (GitHub Pages serves the repo's static files; `tests/node_modules` and Playwright output are gitignored).
- It does not add a build step to the app — `index.html` still opens directly in a browser with no compilation.
- Its `package.json` scopes npm to the `tests/` directory only; the app root still has no `package.json`.

## Consequences

- Contributors who only edit `index.html` still need nothing installed. Running the e2e suite requires `cd tests && npm install && npx playwright install chromium`.
- ADR-0002 is **not** reversed: the deployed artifact is unchanged. This ADR exists to make that boundary explicit so a future reviewer doesn't read `tests/package.json` as evidence the app itself gained a build step.
- Any future dev-only tooling (linters, formatters, other test runners) can follow the same pattern: its own manifest under a dedicated folder, gitignored output, no effect on the deployed files.
