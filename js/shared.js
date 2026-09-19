// Shared globals, loaded first: localStorage keys, DOM lookups used by several
// features, and presentation state read outside presentation/.

const STORAGE_KEY = "qack-maid:source";
const THEME_KEY = "qack-maid:theme";
const PREVIEW_BG_KEY = "qack-maid:preview-bg";
const SPLIT_KEY = "qack-maid:split";

const sourceEl = document.getElementById("source");
const previewEl = document.getElementById("preview");
const errorEl = document.getElementById("error-banner");
const examplesEl = document.getElementById("examples");
const themeSelectEl = document.getElementById("theme-select");
const colorRowEl = document.getElementById("color-row");
const colorPrimaryEl = document.getElementById("color-primary");
const colorTextEl = document.getElementById("color-text");
const colorLineEl = document.getElementById("color-line");
const colorSecondaryEl = document.getElementById("color-secondary");
const resetColorsEl = document.getElementById("reset-colors");
const previewWrapEl = document.querySelector(".preview-wrap");
const previewBgSelectEl = document.getElementById("preview-bg-select");
const previewStatusEl = document.getElementById("preview-status");
const presentBtn = document.getElementById("present");
const presentationExitEl = document.getElementById("presentation-exit");
const presentationToolbarEl = document.getElementById("presentation-toolbar");
const toolPointerEl = document.getElementById("tool-pointer");
const toolLaserEl = document.getElementById("tool-laser");
const laserColorEl = document.getElementById("laser-color");

let presenting = false;
// Issue #7: mouse-only tool switch, no keyboard shortcut. Always reset to
// "pointer" on entry (AC 14).
let presentationTool = "pointer";
let savedZoomLevel = null;
let savedTabPane = null;
let savedPan = null;
// Presentation-only zoom multiplier (issue #6): relative to the presentation
// fit size, independent of the pre-presentation `zoomLevel`, which stays
// saved/restored untouched by this. Always reset to 1 (= fit) on enter/exit.
let presentationZoom = 1;
