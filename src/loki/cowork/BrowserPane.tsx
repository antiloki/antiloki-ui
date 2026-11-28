// THE BROWSER PANE (the operator 2026-11-22): opens on a pretty list of everything running on this machine's ports; a click shows it in the pane. The bar is also a search box (Google, Bing or DuckDuckGo, chosen by the icon). A site that refuses to be shown inside another app (Google, most big sites) is opened in a window of its own, never left as a blank refusal.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { checkFrame, launchAppWindow, runningPorts, type RunningPort } from "./api";

export type Engine = "google" | "bing" | "duckduckgo";
export const ENGINES: Record<Engine, { name: string; url: (q: string) => string; mark: string; color: string }> = {
  google: { name: "Google", url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`, mark: "G", color: "#4285f4" },
  bing: { name: "Bing", url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`, mark: "b", color: "#0f9d8a" },
  duckduckgo: { name: "DuckDuckGo", url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`, mark: "D", color: "#e8590c" },
};
/** What the bar's text means: a port, an address, or a search. Pure. */
export function resolve(raw: string, engine: Engine): string {
  const t = raw.trim(); if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (/^\d{2,5}$/.test(t)) return `http://localhost:${t}/`;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(t)) return `http://${t}`;
  if (!/\s/.test(t) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t)) return `https://${t}`;
  return ENGINES[engine].url(t);
}
const isLocal = (u: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(u);
const ghost: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 7, padding: "3px 10px", fontFamily: nav, fontSize: 12, cursor: "pointer" };
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

