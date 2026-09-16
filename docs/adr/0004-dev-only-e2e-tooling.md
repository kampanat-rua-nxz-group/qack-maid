# 0004. Dev-only Playwright e2e tooling is exempt from the single-file constraint

## Status

Accepted

## Context

ADR-0002 fixes the *deployed artifact* as `index.html` + vendored `mermaid.min.js`, with no `package.json`, bundler, or build step. Presentation mode (and future interactive features) is hard to verify by hand alone — fullscreen transitions, keyboard focus rules, and viewport-fit math all benefit from an automated e2e check. Playwright is the natural tool for that, but it needs its own `package.json` and `node_modules`.

## Decision

Add a `tests/` folder with its own `package.json` (`@playwright/test` as the only dependency) and Playwright config. It drives the app by serving the repo root with a zero-dependency static server (`python3 -m http.server`) on `http://localhost`, loading `index.html` as a browser would — no app-side test hooks, no build step for the app itself.

`tests/` is **dev tooling, not part of the app**:

- `index.html` never references it, so the app neither loads nor depends on it.
- It is still publicly reachable: GitHub Pages serves every committed file, so `tests/` sources (`package.json`, config, specs) are downloadable from the live site. This is acceptable because they contain no secrets and no app logic. `tests/node_modules` and Playwright output are gitignored and never published.
- It does not add a build step to the app — `index.html` still opens directly in a browser with no compilation.
- Its `package.json` scopes npm to the `tests/` directory only; the app root still has no `package.json`.

## Consequences

- Contributors who only edit `index.html` still need nothing installed. Running the e2e suite requires `cd tests && npm install && npx playwright install chromium`.
- ADR-0002 is **not** reversed: the app the site runs is unchanged. This ADR exists to make that boundary explicit so a future reviewer doesn't read `tests/package.json` as evidence the app itself gained a build step.
- Nothing secret may be committed under `tests/` (credentials, private URLs, real user data), since it is served publicly.
- Any future dev-only tooling (linters, formatters, other test runners) can follow the same pattern: its own manifest under a dedicated folder, gitignored output, no effect on the deployed files.
