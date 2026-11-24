// Source colored layer, line-number gutter and scroll sync. The textarea stays
// the only editable element; this file only displays its text.
// Load time needs: shared.js (sourceEl), source/highlight.js.

const sourceHighlightEl = document.querySelector(".source-highlight code");
const sourcePreEl = document.querySelector(".source-highlight");
const sourceGutterLinesEl = document.querySelector(".source-gutter-lines");

let sourceErrorLine = null;

// Marks one gutter number red, or clears the mark when line is null. The mark
// is re-applied by refreshSourceView() until the next call.
function markSourceErrorLine(line) {
  sourceErrorLine = line;
  applySourceErrorMark();
}

function applySourceErrorMark() {
  const prev = sourceGutterLinesEl.querySelector(".source-line-no.error");
  if (prev) prev.classList.remove("error");
  if (sourceErrorLine === null) return;
  // Mermaid reports an unfinished last line as the line after the end; clamp.
  const kids = sourceGutterLinesEl.children;
  const el = kids[Math.min(sourceErrorLine, kids.length) - 1];
  if (el) el.classList.add("error");
}

function refreshSourceView() {
  const text = sourceEl.value;
  // A trailing newline needs a character after it, or the last line collapses.
  sourceHighlightEl.innerHTML = highlightMermaid(text) + (text.endsWith("\n") ? " " : "");
  const count = text.split("\n").length;
  let html = "";
  for (let i = 1; i <= count; i++) html += `<div class="source-line-no">${i}</div>`;
  sourceGutterLinesEl.innerHTML = html;
  applySourceErrorMark();
  syncSourceScroll();
}

function syncSourceScroll() {
  sourcePreEl.style.transform = `translate(${-sourceEl.scrollLeft}px, ${-sourceEl.scrollTop}px)`;
  sourceGutterLinesEl.style.transform = `translate(0, ${-sourceEl.scrollTop}px)`;
}

// Programmatic writes (session.js, Format) fire no input event.
(function installValueHook() {
  const proto = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  Object.defineProperty(sourceEl, "value", {
    configurable: true,
    get() { return proto.get.call(this); },
    set(v) { proto.set.call(this, v); refreshSourceView(); },
  });
})();

sourceEl.addEventListener("input", refreshSourceView);
sourceEl.addEventListener("scroll", syncSourceScroll);
refreshSourceView();
