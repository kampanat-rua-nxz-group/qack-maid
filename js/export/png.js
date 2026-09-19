// PNG Export artifact: rasterizes the SVG artifact at 2x with the canvas stamp.
// Shared by Download PNG and Copy PNG.

// Rasterizes the current Preview to a stamped PNG blob at 2x. Resolves to null
// under the same no-Preview condition as buildExportSvgMarkup(); rejects if the
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
      // Left unfilled on purpose: a fresh canvas is transparent, and the PNG keeps
      // that alpha so the export matches the SVG and composites onto any backdrop.
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

