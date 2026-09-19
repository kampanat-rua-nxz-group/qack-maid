// Diagram theme (mermaid.initialize, custom colors) and Preview background.
// Load time needs: shared.js, mermaid.min.js. Runtime calls: render().

const DEFAULT_CUSTOM_COLORS = {
  primary: "#2f6fed",
  text: "#ffffff",
  line: "#6b6b74",
  secondary: "#e0554f",
};

function loadThemeSettings() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { mode: "auto", colors: DEFAULT_CUSTOM_COLORS };
}

function saveThemeSettings(settings) {
  localStorage.setItem(THEME_KEY, JSON.stringify(settings));
}

let themeSettings = loadThemeSettings();

function applyMermaidTheme() {
  const { mode, colors } = themeSettings;
  if (mode === "custom") {
    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      themeVariables: {
        primaryColor: colors.primary,
        primaryTextColor: colors.text,
        lineColor: colors.line,
        secondaryColor: colors.secondary,
      },
    });
  } else if (mode === "auto") {
    mermaid.initialize({
      startOnLoad: false,
      theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default",
    });
  } else {
    mermaid.initialize({ startOnLoad: false, theme: mode });
  }
}

function syncThemeUI() {
  themeSelectEl.value = themeSettings.mode;
  colorRowEl.classList.toggle("show", themeSettings.mode === "custom");
  const c = { ...DEFAULT_CUSTOM_COLORS, ...themeSettings.colors };
  colorPrimaryEl.value = c.primary;
  colorTextEl.value = c.text;
  colorLineEl.value = c.line;
  colorSecondaryEl.value = c.secondary;
}

syncThemeUI();
applyMermaidTheme();

themeSelectEl.addEventListener("change", () => {
  themeSettings.mode = themeSelectEl.value;
  saveThemeSettings(themeSettings);
  syncThemeUI();
  applyMermaidTheme();
  render();
});

[colorPrimaryEl, colorTextEl, colorLineEl, colorSecondaryEl].forEach((el) => {
  el.addEventListener("input", () => {
    themeSettings.colors = {
      primary: colorPrimaryEl.value,
      text: colorTextEl.value,
      line: colorLineEl.value,
      secondary: colorSecondaryEl.value,
    };
    saveThemeSettings(themeSettings);
    applyMermaidTheme();
    render();
  });
});

resetColorsEl.addEventListener("click", () => {
  themeSettings.colors = { ...DEFAULT_CUSTOM_COLORS };
  saveThemeSettings(themeSettings);
  syncThemeUI();
  applyMermaidTheme();
  render();
});

let previewBg = localStorage.getItem(PREVIEW_BG_KEY) || "auto";

function applyPreviewBg() {
  if (previewBg === "auto") {
    previewWrapEl.removeAttribute("data-preview");
  } else {
    previewWrapEl.setAttribute("data-preview", previewBg);
  }
}

previewBgSelectEl.value = previewBg;
applyPreviewBg();

previewBgSelectEl.addEventListener("change", () => {
  previewBg = previewBgSelectEl.value;
  localStorage.setItem(PREVIEW_BG_KEY, previewBg);
  applyPreviewBg();
});

