// MULTIPLEX AS AN APP (operator 2026-11-27: "can't this be like a PWA mini window?"): the browser installs the `/multiplex` page in one click, with its own name and the "a." mark as its icon. It is a window onto the running antiloki.
import * as React from "react";

export const MULTIPLEX_PATH = "/multiplex";
export function multiplexManifest(origin: string, icons: { src: string; sizes: string }[]) {
  const url = `${origin}${MULTIPLEX_PATH}`;
  return { id: url, name: "antiloki Multiplex", short_name: "Multiplex", start_url: url, scope: url, display: "standalone", background_color: "#0b0d0e", theme_color: "#0b0d0e", icons: icons.map((i) => ({ ...i, type: "image/png", purpose: "any" })) };
}
/** The worn theme's colour, as the page has it now. */
export const themeColor = (): string => { try { return getComputedStyle(document.documentElement).getPropertyValue("--c-brand").trim() || "#c97c5c"; } catch { return "#c97c5c"; } };
/** The "a." mark with its ring of colour, as a square PNG: white on black, its border in the theme's colour, or in all colours while agents run. Empty where there is no canvas. */
export function drawMark(size: number, running = false, theme: string = themeColor(), waiting = false): string {
  try {
    const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d"); if (!g) return "";
    const box = (inset: number, r: number) => { g.beginPath(); g.roundRect(inset, inset, size - inset * 2, size - inset * 2, r); };
    const ring = g.createConicGradient(0, size / 2, size / 2); ["#3ecf8e", "#4d8dff", "#e08fd0", "#f5a524", "#3ecf8e"].forEach((col, i) => ring.addColorStop(i / 4, col));
    box(0, size * 0.28); g.fillStyle = waiting ? "#f2994a" : running ? ring : theme; g.fill(); box(size * 0.055, size * 0.23); g.fillStyle = "#0d1012"; g.fill();
    g.fillStyle = "#fff"; g.font = `700 ${Math.round(size * 0.52)}px Geist, system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("a.", size / 2, size * 0.48);
    return c.toDataURL("image/png");
  } catch { return ""; }
}
/** While mounted, this page offers Multiplex's manifest. Returns the one-click install when the browser offers it (null when it does not: already installed, or a browser that cannot). */
export function useMultiplexInstall(): { install: (() => void) | null; installed: boolean } {
  const [offer, setOffer] = React.useState<any>(null); const [installed, setInstalled] = React.useState(false);
  React.useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setOffer(e); }; const done = () => { setOffer(null); setInstalled(true); };
    window.addEventListener("beforeinstallprompt", on); window.addEventListener("appinstalled", done);
    const icons = [192, 512].map((n) => ({ src: drawMark(n), sizes: `${n}x${n}` })).filter((i) => i.src);
    const link = document.createElement("link"); link.rel = "manifest"; link.href = `data:application/manifest+json,${encodeURIComponent(JSON.stringify(multiplexManifest(window.location.origin, icons)))}`;
    document.head.append(link);
    return () => { window.removeEventListener("beforeinstallprompt", on); window.removeEventListener("appinstalled", done); link.remove(); };
  }, []);
  return { install: offer ? () => { void offer.prompt(); setOffer(null); } : null, installed };
}
