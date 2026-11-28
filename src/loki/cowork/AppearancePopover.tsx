// THE APPEARANCE POPOVER (RFC 0007 §17.8): the one place for how the screen looks. Opacity of the terminals and panes with a slider that acts as you drag it, the wallpaper and how far
// it is darkened, and the palette: antiloki's own, or any theme on this machine, or one downloaded from a git address. Nothing here is saved anywhere but this browser.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import type { OmarchyTheme, ThemeList } from "./api";
import { MAX_DIM, MIN_OPACITY, type Appearance } from "./appearance";

const swatch = (t: OmarchyTheme) => ["background", "lighter_background", "accent", "green", "red"].map((k) => t.colors[k]).filter(Boolean);

export function AppearancePopover({ ap, set, themes, active, onInstall, onClose }: {
  ap: Appearance; set: (patch: Partial<Appearance>) => void; themes: ThemeList | null; active: OmarchyTheme | null;
  onInstall: (url: string) => Promise<{ ok: boolean; id?: string; error?: string }>; onClose: () => void;
}) {
  const [url, setUrl] = React.useState(""); const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const head: React.CSSProperties = { fontFamily: nav, fontSize: 10.5, letterSpacing: "0.05em", color: C.muted, textTransform: "uppercase", padding: "10px 0 4px" };
  const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, fontFamily: nav, fontSize: 12, color: C.fg };
  const chip = (on: boolean): React.CSSProperties => ({ fontFamily: nav, fontSize: 11, padding: "3px 9px", borderRadius: 6, cursor: "pointer", border: `1px solid ${on ? C.brand : C.border}`, background: on ? `color-mix(in oklab, ${C.brand} 16%, transparent)` : "transparent", color: on ? C.brand : C.fg });
  const download = async () => {
    if (!url.trim() || busy) return; setBusy(true); setError(null);
    const r = await onInstall(url.trim()); setBusy(false);
    if (r.ok && r.id) { setUrl(""); set({ themeId: r.id, wallpaper: null, follow: false }); } else setError(r.error ?? "could not download it");
  };
  return (
    <>
      <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 998 }} />
      <div role="dialog" aria-label="appearance" data-testid="appearance" style={{ position: "fixed", right: 12, bottom: 40, zIndex: 999, width: 330, maxHeight: "calc(100vh - 80px)", overflowY: "auto", padding: "6px 14px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: `color-mix(in oklab, ${C.panel2} 92%, transparent)`, backdropFilter: "blur(10px)", boxShadow: "0 18px 50px rgba(0,0,0,.45)" }}>
        <div style={head}>Terminals and panes</div>
        <label style={row}><span style={{ width: 66 }}>terminals</span>
          <input data-testid="appearance-opacity" aria-label="terminal opacity" type="range" min={Math.round(MIN_OPACITY * 100)} max={100} step={1} value={Math.round(ap.termOpacity * 100)} onChange={(e) => set({ termOpacity: Number(e.target.value) / 100 })} style={{ flex: 1 }} />
          <span data-testid="appearance-opacity-value" style={{ fontFamily: mono, width: 38, textAlign: "right" }}>{Math.round(ap.termOpacity * 100)}%</span></label>
        <label style={{ ...row, paddingTop: 6 }}><span style={{ width: 66 }}>panes</span>
          <input data-testid="appearance-pane-opacity" aria-label="pane opacity" type="range" min={Math.round(MIN_OPACITY * 100)} max={100} step={1} value={Math.round(ap.paneOpacity * 100)} onChange={(e) => set({ paneOpacity: Number(e.target.value) / 100 })} style={{ flex: 1 }} />
          <span data-testid="appearance-pane-opacity-value" style={{ fontFamily: mono, width: 38, textAlign: "right" }}>{Math.round(ap.paneOpacity * 100)}%</span></label>
        <div style={{ display: "flex", gap: 5, paddingTop: 7 }}>
          <button data-testid="opacity-solid" onClick={() => set({ termOpacity: 1, paneOpacity: 1 })} style={chip(ap.termOpacity === 1 && ap.paneOpacity === 1)}>solid</button>
          <button data-testid="opacity-glass" onClick={() => set({ termOpacity: 0.6, paneOpacity: 0.5 })} style={chip(ap.termOpacity === 0.6 && ap.paneOpacity === 0.5)}>glass</button>
          <button data-testid="opacity-clear" onClick={() => set({ termOpacity: 0, paneOpacity: 0 })} style={chip(ap.termOpacity === 0 && ap.paneOpacity === 0)}>see the background</button>
        </div>
        <div style={head}>Agent panes</div>
        <div style={{ display: "flex", gap: 5, paddingTop: 4 }} role="group" aria-label="how agent panes are drawn">
          <button data-testid="skin-terminal" aria-pressed={ap.agentSkin !== "chat"} onClick={() => set({ agentSkin: "terminal" })} style={chip(ap.agentSkin !== "chat")}>terminal</button>
          <button data-testid="skin-chat" aria-pressed={ap.agentSkin === "chat"} onClick={() => set({ agentSkin: "chat" })} style={chip(ap.agentSkin === "chat")}>chat</button>
        </div>
        <div style={head}>Pixel effects</div>
        <div style={{ display: "flex", gap: 5, paddingTop: 4 }} role="group" aria-label="how the pixel effects are drawn">
          <button data-testid="pixels-pixel" aria-pressed={!["shadow", "minimal", "liquid"].includes(ap.pixelStyle)} onClick={() => set({ pixelStyle: "pixel" })} style={chip(!["shadow", "minimal", "liquid"].includes(ap.pixelStyle))}>pixelated</button>
          <button data-testid="pixels-shadow" aria-pressed={ap.pixelStyle === "shadow"} onClick={() => set({ pixelStyle: "shadow" })} style={chip(ap.pixelStyle === "shadow")}>shadow</button>
          <button data-testid="pixels-liquid" aria-pressed={ap.pixelStyle === "liquid"} onClick={() => set({ pixelStyle: "liquid" })} style={chip(ap.pixelStyle === "liquid")}>liquid</button>
          <button data-testid="pixels-minimal" aria-pressed={ap.pixelStyle === "minimal"} onClick={() => set({ pixelStyle: "minimal" })} style={chip(ap.pixelStyle === "minimal")}>minimal</button>
        </div>
        <div style={head}>Theme</div>
        <label style={{ ...row, paddingBottom: 6 }}><input data-testid="appearance-follow" type="checkbox" checked={ap.follow} onChange={(e) => set({ follow: e.target.checked })} />follow my desktop theme{themes?.current ? <span style={{ color: C.muted }}>({themes.current})</span> : null}</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 190, overflowY: "auto" }}>
          <button data-testid="theme-default" onClick={() => set({ themeId: null, wallpaper: null, follow: false })} style={{ ...row, background: ap.themeId === null && !ap.follow ? C.hover : "transparent", border: "none", borderRadius: 6, padding: "5px 8px", cursor: "pointer", textAlign: "left" }}>antiloki's own<span style={{ flex: 1 }} /><span style={{ color: C.muted, fontSize: 11 }}>default</span></button>
          {themes === null && <div style={{ color: C.muted, fontSize: 12, padding: "4px 8px" }}>looking for themes…</div>}
          {themes && themes.themes.length === 0 && <div style={{ color: C.muted, fontSize: 12, padding: "4px 8px" }}>no antiloki themes on this machine yet. Download one below.</div>}
          {themes?.themes.map((t) => (
            <button key={t.id} data-testid={`theme-${t.id}`} aria-pressed={active?.id === t.id} onClick={() => set({ themeId: t.id, wallpaper: null, follow: false })}
              style={{ ...row, background: active?.id === t.id ? C.hover : "transparent", border: "none", borderRadius: 6, padding: "5px 8px", cursor: "pointer", textAlign: "left" }}>
              <span style={{ display: "flex" }}>{swatch(t).map((c, i) => <span key={i} style={{ width: 12, height: 12, background: c, border: `1px solid ${C.border}`, marginLeft: i ? -3 : 0, borderRadius: 3 }} />)}</span>
              <span style={{ flex: 1 }}>{t.name}</span><span style={{ color: C.muted, fontSize: 11 }}>{t.custom ? <span data-testid={`theme-custom-${t.id}`} style={{ color: C.brand }}>custom</span> : t.source === "downloaded" ? "downloaded" : t.mode}</span>
            </button>
          ))}
        </div>
        {active && active.backgrounds.length > 0 && (
          <>
            <div style={head}>Background</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <button data-testid="wall-none" onClick={() => set({ wallpaper: "" })} style={chip(ap.wallpaper === "")}>none</button>
              {active.backgrounds.map((b, i) => <button key={b} data-testid={`wall-${i}`} title={b} onClick={() => set({ wallpaper: b })} style={chip((ap.wallpaper ?? active.backgrounds[0]) === b)}>{i + 1}</button>)}
            </div>
            <label style={{ ...row, paddingTop: 8 }}><span style={{ width: 66 }}>darken</span>
              <input data-testid="appearance-dim" aria-label="darken the background" type="range" min={0} max={Math.round(MAX_DIM * 100)} step={1} value={Math.round(ap.dim * 100)} onChange={(e) => set({ dim: Number(e.target.value) / 100 })} style={{ flex: 1 }} />
              <span style={{ fontFamily: mono, width: 38, textAlign: "right" }}>{Math.round(ap.dim * 100)}%</span></label>
          </>
        )}
        <div style={head}>Download a theme</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input data-testid="theme-url" aria-label="git address of a theme" value={url} placeholder="https://github.com/…/…-theme" onChange={(e) => { setUrl(e.target.value); setError(null); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") void download(); }}
            style={{ flex: 1, minWidth: 0, background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px", fontFamily: mono, fontSize: 11.5, outline: "none" }} />
          <button data-testid="theme-download" disabled={busy || !url.trim()} onClick={() => void download()} style={{ ...chip(false), opacity: busy || !url.trim() ? 0.5 : 1 }}>{busy ? "downloading…" : "download"}</button>
        </div>
        {error && <div data-testid="theme-error" style={{ color: C.bad, fontSize: 11.5, lineHeight: 1.4, paddingTop: 5 }}>{error}</div>}
        <div style={{ color: C.muted, fontSize: 11, lineHeight: 1.45, paddingTop: 6 }}>Saved in antiloki's own folder{themes?.dir ? ` (${themes.dir})` : ""}. Your desktop theme is never changed.</div>
      </div>
    </>
  );
}
