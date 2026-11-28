/**
 * OpencodePane — EPIC-VIBE-OPENCODE-ACT-LAYER P2/P3 FE. A REAL terminal (xterm.js)
 * over the BE's PTY host: output tails build_gate_live (key pane-pty-<id>, phase
 * 'pty') through the same endpoint the gate terminals use; keystrokes POST to
 * /cockpit/pty/input. ▶ boots OpenCode inside the pane's box (sparse worktree +
 * AGENTS.md + proxied model — provisioned by pane-add); ⏹ kills it.
 */
import * as React from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { apiGet, apiPost } from "@/loki/api/client";
import { subscribePane } from "./pty-streams";
import { C } from "@/loki/theme";
import { isSubscriptionPaneKind } from "@/loki/api/engine";
import { paneDisplay } from "@/loki/widgets/types";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';

// INSTANT TERMINAL (plan S3, corrected 2026-07-12): typing is instant BY
// DEFAULT — no mode, no toggle. On every keystroke we open a short FAST-POLL
// window (activeUntil), so the PTY's echo returns within ~a frame instead of
// waiting for the idle cadence. Combined with the BE's 16ms output flush, the
// echo round-trip is a frame or two — imperceptible — with zero double-char
// risk (we never echo locally; the PTY is always the single source of truth).
const FAST_MS = 16;   // poll cadence while actively typing / output flowing
const IDLE_MS = 220;  // poll cadence when quiet
const ACTIVE_WINDOW_MS = 800; // keep fast-polling this long after a keystroke

// the terminal wears the app THEME (operator 2026-07-25): xterm needs concrete colors, not CSS vars —
// resolve them from the live theme at mount so the pane matches every other pane.
function themeColors() {
  try {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
    return { bg: v("--c-bg", "#0b0f16"), fg: v("--c-fg", "#e7e7ea"), dim: v("--c-dim", "#8b8fa3") };
  } catch { return { bg: "#0b0f16", fg: "#e7e7ea", dim: "#8b8fa3" }; }
}

// auto (the inline chat panes): no control row — the agent BOOTS ITSELF once the pane attaches
// (operator 2026-07-25: "once the panel is created it should play already").
/** THE INTERCEPT (operator 2026-09-20: "it just codes normally like raw Claude"): with Heimdall on, what the
 *  operator types echoes in the CLI's composer as usual, but Enter hands the LINE to the pane instead of the
 *  CLI when `intercept(line)` takes it — the composer is cleared (ctrl+u) and the router decides first.
 *  Pure line tracking: printable text accumulates, backspace removes, an escape sequence (arrows, history)
 *  gives up tracking so that Enter passes through untouched. */
