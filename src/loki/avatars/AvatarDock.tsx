// THE DOCK (operator 2026-11-16): one small character per agent at the screen's edge. Click one: a read-only PREVIEW opens beside it (terminal, or the agent's facts), with a button that opens the full pane only if asked.
// A sleeping agent is dashed; "Wake and open" starts it again, and it reads its saga. The pill underneath is the multiplex indicator.
import * as React from "react";
import { apiGet, apiPost } from "@/loki/api/client";
import { Avatar, type AvatarState } from "./Avatar";

export type AgentRow = { pane_id: number; name: string; role: string; kind: string; state: "work" | "wait" | "idle" | "sleep" | "ended"; idle_min?: number };
export type Avatars = { enabled: boolean; minutes: number; agents: AgentRow[]; live: number; asleep: number };
/** Which rows get an avatar: not the ended ones. Pure. */
export const shown = (a: AgentRow[]) => a.filter((r) => r.state !== "ended" && r.kind !== "shell");
export const faceOf = (s: AgentRow["state"]): AvatarState => (s === "ended" ? "idle" : s);
const WORDS: Record<string, string> = { work: "working", wait: "waits for you", idle: "idle", sleep: "asleep", ended: "ended" };
export const wordsOf = (r: AgentRow) => (r.state === "idle" && r.idle_min ? `idle ${r.idle_min} min` : WORDS[r.state]);

const VARS = { ["--panel" as any]: "var(--c-bg)", ["--line" as any]: "var(--c-border)", ["--ac" as any]: "var(--c-brand, #7b8cff)", ["--ok" as any]: "var(--c-ok, #3ecf8e)", ["--bad" as any]: "var(--c-bad, #ef5b5b)", ["--warn" as any]: "#e5a63b", ["--dim" as any]: "var(--c-dim, #5a6069)" } as React.CSSProperties;

