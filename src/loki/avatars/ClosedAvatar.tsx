// MULTIPLEX, THE CLOSED APP'S ONE MARK (N13; redrawn 2026-11-27, the operator: "drop the avatar, add the multicolored borders icon a., make the window more like AffectUI, animations"): the page the desktop shell shows in a small
// transparent window when the main window is closed but agents or teams still run. The mark "a." shows the busiest state (waits for you > working > quiet); click it for a card per busy agent and a button that brings the app back.
// Flat, never 3D (no shadows or glows); every motion stops when less motion is asked for. The mark can be dragged anywhere, and its ✕ closes the icon only.
import * as React from "react";
import { apiGet, apiPost } from "@/loki/api/client";
import type { AvatarState } from "./Avatar";
import { dragMark, fitMark, hideMark, openMain } from "./desktop-mark";
import { shown, wordsOf, type AgentRow, type Avatars } from "./AvatarDock";

/** The one state to show: a gate or a waiting agent first, then work, then sleep; null when there is nothing to show. Pure. */
export function oneState(rows: AgentRow[], gates: number): AvatarState | null {
  if (gates > 0 || rows.some((r) => r.state === "wait")) return "wait"; if (rows.some((r) => r.state === "work")) return "work";
  if (rows.some((r) => r.state === "idle")) return "idle"; if (rows.length) return "sleep"; return null;
}

