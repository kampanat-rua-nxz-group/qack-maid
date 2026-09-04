# CONTEXT.md

Domain glossary for qack-maid. Use these terms as defined here; don't drift to synonyms.

## Terms

- **Source** — the raw Mermaid text a user types into the left pane (`textarea#source`). Persisted verbatim to `localStorage` under `qack-maid:source` on every keystroke, valid or not.
- **Preview** — the rendered SVG shown in the right pane (`#preview`), produced by feeding Source to `mermaid.render()`. Distinct from Source: Preview can be stale/absent (e.g. on a render error) while Source keeps updating.
- **Render** — the act of turning Source into Preview. Debounced 250ms after the last keystroke; not synchronous with typing.
- **Example** — one of the built-in named Mermaid snippets (`sequence`, `er`, `flowchart`, `class`, `gantt`, `state`) in the `EXAMPLES` map. Loading an Example overwrites Source.
- **Format** — the naive reindent-by-brace-depth transform applied to Source (`formatMermaid`). Not a Mermaid parser; don't call it "parsing" or "validation" — it doesn't check syntax.
- **Export** — turning the current Preview into a shareable artifact, either SVG (serialized markup) or PNG (rasterized via canvas at 2x). Export always acts on Preview, never on Source directly — if Preview is stale or missing (error state), Export has nothing to act on.
- **Download** / **Copy** — the two ways an Export is delivered: written to a file the browser saves, or placed on the system clipboard. Both are offered for both formats from the Export menu. They differ only in delivery — the SVG markup and PNG bytes are identical either way, attribution stamp included.
- **Autosave** — the continuous write of Source to `localStorage`. Not a save the user triggers; happens on every `input` event regardless of validity. "Save" alone is ambiguous here — prefer "Autosave" when meaning this mechanism.

## See also

- `docs/adr/` for decisions behind the offline/single-file/no-backend shape of this app.
- `docs/agents/domain.md` for how agent skills consume this file.
