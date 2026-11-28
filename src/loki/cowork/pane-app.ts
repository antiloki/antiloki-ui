// A PANE AS AN APP OF ITS OWN (operator 2026-11-27: the browser's "install as an app", for a pane). A pane has an address that holds all it needs to be drawn, and a web manifest made for it,
// so the browser installs it with its own name, icon and window. Pure but for the browser call at the end. The app is a window onto the running antiloki: it needs the serve.
import type { PaneRef } from "./layout";

export const APP_PATH = "/pane/";
const SOLO_TOOLS = new Set(["files", "notes", "browser", "board", "connectors", "group"]);
/** Can this pane stand alone? Agents, terminals and the tools that need nothing from the screen around them. */
export const canBeApp = (p: PaneRef): boolean => p.kind === "engine" || p.kind === "shell" ? !!p.paneId : p.kind === "tool" && SOLO_TOOLS.has(p.tool ?? "") && (p.tool !== "group" || !!p.group);

const KEEP = ["id", "kind", "engine", "tool", "title", "paneId", "sessionId", "specialist", "skin", "group"] as const;
export function packPane(p: PaneRef): string {
  const o: Record<string, unknown> = {}; for (const k of KEEP) if ((p as any)[k] !== undefined) o[k] = (p as any)[k];
  const bytes = new TextEncoder().encode(JSON.stringify(o)); let s = ""; bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
/** The pane an address holds; anything unreadable, or not able to stand alone, is null. */
export function unpackPane(s: string): PaneRef | null {
  try {
    const raw = atob(s.replace(/-/g, "+").replace(/_/g, "/")); const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, (c) => c.charCodeAt(0))));
    return o && typeof o.id === "string" && typeof o.kind === "string" && canBeApp(o as PaneRef) ? (o as PaneRef) : null;
  } catch { return null; }
}
export const appName = (p: PaneRef): string => (p.title || p.tool || p.engine || "pane").slice(0, 60);
/** The app's own scope. The closing `~` keeps pane 1's scope from also holding pane 12's. */
export const appScope = (p: PaneRef): string => `${APP_PATH}${encodeURIComponent(p.id)}~`;
export const appUrl = (p: PaneRef): string => `${appScope(p)}?p=${packPane(p)}`;
export function appManifest(p: PaneRef, origin: string, icons: { src: string; sizes: string }[]) {
  return { id: `${origin}${appScope(p)}`, name: `${appName(p)} · antiloki`, short_name: appName(p).slice(0, 24), start_url: `${origin}${appUrl(p)}`, scope: `${origin}${appScope(p)}`,
    display: "standalone", background_color: "#0f1113", theme_color: "#0f1113", icons: icons.map((i) => ({ ...i, type: "image/png", purpose: "any" })) };
}
/** A square icon: the pane's first letter on its colour. Empty where there is no canvas. */
export function drawIcon(letter: string, color: string, size: number): string {
  try {
    const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d"); if (!g) return "";
    g.fillStyle = "#0f1113"; g.fillRect(0, 0, size, size); g.fillStyle = color; g.beginPath(); g.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#0f1113"; g.font = `700 ${Math.round(size * 0.46)}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(letter.toUpperCase(), size / 2, size * 0.53);
    return c.toDataURL("image/png");
  } catch { return ""; }
}
export const openAsApp = (p: PaneRef): void => { window.open(appUrl(p), "_blank", "noopener"); };