export function trackLine(buf: string, d: string): { buf: string; enter: boolean; tracked: boolean } {
  if (d === "\r" || d === "\n") return { buf, enter: true, tracked: true };
  if (d === "\x7f" || d === "\b") return { buf: buf.slice(0, -1), enter: false, tracked: true };
  if (d === "\x15" || d === "\x03") return { buf: "", enter: false, tracked: true }; // ctrl+u / ctrl+c: the composer is empty again
  if (d === "\x1b[I" || d === "\x1b[O" || d === "") return { buf, enter: false, tracked: true }; // focus in/out: not a keystroke
  // eslint-disable-next-line no-control-regex -- the escape byte IS the thing being matched
  const text = d.replace(/\x1b\[20[01]~/g, ""); // a bracketed paste is text
  if (text.startsWith("\x1b") || text.length === 1 && text.charCodeAt(0) < 32) return { buf: "", enter: false, tracked: false }; // arrows, tab, other controls: the composer's content is no longer ours to know
  return { buf: buf + text, enter: false, tracked: true };
}
/** A line worth routing: an ask, not a slash command, a y/n, or a menu pick. Pure.
 *  A SHORT IMPERATIVE IS AN ASK (operator 2026-09-29): this required 12 characters, so "add filters" (11) never reached Heimdall - the chat
 *  model answered it itself, and "go" (2) likewise; nothing was routed, priced or shown in a stats box. Two words opening on an action verb count.
 *  A bare "go" / "yes" is not an ask: the serve's front resolves those against what is pending. */
const ACTION_VERB = /^(add|fix|make|build|create|implement|remove|delete|rename|refactor|change|update|write|move|replace|split|extract|install|convert|migrate|optimi[sz]e|improve|clean|wire|enable|disable|style|document|test|redesign|restyle|debug)\b/i;
export function worthRouting(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith("/") || t.startsWith("!")) return false;
  if (t.length >= 12 && t.includes(" ")) return true;
  return /\s/.test(t) && ACTION_VERB.test(t);
}
export function OpencodePane({ p, auto = false, intercept }: { p: any; auto?: boolean; /** Heimdall's front door: takes an Enter'd line, or returns false to let the CLI have it */ intercept?: (line: string) => boolean }) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const lineRef = React.useRef(""); const tracked = React.useRef(true);
  // IN ORDER (2026-09-20: one un-awaited POST per key reached the PTY scrambled — "r word:ep pineapplely"):
  // keystrokes queue and go out one request at a time, whatever accumulated while the previous one flew
  const outQ = React.useRef(""); const sending = React.useRef<Promise<void>>(Promise.resolve());
  const send = React.useCallback((data: string) => {
    outQ.current += data;
    sending.current = sending.current.then(async () => { const d = outQ.current; if (!d) return; outQ.current = ""; try { await apiPost(`/api/v1/cockpit/pty/input`, { pane_id: p.id, data: d }); } catch { /* the PTY is gone; the status probe says so */ } });
  }, [p.id]);
  const interceptRef = React.useRef(intercept); interceptRef.current = intercept;
  const termRef = React.useRef<Terminal | null>(null);
  const lastId = React.useRef(0);
  const activeUntil = React.useRef(0);
  const [running, setRunning] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);
  const colors = React.useMemo(themeColors, []);

  React.useEffect(() => {
    if (!hostRef.current || termRef.current) return;
    const term = new Terminal({ fontFamily: mono, fontSize: 12, cursorBlink: true, convertEol: false, theme: { background: colors.bg, foreground: colors.fg, cursor: colors.fg, selectionBackground: colors.dim } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    term.onData((d) => {
      // send the keystroke and enter the fast-poll window so its echo comes
      // back near-instantly. No local echo — the PTY renders, always.
      activeUntil.current = Date.now() + ACTIVE_WINDOW_MS;
      const next = trackLine(lineRef.current, d);
      if (next.enter) {
        const line = lineRef.current; lineRef.current = "";
        // Heimdall first: the composer is cleared and the pane routes the line
        if (tracked.current && interceptRef.current && worthRouting(line) && interceptRef.current(line)) { send("\x15"); tracked.current = true; return; }
        tracked.current = true;
      } else { lineRef.current = next.buf; if (!next.tracked) tracked.current = false; else if (d === "\x15" || d === "\x03") tracked.current = true; }
      send(d);
    });
    termRef.current = term;
    // FIT THE SPACE (operator 2026-07-07: "the TUI is cut — it should use the space
    // it has"): fit on mount + whenever the pane resizes, and tell the PTY the new
    // dimensions — a TUI renders for the PTY size, so both sides must agree.
    let resizeT: any = null;
    const doFit = () => {
      try { fit.fit(); } catch { /* host hidden */ }
      const { cols, rows } = term;
      if (resizeT) clearTimeout(resizeT);
      resizeT = setTimeout(() => { void apiPost(`/api/v1/cockpit/pty/resize`, { pane_id: p.id, cols, rows }); }, 200);
    };
    doFit();
    const ro = new ResizeObserver(doFit);
    ro.observe(hostRef.current);
    return () => { ro.disconnect(); if (resizeT) clearTimeout(resizeT); term.dispose(); termRef.current = null; };
  }, [p.id]);

  React.useEffect(() => {
    let stop = false;
    let timer: any = null;
    let sinceStatus = 0;
    // ADAPTIVE STREAM (plan S3): after a poll that carried data — OR while the
    // post-keystroke fast window is open — re-poll near-immediately, chaining
    // ~5-15ms localhost round-trips into a stream. When quiet AND not typing,
    // fall back to the idle cadence. Status is checked at most ~1/s.
    const loop = async () => {
      if (stop) return;
      let gotData = false;
      try {
        const r: any = await apiGet(`/api/v1/gate/build-live?contract_slug=${encodeURIComponent(`pane-pty-${p.id}`)}&after=${lastId.current}&phase=pty`);
        const d = r?.result ?? r;
        if (!stop && d?.chunks?.length) {
          lastId.current = d.last_id;
          for (const c of d.chunks) termRef.current?.write(c.chunk ?? "");
          gotData = true;
        }
      } catch { /* pre-restart */ }
      if (Date.now() - sinceStatus > 1000) {
        sinceStatus = Date.now();
        try {
          const s: any = await apiGet(`/api/v1/cockpit/pty/status?pane_id=${p.id}`);
          if (!stop) setRunning(!!(s?.result ?? s)?.running);
        } catch { /* */ }
      }
      if (stop) return;
      const typing = Date.now() < activeUntil.current;
      timer = setTimeout(loop, gotData || typing ? FAST_MS : IDLE_MS);
    };
    // THE PUSH CHANNEL FIRST (2026-09-20): the serve streams the pane's output as SSE — ONE connection
    // per tab shared by every pane (pty-streams.ts), instead of one per pane that hit Chrome's
    // 6-per-host cap at five agents. The polling loop above is the fallback when no stream can open.
    let polling = false;
    const unsubscribe = subscribePane(p.id, lastId.current, {
      chunk: (id, data) => { if (stop) return; if (id > lastId.current) lastId.current = id; termRef.current?.write(data); }, // id 0 = a live chunk (its seq is not an id)
      ready: (last) => { if (stop) return; if (last > lastId.current) lastId.current = last; setRunning(true); },
      exit: (data) => { if (stop) return; termRef.current?.write(data); setRunning(false); },
      unavailable: () => { if (!stop && !polling) { polling = true; void loop(); } },
    });
    // the status probe stays: running/exited drives the ▶ button
    const statusT = setInterval(async () => { if (stop) return; try { const s2: any = await apiGet(`/api/v1/cockpit/pty/status?pane_id=${p.id}`); if (!stop) setRunning(!!(s2?.result ?? s2)?.running); } catch { /* */ } }, 3000);
    return () => { stop = true; if (timer) clearTimeout(timer); clearInterval(statusT); unsubscribe(); };
  }, [p.id]);

  const start = async (agent: boolean) => {
    setBusy(true);
    try {
      termRef.current?.clear();
      lastId.current = 0;
      // pass the pane's ENGINE (pane_kind) so the BE spawns the right binary (opencode → proxy;
      // claude-code/codex → the subscription CLI, no proxy). Falls back to opencode for legacy panes.
      const r: any = await apiPost(`/api/v1/cockpit/pty/start`, { pane_id: p.id, ...(agent ? { agent: p.pane_kind ?? "opencode" } : {}), cols: termRef.current?.cols ?? 100, rows: termRef.current?.rows ?? 30 }, { timeoutMs: 60000 });
      if (r && (r.result ?? r)?.ok === false) setStartFailed(true);
    } catch { setStartFailed(true); }
    finally { setBusy(false); }
  };
  const kill = async () => { setBusy(true); try { await apiPost(`/api/v1/cockpit/pty/kill`, { pane_id: p.id }); } finally { setBusy(false); } };

  // AUTO-BOOT (inline panes): the agent starts itself as soon as the pane attaches and the PTY is
  // confirmed not-running. Once only — if the CLI exits later, a discrete ↻ chip offers a restart.
  const autoStarted = React.useRef(false);
  // "stopped" is only true once the CLI was SEEN running (or its start failed) — a fresh boot is not a
  // stop (2026-09-20: thread 8 said "the terminal stopped" while Claude was still booting)
  const everRan = React.useRef(false); const [startFailed, setStartFailed] = React.useState(false);
  React.useEffect(() => { if (running === true) { everRan.current = true; setStartFailed(false); } }, [running]);
  React.useEffect(() => {
    if (!auto || autoStarted.current) return;
    if (running === false && p.worktree_path) { autoStarted.current = true; void start(true); }
    if (running === true) autoStarted.current = true; // reattached to a live PTY — nothing to boot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, running, p.worktree_path]);

  // the engine's own name and binary, for any seat (it knew claude, codex and opencode: a Cursor / Gemini / Grok pane booted as "OpenCode")
  const engineName = p.pane_kind === "opencode" || p.pane_kind === "opencode-direct" ? "OpenCode" : paneDisplay(String(p.pane_kind ?? "")).name;
  const engineBin = ({ "claude-code": "claude", gemini: "agy", cursor: "cursor-agent" } as Record<string, string>)[p.pane_kind] ?? (p.pane_kind === "opencode-direct" ? "opencode" : String(p.pane_kind ?? "opencode"));
  const btn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: "1px 8px", borderRadius: 4 };
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
      {/* the cockpit keeps its controls; auto panes have none — the agent is already playing */}
      {!auto && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 10px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: mono, fontSize: 9.5, color: running ? C.ok : C.dim }}>
            {running == null ? "…" : running ? "● live" : "○ stopped"}
          </span>
          <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 6px" }}
            title={isSubscriptionPaneKind(p.pane_kind) ? "subscription CLI — no proxy; auth is the vendor's login" : "proxied — BYOK key held server-side, per-token metering + kill-switch"}>
            {isSubscriptionPaneKind(p.pane_kind) ? `${paneDisplay(p.pane_kind).glyph} ${paneDisplay(p.pane_kind).name} · sub` : p.pane_kind === "opencode-direct" ? "⌨ OpenCode · OpenAI" : "⌨ OpenCode · OpenRouter"}
          </span>
          <span style={{ flex: 1 }} />
          <button disabled={busy || !p.worktree_path} onClick={() => start(true)} style={{ ...btn, color: C.ok, borderColor: C.ok }}
            title={p.worktree_path ? `boot ${engineName} inside this pane's box (sparse worktree · AGENTS.md${isSubscriptionPaneKind(p.pane_kind) ? " · your subscription" : " · proxied model"})` : "worktree pending — provision first"}>▶ {engineBin}</button>
          <button disabled={busy} onClick={() => start(false)} style={btn} title="plain shell in the worktree">▶ shell</button>
          <button disabled={busy || !running} onClick={kill} style={{ ...btn, color: C.bad }} title="kill the terminal">⏹</button>
        </div>
      )}
      {/* THE STOPPED TERMINAL (operator 2026-09-20: "the widget turns black with no indication"): a serve
          restart kills every agent's PTY — say so where the eye is, and bring it back in one click.
          Claude resumes its own conversation (the serve restarts it with --resume when the transcript exists). */}
      {auto && autoStarted.current && running === false && (everRan.current || startFailed) && (
        <div data-testid="pty-stopped" style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 4, display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", background: `color-mix(in oklab, ${C.warn} 14%, ${colors.bg})`, borderBottom: `1px solid ${C.warn}`, fontFamily: mono, fontSize: 10 }}>
          <span style={{ color: C.warn, fontWeight: 700 }}>■ the terminal stopped</span>
          <span style={{ color: C.muted }}>{startFailed && !everRan.current ? "the agent could not start — see the terminal for the reason" : p.pane_kind === "claude-code" ? "the agent's process is gone (a serve restart, a crash, or it quit) — Claude picks its conversation back up" : "the agent's process is gone (a serve restart, a crash, or it quit)"}</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => void start(true)} disabled={busy} title="boot the agent again in this box" style={{ ...btn, color: C.ok, borderColor: C.ok, background: colors.bg, fontWeight: 700 }}>{busy ? "starting…" : p.pane_kind === "claude-code" ? "▶ resume" : "▶ restart"}</button>
        </div>
      )}
      {auto && autoStarted.current && running === false && !everRan.current && !startFailed && (
        <span data-testid="pty-booting" style={{ position: "absolute", top: 8, right: 12, zIndex: 4, fontFamily: mono, fontSize: 9.5, color: C.dim }}>starting {engineName}…</span>
      )}
      <div ref={hostRef} style={{ flex: 1, minHeight: 0, background: colors.bg, padding: "2px 4px" }} />
    </div>
  );
}
