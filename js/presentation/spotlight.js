// Spotlight highlighting and stepping for flowchart and sequence diagrams.
// Runtime reads: dragSuppressClick (zoom-pan.js).

// --- Spotlight highlighting (issue #3, generalized for sequence — issue #5) --
// One selector map keyed by the rendered SVG's `aria-roledescription`.
// Diagram types with no entry get no highlight and no errors (spec: "Out of
// scope"). A "node" is not always a single element — a sequence participant
// is two elements (top + bottom `mirrorActors` copies) that must act as one
// for hover/pin/dim/outline/stepping — so each map entry either lists a flat
// `nodeSelector` (one element = one node, e.g. flowchart) or provides a
// `nodeGroups(svg)` function returning an array of element groups (one array
// per logical node). `highlightNodeGroups` always holds the latter shape;
// buildNodeGroups() wraps a flat `nodeSelector` into single-element groups so
// the rest of the pipeline (dim/focus/pin/step) only deals with groups.
//
// Verified against the built-in flowchart example's rendered SVG
// (Mermaid 11.16.1, `aria-roledescription="flowchart-v2"`):
//   - nodes: `.nodes > g.node`      (one <g> per box, e.g. id="…-flowchart-A-0")
//   - edges: `.edgePaths > path`    (one <path> per line, e.g. id="…-L_A_B_0")
//
// Verified against the built-in sequence example's rendered SVG (Mermaid
// 11.16.1, `aria-roledescription="sequence"`, participants A/B, 2 messages):
//   - participant copies: `rect.actor.actor-top[name]` / `rect.actor.actor-bottom[name]`,
//     each living in its own wrapping <g> (the bottom copy's <g> has no
//     id/class; the top copy's <g> has id="root-N" and data-id). The two
//     copies for one participant are correlated only by sharing the same
//     `name` attribute value — grouped by that below.
//   - message arrows: `line.messageLine0` (solid) / `line.messageLine1`
//     (dashed) — the class marks arrow style, not message index. Arrowhead
//     markers and message-text labels are not part of the highlightable unit
//     (matches flowchart edges, which don't include labels either).
const PRESENTATION_HIGHLIGHT_MAP = {
  "flowchart-v2": {
    nodeSelector: ".nodes > g.node",
    edgeSelector: ".edgePaths > path",
  },
  "sequence": {
    nodeGroups(svg) {
      const rects = Array.from(svg.querySelectorAll("rect.actor.actor-top, rect.actor.actor-bottom"));
      const byName = new Map(); // name attribute -> { x, elements: [<g> per copy] }
      rects.forEach((rect) => {
        const name = rect.getAttribute("name") || "";
        const container = rect.parentElement || rect; // <g> wrapping this copy's rect + label
        const entry = byName.get(name) || { x: parseFloat(rect.getAttribute("x")) || 0, elements: [] };
        entry.elements.push(container);
        byName.set(name, entry);
      });
      // Left-to-right (x-ascending) order — matches the participants' visual
      // reading order (and their declared order in this example).
      return Array.from(byName.values())
        .sort((a, b) => a.x - b.x)
        .map((entry) => entry.elements);
    },
    edgeSelector: "line.messageLine0, line.messageLine1",
    boxGroups(svg) {
      // Mermaid puts each frame and its branch labels in a separate group,
      // even for nested alt blocks. Messages remain independent targets.
      return Array.from(svg.querySelectorAll('g[data-et="control-structure"]'))
        .filter((group) => group.querySelector(".labelText")?.textContent.trim() === "alt")
        .map((group) => [group]);
    },
  },
};

function buildNodeGroups(svg, map) {
  if (typeof map.nodeGroups === "function") return map.nodeGroups(svg);
  return Array.from(svg.querySelectorAll(map.nodeSelector)).map((el) => [el]);
}

