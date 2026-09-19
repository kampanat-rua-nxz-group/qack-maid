// SVG Export artifact: stamped, background-stripped, label-flattened clone of
// Preview. Shared by Download SVG and Copy SVG.

// Serializes the current Preview to standalone SVG markup: a stamped,
// background-stripped clone of the rendered <svg>. Returns null when there is no
// Preview at all — a failed render leaves the previous one in place, so this is
// only the case before the first successful render.
async function buildExportSvgMarkup() {
  const svg = previewEl.querySelector("svg");
  if (!svg) return null;
  const copy = svg.cloneNode(true);
  // The live SVG carries the preview pane's zoom as inline px width/height. Left
  // in place they fight the stamped viewBox and export a stretched diagram.
  copy.style.removeProperty("width");
  copy.style.removeProperty("height");
  copy.style.removeProperty("max-width");
  delete copy.dataset.baseWidth;
  delete copy.dataset.baseHeight;
  stripBackgroundForExport(copy);
  try {
    await appendStampToSvg(copy, svg);
  } catch {
    // A failed stamp must not cost the user their export.
  }
  // Must be XMLSerializer, not outerHTML: the HTML serializer leaves Mermaid's
  // <br> in labels unclosed and omits the xmlns:xlink declaration the stamp
  // needs, either of which makes the downloaded file unparseable as SVG.
  return new XMLSerializer().serializeToString(copy);
}

// Exports carry a transparent background, so the diagram drops onto whatever the
// file is pasted into. Mermaid normally leaves the SVG root unpainted, but a
// theme (or a diagram type that paints its own canvas) can pin a background on
// the root element or in the root rule of the stylesheet it inlines — strip both.
// Only the root selector is touched: `background-color` elsewhere in that sheet
// is what makes edge labels legible where they cross a line.
function stripBackgroundForExport(copy) {
  copy.style.removeProperty("background");
  copy.style.removeProperty("background-color");
  const rootRule = copy.id
    ? new RegExp(`(?:#${copy.id.replace(/[^\w-]/g, "\\$&")}|svg)\\s*\\{[^}]*\\}`, "g")
    : /svg\s*\{[^}]*\}/g;
  copy.querySelectorAll("style").forEach((styleEl) => {
    styleEl.textContent = styleEl.textContent.replace(rootRule, (rule) =>
      rule.replace(/background(-color)?\s*:[^;}]*;?/g, ""),
    );
  });
  copy.querySelectorAll(":scope > rect").forEach((rect) => {
    if (rect.classList.contains("background")) rect.remove();
  });
}

const SVG_NS = "http://www.w3.org/2000/svg";

// Recursively copies text nodes and b/strong/i/em formatting from an HTML
// fragment into nested SVG <tspan>s, preserving bold/italic runs.
function appendFormattedRuns(sourceNode, target) {
  sourceNode.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      target.appendChild(document.createTextNode(node.textContent));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    const inner = document.createElementNS(SVG_NS, "tspan");
    if (tag === "b" || tag === "strong") inner.setAttribute("font-weight", "bold");
    if (tag === "i" || tag === "em") inner.setAttribute("font-style", "italic");
    appendFormattedRuns(node, inner);
    target.appendChild(inner);
  });
}

// Chrome/Firefox/Safari taint any canvas rasterized from an SVG that contains
// <foreignObject> (Mermaid uses it for every text label), regardless of origin.
// Replace each foreignObject label with an equivalent SVG <text> before export.
function flattenLabelsForExport(svg) {
  const clone = svg.cloneNode(true);
  const origFos = Array.from(svg.querySelectorAll("foreignObject"));
  const cloneFos = Array.from(clone.querySelectorAll("foreignObject"));
  origFos.forEach((fo, i) => {
    const div = fo.querySelector("div");
    const cloneFo = cloneFos[i];
    if (!div || !cloneFo) return;
    const pElements = Array.from(div.querySelectorAll("p"));
    let lineHtmls = [];
    if (pElements.length) {
      // Mermaid puts explicit line breaks as <br> inside a single <p>, not separate <p>s.
      pElements.forEach((p) => {
        lineHtmls.push(...p.innerHTML.split(/<br\s*\/?>/i));
      });
    } else {
      lineHtmls = [div.innerHTML];
    }
    if (!div.textContent.trim()) {
      cloneFo.remove();
      return;
    }
    const cs = getComputedStyle(div);
    const fontSize = parseFloat(cs.fontSize) || 16;
    const lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.5;
    const width = parseFloat(fo.getAttribute("width")) || 0;
    const textAnchor = cs.textAlign === "left" ? "start" : cs.textAlign === "right" ? "end" : "middle";
    const x = textAnchor === "middle" ? width / 2 : textAnchor === "end" ? width : 0;
    const textEl = document.createElementNS(SVG_NS, "text");
    // Strip quotes from font-family: quoted family names survive live DOM/inline SVG
    // rendering fine, but break font resolution when this SVG is rasterized via an
    // <img>/canvas pipeline, silently falling back to a default cursive-ish font.
    textEl.setAttribute("font-family", cs.fontFamily.replace(/"/g, ""));
    textEl.setAttribute("font-size", fontSize);
    textEl.setAttribute("fill", cs.color);
    lineHtmls.forEach((lineHtml, idx) => {
      const lineTspan = document.createElementNS(SVG_NS, "tspan");
      lineTspan.setAttribute("x", x);
      lineTspan.setAttribute("y", idx * lineHeight + lineHeight * 0.7);
      lineTspan.setAttribute("text-anchor", textAnchor);
      const tmp = document.createElement("div");
      tmp.innerHTML = lineHtml;
      appendFormattedRuns(tmp, lineTspan);
      textEl.appendChild(lineTspan);
    });
    cloneFo.replaceWith(textEl);
  });
  return clone;
}

