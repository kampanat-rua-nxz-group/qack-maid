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
    // Same stdlib server as `python3 -m http.server`, but with a listen
    // backlog of 128 instead of socketserver's default 5: parallel workers
    // each request every css/ and js/ file at once, and an overflowing
    // backlog resets connections (ERR_CONNECTION_RESET -> missing script).
    command: `python3 -c "import functools, http.server as s; s.ThreadingHTTPServer.request_queue_size = 128; s.test(HandlerClass=functools.partial(s.SimpleHTTPRequestHandler, directory='${APP_ROOT}'), ServerClass=s.ThreadingHTTPServer, port=${PORT}, bind='127.0.0.1')"`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
