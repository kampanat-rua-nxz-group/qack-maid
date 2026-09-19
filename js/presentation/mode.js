// Presentation mode: enter/exit/teardown, fit-to-viewport, idle chrome, tool
// switch, keyboard shortcuts. Its state lives in shared.js.
// Runtime calls: laser.js and spotlight.js setup/teardown.

function clampPresentationZoom(v) {
  return Math.min(3, Math.max(0.25, +v.toFixed(2)));
}

// --- Presentation mode -------------------------------------------------
// Fullscreens .preview-wrap (via the Fullscreen API, falling back to a CSS
// fixed-viewport overlay if the browser rejects the request) and fits the
// diagram to whatever viewport results. No highlighting/stepping here — see
// the presentation-mode spec for later slices.

// Idle-driven chrome: the exit control and OS cursor stay visible on mouse
// move, then fade after ~2s of no movement. One timer, reset on every move.
const PRESENTATION_IDLE_MS = 2000;
let presentationIdleTimer = null;

function showPresentationChrome() {
  previewWrapEl.classList.add("chrome-visible");
  previewWrapEl.classList.remove("idle");
}

function schedulePresentationIdle() {
  clearTimeout(presentationIdleTimer);
  presentationIdleTimer = setTimeout(() => {
    previewWrapEl.classList.remove("chrome-visible");
    previewWrapEl.classList.add("idle");
  }, PRESENTATION_IDLE_MS);
}

// Owner decision (issue #7, resolving the spec's open question): in Laser
// mode, moving over the diagram must not reveal the toolbar — only moving
// near/over the toolbar's own region does, after which it fades on the same
// ~2s idle timer as always. Pointer mode is unchanged (any move reveals).
const PRESENTATION_TOOLBAR_HOT_PAD = 24;
function pointNearPresentationToolbar(x, y) {
  const rect = presentationToolbarEl.getBoundingClientRect();
  if (!rect.width && !rect.height) return false;
  return (
    x >= rect.left - PRESENTATION_TOOLBAR_HOT_PAD &&
    x <= rect.right + PRESENTATION_TOOLBAR_HOT_PAD &&
    y >= rect.top - PRESENTATION_TOOLBAR_HOT_PAD &&
    y <= rect.bottom + PRESENTATION_TOOLBAR_HOT_PAD
  );
}

function handlePresentationPointerMove(e) {
  if (presentationTool === "laser") {
    handleLaserPointerMove(e);
    if (pointNearPresentationToolbar(e.clientX, e.clientY)) {
      showPresentationChrome();
      schedulePresentationIdle();
    }
    return;
  }
  showPresentationChrome();
  schedulePresentationIdle();
}

function setPresentationTool(tool) {
  if (!presenting || presentationTool === tool) return;
  presentationTool = tool;
  toolPointerEl.setAttribute("aria-pressed", String(tool === "pointer"));
  toolLaserEl.setAttribute("aria-pressed", String(tool === "laser"));
  previewWrapEl.classList.toggle("laser-active", tool === "laser");
  laserTrailPoints = [];
  laserDotPos = null;
  laserStrokeActive = false;
  // Clicking a toolbar button is interaction with the toolbar itself, so
  // chrome stays visible (then fades on the normal idle timer).
  showPresentationChrome();
  schedulePresentationIdle();
}

toolPointerEl.addEventListener("click", () => setPresentationTool("pointer"));
toolLaserEl.addEventListener("click", () => setPresentationTool("laser"));

function canPresent() {
  return !!previewEl.querySelector("svg") && !previewEl.classList.contains("has-error");
}

function updatePresentAvailability() {
  const ok = canPresent();
  presentBtn.disabled = !ok;
  presentBtn.title = ok ? "F present · Esc exit" : "Fix the error to present";
}

function setZoomControlsDisabled(disabled) {
  document.getElementById("zoom-in").disabled = disabled;
  document.getElementById("zoom-out").disabled = disabled;
  document.getElementById("zoom-reset").disabled = disabled;
}

