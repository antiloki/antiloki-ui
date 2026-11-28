// A REAL TERMINAL IN A PANE (RFC 0007 §5.1, §5.2). xterm.js draws what the engine's own CLI prints; the keystrokes go to the PTY as typed.
// Nothing is routed, rewritten or held here: typing into the terminal is the raw path (the pre-check is the composer's, outside).
// The terminal itself lives in the serve (and, with the sidecar host, outlives it): this component only attaches. A pane that is already
// running is attached to, never restarted; one that is not is started once, and a failure says why and offers the retry.
import * as React from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { subscribePane } from "@/loki/cockpit/pty-streams";
import { C, mono } from "@/loki/theme";
import { Skeleton, useSlow } from "./PixelLoader";
import { attachFile, ptyInput, ptyResize, ptyStart, ptyStatus, shellStart } from "./api";
import { bufferLines, copyChord, copyOnSelect, fileRef, forceSelectOn, setForceSelectOn, givableFile, newlineFor, setCopyOnSelect, splitSubmit } from "./terminal-input";
import { carriesFile, draggedPath } from "./file-drag";
import type { PaneRef } from "./layout";

// xterm needs concrete colours, not CSS variables: resolve them from the live theme at mount so the terminal wears the app's theme
function themeColors(): { bg: string; fg: string; dim: string } {
  try {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
    return { bg: v("--c-bg", "#0b0f16"), fg: v("--c-fg", "#e7e7ea"), dim: v("--c-dim", "#8b8fa3") };
  } catch { return { bg: "#0b0f16", fg: "#e7e7ea", dim: "#8b8fa3" }; }
}

