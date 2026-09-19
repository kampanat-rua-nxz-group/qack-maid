// Render: Source -> Preview via mermaid.render(), error banner, jump-to-line.
// Runtime calls: applyZoom() (zoom-pan.js), updatePresentAvailability()
// (presentation/mode.js).

let renderSeq = 0;

async function render() {
  const code = sourceEl.value.trim();
  localStorage.setItem(STORAGE_KEY, sourceEl.value);
  if (!code) {
    previewEl.innerHTML = "";
    previewEl.classList.remove("has-error");
    errorEl.classList.remove("show", "jumpable");
    previewStatusEl.textContent = "";
    updatePresentAvailability();
    return;
  }
  previewStatusEl.textContent = "Rendering…";
  const id = "graph-" + (++renderSeq);
  try {
    const { svg } = await mermaid.render(id, code);
    previewEl.innerHTML = svg;
    previewEl.classList.remove("has-error");
    errorEl.classList.remove("show", "jumpable");
    applyZoom();
  } catch (err) {
    previewEl.classList.add("has-error");
    const message = (err && err.message) ? err.message : String(err);
    errorEl.textContent = message;
    errorEl.classList.add("show");
    const lineMatch = message.match(/line\s+(\d+)/i);
    if (lineMatch) {
      errorEl.dataset.line = lineMatch[1];
      errorEl.classList.add("jumpable");
      errorEl.title = "Click to jump to line " + lineMatch[1];
    } else {
      delete errorEl.dataset.line;
      errorEl.classList.remove("jumpable");
      errorEl.title = "";
    }
    // remove any stray error DOM mermaid injects outside #preview
    document.querySelectorAll('[id^="dqueue-"], [id^="d' + id + '"]').forEach(n => n.remove());
  } finally {
    previewStatusEl.textContent = "";
    updatePresentAvailability();
  }
}

function jumpToLine(lineNum) {
  const lines = sourceEl.value.split("\n");
  let charIndex = 0;
  for (let i = 0; i < lineNum - 1 && i < lines.length; i++) charIndex += lines[i].length + 1;
  const lineText = lines[lineNum - 1] || "";
  sourceEl.focus();
  sourceEl.setSelectionRange(charIndex, charIndex + lineText.length);
  const lineHeight = 13 * 1.5;
  sourceEl.scrollTop = Math.max(0, (lineNum - 1) * lineHeight - sourceEl.clientHeight / 2);
}

errorEl.addEventListener("click", () => {
  const line = errorEl.dataset.line;
  if (!line) return;
  jumpToLine(parseInt(line, 10));
});

