// Source editing: debounced Render, Cmd/Ctrl+Enter and Cmd/Ctrl+S shortcuts,
// mobile tabs, splitter, Example select, Format.
// Load time needs: shared.js. Runtime calls: render(), runExport().

let debounceTimer;
sourceEl.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(render, 250);
});

document.addEventListener("keydown", (e) => {
  if (presenting) return; // every app shortcut except arrows/Esc is suppressed while presenting
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  if (e.key === "Enter") {
    e.preventDefault();
    clearTimeout(debounceTimer);
    render();
  } else if (e.key.toLowerCase() === "s") {
    e.preventDefault();
    runExport("download-svg");
  }
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".pane").forEach((p) => p.classList.remove("active-pane"));
    document.querySelector('.pane[data-pane="' + btn.dataset.pane + '"]').classList.add("active-pane");
  });
});

const mainEl = document.querySelector("main");
const splitterEl = document.getElementById("splitter");
const sourcePaneEl = document.querySelector('.pane[data-pane="source"]');

function applySplit(pct) {
  mainEl.style.setProperty("--split", pct + "%");
}

const savedSplit = parseFloat(localStorage.getItem(SPLIT_KEY));
applySplit(Number.isFinite(savedSplit) ? savedSplit : 50);

splitterEl.addEventListener("mousedown", (e) => {
  e.preventDefault();
  splitterEl.classList.add("dragging");
  document.body.style.userSelect = "none";
  const onMove = (moveEvent) => {
    const rect = mainEl.getBoundingClientRect();
    let pct = ((moveEvent.clientX - rect.left) / rect.width) * 100;
    pct = Math.min(80, Math.max(20, pct));
    applySplit(pct);
  };
  const onUp = () => {
    splitterEl.classList.remove("dragging");
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    const pct = parseFloat(mainEl.style.getPropertyValue("--split"));
    if (Number.isFinite(pct)) localStorage.setItem(SPLIT_KEY, pct);
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
});

splitterEl.addEventListener("dblclick", () => {
  applySplit(50);
  localStorage.setItem(SPLIT_KEY, 50);
});

examplesEl.addEventListener("change", () => {
  const key = examplesEl.value;
  if (!key) return;
  sourceEl.value = EXAMPLES[key];
  examplesEl.value = "";
  render();
});

function formatMermaid(code) {
  const lines = code
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== ""); // drop all blank lines
  if (!lines.length) return "";

  const out = [lines[0]]; // diagram-type declaration stays at indent 0
  let depth = 1;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("}")) depth = Math.max(1, depth - 1);
    out.push("    ".repeat(depth) + line);
    if (line.endsWith("{")) depth += 1;
  }
  return out.join("\n");
}

document.getElementById("format").addEventListener("click", () => {
  sourceEl.value = formatMermaid(sourceEl.value);
  render();
});