/** A CSS colour as [r,g,b] (0-255), whatever the notation (hex, rgb, oklch ...), by painting one pixel; null when the browser cannot say. */
export function rgbOf(css: string): [number, number, number] | null {
  try { const c = document.createElement("canvas"); c.width = c.height = 1; const g = c.getContext("2d", { willReadFrequently: true }); if (!g) return null; g.clearRect(0, 0, 1, 1); g.fillStyle = "#000"; g.fillStyle = css; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; } catch { return null; }
}
/** Is this colour dark (relative luminance under a half)? Pure. */
export function isDark(rgb: [number, number, number] | null): boolean { if (!rgb) return true; const [r, g, b] = rgb.map((v) => v / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5; }
/** THE GREY TEXT OF A TERMINAL ON GLASS (operator 2026-11-11: "the grey fonts on the panes, terminals, agents become invisible on glass, make less grey"): the terminal's own greys (dim text, bright black) are lifted until they read at this ratio against the pane's colour; a light
 *  theme (whose glass is light) keeps the terminal's own colours, because the ratio is measured against black there. */
export const TERMINAL_CONTRAST = 6;
export const contrastFor = (bg: string): number => (isDark(rgbOf(bg)) ? TERMINAL_CONTRAST : 1);

export type TermState = "attaching" | "running" | "stopped" | "failed";

/** `readOnly`: the person cannot type into it (a team's worker or QA: the planner drives them). The terminal still shows everything; the serve types into it all the same. */
export function TerminalPane({ pane, focused, onFocus, onState, onStarted, readOnly = false }: { pane: PaneRef; focused: boolean; onFocus: () => void; onState?: (s: TermState) => void; /** a held pane is now running */ onStarted?: () => void; readOnly?: boolean }) {
  const id = pane.paneId ?? 0;
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const termRef = React.useRef<Terminal | null>(null);
  const lastId = React.useRef(0);
  const [state, setState] = React.useState<TermState>("attaching");
  const [why, setWhy] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const colors = React.useMemo(themeColors, []);
  const stateRef = React.useRef(state); stateRef.current = state;
  const readOnlyRef = React.useRef(readOnly); readOnlyRef.current = readOnly;
  // SELECTING IS NOT CLEARED BY THE PROGRAM REDRAWING (a TUI repaints its spinner and status several times a second, and xterm drops a selection whose lines change): while the mouse is down and while a selection stands, what the
  // program prints waits, and is written the moment the selection goes (or its text is copied). A small note says so.
  const holdRef = React.useRef(false); const pending = React.useRef<string[]>([]); const [held, setHeld] = React.useState(false);
  const flush = React.useCallback(() => { holdRef.current = false; setHeld(false); const p = pending.current; pending.current = []; if (p.length) termRef.current?.write(p.join("")); }, []);
  const [toast, setToast] = React.useState(""); const [menu, setMenu] = React.useState(false); const [autoCopy, setAutoCopy] = React.useState(copyOnSelect());
  const mouseDownRef = React.useRef<{ current: boolean } | null>(null); const [forceSelect, setForceSelect] = React.useState(forceSelectOn()); const forceSelectRef = React.useRef(() => forceSelect); forceSelectRef.current = () => forceSelect;
  const fileInput = React.useRef<HTMLInputElement | null>(null); const sendRef = React.useRef<(d: string) => void>(() => {});
  const say = React.useCallback((t: string) => { setToast(t); setTimeout(() => setToast((x) => (x === t ? "" : x)), 2200); }, []);
  const copyText = React.useCallback(async (t: string, ok: string) => { try { await navigator.clipboard.writeText(t); say(ok); } catch { say("the browser would not copy: select the text and press Ctrl+Shift+C"); } }, [say]);
  const report = React.useCallback((s: TermState) => { setState(s); onState?.(s); }, [onState]);

  // keystrokes go out in order, one request at a time (one un-awaited POST per key reached the PTY scrambled, 2026-09-20)
  const outQ = React.useRef(""); const sending = React.useRef<Promise<void>>(Promise.resolve());
  const send = React.useCallback((data: string) => {
    outQ.current += data;
    sending.current = sending.current.then(async () => { const d = outQ.current; if (!d) return; outQ.current = ""; const { body, submit } = splitSubmit(d); // a key that did not arrive is said, never swallowed (2026-11-27: "he pressed all buttons and it didn't work")
      const lost = (r: any) => { const x = r?.result ?? r; if (x?.ok === false || x?.__engine_error) say(`that key did not reach the agent: ${String(x?.error ?? x?.__engine_error?.cause ?? "the server refused it")}`); };
      try { if (body) lost(await ptyInput(id, body)); if (submit) { await new Promise((r) => setTimeout(r, 150)); lost(await ptyInput(id, "\r")); } } catch (e: any) { say(`that key did not reach the agent: ${String(e?.message ?? e)}`); } });
  }, [id, say]);

  sendRef.current = send;
  // GIVING AN AGENT A FILE: pasted, imported or dropped; it is saved in the box and its @path is typed into the input (not sent)
  const give = React.useCallback(async (f: File) => { if (readOnlyRef.current || !id) return; say(`giving ${f.name || "the file"} to the agent…`); const r = await attachFile(id, f); if (r.ok) { sendRef.current(fileRef(r.path)); say(`${r.kind === "image" ? "image" : "file"} attached: ${r.path.split("/").pop()}`); } else say(r.error); }, [id, say]);
  // the terminal, and fitting it: a TUI renders for the PTY's size, so both sides must agree
  React.useEffect(() => {
    if (!hostRef.current || termRef.current) return;
    // the terminal itself is see-through: the pane card behind it carries the colour and the opacity the person chose (appearance.ts), so one setting governs both
    const term = new Terminal({ fontFamily: mono, fontSize: 12.5, cursorBlink: true, convertEol: false, allowProposedApi: false, allowTransparency: true, minimumContrastRatio: contrastFor(colors.bg), theme: { background: "rgba(0,0,0,0)", foreground: colors.fg, cursor: colors.fg, selectionBackground: colors.dim } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    if (term.options) term.options.disableStdin = readOnlyRef.current;
    term.onData((d) => { if (!readOnlyRef.current) send(d); });
    // THE APP'S OWN CHORDS (Alt+], Alt+[, Alt+Z): xterm would send an Alt-key to the program and swallow the event, so the pane chords would die
    // exactly when a terminal has the focus. Returning false lets the event through to the screen's handler; everything else is the program's.
    term.attachCustomKeyEventHandler((e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "]" || e.key === "[" || e.key.toLowerCase() === "z")) return false;
      // SHIFT+ENTER is a new line in the agent's input; COPY is Ctrl+Shift+C, Cmd+C, or Ctrl+C while something is selected (xterm would send ^C to the program)
      const nl = newlineFor(e); if (nl !== null) { if (!readOnlyRef.current) sendRef.current(nl); return false; }
      if (e.key === "Enter" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) return false;   // keypress/keyup of the same key: nothing more to send
      if (copyChord(e, term.hasSelection())) { const t = term.getSelection(); if (t) void copyText(t, "copied"); return false; }
      return true;
    });
    term.onSelectionChange(() => {
      if (term.hasSelection()) { holdRef.current = true; setHeld(true); if (copyOnSelect()) { const t = term.getSelection(); if (t) void copyText(t, "copied"); } } else if (holdRef.current && !mouseDown.current) flush();
    });
    termRef.current = term;
    // a pasted image (a screenshot on the clipboard) has no text for xterm to paste: it is given to the agent as a file
    const onPaste = (e: ClipboardEvent) => { const f = givableFile(e.clipboardData?.files); if (!f) return; e.preventDefault(); e.stopPropagation(); void give(f); };
    hostRef.current.addEventListener("paste", onPaste, true);
    const hostEl = hostRef.current;
    // the mouse going down starts holding the output (a drag is a selection in the making); going up with nothing selected lets it flow again
    const mouseDown = { current: false }; mouseDownRef.current = mouseDown;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return; mouseDown.current = true; holdRef.current = true; setHeld(true);
      // A PROGRAM THAT TAKES THE MOUSE (OpenCode, Codex ...) would get the drag and nothing would be selected: unless the person turned it off, the drag is made a selection (what holding Shift does)
      if (!e.shiftKey && forceSelectRef.current() && term.modes.mouseTrackingMode !== "none") { e.stopImmediatePropagation(); e.preventDefault(); const t = e.target as Element; t.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, composed: true, clientX: e.clientX, clientY: e.clientY, button: 0, buttons: 1, shiftKey: true, detail: e.detail })); }
    };
    const onUp = () => { if (!mouseDown.current) return; mouseDown.current = false; if (!term.hasSelection()) flush(); };
    hostEl.addEventListener("mousedown", onDown, true); window.addEventListener("mouseup", onUp, true);
    // A FINGER SCROLLS THE TERMINAL (operator 2026-11-12: "on the phone I can't scroll inside a pane"): xterm's canvas sits over its own scroll area and takes the touch, so a drag did nothing. A vertical drag moves the scrollback by lines;
    // a program that holds the screen (the alternate buffer) or takes the mouse is given the drag as wheel turns instead, as a mouse wheel would. A sideways drag is left alone: it belongs to the pager.
    hostEl.style.touchAction = "none";
    const finger = { on: false, x: 0, y: 0, acc: 0, vertical: false };
    const lineH = () => Math.max(8, hostEl.clientHeight / Math.max(1, term.rows));
    const scrollBy = (n: number) => { if (term.buffer.active.type === "alternate" || term.modes.mouseTrackingMode !== "none") { (hostEl.querySelector(".xterm-screen") ?? hostEl).dispatchEvent(new WheelEvent("wheel", { deltaY: n * 40, deltaMode: 0, bubbles: true, cancelable: true })); } else term.scrollLines(n); };
    const tStart = (e: TouchEvent) => { if (e.touches.length !== 1) { finger.on = false; return; } finger.on = true; finger.x = e.touches[0].clientX; finger.y = e.touches[0].clientY; finger.acc = 0; finger.vertical = false; };
    const tMove = (e: TouchEvent) => { if (!finger.on || e.touches.length !== 1) return; const t = e.touches[0]; const dx = t.clientX - finger.x, dy = t.clientY - finger.y;
      if (!finger.vertical) { if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.2) { finger.vertical = true; finger.y = t.clientY; } return; }
      finger.acc += -(t.clientY - finger.y) / lineH(); finger.y = t.clientY; const n = Math.trunc(finger.acc); if (n) { finger.acc -= n; scrollBy(n); } };
    const tEnd = () => { finger.on = false; };
    hostEl.addEventListener("touchstart", tStart, { capture: true, passive: true }); hostEl.addEventListener("touchmove", tMove, { capture: true, passive: true }); hostEl.addEventListener("touchend", tEnd, true); hostEl.addEventListener("touchcancel", tEnd, true);
    let t: ReturnType<typeof setTimeout> | null = null; let sent = ""; let wasHidden = false;
    // A TUI (Claude Code, OpenCode) repaints only the lines that changed, so when the screen it drew was lost (a thread switch hid the pane, the replay of its output began mid-screen) the rest stays blank. A size that does not change signals nothing, so the size is nudged by one row and back: the program then redraws the whole screen.
    const repaint = () => { if (!id) return; const { cols, rows } = term; if (rows < 3) return; void ptyResize(id, cols, rows - 1); setTimeout(() => { void ptyResize(id, cols, rows); }, 120); };
    (termRef as any).repaint = repaint;
    const doFit = () => {
      // a pane that is hidden or still laid out at a sliver (a thread opening, a split moving) is no size to tell a program: it would redraw for 2 columns and lose its screen
      const w = hostEl.clientWidth, h = hostEl.clientHeight; if (!hostEl.isConnected || w < 60 || h < 40) { wasHidden = true; return; }
      try { fit.fit(); } catch { /* hidden */ }
      if (t) clearTimeout(t);
      const { cols, rows } = term; const back = wasHidden; wasHidden = false;
      t = setTimeout(() => { if (!id) return; const key = `${cols}x${rows}`; if (key !== sent) { sent = key; void ptyResize(id, cols, rows); } if (back) setTimeout(repaint, 250); }, 200);
    };
    doFit();
    const ro = new ResizeObserver(doFit);
    ro.observe(hostRef.current);
    return () => { hostEl.removeEventListener("touchstart", tStart, true); hostEl.removeEventListener("touchmove", tMove, true); hostEl.removeEventListener("touchend", tEnd, true); hostEl.removeEventListener("touchcancel", tEnd, true); hostEl.removeEventListener("paste", onPaste, true); hostEl.removeEventListener("mousedown", onDown, true); window.removeEventListener("mouseup", onUp, true); ro.disconnect(); if (t) clearTimeout(t); term.dispose(); termRef.current = null; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => { const t = termRef.current; if (t?.options) t.options.disableStdin = readOnly; }, [readOnly]);

  // the stream: the serve pushes the pane's output (one shared connection per tab, pty-streams.ts)
  React.useEffect(() => {
    if (!id) return;
    let stop = false;
    const unsub = subscribePane(id, lastId.current, {
      chunk: (cid, data) => { if (stop) return; if (cid > lastId.current) lastId.current = cid; if (holdRef.current) pending.current.push(data); else termRef.current?.write(data); },
      ready: (last) => { if (stop) return; if (last > lastId.current) lastId.current = last; },
      exit: (data) => { if (stop) return; termRef.current?.write(data); report("stopped"); },
    });
    return () => { stop = true; unsub(); };
  }, [id, report]);

  // A HELD PANE STARTS NOTHING BY ITSELF (issue 30: looking at a team started its Leader on the account's default model): it waits for the person's click
  const released = React.useRef(false); const [waiting, setWaiting] = React.useState(false);
  const started = React.useRef(onStarted); started.current = onStarted;
  React.useEffect(() => { if (pane.held && state === "running") { setWaiting(false); started.current?.(); } }, [pane.held, state]);

  // attach to a running terminal, or start it once
  const boot = React.useCallback(async () => {
    if (!id) { setWhy("this pane has no terminal"); report("failed"); return; }
    setBusy(true);
    try {
      const st = await ptyStatus(id);
      // ATTACHING TO A TERMINAL THAT IS ALREADY RUNNING (a reload, a restarted serve, a pane moved): its program is drawn for whatever size it had, and the fit that ran
      // while this one mounted came before there was anything to resize. Say the size now, or a TUI keeps painting for the old width and the screen reads as garbage.
      if (st?.running) { const { cols, rows } = termRef.current ?? { cols: 100, rows: 30 }; void ptyResize(id, cols, rows); setTimeout(() => (termRef as any).repaint?.(), 400); setWhy(""); report("running"); return; }
      if (pane.held && !released.current) { setWaiting(true); report("stopped"); return; }
      const { cols, rows } = termRef.current ?? { cols: 100, rows: 30 };
      const r = pane.kind === "shell" ? await shellStart(id, cols, rows) : await ptyStart(id, pane.engine ?? null, cols, rows);
      if (r.ok) { setWhy(""); report("running"); } else { setWhy(r.error ?? "the terminal did not start"); report("failed"); }
    } finally { setBusy(false); }
  }, [id, pane.kind, pane.engine, pane.held, report]);
  const booted = React.useRef(false);
  React.useEffect(() => { if (!booted.current && id) { booted.current = true; void boot(); } }, [boot, id]);

  // the status probe: running or exited drives the overlay
  React.useEffect(() => {
    if (!id) return;
    const t = setInterval(async () => { const s = await ptyStatus(id); if (!s) return; if (s.running && stateRef.current !== "running" && stateRef.current !== "attaching") report("running"); if (s.running && stateRef.current === "attaching") report("running"); if (!s.running && stateRef.current === "running") report("stopped"); }, 3000);
    return () => clearInterval(t);
  }, [id, report]);

  // the terminal takes the keyboard when its pane is focused, but never from a text box the person is typing in (the appearance popover's address field, a rename): focus
  // that follows the pointer must not pull the keyboard out of the middle of a word
  React.useEffect(() => {
    if (!focused) return;
    const a = document.activeElement as HTMLElement | null;
    const typing = !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable) && !a.closest(".xterm") && !a.hasAttribute("data-chat-input");   // a chat pane's message box is not "a word being typed" in this pane: clicking a terminal takes the keyboard from it (found 2026-11-22: a terminal beside a chat would not take the keys)
    if (!typing) termRef.current?.focus();
  }, [focused, pane.skin]);   // and again when the pane comes back from its chat look

  const attachSlow = useSlow(state === "attaching", 1000);
  const idle = waiting && !!pane.held && state === "stopped";
  const overlay = (state === "stopped" || state === "failed") && !idle;
  return (
    <div data-testid={`terminal-${pane.id}`} onMouseDown={onFocus} style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column", position: "relative" }}>
      {idle && (
        <div data-testid="terminal-held" style={{ position: "absolute", inset: 0, zIndex: 3, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center", background: colors.bg, fontFamily: mono, fontSize: 12, color: C.muted }}>
          <span>Not started. Nothing runs and nothing is spent until you start it.</span>
          <button data-testid="terminal-start" onClick={() => { released.current = true; setWaiting(false); report("attaching"); void boot(); }} disabled={busy} style={{ fontFamily: mono, fontSize: 12, background: "transparent", color: C.ok, border: `1px solid ${C.ok}`, borderRadius: 6, padding: "4px 14px", cursor: "pointer" }}>▶ start{pane.engine ? ` ${pane.engine}` : ""}</button>
        </div>
      )}
      {overlay && (
        <div data-testid="terminal-stopped" style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 3, display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", background: `color-mix(in oklab, ${C.warn} 14%, ${colors.bg})`, borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 11 }}>
          <span style={{ color: C.warn, fontWeight: 700 }}>■ {state === "failed" ? "could not start" : "the terminal stopped"}</span>
          <span style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{why || "the process has ended"}</span>
          <button onClick={() => { booted.current = true; void boot(); }} disabled={busy} style={{ fontFamily: mono, fontSize: 10.5, background: colors.bg, color: C.ok, border: `1px solid ${C.ok}`, borderRadius: 4, padding: "1px 9px", cursor: "pointer" }}>{busy ? "starting…" : "↻ start again"}</button>
        </div>
      )}
      {state === "attaching" && attachSlow && <div style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}><Skeleton lines={6} testid="terminal-skeleton" /></div>}
      {state === "attaching" && <span data-testid="terminal-attaching" style={{ position: "absolute", top: 8, right: 12, zIndex: 3, fontFamily: mono, fontSize: 10, color: C.dim }}>attaching…</span>}
      <div ref={hostRef} onDragOver={(e) => { if (carriesFile(e.dataTransfer) || Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault(); }} onDrop={(e) => { const p = draggedPath(e.dataTransfer); if (p) { e.preventDefault(); if (!readOnlyRef.current && id) { sendRef.current(pane.kind === "shell" ? `'${p.replace(/'/g, "'\\''")}' ` : fileRef(p)); termRef.current?.focus(); } return; } const f = givableFile(e.dataTransfer?.files); if (f) { e.preventDefault(); void give(f); } }} style={{ flex: 1, minHeight: 0, background: "transparent", padding: "2px 6px" }} />
      {/* COPY AND ATTACH: a small bar in the corner of the terminal (a TUI that takes the mouse makes selecting hard: Shift+drag selects inside it; the copy menu does not need the mouse at all) */}
      {state === "running" && (
        <div data-testid={`terminal-tools-${pane.id}`} style={{ position: "absolute", top: 4, right: 10, zIndex: 3, display: "flex", gap: 4, alignItems: "center" }}>
          {held && <button data-testid="terminal-held" onClick={() => { termRef.current?.clearSelection(); flush(); }} title="the program's output waits while text is selected: click to let it flow" style={{ ...toolBtn(colors.bg), color: C.warn }}>⏸ selecting · resume</button>}
          {toast && <span data-testid="terminal-toast" role="status" style={{ fontFamily: mono, fontSize: 10, color: C.ok, background: colors.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 7px", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{toast}</span>}
          {!readOnly && <button data-testid={`terminal-attach-${pane.id}`} aria-label="attach an image or file" title="attach an image or file (you can also paste one, or drop it here)" onClick={() => fileInput.current?.click()} style={toolBtn(colors.bg)}>⎘ file</button>}
          <button data-testid={`terminal-copy-${pane.id}`} aria-label="copy text" aria-expanded={menu} title="copy this terminal's text" onClick={() => setMenu((m) => !m)} style={toolBtn(colors.bg)}>⧉ copy</button>
          {menu && (
            <div data-testid="terminal-copy-menu" role="menu" style={{ position: "absolute", top: 24, right: 0, minWidth: 220, background: colors.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: 4, display: "flex", flexDirection: "column", gap: 1, fontFamily: mono, fontSize: 10.5, boxShadow: "0 6px 24px rgba(0,0,0,.4)" }}>
              <button role="menuitem" data-testid="copy-selection" disabled={!termRef.current?.hasSelection()} onClick={() => { const t = termRef.current?.getSelection(); if (t) void copyText(t, "selection copied"); termRef.current?.clearSelection(); flush(); setMenu(false); }} style={itemBtn(!termRef.current?.hasSelection())}>copy the selection <span style={{ color: C.muted }}>Ctrl+Shift+C</span></button>
              <button role="menuitem" data-testid="copy-screen" onClick={() => { const b = termRef.current?.buffer.active; if (b) void copyText(bufferLines(b.length, (i) => b.getLine(i)?.translateToString(true), b.baseY, b.baseY + (termRef.current?.rows ?? 0)), "screen copied"); setMenu(false); }} style={itemBtn(false)}>copy what is on the screen</button>
              <button role="menuitem" data-testid="copy-all" onClick={() => { const b = termRef.current?.buffer.active; if (b) void copyText(bufferLines(b.length, (i) => b.getLine(i)?.translateToString(true)), "everything copied"); setMenu(false); }} style={itemBtn(false)}>copy everything (scrollback)</button>
              <label style={{ display: "flex", gap: 6, alignItems: "center", padding: "3px 8px", color: C.dim, cursor: "pointer" }}><input type="checkbox" data-testid="copy-on-select" checked={autoCopy} onChange={(e) => { setAutoCopy(e.target.checked); setCopyOnSelect(e.target.checked); }} />copy when I select</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", padding: "3px 8px", color: C.dim, cursor: "pointer" }} title="a program that takes the mouse (OpenCode, Codex ...) would otherwise get your drag and nothing would be selected; Shift+drag always selects"><input type="checkbox" data-testid="force-select" checked={forceSelect} onChange={(e) => { setForceSelect(e.target.checked); setForceSelectOn(e.target.checked); }} />select even in programs that take the mouse</label>
            </div>
          )}
          <input ref={fileInput} data-testid={`terminal-file-${pane.id}`} type="file" accept="image/*,application/pdf,text/plain" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void give(f); e.target.value = ""; }} />
        </div>
      )}
    </div>
  );
}

const toolBtn = (bg: string): React.CSSProperties => ({ fontFamily: mono, fontSize: 10, color: C.dim, background: bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "0 7px", cursor: "pointer", lineHeight: "16px", opacity: 0.85 });
const itemBtn = (off: boolean): React.CSSProperties => ({ textAlign: "left", background: "transparent", border: "none", color: off ? C.muted : C.fg, padding: "4px 8px", cursor: off ? "default" : "pointer", fontFamily: mono, fontSize: 10.5, display: "flex", gap: 8, justifyContent: "space-between", borderRadius: 4 });