/** The agent's name for a row: its own, else its role, else a plain "agent" (never a bare pane number). Pure. */
export const nameOfRow = (r: AgentRow): string => r.name || (r.role ? r.role[0].toUpperCase() + r.role.slice(1) : "Agent");
/** One line: how many work, how many wait, how many decisions. Pure. */
export function summary(rows: AgentRow[], gates: number): string { const w = rows.filter((r) => r.state === "work").length, q = rows.filter((r) => r.state === "wait").length; return [w ? `${w} working` : "", q ? `${q} waiting` : "", gates ? `${gates} to decide` : ""].filter(Boolean).join(" · ") || "all quiet"; }
export const MULTIPLEX_CSS = `@property --mx-ang{syntax:"<angle>";initial-value:0deg;inherits:false}
@keyframes mx-turn{to{--mx-ang:360deg}}@keyframes mx-spin{to{transform:rotate(360deg)}}@keyframes mx-breath{50%{opacity:.35}}
@keyframes mx-pop{from{opacity:0;transform:translateY(10px) scale(.94)}to{opacity:1;transform:none}}@keyframes mx-in{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
@keyframes mx-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}@keyframes mx-dot{0%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}@keyframes mx-wash{50%{background-color:color-mix(in srgb,var(--mx-c) 15%,transparent)}}
/* SMALL AND GLASSY UNTIL THE POINTER IS ON IT (operator 2026-11-27): see-through at rest, solid under the mouse or the keyboard; less see-through while somebody waits */
.mx-root{zoom:.82;opacity:.62;transition:opacity .22s ease}.mx-root[data-state=wait]{opacity:.85}.mx-root:hover,.mx-root:has(:focus-visible){opacity:1}
.mx-root .mx-mark,.mx-root .mx-panel{backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);transition:background-color .22s ease,transform .18s ease}
.mx-mark{position:relative;width:54px;height:54px;border:0;border-radius:17px;background-color:rgba(13,16,18,.55);color:#fff;font:700 24px/1 Geist,Inter,system-ui,sans-serif;letter-spacing:-1px;cursor:pointer;padding:0;animation:mx-pop .42s cubic-bezier(.2,1.3,.4,1) both;transition:transform .18s ease}
.mx-mark:hover{transform:translateY(-2px)}.mx-mark:active{transform:scale(.95)}.mx-mark:focus-visible{outline:2px solid #8a8fff;outline-offset:2px}
.mx-ring{position:absolute;inset:0;border-radius:inherit;padding:2px;pointer-events:none;background:var(--c-brand,#c97c5c);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
/* THE MARK IS ALWAYS THE LOGO ON BLACK; only its border speaks (operator 2026-11-27): the worn theme's colour at rest, all colour and turning while an agent runs */
.mx-mark[data-running="1"] .mx-ring{background:conic-gradient(from var(--mx-ang),#3ecf8e,#4d8dff,#e08fd0,#f5a524,#3ecf8e);animation:mx-turn 2.4s linear infinite}
.mx-root:hover .mx-mark,.mx-root:has(:focus-visible) .mx-mark{background-color:#0d1012}
/* SOMEBODY IS NEEDED: the border is orange, in place of the colours or the theme's, until it is answered (operator 2026-11-27) */
.mx-mark[data-state="wait"] .mx-ring{background:#f2994a;animation:mx-breath 1.3s ease-in-out infinite}
.mx-x{position:absolute;top:-8px;left:-8px;width:20px;height:20px;border-radius:50%;border:1px solid #ffffff26;background:#1b1f22;color:#e4e7e2;font:600 10px/1 Geist,Inter,system-ui,sans-serif;cursor:pointer;padding:0;opacity:0;transition:opacity .18s ease}
.mx-wrap{position:relative}.mx-wrap:hover .mx-x,.mx-x:focus-visible{opacity:1}
.mx-badge{position:absolute;top:-7px;right:-7px;min-width:19px;height:19px;padding:0 5px;box-sizing:border-box;border-radius:10px;background:#f2994a;color:#17110a;font:700 11px/19px Geist,Inter,system-ui,sans-serif;letter-spacing:0;animation:mx-pop .3s cubic-bezier(.2,1.5,.4,1) both}
.mx-panel{width:316px;display:flex;flex-direction:column;background:rgba(15,18,20,.58);border:1px solid #ffffff17;border-radius:16px;overflow:hidden;transform-origin:100% 100%;animation:mx-pop .28s cubic-bezier(.2,1.15,.35,1) both}
.mx-card{--mx-c:#4cb782;display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:11px;border:1px solid color-mix(in srgb,var(--mx-c) 28%,transparent);background-color:color-mix(in srgb,var(--mx-c) 6%,transparent);animation:mx-in .34s ease both,mx-wash 2.6s ease-in-out infinite}
.mx-card[data-state=wait]{--mx-c:#f2994a}
.mx-tile{width:28px;height:28px;border-radius:9px;flex:none;display:grid;place-items:center;font-weight:700;font-size:12px;background:color-mix(in srgb,var(--mx-c) 18%,transparent);color:var(--mx-c)}
.mx-pill{display:inline-flex;align-items:center;gap:6px;flex:none;height:21px;padding:0 8px;border-radius:7px;font-size:11px;font-weight:600;color:var(--mx-c);background:color-mix(in srgb,var(--mx-c) 14%,transparent)}
.mx-spin{width:9px;height:9px;border-radius:50%;border:1.6px solid color-mix(in srgb,var(--mx-c) 30%,transparent);border-top-color:var(--mx-c);animation:mx-spin .8s linear infinite}
.mx-dots{display:inline-flex;gap:3px}.mx-dots i{width:3px;height:3px;border-radius:50%;background:currentColor;animation:mx-dot 1.2s ease-in-out infinite}.mx-dots i:nth-child(2){animation-delay:.15s}.mx-dots i:nth-child(3){animation-delay:.3s}
.mx-bar{display:flex;gap:3px;height:4px;margin:0 14px 10px}.mx-bar i{border-radius:2px;transform-origin:0 50%;animation:mx-grow .6s cubic-bezier(.2,.9,.3,1) both;transition:flex-grow .5s ease}
.mx-go{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:32px;border:1px solid #ffffff1c;border-radius:10px;background:#ffffff0d;color:#eef0ec;font:600 12.5px Geist,Inter,system-ui,sans-serif;cursor:pointer;transition:background .18s ease,border-color .18s ease}
.mx-go span{transition:transform .18s ease}.mx-go:hover{background:#ffffff18;border-color:#ffffff33}.mx-go:hover span{transform:translateX(3px)}
@media (prefers-reduced-motion:reduce){.mx-root,.mx-root .mx-mark,.mx-root .mx-panel{transition:none}.mx-mark,.mx-ring,.mx-badge,.mx-panel,.mx-card,.mx-spin,.mx-dots i,.mx-bar i{animation:none !important}}`;