function Preview({ row, onClose }: { row: AgentRow; onClose: () => void }) {
  const [view, setView] = React.useState<"term" | "node">("term");
  const [rows, setRows] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (row.state === "sleep" || view !== "term") return; let on = true;
    const load = () => apiGet<{ rows?: string[] }>(`/api/v1/cockpit/pty/screen?pane_id=${row.pane_id}`).then((r) => { if (on && r?.rows) setRows(r.rows); });
    load(); const t = setInterval(load, 1500); return () => { on = false; clearInterval(t); };
  }, [row.pane_id, row.state, view]);
  const open = async () => { if (row.state === "sleep") await apiPost("/api/v1/cockpit/sleep/wake", { pane_id: row.pane_id }); window.dispatchEvent(new CustomEvent("antiloki:open-pane", { detail: { paneId: row.pane_id } })); onClose(); };
  const text = rows.map((r) => r.trimEnd()).filter((r, i, a) => r || a.slice(i).some(Boolean)).slice(-14).join("\n");
  const btn: React.CSSProperties = { border: 0, background: "none", color: "var(--c-muted)", cursor: "pointer", padding: 4, borderRadius: 6, font: "inherit", fontSize: 12 };
  return (
    <div data-testid="avatar-preview" style={{ position: "absolute", right: 56, top: 0, width: 380, background: "var(--c-bg)", border: "1px solid var(--c-border)", borderRadius: 12, overflow: "hidden", color: "var(--c-fg)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
        <Avatar role={row.role} paneId={row.pane_id} state={faceOf(row.state)} size={30} />
        <b style={{ fontWeight: 500 }}>{row.name || row.role || `pane ${row.pane_id}`}</b><span style={{ color: "var(--c-muted)", fontSize: 12 }}>{wordsOf(row)}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
          <button style={{ ...btn, color: view === "term" ? "var(--c-fg)" : undefined }} title="Terminal" onClick={() => setView("term")}>⌨</button>
          <button style={{ ...btn, color: view === "node" ? "var(--c-fg)" : undefined }} title="Agent" onClick={() => setView("node")}>◉</button>
          <button style={btn} title="Close" onClick={onClose}>✕</button>
        </span>
      </div>
      <div style={{ height: 200, borderBlock: "1px solid var(--c-border)", padding: "10px 12px", overflow: "hidden", fontSize: 11.5, lineHeight: 1.5, color: "var(--c-muted)" }}>
        {row.state === "sleep" ? <div style={{ color: "var(--c-dim)" }}>Asleep. Its terminal is closed and its saga is saved: what it did and what is left.<br /><br />Waking it starts a new terminal that reads the saga first.</div>
          : view === "term" ? <pre style={{ margin: 0, fontFamily: "var(--font-mono, ui-monospace, monospace)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text || "…"}</pre>
          : <div style={{ display: "grid", gap: 6, fontSize: 13 }}><span>Role · {row.role || "—"}</span><span>Engine · {row.kind || "—"}</span><span>Pane · {row.pane_id}</span><span>State · {wordsOf(row)}</span></div>}
      </div>
      <div style={{ padding: "8px 10px", display: "flex", gap: 8, alignItems: "center" }}>
        <button data-testid="avatar-open" onClick={open} style={{ border: "1px solid var(--c-border)", borderRadius: 8, padding: "4px 10px", background: row.state === "sleep" ? "var(--c-brand, #7b8cff)" : "none", color: row.state === "sleep" ? "#fff" : "var(--c-fg)", cursor: "pointer", font: "inherit" }}>{row.state === "sleep" ? "Wake and open" : "Open the full app"}</button>
        <span style={{ color: "var(--c-dim)", fontSize: 12 }}>only if you ask</span>
      </div>
    </div>
  );
}

export function AvatarDock() {
  const [d, setD] = React.useState<Avatars | null>(null);
  const [sel, setSel] = React.useState<number | null>(null);
  const [list, setList] = React.useState(false);
  React.useEffect(() => {
    let on = true; const load = () => { if (document.hidden) return; apiGet<Avatars>("/api/v1/cockpit/avatars").then((r) => { if (on && r && Array.isArray(r.agents)) setD(r); }); };
    load(); const t = setInterval(load, 6000); return () => { on = false; clearInterval(t); };
  }, []);
  const rows = d ? shown(d.agents) : []; const row = rows.find((r) => r.pane_id === sel) ?? null;
  if (!d || (!rows.length && !d.asleep)) return null;
  return (
    <div data-testid="avatar-dock" style={{ ...VARS, position: "fixed", right: 12, top: 76, zIndex: 40, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
      {rows.map((r) => (
        <button key={r.pane_id} data-testid={`avatar-${r.pane_id}`} title={`${r.name || r.role} · ${wordsOf(r)}`} onClick={() => setSel(sel === r.pane_id ? null : r.pane_id)} style={{ border: 0, background: "none", padding: 0, cursor: "pointer", position: "relative" }}>
          <Avatar role={r.role} paneId={r.pane_id} state={faceOf(r.state)} size={44} />
          {sel === r.pane_id && row ? <Preview row={row} onClose={() => setSel(null)} /> : null}
        </button>
      ))}
      <button data-testid="mux-pill" onClick={() => setList((v) => !v)} style={{ border: "1px solid var(--c-border)", background: "var(--c-bg)", color: "var(--c-muted)", borderRadius: 999, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}>{d.live} live · {d.asleep} asleep</button>
      {list ? <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 6, width: 230, background: "var(--c-bg)", border: "1px solid var(--c-border)", borderRadius: 10, padding: 8, fontSize: 12, color: "var(--c-muted)" }}>
        {d.agents.map((r) => <div key={r.pane_id} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}><span>{r.name || r.role || `pane ${r.pane_id}`}</span><span>{wordsOf(r)}</span></div>)}
        <div style={{ paddingTop: 8, display: "flex", alignItems: "center", gap: 6, color: "var(--c-dim)" }}>
          <label style={{ display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}><input data-testid="sleep-enabled" type="checkbox" checked={d.enabled} onChange={(e) => { const enabled = e.target.checked; setD({ ...d, enabled }); apiPost("/api/v1/cockpit/sleep", { enabled }); }} />sleep after</label>
          <input data-testid="sleep-minutes" type="number" min={1} max={1440} value={d.minutes} onChange={(e) => { const minutes = Math.max(1, Math.min(1440, Number(e.target.value) || 30)); setD({ ...d, minutes }); apiPost("/api/v1/cockpit/sleep", { minutes }); }} style={{ width: 52, background: "none", border: "1px solid var(--c-border)", borderRadius: 6, color: "var(--c-fg)", padding: "1px 4px" }} />min idle</div></div> : null}
    </div>
  );
}
