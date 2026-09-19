// Laser pointer: overlay canvas, persistent dot, fading trail, Laser color.
// Load time needs: shared.js. Runtime calls: presentation/mode.js chrome timers.

// --- Laser trail (issue #7) ---------------------------------------------
// A separate <canvas> overlay above the preview, `pointer-events: none`, so
// it never interferes with the SVG/hit-areas and never appears in exports
// (AC 10, 15). Created on presentation enter, sized to the fullscreen
// viewport (resized on every refit via fitPresentationSvg), and removed on
// teardown along with its listeners and animation frame.
//
// The persistent dot (`laserDotPos`) and the fading trail (`laserTrailPoints`)
// are tracked separately: mouse movement alone only ever moves the dot; a
// trail sample is appended only while a left-button stroke is active. See
// docs/specs/laser-pointer.md for the full behavior reference.
const LASER_TRAIL_FADE_MS = 950; // ~1s, per spec assumption
const LASER_COLOR_KEY = "qack-maid:laser-color";
const LASER_COLOR_DEFAULT = "#dc2626";

function isValidHexColor(v) {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}
function hexToRgbTriplet(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
function loadLaserColor() {
  try {
    const raw = localStorage.getItem(LASER_COLOR_KEY);
    if (isValidHexColor(raw)) return raw;
  } catch {}
  return LASER_COLOR_DEFAULT;
}
function saveLaserColor(hex) {
  try {
    localStorage.setItem(LASER_COLOR_KEY, hex);
  } catch {}
}
let laserColor = loadLaserColor();
let laserColorRgb = hexToRgbTriplet(laserColor);
laserColorEl.value = laserColor;
laserColorEl.addEventListener("input", () => {
  const v = laserColorEl.value;
  if (!isValidHexColor(v)) return;
  laserColor = v;
  laserColorRgb = hexToRgbTriplet(v);
  saveLaserColor(v);
});
// Keep the toolbar visible (and its idle timer paused) while the native
// picker is being used, per the presentation-mode idle behavior.
laserColorEl.addEventListener("focus", () => {
  if (!presenting) return;
  showPresentationChrome();
  clearTimeout(presentationIdleTimer);
});
laserColorEl.addEventListener("blur", () => {
  if (!presenting) return;
  schedulePresentationIdle();
});

let laserCanvasEl = null;
let laserCanvasCtx = null;
let laserTrailPoints = []; // { x, y, t } in viewport (client) coordinates
let laserDotPos = null; // { x, y } in viewport coordinates; null hides the dot
let laserStrokeActive = false; // true only between an eligible left-button press and its end
let laserAnimHandle = null;

function sizeLaserCanvas() {
  if (!laserCanvasEl) return;
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  laserCanvasEl.width = Math.round(w * dpr);
  laserCanvasEl.height = Math.round(h * dpr);
  laserCanvasEl.style.width = w + "px";
  laserCanvasEl.style.height = h + "px";
  laserCanvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawLaserFrame() {
  if (!laserCanvasCtx) return;
  const now = performance.now();
  laserCanvasCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  laserTrailPoints = laserTrailPoints.filter((p) => now - p.t < LASER_TRAIL_FADE_MS);
  // Fading trail first, then the current dot on top at full opacity, so the
  // dot never gets visually buried under a fresh trail sample at the same spot.
  laserTrailPoints.forEach((p) => {
    const age = now - p.t;
    const alpha = Math.max(0, 1 - age / LASER_TRAIL_FADE_MS);
    laserCanvasCtx.beginPath();
    laserCanvasCtx.fillStyle = `rgba(${laserColorRgb}, ${alpha})`;
    laserCanvasCtx.shadowColor = `rgba(${laserColorRgb}, ${Math.min(1, alpha + 0.2)})`;
    laserCanvasCtx.shadowBlur = 14;
    laserCanvasCtx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    laserCanvasCtx.fill();
  });
  if (laserDotPos) {
    laserCanvasCtx.beginPath();
    laserCanvasCtx.fillStyle = `rgba(${laserColorRgb}, 1)`;
    laserCanvasCtx.shadowColor = `rgba(${laserColorRgb}, 1)`;
    laserCanvasCtx.shadowBlur = 14;
    laserCanvasCtx.arc(laserDotPos.x, laserDotPos.y, 7, 0, Math.PI * 2);
    laserCanvasCtx.fill();
  }
  laserAnimHandle = requestAnimationFrame(drawLaserFrame);
}

// Eligible area: inside the presentation wrapper and outside the toolbar's
// own rectangle. The toolbar's separate 24px reveal padding
// (`pointNearPresentationToolbar`) only controls when the chrome reappears —
// it is still eligible ground for the dot, so it isn't reused as this
// boundary.
function isInsidePresentationWrapper(x, y) {
  const rect = previewWrapEl.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
function pointInPresentationToolbar(x, y) {
  const rect = presentationToolbarEl.getBoundingClientRect();
  if (!rect.width && !rect.height) return false;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
function isLaserEligible(x, y) {
  return isInsidePresentationWrapper(x, y) && !pointInPresentationToolbar(x, y);
}

function endLaserStroke() {
  laserStrokeActive = false;
}

// Toolbar entry, presentation-area exit, window blur, and pointer
// cancellation all funnel through this: end the stroke and hide the dot.
// Existing trail samples are left alone so they keep fading on their own.
function interruptLaserGesture() {
  endLaserStroke();
  laserDotPos = null;
}

function handleLaserPointerMove(e) {
  if (e.pointerType !== "mouse") return; // touch/pen are outside this change
  const x = e.clientX, y = e.clientY;
  if (!isLaserEligible(x, y)) {
    interruptLaserGesture();
    return;
  }
  laserDotPos = { x, y };
  if (laserStrokeActive) {
    if (e.buttons & 1) {
      laserTrailPoints.push({ x, y, t: performance.now() });
    } else {
      // Defensive: a release that never reached handleLaserPointerUp (e.g. it
      // happened before listeners were attached) still ends the stroke.
      endLaserStroke();
    }
  }
}

function handleLaserPointerDown(e) {
  if (presentationTool !== "laser" || e.pointerType !== "mouse" || e.button !== 0) return;
  if (!isLaserEligible(e.clientX, e.clientY)) return;
  e.preventDefault(); // avoid text selection while dragging a trail
  laserStrokeActive = true;
  laserDotPos = { x: e.clientX, y: e.clientY };
  laserTrailPoints.push({ x: e.clientX, y: e.clientY, t: performance.now() });
}

function handleLaserPointerUp(e) {
  if (e.button !== 0) return;
  endLaserStroke();
}

function handleLaserAreaLeave(e) {
  if (e.pointerType && e.pointerType !== "mouse") return;
  interruptLaserGesture();
}

function createLaserCanvas() {
  if (laserCanvasEl) return;
  laserCanvasEl = document.createElement("canvas");
  laserCanvasEl.id = "laser-canvas";
  previewWrapEl.appendChild(laserCanvasEl);
  laserCanvasCtx = laserCanvasEl.getContext("2d");
  laserTrailPoints = [];
  laserDotPos = null;
  laserStrokeActive = false;
  sizeLaserCanvas();
  laserAnimHandle = requestAnimationFrame(drawLaserFrame);
}

function removeLaserCanvas() {
  if (laserAnimHandle != null) cancelAnimationFrame(laserAnimHandle);
  laserAnimHandle = null;
  laserTrailPoints = [];
  laserDotPos = null;
  laserStrokeActive = false;
  laserCanvasCtx = null;
  if (laserCanvasEl && laserCanvasEl.parentNode) laserCanvasEl.parentNode.removeChild(laserCanvasEl);
  laserCanvasEl = null;
}

