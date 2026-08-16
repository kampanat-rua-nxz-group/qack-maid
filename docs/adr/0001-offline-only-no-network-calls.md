# 0001. Offline-only, no network calls

## Status

Accepted

## Context

qack-maid is a Mermaid diagram editor. The obvious implementation loads Mermaid from a CDN and could optionally send diagram source to a backend for sharing, linting, or analytics.

## Decision

No fetch/XHR/WebSocket calls anywhere in the app, and no external asset references (fonts, CDN scripts). `mermaid.min.js` is vendored into the repo (`mermaid.min.js`) and loaded via a local `<script src="mermaid.min.js">` tag. Diagram source never leaves the browser tab.

## Consequences

- Works fully offline; nothing to configure, no API keys, no rate limits.
- Upgrading Mermaid means replacing the vendored file wholesale, not bumping a CDN version pin.
- Any future feature that would send data off-device (share links, cloud sync, telemetry) contradicts this ADR — flag it explicitly rather than adding quietly.
