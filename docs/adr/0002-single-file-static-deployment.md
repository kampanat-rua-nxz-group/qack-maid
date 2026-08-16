# 0002. Single-file static deployment, no build step

## Status

Accepted

## Context

The app is small enough to write directly as HTML/CSS/JS. A bundler (Vite, webpack, esbuild) would add module imports, minification, and a build/deploy pipeline.

## Decision

The entire app is `index.html` (markup, styles, and script inline) plus one vendored `mermaid.min.js`. No `package.json`, no bundler, no transpilation. Deployed as-is to GitHub Pages — the repo's static files are the shipped artifact.

## Consequences

- Editing is instant: open `index.html` in a browser, no `npm install`/build step.
- No module system — all app logic shares one global `<script>` scope. Keep it that way rather than introducing `<script type="module">` imports for a change that doesn't need them.
- Adding a real build step (bundler, TS, framework) is a reversal of this ADR — flag it explicitly if proposed, since it changes how every future contributor works with the repo.
