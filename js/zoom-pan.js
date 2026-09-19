// Preview zoom (buttons, Ctrl/Cmd+wheel) and drag/wheel pan.
// Runtime calls: fitPresentationSvg(), clampPresentationZoom()
// (presentation/mode.js).

let zoomLevel = 1;
const zoomLevelEl = document.getElementById("zoom-level");
function applyZoom() {
  const svg = previewEl.querySelector("svg");
  if (svg) {
    // cache the natural (unzoomed, container-fit) size once per rendered svg
    if (!svg.dataset.baseWidth) {
      // measure while still constrained by max-width:100%, so 100% zoom == fit-to-pane
      const rect = svg.getBoundingClientRect();
      // a hidden preview pane (single-pane layout on the Source tab) measures 0x0;
      // skip caching so the ResizeObserver below can measure once it is shown
      if (rect.width && rect.height) {
        svg.dataset.baseWidth = rect.width;
        svg.dataset.baseHeight = rect.height;
        svg.style.maxWidth = "none";
      }
    }
    if (svg.dataset.baseWidth) {
      svg.style.width = (parseFloat(svg.dataset.baseWidth) * zoomLevel) + "px";
      svg.style.height = (parseFloat(svg.dataset.baseHeight) * zoomLevel) + "px";
    }
  }
  previewEl.classList.toggle("zoomed", zoomLevel !== 1);
  zoomLevelEl.textContent = Math.round(zoomLevel * 100) + "%";
  clampPan();
}
// Measure a diagram that rendered while the preview pane was hidden as soon as
// the pane gets a real size (tab switch, or widening past the breakpoint).
new ResizeObserver(() => {
  const svg = previewEl.querySelector("svg");
  if (svg && !svg.dataset.baseWidth) {
    applyZoom();
    fitPresentationSvg();
  }
}).observe(previewWrapEl);

document.getElementById("zoom-in").addEventListener("click", () => {
  zoomLevel = Math.min(3, +(zoomLevel + 0.15).toFixed(2));
  applyZoom();
});
document.getElementById("zoom-out").addEventListener("click", () => {
  zoomLevel = Math.max(0.25, +(zoomLevel - 0.15).toFixed(2));
  applyZoom();
});
document.getElementById("zoom-reset").addEventListener("click", () => {
  zoomLevel = 1;
  resetPan();
  applyZoom();
});
previewWrapEl.addEventListener("wheel", (e) => {
  if (presenting) {
    // Issue #6: Ctrl/Cmd+wheel (incl. trackpad pinch) zooms relative to the
    // presentation fit size; a plain wheel pans, but only once the diagram
    // overflows the viewport (`.can-pan`, kept in sync by fitPresentationSvg).
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      presentationZoom = clampPresentationZoom(presentationZoom + (e.deltaY < 0 ? 0.1 : -0.1));
      fitPresentationSvg();
    } else if (previewWrapEl.classList.contains("can-pan")) {
      panBy(-e.deltaX, -e.deltaY);
    }
    return;
  }
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    zoomLevel = Math.min(3, Math.max(0.25, +(zoomLevel + (e.deltaY < 0 ? 0.1 : -0.1)).toFixed(2)));
    applyZoom();
    return;
  }
  // the pane clips rather than scrolls, so the wheel pans the diagram instead
  panBy(-e.deltaX, -e.deltaY);
}, { passive: false });

// Drag-to-pan. The pane clips instead of scrolling, and the diagram is moved by
// translating #preview (never the <svg> itself — exports read the svg's inline
// width/height and its own box, which a translate on the parent leaves alone).
// Panning is free in both axes rather than bounded by overflow, so a tall,
// narrow diagram still moves left/right; clampPan() only stops it from being
// dragged completely out of sight.
const PAN_KEEP_VISIBLE = 60;
let panX = 0, panY = 0;
// Issue #6: while presenting, a primary-button press only becomes a drag
// (pan) once movement exceeds this threshold; below it, the gesture is a
// click (pin/unpin, issue #3). `dragSuppressClick` is set once a gesture
// crosses the threshold so the click that follows a drag is swallowed by
// onHighlightClick instead of pinning/unpinning.
const PAN_DRAG_THRESHOLD = 4;
let dragSuppressClick = false;

