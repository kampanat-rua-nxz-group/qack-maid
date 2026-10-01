// Runs in the page (pass to page.evaluate). Serializes the live Preview SVG
// minus the zoom/pan state the app pins on it, so presentation teardown specs
// can assert Preview is byte-identical before and after.
export function previewSvgSnapshot(): string {
  const copy = document.querySelector("#preview svg")!.cloneNode(true) as SVGSVGElement;
  copy.style.removeProperty("width");
  copy.style.removeProperty("height");
  copy.style.removeProperty("max-width");
  delete copy.dataset.baseWidth;
  delete copy.dataset.baseHeight;
  return new XMLSerializer().serializeToString(copy);
}
