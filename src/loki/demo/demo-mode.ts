// DEMO MODE (operator 2026-07-20, the sell-tabs model): a product screen a user
// has NOT bought renders as ITSELF — same components, same layout — but fed
// fixture data, with mutations simulated. One seam, zero screen changes: the
// api client consults this module before touching the network.
//
// Activation (until the entitlement/control plane arrives):
//   · URL  ?demo=all  or  ?demo=explorer,hub          (persisted to localStorage)
//   · localStorage  antiloki:demo-tabs = "all" | csv  (cleared with ?demo=off)
// The surface is inferred from the route + the chat mode (the dock store).
import { dockStore } from "@/loki/shell/dock-store";
import { demoFixture } from "./fixtures";

export type DemoTab = "explorer" | "hub" | "canvas" | "harness";
const KEY = "antiloki:demo-tabs";

function readTabs(): Set<string> {
  try {
    const q = new URLSearchParams(window.location.search).get("demo");
    if (q != null) {
      if (q === "off") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, q === "" ? "all" : q);
    }
    const v = localStorage.getItem(KEY);
    if (!v) return new Set();
    if (v === "all") return new Set(["explorer", "hub", "canvas", "harness"]);
    return new Set(v.split(",").map((s) => s.trim()).filter(Boolean));
  } catch { return new Set(); }
}

// The "/" surfaces ANNOUNCE themselves at render time (NotebooksView → hub,
// CockpitView → canvas): render runs before any effect, so the screen's first
// fetches always see the right surface. Deriving it from chatMode alone lost a
// StrictMode race — the [mode] publisher re-asserted stale 'agent' after the
// dock-handoff consume, and the screen's mount fetches hit the network.
let mountedSurface: DemoTab | null = null;
export function markSurfaceMounted(t: DemoTab) { mountedSurface = t; }
export function clearSurfaceMounted(t: DemoTab) { if (mountedSurface === t) mountedSurface = null; }

// which product surface the user is LOOKING at right now
export function currentSurface(): DemoTab | null {
  const p = window.location.pathname;
  if (p.startsWith("/operations/atlas") || p.startsWith("/operations/design")) return "explorer";
  if (p.startsWith("/operations") || p.startsWith("/pipeline")) return "harness";
  if (p === "/") {
    if (mountedSurface) return mountedSurface;
    try {
      const pending = sessionStorage.getItem("antiloki:dock-mode");
      if (pending === "terminal") return "canvas";
      if (pending === "search") return "hub";
    } catch { /* storage unavailable */ }
    const m = dockStore.get().chatMode;
    if (m === "terminal") return "canvas";
    if (m === "search") return "hub";
  }
  return null;
}

export function demoActive(): DemoTab | null {
  const s = currentSurface();
  return s && readTabs().has(s) ? s : null;
}

// Only PRODUCT endpoints are ever demoed — the shell (workspaces, auth, god,
// settings, health) must stay real or the gate/nav break under demo mode.
const PRODUCT_PATHS = [
  "/api/v1/notebook", "/api/v1/codebase", "/api/v1/code", "/api/v1/cockpit",
  "/api/v1/dispatch", "/api/v1/rag", "/api/v1/board", "/api/v1/driver",
  "/api/v1/gate", "/api/v1/contracts", "/api/v1/review", "/api/v1/reviews",
  "/api/v1/personas", "/api/v1/pr", "/api/v1/diffs", "/api/v1/enrich",
  "/api/v1/knowledge", "/api/v1/turn", "/api/v1/terminal", "/api/v1/deepsearch",
  // the harness board + its header chips — REAL card titles must never render
  // for an unpaid tab (the first shot round leaked them)
  "/api/v1/cards", "/api/v1/cost",
];

// The api client's pre-flight: a demo answer for this request, or undefined to
// hit the network. Mutations (POSTs with no fixture) resolve ok-shaped so every
// button "works" — nothing errors, nothing persists.
export function demoIntercept(method: "GET" | "POST", path: string, body?: any): any | undefined {
  const tab = demoActive();
  if (!tab) return undefined;
  if (!PRODUCT_PATHS.some((p) => path.startsWith(p))) return undefined;
  const fx = demoFixture(tab, method, path, body);
  if (fx !== undefined) return fx;
  if (method === "POST") return { ok: true, demo: true };
  return null; // unknown reads: the screens' empty states are built for null
}