function applyPan() {
  previewEl.style.transform = (panX || panY) ? "translate(" + panX + "px," + panY + "px)" : "";
}
function clampPan() {
  const svg = previewEl.querySelector("svg");
  if (!svg) return;
  const wrap = previewWrapEl.getBoundingClientRect();
  const box = svg.getBoundingClientRect(); // already reflects the current pan
  let dx = 0, dy = 0;
  if (box.right < wrap.left + PAN_KEEP_VISIBLE) dx = wrap.left + PAN_KEEP_VISIBLE - box.right;
  else if (box.left > wrap.right - PAN_KEEP_VISIBLE) dx = wrap.right - PAN_KEEP_VISIBLE - box.left;
  if (box.bottom < wrap.top + PAN_KEEP_VISIBLE) dy = wrap.top + PAN_KEEP_VISIBLE - box.bottom;
  else if (box.top > wrap.bottom - PAN_KEEP_VISIBLE) dy = wrap.bottom - PAN_KEEP_VISIBLE - box.top;
  if (dx || dy) {
    panX += dx;
    panY += dy;
    applyPan();
  }
}
function resetPan() {
  panX = panY = 0;
  applyPan();
}
function panBy(dx, dy) {
  panX += dx;
  panY += dy;
  applyPan();
  clampPan();
}

previewWrapEl.addEventListener("pointerdown", (e) => {
  // left button only, and never steal a click meant for selecting text/links
  if (e.button !== 0) return;
  // Issue #7: never start a pan from the toolbar (exit control + tool
  // buttons) — they must stay clickable even when the diagram overflows.
  if (presenting && e.target.closest && e.target.closest("#presentation-toolbar")) return;
  // Issue #7: laser mode never pans, drag or otherwise.
  if (presenting && presentationTool === "laser") return;
  // Issue #6: while presenting, drag-to-pan is only active once the zoomed
  // diagram overflows the viewport (`.can-pan`); otherwise leave the event
  // alone so the normal click (pin/unpin) fires unimpeded.
  if (presenting && !previewWrapEl.classList.contains("can-pan")) return;
  e.preventDefault();
  const startX = e.clientX, startY = e.clientY;
  let lastX = startX, lastY = startY;
  // Outside presentation mode there's no click-to-pin to protect, so panning
  // starts immediately, as before. While presenting, wait for movement past
  // PAN_DRAG_THRESHOLD before treating this as a drag (spec: press+move
  // beyond ~4px = drag, below it = click).
  let dragging = !presenting;
  previewWrapEl.setPointerCapture(e.pointerId);
  if (dragging) previewWrapEl.classList.add("panning");
  const onMove = (moveEvent) => {
    if (!dragging) {
      const dx = moveEvent.clientX - startX, dy = moveEvent.clientY - startY;
      if (Math.hypot(dx, dy) < PAN_DRAG_THRESHOLD) return;
      dragging = true;
      dragSuppressClick = true;
      previewWrapEl.classList.add("panning");
    }
    panBy(moveEvent.clientX - lastX, moveEvent.clientY - lastY);
    lastX = moveEvent.clientX;
    lastY = moveEvent.clientY;
  };
  const onUp = (upEvent) => {
    previewWrapEl.classList.remove("panning");
    previewWrapEl.releasePointerCapture(e.pointerId);
    previewWrapEl.removeEventListener("pointermove", onMove);
    previewWrapEl.removeEventListener("pointerup", onUp);
    previewWrapEl.removeEventListener("pointercancel", onUp);
    // A cancelled gesture (e.g. the pointer left the window) never dispatches
    // a click, so nothing will consume dragSuppressClick — clear it here to
    // avoid it wrongly swallowing the next unrelated click.
    if (upEvent.type === "pointercancel") {
      dragSuppressClick = false;
    } else if (dragSuppressClick) {
      // A genuine pointerup can also fail to deliver a click to
      // onHighlightClick — e.g. the pointer went down on a node and came up
      // outside #preview (the click's target becomes the nearest common
      // ancestor of the down/up elements, which onHighlightClick isn't
      // listening on). Clear defensively on the next tick: if a click *does*
      // arrive first, it already consumed and cleared the flag, so this is a
      // harmless no-op; if no click arrives, this is what prevents the flag
      // from wrongly swallowing the next unrelated click.
      setTimeout(() => {
        dragSuppressClick = false;
      }, 0);
    }
  };
  previewWrapEl.addEventListener("pointermove", onMove);
  previewWrapEl.addEventListener("pointerup", onUp);
  previewWrapEl.addEventListener("pointercancel", onUp);
});

