// THE MACHINES PANEL (operator 2026-11-10, asked twice: "add a machine, SSH, one click"): other computers you can SSH into without a password. Add one, press Connect: antiloki is looked for there, put there if it is not, started, and tunnelled to a local address;
// Open shows that machine's own antiloki. The steps are said as they went, and a failure says what to do.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { addMachine, connectMachine, disconnectMachine, listMachines, removeMachine, type Machine } from "@/loki/api/remote";

const btn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: nav, fontSize: 12 };
const primary: React.CSSProperties = { ...btn, background: C.brand, borderColor: C.brand, color: "#fff", fontWeight: 600 };
/** The state of a machine in a word. Pure. */
export function machineState(m: Pick<Machine, "connected" | "up">): { word: string; tone: "ok" | "warn" | "idle" } { return m.connected && m.up ? { word: "connected", tone: "ok" } : m.connected ? { word: "connecting…", tone: "warn" } : { word: "not connected", tone: "idle" }; }

export function MachinesPanel({ onClose, inline = false }: { onClose: () => void; /** drawn in place (the sidebar's Remote section) instead of as a dialog */ inline?: boolean }) {
  const [list, setList] = React.useState<Machine[]>([]); const [target, setTarget] = React.useState(""); const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null); const [err, setErr] = React.useState(""); const [steps, setSteps] = React.useState<{ id: string; lines: string[] } | null>(null);
  const refresh = React.useCallback(async () => { const r = await listMachines(); if (r.machines) setList(r.machines); else if (r.error) setErr(r.error); }, []);
  React.useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 5000); return () => clearInterval(t); }, [refresh]);
  React.useEffect(() => { if (inline) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const act = async (key: string, f: () => Promise<{ machines: Machine[] | null; error?: string; steps?: string[] }>, id?: string) => {
    setBusy(key); setErr(""); const r = await f(); setBusy(null);
    if (r.machines) setList(r.machines); if (r.error) setErr(r.error); if (id && r.steps) setSteps({ id, lines: r.steps }); return r;
  };
  const add = async () => { if (!target.trim()) return; const r = await act("add", () => addMachine(target.trim(), name.trim())); if (!r.error) { setTarget(""); setName(""); } };
  const body = (
    <>
        {err && <div role="alert" data-testid="machines-error" style={{ color: C.bad, fontSize: 12.5 }}>{err}</div>}
        {list.length === 0 && <div data-testid="machines-empty" style={{ fontSize: 12.5, color: C.muted }}>No machine yet.</div>}
        {list.map((m) => { const st = machineState(m); return (
          <div key={m.id} data-testid={`machine-${m.id}`} data-state={st.word} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span aria-hidden style={{ width: 9, height: 9, borderRadius: 5, background: st.tone === "ok" ? C.ok : st.tone === "warn" ? C.warn : C.dim }} />
              <b style={{ fontSize: 13.5 }}>{m.name}</b><span style={{ fontFamily: mono, fontSize: 11.5, color: C.muted }}>{m.target}</span><span style={{ flex: 1 }} /><span data-testid={`machine-state-${m.id}`} style={{ fontSize: 11.5, color: st.tone === "ok" ? C.ok : C.muted }}>{st.word}</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {m.connected && m.up ? <>
                <a data-testid={`machine-open-${m.id}`} href={m.url} target="_blank" rel="noreferrer" style={{ ...primary, textDecoration: "none", display: "inline-block" }}>Open its screen</a>
                <button data-testid={`machine-disconnect-${m.id}`} disabled={busy !== null} onClick={() => void act(`d-${m.id}`, () => disconnectMachine(m.id))} style={btn}>Disconnect</button>
                <button data-testid={`machine-stop-${m.id}`} disabled={busy !== null} title="close the line and stop antiloki on that machine too" onClick={() => void act(`s-${m.id}`, () => disconnectMachine(m.id, true))} style={btn}>Stop it there too</button>
              </> : <button data-testid={`machine-connect-${m.id}`} disabled={busy !== null} onClick={() => void act(`c-${m.id}`, () => connectMachine(m.id), m.id)} style={primary}>{busy === `c-${m.id}` ? "connecting… (the first time installs antiloki there)" : "Connect"}</button>}
              <button data-testid={`machine-remove-${m.id}`} disabled={busy !== null} onClick={() => void act(`r-${m.id}`, () => removeMachine(m.id))} style={{ ...btn, color: C.bad }}>Remove</button>
            </div>
            {steps?.id === m.id && <ol data-testid={`machine-steps-${m.id}`} style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{steps.lines.map((l, i) => <li key={i}>{l}</li>)}</ol>}
          </div>
        ); })}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input data-testid="machine-target" aria-label="user@host" value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} placeholder="user@host   or   user@host:2222" style={{ flex: "2 1 200px", background: C.panel, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 9px", fontFamily: mono, fontSize: 12 }} />
          <input data-testid="machine-name" aria-label="a name for it" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} placeholder="name (optional)" style={{ flex: "1 1 120px", background: C.panel, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 9px", fontFamily: nav, fontSize: 12 }} />
          <button data-testid="machine-add" disabled={busy !== null || !target.trim()} onClick={() => void add()} style={primary}>Add a machine</button>
        </div>
    </>
  );
  if (inline) return <div data-testid="machines-inline" style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: nav, fontSize: 12.5, color: C.fg }}>{body}</div>;
  return (
    <div role="dialog" aria-label="Machines" data-testid="machines-panel" style={{ position: "fixed", inset: 0, zIndex: 400, display: "grid", placeItems: "center", background: "rgba(0,0,0,.5)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "min(600px, calc(100vw - 24px))", maxHeight: "calc(100vh - 24px)", overflowY: "auto", background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 12, fontFamily: nav }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>Machines</div><button data-testid="machines-close" aria-label="close" onClick={onClose} style={btn}>✕</button></div>
        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>Another computer you can reach with SSH (a key or the agent: antiloki never asks for a password). Connecting puts antiloki on it if it is not there, starts it, and gives you its screen at a local address.</div>
      {body}
      </div>
    </div>
  );
}
