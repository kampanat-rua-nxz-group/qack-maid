// Export menu, toast, clipboard, and the Download/Copy actions (EXPORT_ACTIONS).
// Copy PNG hands ClipboardItem the pending blob inside the click (Safari).

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- Export menu -----------------------------------------------------------
// The four export actions (download/copy x SVG/PNG) live behind one header
// button. Each returns the toast text to confirm with, or throws a message to
// show instead — the dispatcher below is the only place that touches the UI.

const exportMenuEl = document.getElementById("export-menu");
const exportTriggerEl = document.getElementById("export-trigger");
const toastEl = document.getElementById("toast");

let toastTimer;
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2000);
}

// Export always acts on Preview, so every action starts here. A failed render
// keeps the previous Preview, so the only way to have no SVG is a first render
// that never succeeded — the diagram has to be fixed before anything can export.
function requirePreview() {
  const svg = previewEl.querySelector("svg");
  if (!svg) throw new Error("Nothing to export — fix the diagram first");
  return svg;
}

// Clipboard writes need a secure context; fall back to the legacy copy path so
// the app still works when opened straight off the filesystem.
async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("Clipboard unavailable in this browser");
}

const EXPORT_ACTIONS = {
  "download-svg": async () => {
    requirePreview();
    const markup = await buildExportSvgMarkup();
    downloadBlob(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }), "diagram.svg");
    return "SVG downloaded";
  },
  "download-png": async () => {
    requirePreview();
    downloadBlob(await buildExportPngBlob(), "diagram.png");
    return "PNG downloaded";
  },
  "copy-svg": async () => {
    requirePreview();
    await copyText(await buildExportSvgMarkup());
    return "SVG markup copied";
  },
  "copy-png": async () => {
    requirePreview();
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      throw new Error("This browser can't copy images — use Download PNG");
    }
    // Hand ClipboardItem the pending blob rather than awaiting it first: Safari
    // only honors a clipboard write issued synchronously within the click.
    const item = new ClipboardItem({ "image/png": buildExportPngBlob() });
    await navigator.clipboard.write([item]);
    return "PNG copied";
  },
};

async function runExport(name) {
  try {
    showToast(await EXPORT_ACTIONS[name]());
  } catch (err) {
    showToast(err?.message || "Export failed");
  }
}

function setExportMenuOpen(open) {
  exportMenuEl.classList.toggle("open", open);
  exportTriggerEl.setAttribute("aria-expanded", String(open));
}

exportTriggerEl.addEventListener("click", () => {
  setExportMenuOpen(!exportMenuEl.classList.contains("open"));
});

exportMenuEl.querySelectorAll("[data-export]").forEach((btn) => {
  btn.addEventListener("click", () => {
    setExportMenuOpen(false);
    runExport(btn.dataset.export);
  });
});

document.addEventListener("click", (e) => {
  if (!exportMenuEl.contains(e.target)) setExportMenuOpen(false);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && exportMenuEl.classList.contains("open")) {
    setExportMenuOpen(false);
    exportTriggerEl.focus();
  }
});

document.getElementById("svg-shortcut").textContent =
  navigator.platform.toLowerCase().includes("mac") ? "\u2318S" : "Ctrl+S";

