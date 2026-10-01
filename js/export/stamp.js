// Attribution stamp for exports: geometry, contrast color, canvas band.
// Runtime calls: loadQackLogo(), tintedLogoCanvas() (logo.js).

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
function previewBackgroundColor() {
  return getComputedStyle(previewWrapEl).backgroundColor;
}

function stampColor() {
  const bg = previewBackgroundColor();
  const parts = (bg.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  if (parts.length < 3) return "#000";
  const [r, g, b] = parts.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? "#000" : "#fff";
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

