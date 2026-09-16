import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// Serves the repo root (index.html + mermaid.min.js) exactly as it is
// deployed — no build step, no bundler (ADR-0002 / ADR-0004). Uses the
// zero-dependency python static server rather than adding another npm
// package just for local hosting.
const PORT = 4317;
const APP_ROOT = path.resolve(__dirname, "..");

export default defineConfig({
  testDir: "./specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `python3 -m http.server ${PORT} --directory ${APP_ROOT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