let highlightSvg = null;
let highlightNodeGroups = []; // array of groups; each group is an array of one-or-more elements acting as one logical node
let highlightBoxGroups = []; // selectable frames, excluded from participant stepping
let highlightEdges = []; // the real (thin) edge elements — never the hit-area clones
let highlightHitAreaByEdge = new WeakMap(); // real edge element -> its hit-area clone
let highlightEdgeByHitArea = new WeakMap(); // hit-area clone -> its real edge element
let highlightOriginalClass = new WeakMap(); // element -> its exact pre-presentation class attribute (may be null if it had none)
let pinnedHighlight = null; // the currently pinned node group (array) or edge element
let hoveredHighlight = null; // the currently hovered node group (array) or edge element

function resolveHighlightTarget(eventTarget) {
  if (!eventTarget || typeof eventTarget.closest !== "function") return null;
  const hitArea = eventTarget.closest(".presentation-hit-area");
  if (hitArea) return highlightEdgeByHitArea.get(hitArea) || null;
  for (const group of highlightNodeGroups.concat(highlightBoxGroups)) {
    if (group.some((el) => el === eventTarget || el.contains(eventTarget))) return group;
  }
  return null;
}

function allHighlightables() {
  return highlightNodeGroups.flat().concat(highlightBoxGroups.flat(), highlightEdges);
}

function applySpotlight(target) {
  const targetElements = new Set(Array.isArray(target) ? target : [target]);
  allHighlightables().forEach((el) => {
    if (targetElements.has(el)) {
      el.classList.remove("presentation-dim");
      el.classList.add("presentation-focus");
    } else {
      el.classList.add("presentation-dim");
      el.classList.remove("presentation-focus");
    }
  });
}

function clearSpotlight() {
  allHighlightables().forEach((el) => {
    el.classList.remove("presentation-dim", "presentation-focus");
  });
}

function unpinHighlight() {
  pinnedHighlight = null;
  hoveredHighlight = null;
  clearSpotlight();
}

function onHighlightPointerOver(e) {
  if (presentationTool === "laser") return; // issue #7: laser suppresses hover preview
  if (pinnedHighlight) return; // pinned beats hover
  const target = resolveHighlightTarget(e.target);
  if (!target || target === hoveredHighlight) return;
  hoveredHighlight = target;
  applySpotlight(target);
}

function onHighlightPointerOut(e) {
  if (presentationTool === "laser") return; // issue #7
  if (pinnedHighlight) return;
  if (!hoveredHighlight) return;
  const stillOver = resolveHighlightTarget(e.relatedTarget);
  if (stillOver === hoveredHighlight) return;
  hoveredHighlight = null;
  clearSpotlight();
}

function onHighlightClick(e) {
  if (presentationTool === "laser") return; // issue #7: laser clicks never pin/unpin
  // Issue #6: a drag-to-pan gesture must never pin/unpin. The pointerdown
  // handler below sets this once movement crosses the drag threshold; the
  // click that follows a drag consumes and clears it instead of acting.
  if (dragSuppressClick) {
    dragSuppressClick = false;
    return;
  }
  const target = resolveHighlightTarget(e.target);
  if (target) {
    pinnedHighlight = target;
    hoveredHighlight = null;
    applySpotlight(target);
  } else {
    unpinHighlight();
  }
}

function pinHighlight(target) {
  pinnedHighlight = target;
  hoveredHighlight = null;
  applySpotlight(target);
}

// Steps the pin through highlightNodeGroups only, in group order (issue #4;
// generalized for grouped nodes in issue #5 — a sequence participant's two
// copies count as one step position, never two). A pinned edge counts as
// "nothing pinned" — an edge is never a step position, so stepping from one
// always lands on an end (first/last node) rather than continuing from the
// edge's position in some combined order.
function stepHighlight(direction) {
  if (!highlightNodeGroups.length) return; // unmatched diagram type: no-op
  const currentIndex = pinnedHighlight ? highlightNodeGroups.indexOf(pinnedHighlight) : -1;
  let nextIndex;
  if (currentIndex === -1) {
    nextIndex = direction > 0 ? 0 : highlightNodeGroups.length - 1;
  } else {
    nextIndex = Math.min(highlightNodeGroups.length - 1, Math.max(0, currentIndex + direction));
  }
  pinHighlight(highlightNodeGroups[nextIndex]);
}