/** What runs right now, asked every few seconds. `clock` is the window whose timer counts: a pinned window keeps its own, so a hidden page does not slow it. */
export function useMultiplex(pollMs = 5000, clock: Window | null = null): { rows: AgentRow[]; gates: number; state: AvatarState | null; answered: boolean | null } {
  const [d, setD] = React.useState<Avatars | null>(null); const [gates, setGates] = React.useState(0); const [answered, setAnswered] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    let on = true; const go = () => { void apiGet<Avatars>("/api/v1/cockpit/avatars").catch(() => null).then((r) => { if (!on) return; const ok = !!r && Array.isArray(r.agents); setAnswered(ok); if (ok) setD(r); });
      void apiPost<{ runs?: { needs_you?: boolean }[] }>("/api/v1/cockpit/team-graph", { op: "list" }).then((r: any) => { if (on) setGates((r?.runs ?? []).filter((x: any) => x.needs_you).length); }).catch(() => {}); };
    const w = clock ?? window; go(); const t = w.setInterval(go, pollMs); return () => { on = false; w.clearInterval(t); };
  }, [pollMs, clock]);
  const rows = d ? shown(d.agents) : []; return { rows, gates, state: oneState(rows, gates), answered };
}
/** The window's inside: the head, the meter, a card per busy agent, and the way back to antiloki. */
export function MultiplexPanel({ rows, gates, onOpen, extra }: { rows: AgentRow[]; gates: number; onOpen: () => void; /** controls under the button */ extra?: React.ReactNode }) {
  const active = rows.filter((r) => r.state === "work" || r.state === "wait"); const quiet = rows.filter((r) => r.state !== "work" && r.state !== "wait");
  const waiting = rows.filter((r) => r.state === "wait").length + gates; const working = rows.filter((r) => r.state === "work").length;
  const parts = [{ k: "wait", n: waiting, c: "#f2994a" }, { k: "work", n: working, c: "#4cb782" }, { k: "quiet", n: quiet.length, c: "#2c3236" }].filter((p) => p.n > 0);
  const muted = "#838a85";
  return (
        <div role="region" aria-label="antiloki is running" data-testid="closed-avatar-list" className="mx-panel">
          <div data-testid="closed-avatar-head" style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "13px 14px 9px" }}><b style={{ fontWeight: 600, fontSize: 13 }}>antiloki is running</b><span style={{ marginLeft: "auto", fontSize: 11.5, color: muted }}>{summary(rows, gates)}</span></div>
          <div aria-hidden className="mx-bar">{parts.map((p, i) => <i key={p.k} style={{ flexGrow: p.n, flexBasis: 0, background: p.c, animationDelay: `${0.08 + i * 0.09}s` }} />)}</div>
          <div style={{ maxHeight: "min(50vh, 250px)", overflowY: "auto", padding: "0 8px", display: "flex", flexDirection: "column", gap: 6 }}>
            {gates > 0 && <div data-testid="closed-avatar-gates" className="mx-card" data-state="wait" style={{ animationDelay: ".05s, 0s" }}><span className="mx-tile">!</span><span style={{ flex: 1 }}>Waits for you: {gates} decision{gates === 1 ? "" : "s"}</span></div>}
            {active.map((r, i) => <div key={r.pane_id} data-testid={`closed-avatar-row-${r.pane_id}`} className="mx-card" data-state={r.state} style={{ animationDelay: `${0.07 + (i + (gates > 0 ? 1 : 0)) * 0.06}s, 0s` }}>
              <span aria-hidden className="mx-tile">{nameOfRow(r)[0].toUpperCase()}</span>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.35 }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{nameOfRow(r)}</span>{(r.role || r.kind) && <span style={{ fontSize: 11, color: muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[r.role, r.kind].filter(Boolean).join(" · ")}</span>}</span>
              <span className="mx-pill">{r.state === "work" ? <><i className="mx-spin" />{wordsOf(r)}<span aria-hidden className="mx-dots"><i /><i /><i /></span></> : wordsOf(r)}</span></div>)}
            {quiet.length > 0 && <div data-testid="closed-avatar-quiet" style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 11px", color: muted, fontSize: 12, animation: "mx-in .34s ease .25s both" }}><span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: "#4a5156" }} />{quiet.length} more {quiet.length === 1 ? "agent" : "agents"} idle or asleep</div>}
          </div>
          <div style={{ padding: "9px 8px 8px" }}><button data-testid="closed-avatar-open" className="mx-go" onClick={onOpen}>Open antiloki<span aria-hidden>→</span></button>{extra}</div>
        </div>
  );
}
/** Is any agent running right now? Pure. */
export const isRunning = (rows: AgentRow[]): boolean => rows.some((r) => r.state === "work");
/** The "a." mark: white on black; its border is the theme's colour at rest, all colour and turning while an agent runs, and orange with a count while somebody is needed. */
export function MultiplexMark({ rows, gates, state, open, onClick, onDrag }: { rows: AgentRow[]; gates: number; state: AvatarState | null; open?: boolean; onClick?: () => void; /** the pointer pulled the mark: it is being moved, not clicked */ onDrag?: () => void }) {
  const from = React.useRef<{ x: number; y: number } | null>(null); const moved = React.useRef(false);
  const waiting = rows.filter((r) => r.state === "wait").length + gates;
  return (
    <button data-testid="closed-avatar-face" className="mx-mark" data-state={state ?? "sleep"} data-running={isRunning(rows) ? "1" : "0"} aria-expanded={onClick ? open : undefined}
      onPointerDown={(e) => { moved.current = false; from.current = e.button === 0 ? { x: e.screenX, y: e.screenY } : null; }} onPointerUp={() => { from.current = null; }}
      onPointerMove={(e) => { const f = from.current; if (!f || !onDrag || Math.abs(e.screenX - f.x) + Math.abs(e.screenY - f.y) <= 5) return; from.current = null; moved.current = true; onDrag(); }} aria-label={`antiloki is running: ${summary(rows, gates)}`} title="antiloki is running" onClick={() => { if (!moved.current) onClick?.(); moved.current = false; }} style={onClick ? undefined : { cursor: "default" }}>
      <span aria-hidden className="mx-ring" data-testid="closed-mark" />a.{waiting > 0 && <span data-testid="closed-mark-count" className="mx-badge">{waiting}</span>}</button>
  );
}
export function ClosedAvatar({ pollMs = 5000 }: { pollMs?: number }) {
  const { rows, gates, state, answered } = useMultiplex(pollMs); const [open, setOpen] = React.useState(false);
  const box = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const el = box.current; if (!el) return; const tell = () => { const r = el.getBoundingClientRect(); if (r.width) fitMark(r.width + 30, r.height + 30); };
    tell(); if (typeof ResizeObserver === "undefined") return; const ro = new ResizeObserver(tell); ro.observe(el); return () => ro.disconnect();
  });
  React.useEffect(() => { try { document.body.style.background = "transparent"; document.documentElement.style.background = "transparent"; } catch { /* no document */ } }, []);
  if (!answered) return null;   // nothing is drawn until antiloki has answered; with no agents at all the mark rests
  return (
    <div ref={box} data-testid="closed-avatar" className="mx-root" data-state={state ?? "sleep"} style={{ position: "fixed", right: 14, bottom: 14, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, fontFamily: "Geist, Inter, system-ui, sans-serif", fontSize: 13, color: "#dfe2dd" }}>
      <style>{MULTIPLEX_CSS}</style>
      {open && (
        <MultiplexPanel rows={rows} gates={gates} onOpen={openMain} />)}
      <div className="mx-wrap">
        <MultiplexMark rows={rows} gates={gates} state={state} open={open} onClick={() => setOpen((o) => !o)} onDrag={dragMark} />
        <button data-testid="closed-mark-close" className="mx-x" aria-label="close the icon" title="close the icon: your agents keep working" onClick={() => { setOpen(false); hideMark(); }}>✕</button>
      </div>
    </div>
  );
}
