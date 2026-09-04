# qack-maid

Offline Mermaid diagram renderer. Paste Mermaid source, get a live preview, export SVG/PNG. No server, no network calls, nothing leaves your browser.

## Live

**https://kampanat-rua-nxz-group.github.io/qack-maid/**

## What it does

- Single static HTML file, Mermaid.js vendored locally — works fully offline
- Live preview as you type, with an inline error banner on invalid syntax
- Diagram theme picker (auto/default/dark/forest/neutral) plus a custom mode with color pickers
- Independent preview background control (auto/light/dark) to check a diagram against either backdrop
- Format button normalizes indentation and strips blank lines
- Export the rendered diagram as SVG or PNG — download it as a file or copy it straight to the clipboard, all from one Export menu
- Autosaves your source and theme/background preferences to `localStorage` — nothing is sent anywhere
- Auto light/dark page theme via `prefers-color-scheme`
- Built-in examples: sequence, ER, flowchart, class, gantt, state diagrams

## Usage

Open [the live page](https://kampanat-rua-nxz-group.github.io/qack-maid/), or run it locally — it's a static file, no build step:

```bash
git clone https://github.com/kampanat-rua-nxz-group/qack-maid.git
open qack-maid/index.html
```

## Privacy

Diagram code stays in your browser tab. No fetch/XHR/WebSocket calls, no backend. Autosave uses `localStorage` only.