/** The list of what runs on this machine, and framed pages. */
export function BrowserPane() {
  const [url, setUrl] = React.useState(""); const [draft, setDraft] = React.useState("");
  const [engine, setEngine] = React.useState<Engine>(() => { const e = lsGet("antiloki.browser.engine"); return e === "bing" || e === "duckduckgo" ? e : "google"; }); const [pickOpen, setPickOpen] = React.useState(false);
  const [list, setList] = React.useState<RunningPort[] | null | undefined>(undefined); const [busy, setBusy] = React.useState(false);
  const [refused, setRefused] = React.useState<string | null>(null); const [note, setNote] = React.useState("");
  const scan = React.useCallback(async () => { setBusy(true); const r = await runningPorts(); setList(r); setBusy(false); }, []);
  React.useEffect(() => { if (!url) void scan(); }, [url, scan]);
  const pickEngine = (e: Engine) => { setEngine(e); setPickOpen(false); try { localStorage.setItem("antiloki.browser.engine", e); } catch { /* fine */ } };
  const openOutside = async (u: string) => { setNote(""); const r = await launchAppWindow({ id: "browser", url: u }); if (r.ok) { setNote("opened in a window of its own"); return; } window.open(u, "_blank", "noopener"); setNote("opened in a new tab"); };
  const go = async (raw: string) => {
    const u = resolve(raw, engine); if (!u) return; setDraft(u); setNote(""); setRefused(null);
    const v = await checkFrame(u); if (v.frameable === false) { setRefused(u); setUrl(u); return; }
    setUrl(u);
  };
  const running = (list ?? []).length > 0; const e = ENGINES[engine];
  return (
    <div data-testid="browser-pane" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", fontFamily: nav, color: C.fg, fontSize: 12.5 }}>
      <form onSubmit={(ev) => { ev.preventDefault(); void go(draft); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", position: "relative" }}>
        <button type="button" data-testid="browser-home" aria-label={running ? "Running now: something is running" : "Running now: nothing is running"} title={running ? `${list!.length} running: show the list` : "Nothing running: show the list"} onClick={() => { setUrl(""); setRefused(null); setDraft(""); }} style={{ ...ghost, padding: 0, width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 14 }}>
          <span data-testid="browser-dot" data-running={running ? "1" : "0"} style={{ width: 9, height: 9, borderRadius: "50%", background: running ? C.ok : C.muted, boxShadow: running ? `0 0 8px ${C.ok}` : "none" }} /></button>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, background: "color-mix(in srgb, var(--c-fg) 6%, transparent)", borderRadius: 999, padding: "0 12px 0 4px", height: 30 }}>
          <button type="button" data-testid="browser-engine" aria-label={`Search with ${e.name}`} title={`Search with ${e.name}`} onClick={() => setPickOpen((o) => !o)} style={{ all: "unset", cursor: "pointer", width: 22, height: 22, borderRadius: "50%", background: e.color, color: "#fff", fontWeight: 700, fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{e.mark}</button>
          <input data-testid="browser-address" value={draft} onChange={(ev) => setDraft(ev.target.value)} placeholder={`Search ${e.name} or type an address`} spellCheck={false} style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", color: C.fg, fontFamily: nav, fontSize: 12.5, outline: "none" }} /></div>
        {pickOpen && <div role="menu" data-testid="browser-engines" style={{ position: "absolute", left: 46, top: 40, zIndex: 20, background: "color-mix(in srgb, var(--c-bg) 96%, transparent)", backdropFilter: "blur(14px)", borderRadius: 10, padding: 4, boxShadow: "0 8px 28px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", minWidth: 150 }}>
          {(Object.keys(ENGINES) as Engine[]).map((k) => <button key={k} type="button" role="menuitem" data-testid={`engine-${k}`} onClick={() => pickEngine(k)} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 9, padding: "6px 10px", borderRadius: 7, fontSize: 12.5, background: k === engine ? "color-mix(in srgb, var(--c-fg) 8%, transparent)" : "transparent" }}><span style={{ width: 20, height: 20, borderRadius: "50%", background: ENGINES[k].color, color: "#fff", fontWeight: 700, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{ENGINES[k].mark}</span>{ENGINES[k].name}</button>)}</div>}
        {url && <a data-testid="browser-external" href={url} target="_blank" rel="noreferrer" style={{ color: C.brand, fontSize: 12 }}>open in a tab ↗</a>}
      </form>
      {refused ? (
        <div data-testid="browser-refused" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{(() => { try { return new URL(refused).hostname; } catch { return "This site"; } })()} cannot be shown inside another app</div>
          <div style={{ color: C.muted, maxWidth: 420, lineHeight: 1.5 }}>That is the site's own rule. It opens fine in a window of its own.</div>
          <button data-testid="browser-open-window" onClick={() => void openOutside(refused)} style={{ ...ghost, background: C.brand, color: "#fff", borderColor: C.brand, padding: "6px 16px" }}>Open in a window</button>
          {note && <div data-testid="browser-note" style={{ color: C.muted }}>{note}</div>}
        </div>
      ) : url ? <iframe data-testid="browser-frame" title="browser" src={url} referrerPolicy="no-referrer" sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-downloads" style={{ flex: 1, minHeight: 0, width: "100%", border: "none", background: "#fff" }} /> : (
        <div data-testid="browser-list" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ fontSize: 15, fontWeight: 600 }}>Running now</div><span style={{ color: C.muted }}>{list === undefined ? "looking…" : list === null ? "" : `${list.length} on this machine`}</span><span style={{ flex: 1 }} /><button data-testid="browser-rescan" onClick={() => void scan()} disabled={busy} style={ghost}>{busy ? "looking…" : "Refresh"}</button></div>
          {list === null && <div data-testid="browser-noserve" style={{ color: C.muted, lineHeight: 1.6, padding: "14px 0" }}>The serve running now cannot list ports yet (it is older than this screen). Restart it and press Refresh. You can still type a port or an address above.</div>}
          {list && list.length === 0 && <div data-testid="browser-empty" style={{ color: C.muted, lineHeight: 1.6, padding: "18px 0" }}>Nothing is listening on the usual dev ports yet. Start an app (an agent's preview, <span style={{ fontFamily: mono }}>npm run dev</span>) and press Refresh, or search above.</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {(list ?? []).map((p) => (
              <button key={p.port} data-testid={`running-${p.port}`} onClick={() => void go(p.url)} style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 4, padding: "11px 13px", borderRadius: 10, border: "none", background: "color-mix(in srgb, var(--c-fg) 6%, transparent)", color: C.fg, cursor: "pointer", fontFamily: nav, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}><span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: p.web ? C.ok : C.muted }} /><span style={{ fontFamily: mono, fontSize: 13, fontWeight: 600 }}>:{p.port}</span><span style={{ marginLeft: "auto", color: C.muted, fontSize: 11 }}>{p.web ? "web page" : "service"}</span></span>
                <span style={{ color: p.title ? C.fg : C.muted, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title ?? (p.web ? "no title" : "not a web page")}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
