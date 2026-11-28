// Standard Vite + React SPA config. No SSR, no Cloudflare workers,
// no TanStack Start. The FE is a local-first app (runs in the
// operator's browser or wrapped in Tauri) — there's no server-side
// render to do.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  plugins: [
    // Generates routeTree.gen.ts from src/routes/*.tsx
    TanStackRouterVite({ autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  // THE CODE EDITOR'S LANGUAGES LOAD ON DEMAND (one chunk per file type): in dev, Vite found them only when a file of that type was opened, re-optimised, and answered the request for the page's own chunk
  // with 504 "Outdated Optimize Dep", so an .html or .json file showed no colours until a reload (the operator 2026-11-21). Pre-bundling them here settles that once.
  optimizeDeps: { include: ["@codemirror/lang-html", "@codemirror/lang-json", "@codemirror/lang-javascript", "@codemirror/lang-css", "@codemirror/lang-markdown", "@codemirror/lang-python", "@codemirror/lang-rust", "@codemirror/lang-go", "@codemirror/lang-yaml", "@codemirror/lang-xml", "@codemirror/lang-sql", "@codemirror/lang-cpp", "@codemirror/lang-java", "@codemirror/lang-php", "@codemirror/lang-sass", "@codemirror/lang-less", "@codemirror/lang-vue", "@codemirror/language-data"] },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    // strictPort=true makes Vite EXIT with an error if 8080 is already
    // taken, instead of silently picking 8081/8082. CORS on the BE only
    // allows :8080, so a silent port fallback breaks the integration in
    // a way that looks like "BE is down" — hours wasted last time.
    // Fail loudly so the operator notices the stale process immediately.
    strictPort: true,
    // LOOPBACK ONLY (operator 2026-11-11: an old dev server on :5173 had been reachable from the phone's QR,
    // showing a stale build). The dev server was open on every network address (`host: true`); it is not any more.
    // The phone, and any other device, reaches antiloki through the SERVE's own door (Settings > Remote: the LAN
    // address or the tunnel), which hands out the BUILT app, never through a vite dev server.
    host: "localhost",
  },
  preview: {
    port: 5173,
    strictPort: true,
    host: "localhost",
  },
});
