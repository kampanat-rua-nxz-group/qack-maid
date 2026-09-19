// Attribution stamp for exports: geometry, contrast color, SVG band, canvas band.
// Runtime calls: loadQackLogo(), tintedLogoCanvas() (logo.js); SVG_NS (export/svg.js).

// Geometry for the attribution band appended below an exported diagram, sized
// off the diagram so the stamp stays proportional at any dimension.
function stampMetrics(diagramWidth) {
  const logoHeight = Math.max(11, Math.min(22, diagramWidth * 0.022));
  return {
    logoHeight,
    logoWidth: logoHeight * QACK_LOGO_RATIO,
    fontSize: logoHeight * 0.66,
    gap: logoHeight * 0.45,
    pad: logoHeight * 0.7,
    get bandHeight() {
      return this.logoHeight + this.pad * 2;
    },
  };
}

// The exported stamp mirrors the footer: muted "Powered by" + the glyph, keyed
// to the preview pane's own text color so it reads on either background.
const STAMP_TEXT = "Powered by";
const STAMP_FONT = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const STAMP_ALPHA = 0.65;

// The preview background can be pinned independently of the page theme, so the
// pane's own text color is not a safe contrast reference (a light page with a
// dark-pinned preview yields dark-on-dark). Pick from the background's
// luminance instead.
function stampColor() {
  const bg = getComputedStyle(previewWrapEl).backgroundColor;
  const parts = (bg.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  if (parts.length < 3) return "#000";
  const [r, g, b] = parts.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? "#000" : "#fff";
}
// Grows the exported SVG by a band at the bottom and draws the attribution into
// it, so the stamp never overlaps diagram content.
async function appendStampToSvg(copy, svg) {
  const box = svg.viewBox?.baseVal;
  const width = box?.width || svg.getBoundingClientRect().width;
  const height = box?.height || svg.getBoundingClientRect().height;
  if (!width || !height) return;
  const x = box?.x || 0;
  const y = box?.y || 0;
  const m = stampMetrics(width);
  const color = stampColor();

  copy.setAttribute("viewBox", `${x} ${y} ${width} ${height + m.bandHeight}`);
  copy.setAttribute("width", width);
  copy.setAttribute("height", height + m.bandHeight);
  // Mermaid pins an inline style height on the root, which outranks the height
  // attribute in any CSS-aware viewer and would squash the taller viewBox.
  copy.style.height = `${height + m.bandHeight}px`;

  const baseline = y + height + m.pad + m.logoHeight * 0.78;
  const logoX = x + width - m.pad - m.logoWidth;

  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("x", logoX - m.gap);
  text.setAttribute("y", baseline);
  text.setAttribute("text-anchor", "end");
  text.setAttribute("font-family", STAMP_FONT);
  text.setAttribute("font-size", m.fontSize);
  text.setAttribute("fill", color);
  text.setAttribute("fill-opacity", STAMP_ALPHA);
  text.textContent = STAMP_TEXT;

  const logo = await loadQackLogo();
  const image = document.createElementNS(SVG_NS, "image");
  image.setAttribute("x", logoX);
  image.setAttribute("y", y + height + m.pad);
  image.setAttribute("width", m.logoWidth);
  image.setAttribute("height", m.logoHeight);
  image.setAttribute("opacity", STAMP_ALPHA);
  const logoData = tintedLogoCanvas(logo, m.logoHeight * 4, color).toDataURL("image/png");
  image.setAttribute("href", logoData);
  // xlink:href as well, for viewers predating SVG 2.
  image.setAttributeNS("http://www.w3.org/1999/xlink", "href", logoData);

  copy.appendChild(text);
  copy.appendChild(image);
}

// Draws the attribution into the band reserved below the rasterized diagram.
async function drawStampOnCanvas(ctx, canvasWidth, diagramBottom, m, scale) {
  const logo = await loadQackLogo();
  const color = stampColor();
  const logoHeight = m.logoHeight * scale;
  const logoWidth = m.logoWidth * scale;
  const pad = m.pad * scale;
  const logoX = canvasWidth - pad - logoWidth;
  const logoY = diagramBottom + pad;

  ctx.save();
  ctx.globalAlpha = STAMP_ALPHA;
  ctx.font = `${m.fontSize * scale}px ${STAMP_FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(STAMP_TEXT, logoX - m.gap * scale, logoY + logoHeight / 2);
  ctx.drawImage(
    tintedLogoCanvas(logo, logoHeight * 2, color),
    logoX,
    logoY,
    logoWidth,
    logoHeight,
  );
  ctx.restore();
}