// Fits the cached (aspect-correct) base size of the current svg against the
// current .preview-wrap box — the fullscreen viewport, not the pane width
// applyZoom() would otherwise use. Re-measures the fit base every call (so a
// resize refit re-derives it) and then applies `presentationZoom` on top, so
// 100% presentation zoom always means "fit", per issue #6.
function fitPresentationSvg() {
  if (!presenting) return;
  sizeLaserCanvas(); // issue #7: keep the laser overlay sized to the viewport on every refit
  const svg = previewEl.querySelector("svg");
  if (!svg) return;
  const baseW = parseFloat(svg.dataset.baseWidth);
  const baseH = parseFloat(svg.dataset.baseHeight);
  if (!baseW || !baseH) return;
  const PAD = 32; // matches #preview's 16px horizontal/vertical padding
  const availW = Math.max(1, previewWrapEl.clientWidth - PAD);
  const availH = Math.max(1, previewWrapEl.clientHeight - PAD);
  const fitScale = Math.min(availW / baseW, availH / baseH);
  const scale = fitScale * presentationZoom;
  const width = baseW * scale;
  const height = baseH * scale;
  svg.style.width = width + "px";
  svg.style.height = height + "px";
  // Drag-to-pan (and wheel-pan) only kicks in once the zoomed diagram
  // overflows the viewport it's fit against.
  previewWrapEl.classList.toggle("can-pan", width > availW || height > availH);
  clampPan();
}

// Single source of truth for leaving presentation mode, regardless of how it
// was triggered (button/Esc, or the browser's own fullscreen-exit UI, which
// may not deliver a keydown at all).
function teardownPresentation() {
  if (!presenting) return;
  presenting = false;
  teardownHighlight();
  removeLaserCanvas();
  presentationTool = "pointer";
  toolPointerEl.setAttribute("aria-pressed", "true");
  toolLaserEl.setAttribute("aria-pressed", "false");
  previewWrapEl.classList.remove("laser-active");
  window.removeEventListener("resize", fitPresentationSvg);
  previewWrapEl.removeEventListener("pointermove", handlePresentationPointerMove);
  previewWrapEl.removeEventListener("pointerdown", handleLaserPointerDown);
  previewWrapEl.removeEventListener("pointerleave", handleLaserAreaLeave);
  window.removeEventListener("pointerup", handleLaserPointerUp);
  window.removeEventListener("pointercancel", interruptLaserGesture);
  window.removeEventListener("blur", interruptLaserGesture);
  clearTimeout(presentationIdleTimer);
  presentationIdleTimer = null;
  previewWrapEl.classList.remove("presenting", "chrome-visible", "idle", "can-pan", "panning");
  // Issue #6 leak fix: a drag released outside #preview (see onUp above)
  // otherwise leaves this stuck across sessions — never let it survive into
  // the next presentation.
  dragSuppressClick = false;
  presentationZoom = 1;
  const svg = previewEl.querySelector("svg");
  if (svg) {
    // Clear the sizing this feature applied so applyZoom() re-measures a
    // fresh pane-relative base size instead of reusing presentation-time
    // (fullscreen-relative) numbers.
    svg.style.width = "";
    svg.style.height = "";
    svg.style.maxWidth = "";
    delete svg.dataset.baseWidth;
    delete svg.dataset.baseHeight;
  }
  if (savedZoomLevel != null) {
    zoomLevel = savedZoomLevel;
    savedZoomLevel = null;
  }
  if (savedPan) {
    panX = savedPan.x;
    panY = savedPan.y;
    savedPan = null;
    applyPan();
  }
  if (savedTabPane) {
    document.querySelector('.tab-btn[data-pane="' + savedTabPane + '"]').click();
    savedTabPane = null;
  }
  setZoomControlsDisabled(false);
  applyZoom();
  updatePresentAvailability();
}

