// Mermaid tokenizer for the Source colored layer. Pure: text in, HTML string out.
// Only colors; it never validates. Load time needs: nothing.

const DIAGRAM_TYPES = new Set([
  "flowchart", "graph", "sequenceDiagram", "classDiagram", "stateDiagram", "stateDiagram-v2",
  "erDiagram", "gantt", "pie", "journey", "mindmap", "timeline", "gitGraph", "quadrantChart",
  "requirementDiagram", "C4Context", "C4Container", "C4Component", "C4Dynamic", "C4Deployment",
  "sankey-beta", "xychart-beta", "block-beta", "packet-beta", "architecture-beta", "kanban",
  "radar-beta", "treemap-beta",
]);

const KEYWORDS = new Set([
  "subgraph", "end", "participant", "actor", "loop", "alt", "else", "opt", "par", "and", "rect",
  "critical", "option", "break", "note", "Note", "direction", "class", "classDef", "style",
  "linkStyle", "click", "state", "title", "section", "dateFormat", "axisFormat", "activate",
  "deactivate", "autonumber", "over", "of", "left", "right", "as", "box", "namespace", "link",
  "links", "create", "destroy", "commit", "branch", "checkout", "merge", "cherry-pick",
]);

// Ordered alternation: comment, string, arrow, label, identifier.
const TOKEN_RE = new RegExp(
  [
    "(%%.*)",
    '("[^"\\n]*"?)',
    "(<?(?:--\\s[^\\n\\[\\](){}\"]*?\\s(?:-->>|-->|---|--x|--o)|-->>|-\\.->|-->|--x|--o|---|==>|===|->>|-\\.-|->))",
    "(\\(\\([^\\n]*?\\)\\)|\\[[^\\]\\n]*\\]|\\([^)\\n]*\\)|\\{[^}\\n]*\\}|>[^\\]\\n]*\\])",
    // A hyphen belongs to a name only when a letter follows, so `A-->B` keeps its arrow.
    "([A-Za-z_]\\w*(?:-[A-Za-z]\\w*)*)",
  ].join("|"),
  "g"
);
const TOKEN_CLASS = [null, "tok-comment", "tok-string", "tok-arrow", "tok-label"];
const DIAGRAM_RE = /^(\s*)([A-Za-z][\w-]*)/;

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function span(cls, text) {
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

function highlightLine(line) {
  let out = "";
  let rest = line;
  const head = DIAGRAM_RE.exec(line);
  if (head && DIAGRAM_TYPES.has(head[2])) {
    out += escapeHtml(head[1]) + span("tok-diagram", head[2]);
    rest = line.slice(head[0].length);
  }
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(rest))) {
    let cls = null;
    for (let i = 1; i <= 4; i++) if (m[i] !== undefined) cls = TOKEN_CLASS[i];
    if (m[5] !== undefined && KEYWORDS.has(m[5])) cls = "tok-keyword";
    out += escapeHtml(rest.slice(last, m.index));
    out += cls ? span(cls, m[0]) : escapeHtml(m[0]);
    last = m.index + m[0].length;
  }
  return out + escapeHtml(rest.slice(last));
}

function highlightMermaid(text) {
  return text.split("\n").map(highlightLine).join("\n");
}
