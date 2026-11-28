// FEAT-FE-UNIT-VITEST-SCAFFOLD.
// Separate from vite.config.ts so the dev build doesn't pay any cost
// for test-only config (jsdom polyfills, setupFiles). Vitest reads
// this file automatically.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

// workers inherit this (a newer Node ships a built-in localStorage that hides jsdom's: tests that clear it died, 2026-11-22)
if (!/no-experimental-webstorage/.test(process.env.NODE_OPTIONS ?? "")) process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --no-experimental-webstorage`.trim();

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    // Vitest scans recursively by default; exclude the Playwright suite
    // so e2e specs don't get picked up by both runners.
    exclude: ["node_modules", "dist", "e2e", "test-results", "playwright-report"],
    css: false,
    // NEWER NODE (2026-11-22) HAS A BUILT-IN `localStorage` that hides the test page's own and is undefined without a file: tests that touch localStorage died with "reading 'clear'". The workers start without it.
    // panes that read through a mocked serve take a few seconds when the machine is busy; 5 s made them flake (2026-11-20)
    testTimeout: 15000,
    // A LOG LINE STILL ON ITS WAY WHEN A WORKER CLOSES is not a failure (2026-11-27: the public CI failed with all 3631 tests passing: "EnvironmentTeardownError: Closing rpc while onUserConsoleLog was pending"). Only that one error is let pass.
    onUnhandledError(err) { const e = err as { name?: string; message?: string }; if (e?.name === "EnvironmentTeardownError" && String(e.message).includes("onUserConsoleLog")) return false; },
    // PLAN-THE-TESTS phase 0: `npm run cov` measures every file under src/ (not only the ones a test happens to import),
    // so an untested file shows up as 0 %, not as absent. The number is a floor that only rises (scripts/cov-ratchet.mjs).
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.*", "src/**/*.d.ts", "src/routeTree.gen.ts", "src/test-setup.ts"],
      reporter: ["json-summary", "text-summary"],
      reportsDirectory: "coverage",
    },
  },
});
