// PtyTerminal — a live shell over the BE PTY host, reusable anywhere (Settings › Environments, the
// PR fix terminal). Host runtime → a shell in the target dir; docker runtime → `docker exec` inside
// the workspace container (at the PR's worktree when start body carries ref_slug). Step "▶ Run"
// buttons POST their editable command into the same pane via runInPane(). Mirrors OpencodePane's
// xterm↔PTY wiring, minus the cockpit/vibe engine coupling.
import * as React from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { apiGet, apiPost } from "@/loki/api/client";
import { C } from "@/loki/theme";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';
export const ENV_PANE_ID = 990001;  // Settings › Environments (workspace root / container /repo)
export const FIX_PANE_ID = 990002;  // PR fix terminal (the PR's worktree / container /worktrees/<name>)

// Send a command line to a terminal pane (used by the setup-step ▶ Run buttons).
export async function runInPane(paneId: number, cmd: string) {
  await apiPost(`/api/v1/cockpit/pty/input`, { pane_id: paneId, data: String(cmd).replace(/\n?$/, "\n") });
}
export const runInEnv = (cmd: string) => runInPane(ENV_PANE_ID, cmd);

export function PtyTerminal({ paneId, startBody = {}, label = "terminal", height = 300, startTitle = "start a shell" }:
  { paneId: number; startBody?: any; label?: string; height?: number | string; startTitle?: string }) {
  const hostRef = React.useRef<any>(null);
  const termRef = React.useRef<any>(null);
  const lastId = React.useRef(0);
  const [running, setRunning] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!hostRef.current || termRef.current) return;
    const term = new Terminal({ fontFamily: mono, fontSize: 12, cursorBlink: true, theme: { background: "#0b0f16" } });
    const fit = new FitAddon(); term.loadAddon(fit); term.open(hostRef.current);
    // IN ORDER (Grokbot QA 2026-10-12, items 19-20: "git status" arrived as " status"): one un-awaited POST per keystroke can land out of order or be lost under load, which OpencodePane already learned
    // (2026-09-20). Keystrokes queue and go out one request at a time, whatever piled up while the previous one was in flight.
    let outQ = ""; let sending: Promise<void> = Promise.resolve();
    term.onData((d: string) => {
      outQ += d;
      sending = sending.then(async () => { const x = outQ; if (!x) return; outQ = ""; try { await apiPost(`/api/v1/cockpit/pty/input`, { pane_id: paneId, data: x }); } catch { /* the next key goes out with whatever follows */ } });
    });
    termRef.current = term;
    let rt: any = null;
    const doFit = () => { try { fit.fit(); } catch { /* hidden */ } const { cols, rows } = term; if (rt) clearTimeout(rt); rt = setTimeout(() => { void apiPost(`/api/v1/cockpit/pty/resize`, { pane_id: paneId, cols, rows }); }, 200); };
    doFit(); const ro = new ResizeObserver(doFit); ro.observe(hostRef.current);
    return () => { ro.disconnect(); if (rt) clearTimeout(rt); term.dispose(); termRef.current = null; };
  }, [paneId]);

  React.useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const r: any = await apiGet(`/api/v1/gate/build-live?contract_slug=${encodeURIComponent(`pane-pty-${paneId}`)}&after=${lastId.current}&phase=pty`);
        const d = r?.result ?? r;
        if (!stop && d?.chunks?.length) { lastId.current = d.last_id; for (const c of d.chunks) termRef.current?.write(c.chunk ?? ""); }
      } catch { /* pre-restart */ }
      try { const s: any = await apiGet(`/api/v1/cockpit/pty/status?pane_id=${paneId}`); if (!stop) setRunning(!!(s?.result ?? s)?.running); } catch { /* */ }
    };
    poll(); const t = setInterval(poll, 100); return () => { stop = true; clearInterval(t); }; // 100ms: snappy echo
  }, [paneId]);

  const start = async () => {
    setBusy(true);
    try { termRef.current?.clear(); lastId.current = 0; await apiPost(`/api/v1/workspace/pty/start`, { pane_id: paneId, ...startBody, cols: termRef.current?.cols ?? 100, rows: termRef.current?.rows ?? 24 }, { timeoutMs: 60000 }); }
    finally { setBusy(false); }
  };
  const kill = async () => { setBusy(true); try { await apiPost(`/api/v1/cockpit/pty/kill`, { pane_id: paneId }); } finally { setBusy(false); } };

  const btn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: "2px 9px", borderRadius: 4 };
  return (
    <div style={{ display: "flex", flexDirection: "column", height, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 10px", borderBottom: `1px solid ${C.border}`, background: C.panel }}>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: running ? C.ok : C.dim }}>{running == null ? "…" : running ? "● live" : "○ stopped"}</span>
        <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{label}</span>
        <span style={{ flex: 1 }} />
        <button disabled={busy} onClick={start} style={{ ...btn, color: C.ok, borderColor: C.ok }} title={startTitle}>▶ start shell</button>
        <button disabled={busy || !running} onClick={kill} style={{ ...btn, color: C.bad }} title="kill the terminal">⏹</button>
      </div>
      <div ref={hostRef} style={{ flex: 1, minHeight: 0, background: "#0b0f16", padding: "2px 4px" }} />
    </div>
  );
}

export function EnvTerminal() {
  return (
    <div style={{ marginTop: 12 }}>
      <PtyTerminal paneId={ENV_PANE_ID} label="workspace env terminal"
        startTitle="start a shell in the workspace env (host root, or docker exec into the container)" />
    </div>
  );
}
