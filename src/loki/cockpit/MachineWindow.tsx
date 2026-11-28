// THE MACHINE WINDOW (operator 2026-11-21, approved mockup): three rings (CPU, RAM, VRAM) that ease to their value and turn amber then red, one line of advice, the last two minutes as lines, and who is using it. A card in the middle of the screen, drawn in the body (the bottom bar's blur would otherwise hang it off the bottom).
import * as React from "react";
import { createPortal } from "react-dom";
import { C, mono, nav } from "@/loki/theme";
import { useTourUnlock } from "@/loki/shell/mini-tour";
import { apiPost } from "@/loki/api/client";
import { adviceOf, gb, toneColor, toneOf, useMachine, type Machine } from "./machine";
import { PausedBar, usePaused } from "./pane-watch";

const R = 36, CIRC = 2 * Math.PI * R;
function Ring({ label, pct, sub, id }: { label: string; pct: number | null; sub: string; id: string }) {
  const t = toneOf(pct); const off = CIRC * (1 - Math.min(100, Math.max(0, pct ?? 0)) / 100);
  return (
    <div data-testid={`machine-${id}`} data-tone={pct == null ? "none" : t} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 10, display: "grid", justifyItems: "center", gap: 4 }}>
      <div style={{ position: "relative", width: 88, height: 88 }}>
        <svg viewBox="0 0 88 88" width={88} height={88} aria-hidden>
          <circle cx={44} cy={44} r={R} fill="none" stroke={C.border} strokeWidth={7} />
          {pct != null && <circle cx={44} cy={44} r={R} fill="none" stroke={toneColor(t)} strokeWidth={7} strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={off} transform="rotate(-90 44 44)" style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1), stroke .3s" }} />}
        </svg>
        <div data-testid={`machine-${id}-pct`} style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: mono, fontWeight: 600, fontSize: 18 }}>{pct == null ? "—" : `${Math.round(pct)}%`}</div>
      </div>
      <div style={{ fontSize: 12, color: C.muted }}>{label}</div><div style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>{sub}</div>
    </div>);
}
function Lines({ hist }: { hist: { cpu: number[]; ram: number[]; vram: number[] } }) {
  const W = 400, H = 44; const path = (a: number[]) => (a.length < 2 ? "" : "M" + a.map((v, i) => `${((i * W) / (a.length - 1)).toFixed(1)},${(H - 2 - (v / 100) * (H - 6)).toFixed(1)}`).join(" L"));
  const y80 = H - 2 - 0.8 * (H - 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="CPU, RAM and VRAM over the last two minutes" style={{ width: "100%", height: 44, display: "block" }}>
      <line x1={0} x2={W} y1={y80} y2={y80} stroke="var(--c-warn)" strokeDasharray="3 4" opacity={0.5} vectorEffect="non-scaling-stroke" />
      {([["cpu", "#7fb7e6"], ["ram", "#8fd0c0"], ["vram", "#b79cf0"]] as const).map(([k, c]) => <path key={k} d={path(hist[k])} fill="none" stroke={c} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />)}
    </svg>);
}
const procRow = (p: Machine["procs"][number]) => ({ key: p.pid, name: p.name, kind: p.kind, cpu: p.cpu === null ? "—" : `${Math.round(p.cpu)}%`, ram: p.ram_kb >= 1048576 ? `${(p.ram_kb / 1048576).toFixed(1)} GB` : `${Math.round(p.ram_kb / 1024)} MB` });

