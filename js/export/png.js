// PNG Export artifact: Preview rasterized at 2x onto the Preview background,
// with the canvas stamp. Shared by Download PNG and Copy PNG.

// Rasterizes the current Preview to a stamped PNG blob at 2x. Resolves to null
// when there is no Preview at all (a failed render keeps the previous one); rejects if the
// SVG fails to rasterize or encode.
function buildExportPngBlob() {
  const svg = previewEl.querySelector("svg");
  if (!svg) return Promise.resolve(null);
  const flatSvg = flattenLabelsForExport(svg);
  const bbox = svg.getBoundingClientRect();
  const pxWidth = svg.viewBox?.baseVal?.width || bbox.width;
  const pxHeight = svg.viewBox?.baseVal?.height || bbox.height;
  // The live SVG's root width="100%" has no matching height attribute, so a
  // detached copy (as used for the <img> below) has no way to resolve its own
  // intrinsic size and falls back to a 300x150 default box, aspect-fit from the
  // viewBox. That rasterizes the whole diagram at a fraction of its real size,
  // which then gets stretched blurry back up — looks like a broken/blurred font
  // and truncates content when drawn into the full-size canvas. Pin explicit
  // pixel dimensions so the detached SVG resolves to its real size.
  flatSvg.setAttribute("width", pxWidth);
  flatSvg.setAttribute("height", pxHeight);
  const svgData = new XMLSerializer().serializeToString(flatSvg);
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      const scale = 2; // export at 2x for crispness
      const m = stampMetrics(pxWidth);
      const canvas = document.createElement("canvas");
      canvas.width = pxWidth * scale;
      canvas.height = (pxHeight + m.bandHeight) * scale;
      const ctx = canvas.getContext("2d");
      // Fill with the Preview background so the export matches what is on screen:
      // a dark-theme diagram has light text that vanishes on a transparent PNG
      // pasted over a light backdrop.
      ctx.fillStyle = previewBackgroundColor();
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, pxWidth * scale, pxHeight * scale);
      URL.revokeObjectURL(url);
      try {
        await drawStampOnCanvas(ctx, canvas.width, pxHeight * scale, m, scale);
      } catch {
        // A failed stamp must not cost the user their export.
      }
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encode failed"))));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not rasterize the diagram"));
    };
    img.src = url;
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
