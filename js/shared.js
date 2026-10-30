// Shared globals, loaded first: localStorage keys, DOM lookups used by several
// features, the header popup menu wiring, and presentation state read outside
// presentation/.

const LIBRARY_KEY = "qack-maid:diagrams";
const DIAGRAM_KEY_PREFIX = "qack-maid:diagram:";
const OPEN_KEY = "qack-maid:open";
const SIDEBAR_KEY = "qack-maid:sidebar-collapsed";
const LEGACY_SOURCE_KEY = "qack-maid:source"; // read once for migration
const THEME_KEY = "qack-maid:theme";
const PREVIEW_BG_KEY = "qack-maid:preview-bg";
const SPLIT_KEY = "qack-maid:split";

const STORAGE_FULL_TEXT = "Storage is full. Delete diagrams you no longer need.";

const sourceEl = document.getElementById("source");
const previewEl = document.getElementById("preview");
const errorEl = document.getElementById("error-banner");
const themeMenuEl = document.getElementById("theme-menu");
const colorRowEl = document.getElementById("color-row");
const colorPrimaryEl = document.getElementById("color-primary");
const colorTextEl = document.getElementById("color-text");
const colorLineEl = document.getElementById("color-line");
const colorSecondaryEl = document.getElementById("color-secondary");
const resetColorsEl = document.getElementById("reset-colors");
const previewWrapEl = document.querySelector(".preview-wrap");
const previewBgMenuEl = document.getElementById("preview-bg-menu");
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

// Header popup menus (Export, theme pickers) share one keyboard model with the
// diagram row menu: opening focuses the checked or first item, arrows cycle,
// Escape returns focus to the trigger, a click outside closes. onPick runs
// synchronously inside the item's click (Copy PNG relies on that in Safari).
function wireMenu(menuEl, onPick) {
  const trigger = menuEl.querySelector(".menu-trigger");
  const items = [...menuEl.querySelectorAll('[role^="menuitem"]')];
  const isOpen = () => menuEl.classList.contains("open");
  const setOpen = (open) => {
    menuEl.classList.toggle("open", open);
    trigger.setAttribute("aria-expanded", String(open));
  };
  const openAndFocus = () => {
    setOpen(true);
    (menuEl.querySelector('[aria-checked="true"]') || items[0]).focus();
  };

  trigger.addEventListener("click", () => (isOpen() ? setOpen(false) : openAndFocus()));
  items.forEach((item) => item.addEventListener("click", () => {
    setOpen(false);
    trigger.focus();
    onPick(item);
  }));
  menuEl.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    if (!isOpen()) return openAndFocus();
    const at = items.indexOf(document.activeElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    items[at < 0 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length].focus();
  });
  document.addEventListener("click", (e) => {
    if (!menuEl.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) {
      setOpen(false);
      trigger.focus();
    }
  });
}