async function enterPresentation() {
  if (presenting || !canPresent()) return;
  presenting = true;
  savedZoomLevel = zoomLevel;
  savedPan = { x: panX, y: panY };
  resetPan();
  presentationZoom = 1; // starts at fit, independent of the saved zoomLevel
  // Blur so keystrokes can't reach the hidden textarea and trigger a render
  // (which would replace the svg mid-presentation).
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  // In the single-pane layout the Preview pane may be display:none, which would
  // hide the fixed overlay too; show it, and remember the tab to restore on exit.
  const previewPane = document.querySelector('.pane[data-pane="preview"]');
  const activeTab = document.querySelector(".tab-btn.active");
  if (activeTab && getComputedStyle(previewPane).display === "none") {
    savedTabPane = activeTab.dataset.pane;
    document.querySelector('.tab-btn[data-pane="preview"]').click();
    applyZoom(); // measure now that the pane is visible
  }
  previewWrapEl.classList.add("presenting");
  // Issue #7: Pointer is always the active tool on entry (AC 14).
  presentationTool = "pointer";
  toolPointerEl.setAttribute("aria-pressed", "true");
  toolLaserEl.setAttribute("aria-pressed", "false");
  previewWrapEl.classList.remove("laser-active");
  createLaserCanvas();
  setZoomControlsDisabled(true);
  fitPresentationSvg();
  setupHighlight();
  window.addEventListener("resize", fitPresentationSvg);
  previewWrapEl.addEventListener("pointermove", handlePresentationPointerMove);
  previewWrapEl.addEventListener("pointerdown", handleLaserPointerDown);
  previewWrapEl.addEventListener("pointerleave", handleLaserAreaLeave);
  window.addEventListener("pointerup", handleLaserPointerUp);
  window.addEventListener("pointercancel", interruptLaserGesture);
  window.addEventListener("blur", interruptLaserGesture);
  showPresentationChrome();
  schedulePresentationIdle();
  if (typeof previewWrapEl.requestFullscreen === "function") {
    try {
      await previewWrapEl.requestFullscreen();
      fitPresentationSvg(); // viewport can settle slightly differently once native fullscreen engages
    } catch {
      // Rejected (e.g. headless/blocked) — the CSS overlay applied above is the fallback.
    }
  }
  updatePresentAvailability();
}

function exitPresentation() {
  if (!presenting) return;
  if (document.fullscreenElement === previewWrapEl) {
    // Teardown happens in the fullscreenchange handler below once the
    // browser actually leaves fullscreen.
    document.exitFullscreen().catch(() => {});
  } else {
    teardownPresentation();
  }
}

document.addEventListener("fullscreenchange", () => {
  if (presenting && document.fullscreenElement !== previewWrapEl) {
    teardownPresentation();
  }
});

presentBtn.addEventListener("click", () => enterPresentation());
presentationExitEl.addEventListener("click", () => exitPresentation());

document.addEventListener("keydown", (e) => {
  if (presenting) {
    // Let the native color picker handle its own keys (including Escape to
    // close the popup) without stepping the diagram or exiting presentation.
    if (document.activeElement === laserColorEl) return;
    if (e.key === "Escape") {
      e.preventDefault();
      // Esc while pinned unpins only; Esc with nothing pinned exits (owner
      // decision 2026-09-16, presentation-mode spec).
      if (pinnedHighlight) {
        unpinHighlight();
      } else {
        exitPresentation();
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault(); // don't let the arrow scroll the preview
      stepHighlight(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      stepHighlight(-1);
    } else if (e.key === "+" || e.key === "=") {
      // Issue #6: zoom keys, added to the presenting keydown allow-list
      // alongside arrows/Esc (everything else stays suppressed, AC 9).
      e.preventDefault();
      presentationZoom = clampPresentationZoom(presentationZoom + 0.15);
      fitPresentationSvg();
    } else if (e.key === "-") {
      e.preventDefault();
      presentationZoom = clampPresentationZoom(presentationZoom - 0.15);
      fitPresentationSvg();
    } else if (e.key === "0") {
      e.preventDefault();
      presentationZoom = 1;
      resetPan();
      fitPresentationSvg();
    }
    return;
  }
  if (e.key.toLowerCase() !== "f" || e.metaKey || e.ctrlKey || e.altKey) return;
  const active = document.activeElement;
  const tag = active && active.tagName ? active.tagName.toLowerCase() : "";
  if (tag === "textarea" || tag === "input" || tag === "select") return;
  e.preventDefault();
  enterPresentation();
});