function setupHighlight() {
  const svg = previewEl.querySelector("svg");
  if (!svg) return;
  const kind = svg.getAttribute("aria-roledescription") || "";
  const map = PRESENTATION_HIGHLIGHT_MAP[kind];
  if (!map) return; // unmatched diagram type: no highlight, no error
  highlightSvg = svg;
  highlightNodeGroups = buildNodeGroups(svg, map);
  highlightBoxGroups = map.boxGroups ? map.boxGroups(svg) : [];
  highlightEdges = Array.from(svg.querySelectorAll(map.edgeSelector));
  highlightHitAreaByEdge = new WeakMap();
  highlightEdgeByHitArea = new WeakMap();
  highlightOriginalClass = new WeakMap();
  // Store the exact original class attribute (possibly null — a sequence
  // participant's wrapping <g> has no class attribute at all) so teardown
  // can restore it precisely rather than leaving a stray `class=""`.
  allHighlightables().forEach((el) => {
    highlightOriginalClass.set(el, el.getAttribute("class"));
  });
  highlightEdges.forEach((edge) => {
    // Shallow clone (paths have no children); drop the original's id/markers
    // and — critically — its Mermaid classes, whose id-scoped stylesheet
    // rules (e.g. `#graph-2 .edge-thickness-normal{stroke-width:1px}`) would
    // otherwise outrank the plain `.presentation-hit-area` class selector.
    const hitArea = edge.cloneNode(false);
    hitArea.removeAttribute("id");
    hitArea.removeAttribute("marker-end");
    hitArea.removeAttribute("marker-start");
    hitArea.removeAttribute("style");
    hitArea.setAttribute("class", "presentation-hit-area");
    edge.insertAdjacentElement("afterend", hitArea);
    highlightHitAreaByEdge.set(edge, hitArea);
    highlightEdgeByHitArea.set(hitArea, edge);
  });
  previewEl.addEventListener("pointerover", onHighlightPointerOver);
  previewEl.addEventListener("pointerout", onHighlightPointerOut);
  previewEl.addEventListener("click", onHighlightClick);
}

function teardownHighlight() {
  if (!highlightSvg) return;
  previewEl.removeEventListener("pointerover", onHighlightPointerOver);
  previewEl.removeEventListener("pointerout", onHighlightPointerOut);
  previewEl.removeEventListener("click", onHighlightClick);
  // Restore each element's exact original `class` attribute string rather
  // than classList.remove(): DOMTokenList re-serializes (and can dedupe) the
  // whole attribute on any mutation, which would leave the SVG byte-different
  // from a pre-presentation export even with no dim/focus class left on it.
  // An original value of `null` means the element had no class attribute at
  // all (e.g. a sequence participant's wrapping <g>) — remove it rather than
  // setting `class=""`, which would itself be a byte difference.
  allHighlightables().forEach((el) => {
    if (!highlightOriginalClass.has(el)) return;
    const original = highlightOriginalClass.get(el);
    if (original === null) el.removeAttribute("class");
    else el.setAttribute("class", original);
  });
  highlightEdges.forEach((edge) => {
    const hitArea = highlightHitAreaByEdge.get(edge);
    if (hitArea && hitArea.parentNode) hitArea.parentNode.removeChild(hitArea);
  });
  highlightSvg = null;
  highlightNodeGroups = [];
  highlightBoxGroups = [];
  highlightEdges = [];
  highlightHitAreaByEdge = new WeakMap();
  highlightEdgeByHitArea = new WeakMap();
  highlightOriginalClass = new WeakMap();
  pinnedHighlight = null;
  hoveredHighlight = null;
}

