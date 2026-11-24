// Source keyboard handling: Tab indent, auto-indent on Enter, Esc escape.
// Load time needs: shared.js (sourceEl). Edits go through execCommand so the
// browser undo stack keeps them and `input` fires (autosave, view refresh).

const SOURCE_INDENT = "    ";
let tabEscapes = false;

function insertText(text) {
  document.execCommand("insertText", false, text);
}

// Replaces the whole lines touched by the selection and reselects them.
function rewriteLines(transform) {
  const v = sourceEl.value;
  let { selectionStart: s, selectionEnd: e } = sourceEl;
  const from = v.lastIndexOf("\n", s - 1) + 1;
  // A selection ending right after a newline does not include the next line.
  const probe = e > s && v[e - 1] === "\n" ? e - 1 : e;
  const nl = v.indexOf("\n", probe);
  const to = nl === -1 ? v.length : nl;
  const block = v.slice(from, to);
  const next = block.split("\n").map(transform).join("\n");
  if (next === block) return;
  sourceEl.setSelectionRange(from, to);
  insertText(next);
  if (s === e) {
    const delta = next.length - block.length;
    const caret = Math.max(from, s + delta);
    sourceEl.setSelectionRange(caret, caret);
  } else {
    sourceEl.setSelectionRange(from, from + next.length);
  }
}

function outdentLine(line) {
  const m = line.match(/^ {1,4}/);
  return m ? line.slice(m[0].length) : line;
}

function handleTab(e) {
  const multi = sourceEl.value.slice(sourceEl.selectionStart, sourceEl.selectionEnd).includes("\n");
  if (e.shiftKey) rewriteLines(outdentLine);
  else if (multi) rewriteLines((line) => SOURCE_INDENT + line);
  else insertText(SOURCE_INDENT);
}

function handleEnter() {
  const before = sourceEl.value.slice(0, sourceEl.selectionStart);
  const line = before.slice(before.lastIndexOf("\n") + 1);
  const indent = line.match(/^[ \t]*/)[0];
  insertText("\n" + indent + (line.trimEnd().endsWith("{") ? SOURCE_INDENT : ""));
}

sourceEl.addEventListener("keydown", (e) => {
  // Shift alone keeps the flag, so Esc then Shift+Tab still escapes backwards.
  // WebKit may fire compositionend first, leaving keyCode 229 on the commit key.
  if (e.isComposing || e.keyCode === 229 || e.metaKey || e.ctrlKey || e.altKey || e.key === "Shift") return;
  if (e.key === "Escape") {
    tabEscapes = true;
    return;
  }
  if (e.key === "Tab" && tabEscapes) return;
  tabEscapes = false;
  if (e.key === "Tab") {
    e.preventDefault();
    handleTab(e);
  } else if (e.key === "Enter") {
    e.preventDefault();
    handleEnter();
  }
});

sourceEl.addEventListener("blur", () => {
  tabEscapes = false;
});