export function MachineWindow({ onClose }: { onClose: () => void }) {
  useTourUnlock("machine");
  const { now, hist } = useMachine(2000);
  const stopped = usePaused();
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const [ask, setAsk] = React.useState(false); const [msg, setMsg] = React.useState(""); const [busy, setBusy] = React.useState(false);
  const unload = async () => { setBusy(true); setMsg(""); const r: any = await apiPost("/api/v1/machine/unload", {}).catch(() => null); setBusy(false); setAsk(false); const v = r?.result ?? r; setMsg(!v ? "the serve could not be reached" : v.ok === false && v.error ? String(v.error) : (v.unloaded ?? []).length ? `Unloaded ${(v.unloaded as string[]).join(", ")}. The memory comes back in a moment.` : String(v.note ?? "no model was loaded")); };
  const hasLocal = !!now?.procs.some((p) => p.kind === "local model");
  const adv = now ? adviceOf(now) : null; const cell: React.CSSProperties = { textAlign: "right", fontFamily: mono, fontSize: 12 };
  return createPortal(
    <div data-testid="machine-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", padding: 14 }}>
      <div data-testid="machine-window" role="dialog" aria-label="machine" style={{ width: "min(480px, 100%)", maxHeight: "min(90vh, 720px)", overflowY: "auto", borderRadius: 16, fontFamily: nav, color: C.fg, background: C.panel, border: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "14px 18px 0" }}>
          <b style={{ fontSize: 14, fontWeight: 600 }}>Machine</b>
          <span data-testid="machine-label" style={{ fontSize: 11.5, color: now ? toneColor(now.tone) : C.dim, border: `1px solid ${C.border}`, borderRadius: 999, padding: "0 8px" }}>{now ? now.tone : "reading…"}</span>
          <span style={{ flex: 1 }} /><button aria-label="Close" onClick={onClose} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 12 }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, padding: "14px 18px" }}>
          <Ring id="cpu" label="CPU" pct={now?.cpu.pct ?? null} sub={now?.cpu.cores ? `${now.cpu.cores} cores` : "—"} />
          <Ring id="ram" label="RAM" pct={now?.ram?.pct ?? null} sub={now?.ram ? `${gb(now.ram.used_mb)} of ${gb(now.ram.total_mb)}` : "not readable"} />
          <Ring id="vram" label="VRAM" pct={now?.vram?.pct ?? null} sub={now?.vram ? `${gb(now.vram.used_mb)} of ${gb(now.vram.total_mb)}` : "no GPU found"} />
        </div>
        {adv && <div data-testid="machine-advice" role="status" style={{ margin: "0 18px 12px", border: `1px solid ${adv.tone === "calm" ? C.border : `color-mix(in srgb, ${toneColor(adv.tone)} 55%, transparent)`}`, background: adv.tone === "calm" ? "transparent" : `color-mix(in srgb, ${toneColor(adv.tone)} 11%, transparent)`, color: adv.tone === "calm" ? C.muted : C.fg, borderRadius: 10, padding: "8px 10px", fontSize: 12.5, lineHeight: 1.45 }}>{adv.text}</div>}
        {stopped.length > 0 && <div data-testid="machine-paused" style={{ borderTop: `1px solid ${C.border}` }}>{stopped.map((p) => <PausedBar key={p.paneId} paneId={p.paneId} name={`agent ${p.paneId}`} />)}</div>}
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}` }}><div style={{ fontSize: 11.5, color: C.dim, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 6 }}>Last two minutes</div><Lines hist={hist} />
          <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: C.dim, marginTop: 6 }}><span style={{ color: "#7fb7e6" }}>● CPU</span><span style={{ color: "#8fd0c0" }}>● RAM</span><span style={{ color: "#b79cf0" }}>● VRAM</span></div></div>
        {hasLocal && <div style={{ padding: "0 18px 12px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!ask ? <button data-testid="machine-unload" onClick={() => setAsk(true)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 8, padding: "4px 12px", fontFamily: nav, fontSize: 12.5, cursor: "pointer" }}>Unload local models</button>
            : <><span style={{ fontSize: 12.5 }}>Free the memory of every model Ollama holds? The model files stay.</span><button data-testid="machine-unload-yes" disabled={busy} onClick={() => void unload()} style={{ background: C.brand, border: "none", color: "var(--c-bg)", borderRadius: 8, padding: "4px 12px", fontFamily: nav, fontSize: 12.5, cursor: "pointer" }}>{busy ? "Unloading…" : "Unload"}</button><button data-testid="machine-unload-no" onClick={() => setAsk(false)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 8, padding: "4px 12px", fontFamily: nav, fontSize: 12.5, cursor: "pointer" }}>Cancel</button></>}
          {msg && <span data-testid="machine-unload-msg" role="status" style={{ fontSize: 12.5, color: C.muted }}>{msg}</span>}</div>}
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}` }}><div style={{ fontSize: 11.5, color: C.dim, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 6 }}>Who is using it</div>
          {(now?.procs ?? []).length === 0 && <div style={{ color: C.muted, fontSize: 12.5 }}>{now ? "This machine cannot list processes." : "reading…"}</div>}
          {(now?.procs ?? []).slice(0, 6).map((p) => { const r = procRow(p); return (
            <div key={r.key} data-testid="machine-proc" style={{ display: "grid", gridTemplateColumns: "1fr 56px 76px", gap: 8, padding: "5px 0", borderTop: `1px solid ${C.border}`, fontSize: 12.5, alignItems: "center" }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name} <span style={{ color: C.dim }}>{r.kind}</span></span><span style={cell}>{r.cpu}</span><span style={cell}>{r.ram}</span></div>); })}
        </div>
        <div style={{ padding: "10px 18px 14px", borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.muted }}>Live · every 2 seconds</div>
      </div>
    </div>, document.body);
}
