// THE CHAT SKIN of an agent pane (the operator 2026-11-21): the same terminal, drawn as a conversation. The terminal keeps running underneath (hidden, never stopped): this only READS the engine's own transcript and types into the same terminal, so the text, the tools, the tokens and the state are the same ones, only the design differs.
import * as React from "react";
import { usePaused } from "@/loki/cockpit/pane-watch";
import { ModeSwitch } from "./ModeSwitch";
import { parseTermError } from "./term-error";
import { C, mono, nav } from "@/loki/theme";
import { Markdown } from "@/loki/components/Markdown";
import { attachFile, localModels, ptyInput, ptyTranscript, sendToAgent, type ChatTurn } from "./api";
import { fileRef } from "./terminal-input";
import { carriesFile, draggedPath } from "./file-drag";
import { Skeleton, useSlow } from "./PixelLoader";
import { shiftHue } from "./SpecialistAvatar";
import { usePixelStyle, useFx } from "./use-appearance";
import { slashMatches } from "./slash-commands";
import { parseTermMenu, TermMenuCard, TermMirror, useTermScreen } from "./TermMirror";

/** One tool call as a small chip: its name, what it touched, and whether it failed. Pure view. */
export function ToolChip({ t }: { t: ChatTurn["tools"][number] }) {
  const bad = t.done && t.ok === false;
  return <span data-testid="chat-tool" data-ok={bad ? "0" : "1"} title={t.brief} style={{ display: "inline-flex", gap: 6, alignItems: "center", maxWidth: "100%", fontFamily: mono, fontSize: 11, padding: "1px 8px", borderRadius: 10, border: `1px solid ${bad ? C.bad : C.border}`, color: bad ? C.bad : C.muted }}>
    <span style={{ color: bad ? C.bad : C.fg }}>{t.name}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.brief}</span>{!t.done && <span aria-label="running" style={{ width: 6, height: 6, borderRadius: 3, background: C.brand }} />}
  </span>;
}
/** A slash command that only changes a setting (`/model haiku`): no reply follows it and the agent's log keeps no user message for it. The same list as the serve's `is_setting_command`. Pure. */
export function isSettingCommand(text: string): boolean {
  return /^\/(models|model|effort|help|status|cost|usage|config|theme|vim|clear|exit|quit|resume|permissions|mcp|agents|doctor|context)(\s|$)/.test(text.trim());
}
/** A slash command typed BARE that opens a full-screen menu in the agent's terminal (`/model`, `/config`, `/resume` …). The chat's terminal is hidden, so nobody could answer the menu and the next message would land in it (issue 15): the chat does not send it. With an argument (`/model haiku`) it is fine. Pure. */
export function opensAMenu(text: string): string | null {
  const m = /^\/(model|effort|config|theme|permissions|resume|mcp|agents|status|usage|doctor|help)\s*$/.exec(text.trim()); return m ? m[1] : null;
}
const when = (t: string) => { const d = new Date(t); return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };

/** These CLIs draw their model list on the screen the chat already reads, so the bare command is sent and its choices appear as buttons (operator 2026-11-26). Pure. */
export function listsModelsOnScreen(engine: string | undefined, text: string): boolean {
  const t = text.trim(); return ((engine === "gemini" || engine === "cursor") && t === "/model") || (!!engine?.startsWith("opencode") && t === "/models");
}
/** Antigravity writes no result for a tool the person denied or a turn it dropped: its own screen waiting at the prompt, with nothing to cancel, says it is not working (2026-11-26). Pure. */
export function idleAgy(engine: string | undefined, screen: string[]): boolean {
  if (engine !== "gemini") return false; const tail = screen.slice(-12).join("\n");
  return tail.includes("? for shortcuts") && !/esc to (cancel|interrupt)/i.test(tail);
}
/** The most the message box grows to, in pixels; past it the text scrolls. */
export const INPUT_MAX = 140;
/** A turn antiloki typed itself, in one line: a handover says who handed over; anything else (a setting command) is shown as typed. Pure. */
export function antilokiLine(text: string): string { const from = /You are taking over this conversation from (.+?) because/.exec(text)?.[1]; return from ? `antiloki handed this conversation over from ${from}` : text.includes("You are taking over") ? "antiloki handed this conversation over" : text.includes("A person wants to make a new team") ? "antiloki asked this agent to set up the new team" : text.trim().split("\n")[0]; }
/** The thinking indicator: a small box of pixels that blink in a wave, and the word Reasoning. */
export function Reasoning({ color }: { /** the specialist's colour; the theme's when there is none */ color?: string }) {
  const fxR = useFx("reasoning"); if (fxR?.colors[0]) color = fxR.colors[0]; const pstyle = usePixelStyle("reasoning"); const soft = pstyle === "liquid"; const glow = pstyle === "shadow"; const minimal = pstyle === "minimal";
  const cells = Array.from({ length: 15 }, (_, i) => ({ x: i % 5, y: Math.floor(i / 5), d: ((i % 5) * 0.12 + Math.floor(i / 5) * 0.2).toFixed(2) }));
  return (
    <div data-testid="chat-reasoning" data-look={glow ? "border-glow" : undefined} role="status" aria-label="reasoning" style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 12, border: glow ? "1px solid transparent" : `1px solid ${C.border}`, color: C.muted, fontSize: 12.5, ...(glow ? { position: "relative", background: `linear-gradient(${C.panel}, ${C.panel}) padding-box, conic-gradient(from var(--sg-ang, 0deg), ${color ?? C.brand}, ${shiftHue(color ?? "#7c5cf0", 40)}, ${shiftHue(color ?? "#7c5cf0", 80)}, ${color ?? C.brand}) border-box`, boxShadow: `0 0 14px color-mix(in srgb, ${color ?? C.brand} 40%, transparent)`, animation: `sg-turn ${fxR?.speed_s ?? 3.2}s linear infinite, sg-pulse-box 1.8s ease-in-out infinite` } : {}) }}>
      <style>{"@keyframes rs-la{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(12px,-3px) scale(1.3)}}@keyframes rs-lb{0%,100%{transform:translate(0,0) scale(1.1)}50%{transform:translate(-10px,4px) scale(.8)}}@keyframes rs-lc{0%,100%{transform:translate(0,2px) scale(.9)}50%{transform:translate(-14px,-4px) scale(1.4)}}@keyframes rs-dot{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-4px);opacity:1}}@keyframes rs-px{0%,100%{opacity:.15;transform:scale(.7)}50%{opacity:1;transform:scale(1)}}@keyframes rs-dots{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}}.rs-w::after{content:'';animation:rs-dots 1.2s steps(1) infinite}@media (prefers-reduced-motion: reduce){.rs-c{animation:none!important}.rs-w::after{animation:none}}"}</style>
      {glow ? null : minimal ? <span aria-hidden style={{ display: "inline-flex", gap: 5, alignItems: "center", height: 18 }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 6, height: 6, borderRadius: 3, background: color ?? C.brand, animation: `rs-dot 1s ease-in-out ${i * 0.15}s infinite`, opacity: 0.35 }} />)}</span> : soft ? <svg width="46" height="26" viewBox="0 0 46 26" aria-hidden="true" style={{ overflow: "visible" }}><defs><filter id="rs-goo" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur in="SourceGraphic" stdDeviation="3.4" result="b" /><feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" /></filter></defs><g filter="url(#rs-goo)" fill={color ?? C.brand}>{[[10, 13, 8, "rs-la", 2.1], [24, 12, 10, "rs-lb", 2.5], [36, 14, 7, "rs-lc", 1.8]].map(([cx, cy, r, n, d], i) => <circle key={i} cx={cx as number} cy={cy as number} r={r as number} style={{ transformBox: "fill-box", transformOrigin: "center", animation: `${n} ${d}s ease-in-out infinite` }} />)}</g></svg> : <svg width="30" height="18" viewBox="0 0 30 18" aria-hidden="true">{cells.map((c, i) => <rect key={i} className="rs-c" x={c.x * 6} y={c.y * 6} width="5" height="5" rx={soft ? 2.5 : 1} fill={color ?? C.brand} style={{ filter: soft ? "blur(0.9px)" : undefined, transformBox: "fill-box", transformOrigin: "center", animation: `rs-px 1.1s ease-in-out ${c.d}s infinite`, opacity: 0.15 }} />)}</svg>}
      <span className="rs-w">Reasoning</span>
    </div>
  );
}
/** The microphone of a chat's composer (it was on the bar): click to talk, click to send what was said. */
export function MicButton({ state, onToggle }: { state: "idle" | "listening" | "busy"; onToggle: () => void }) {
  return <button data-testid="chat-mic" aria-label={state === "listening" ? "send what you said" : "talk to this agent (microphone)"} title={state === "listening" ? "send what you said" : "talk to this agent (microphone)"} onClick={onToggle} style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 16, border: "none", background: "transparent", display: "grid", placeItems: "center", cursor: "pointer", color: state === "listening" ? C.bad : C.muted, animation: state === "listening" ? "antilokiDotPulse 1s ease-in-out infinite" : "none" }}>
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden style={{ display: "block" }}><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
  </button>;
}
export function ChatSkin({ paneId, who, engine, blocked, notice, onLocalModel, poll = 1500, focused = true, working = false, tools, accent, readOnly }: { paneId: number; who: string; /** the agent's engine (`claude-code`, `codex`): the commands the slash menu suggests */ engine?: string; /** the question the agent's terminal is asking (the pane's `blocked`): "Switch model?" is answered here, with buttons, because the terminal is hidden */ blocked?: string | null; /** `/model <local model>` typed here switches the agent onto that local model (a restart, with the handover): this runs it and answers an error text, or null when it went through */ onLocalModel?: (tag: string) => Promise<string | null>; /** what the agent's CLI last answered a setting command with ("Set model to Sonnet 5.5 ..."): shown as its terminal shows it */ notice?: string;  /** why nobody types here (another agent drives it): the message box is replaced by this line */ readOnly?: string; /** the specialist's colour (the reasoning box wears it) */ accent?: string; poll?: number; /** what used to be on the bar, to the right of the input: the microphone, the model */ tools?: React.ReactNode; /** the agent is running: show the reasoning box */ working?: boolean; /** the pane has the focus: the cursor goes to the message box */ focused?: boolean }) {
  const [turns, setTurns] = React.useState<ChatTurn[]>([]); const [pending, setPending] = React.useState<string[]>([]); const pendingRef = React.useRef(false); const workingRef = React.useRef(working); workingRef.current = working; const [loaded, setLoaded] = React.useState(false); const slow = useSlow(!loaded, 1000); const [note, setNote] = React.useState<string>(""); const [text, setText] = React.useState(""); const [err, setErr] = React.useState(""); const endRef = React.useRef<HTMLDivElement>(null); const stick = React.useRef(true); const box = React.useRef<HTMLDivElement>(null); const input = React.useRef<HTMLTextAreaElement>(null); const fileInput = React.useRef<HTMLInputElement>(null);
  const attach = async (f: File) => { setErr(""); const r = await attachFile(paneId, f); if (r.ok) { setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${fileRef(r.path).trim()} `); input.current?.focus(); } else setErr(r.error); };
  // the cursor lives in the message box: when the chat appears and whenever the pane gets the focus (the terminal under it must not keep it)
  React.useEffect(() => { if (!focused) return; const h = window.requestAnimationFrame(() => input.current?.focus({ preventScroll: true })); return () => window.cancelAnimationFrame(h); }, [focused, paneId]);
  // THE BOX STOPS GROWING (operator 2026-11-26: "this size should be the maximum, not infinity, and the icons could be 2 lines at this point"): from three lines on, the buttons stand in two rows and the text gets the width
  const [tall, setTall] = React.useState(false);
  React.useLayoutEffect(() => { const el = input.current; if (!el) return; el.style.height = "0px"; const need = el.scrollHeight; el.style.height = `${Math.min(INPUT_MAX, need)}px`; setTall((was) => (text === "" ? false : was || need > 60)); }, [text, tall]);
  React.useEffect(() => {
    // THE POLL IS GENTLE (found 2026-11-22: "the thread keeps scrolling alone and crashed Chrome twice"): nothing is set when nothing changed, nothing is asked while the tab is hidden, an idle chat asks slowly, and the next ask is only scheduled when the last one is back
    let alive = true; let timer = 0; let last = "";
    const sig = (ts: ChatTurn[]) => { const l = ts[ts.length - 1]; return `${ts.length}|${l?.t ?? ""}|${l?.text?.length ?? 0}|${l?.tools?.length ?? 0}|${l?.tools?.filter((x) => x.done).length ?? 0}`; };
    const tick = async () => {
      if (!document.hidden) { const r = await ptyTranscript(paneId, 200); if (!alive) return; setLoaded(true);
        if (r) { setMirror(r.known === false); if (r.known === false) setPending((p) => (p.length === 0 ? p : [])); const s = sig(r.turns); if (s !== last) { last = s; setTurns(r.turns); } setPending((p) => (p.length === 0 ? p : p.filter((t) => !r.turns.slice(-6).some((x) => x.role === "user" && x.text.trim() === t.trim())))); const n = r.known ? (r.turns.length ? "" : r.why ?? "") : r.why ?? ""; setNote((o) => (o === n ? o : n)); } }
      if (alive) timer = window.setTimeout(() => void tick(), pendingRef.current || workingRef.current ? poll : Math.max(poll, 4000));
    };
    void tick(); return () => { alive = false; window.clearTimeout(timer); };
  }, [paneId, poll]);
  React.useEffect(() => { pendingRef.current = pending.length > 0; }, [pending]);
  // follow the bottom by moving THIS box only (scrollIntoView moves every scrollable ancestor, the pane and the page too)
  React.useEffect(() => { const e = box.current; if (stick.current && e) e.scrollTop = e.scrollHeight; }, [turns, pending]);
  // A SETTING COMMAND (`/model haiku`) IS NOT A MESSAGE (2026-11-24: "changing models is not reasoning"): the agent's session log never holds it as a user turn and no reply follows, so it must not wait in `pending` (the "Reasoning..." that never stopped). It is sent, and said once.
  const [cmd, setCmd] = React.useState("");
  // THE TERMINAL UNDER THE CHAT: its menus (permissions, trust, what a bare `/…` opens) are shown here as buttons; an engine with no readable transcript shows its screen
  const screen = useTermScreen(paneId, 1500);
  // PAUSED (operator 2026-11-26: "on paused the chatmode input wasnt blocked"): nothing is typed to a stopped agent
  const held = usePaused().some((p) => p.paneId === paneId);
  const menu = readOnly || held ? null : parseTermMenu(screen); const failed = parseTermError(screen); const [mirror, setMirror] = React.useState(false);
  // THE SLASH MENU (the terminal offers its commands on "/"; the chat does the same): shown while the first word is typed, Up/Down choose, Tab or Enter complete it, Esc closes it until the text changes
  const [slashAt, setSlashAt] = React.useState(0); const [slashOff, setSlashOff] = React.useState(false);
  // THE LOCAL MODELS, asked once when the person starts typing /model: they are offered after it, and `/model <local model>` switches to one
  const [localTags, setLocalTags] = React.useState<string[]>([]); const [info, setInfo] = React.useState(""); const askedLocal = React.useRef(false);
  const loadLocals = async (): Promise<string[]> => { const l = await localModels(); const tags = l?.reachable ? l.models.filter((m) => !m.unavailable).map((m) => m.tag) : []; setLocalTags(tags); return tags; };
  React.useEffect(() => { if (askedLocal.current || !onLocalModel || !/^\/model\b/i.test(text)) return; askedLocal.current = true; void loadLocals(); }, [text, onLocalModel]);
  const slash = slashOff ? [] : slashMatches(engine, text, localTags); const slashSel = Math.min(slashAt, Math.max(0, slash.length - 1));
  const completeSlash = (insert: string) => { if (!held && listsModelsOnScreen(engine, insert)) { setSlashAt(0); void sendNow(insert.trim()); return; } setText(insert); setSlashAt(0); input.current?.focus(); };
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (slash.length > 0) {
      // SPACE chooses too, like the terminal's own list (operator 2026-11-26): on a half-typed command or value it completes it, which for /model opens the models
      if (e.key === " " && text.length > 1 && !text.endsWith(" ") && slash[slashSel].insert.trim() !== text.trim()) { e.preventDefault(); completeSlash(slash[slashSel].insert); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashAt((slashSel + 1) % slash.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashAt((slashSel + slash.length - 1) % slash.length); return; }
      if (e.key === "Escape") { e.preventDefault(); setSlashOff(true); return; }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey && slash[slashSel].insert.trim() !== text.trim())) { e.preventDefault(); completeSlash(slash[slashSel].insert); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
  };
  const send = async () => {
    const t = text.trim(); if (!t || held) return;
    // `/model <local model>`: Claude Code cannot move itself onto a local model (the model server is in its environment), so the chat does it: a provider switch with the handover, then a restart
    const lm = /^\/model\s+(?:local:)?(\S+)$/i.exec(t);
    if (lm && onLocalModel && !/^(haiku|sonnet|opus|default)$/i.test(lm[1]) && !/^claude-/i.test(lm[1])) {
      const tags = localTags.length ? localTags : await loadLocals(); const tag = tags.find((x) => x === lm[1] || x === `${lm[1]}:latest`);
      if (tag) { setText(""); setErr(""); setInfo(`switching to ${tag} (local): the conversation goes on…`); const e = await onLocalModel(tag); if (e) { setInfo(""); setErr(e); } else { setInfo(`${tag} (local) continues this conversation`); window.setTimeout(() => setInfo(""), 6000); } return; }
    }
    await sendNow(t);
  };
  const sendNow = async (t: string) => { const menu = listsModelsOnScreen(engine, t) ? null : opensAMenu(t); if (menu) { setText(""); setErr(`/${menu} opens a menu in the terminal. Switch this pane to the terminal view to use it${menu === "model" ? ", or type /model haiku (a model name) here" : ""}.`); return; } const setting = isSettingCommand(t); setText(""); setErr(""); if (!setting) setPending((p) => [...p, t]); stick.current = true; const r = await sendToAgent(paneId, t); if (!r.ok) { setErr(r.error ?? "could not send"); if (!setting) setPending((p) => p.filter((x) => x !== t)); } else if (setting) { setCmd(t); window.setTimeout(() => setCmd(""), 5000); } else { const f = await ptyTranscript(paneId, 200); if (f) setTurns(f.turns); } };
  return (
    <div data-testid="chat-skin" onDragOver={(e) => { if (!readOnly && (carriesFile(e.dataTransfer) || Array.from(e.dataTransfer.types ?? []).includes("Files"))) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
      onDrop={(e) => { const p = draggedPath(e.dataTransfer); const f = e.dataTransfer.files?.[0]; if (readOnly || (!p && !f)) return; e.preventDefault(); if (p) { setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${fileRef(p)}`); input.current?.focus(); } else if (f) void attach(f); }} style={{ position: "absolute", inset: 0, zIndex: 5, display: "flex", flexDirection: "column", background: `color-mix(in srgb, ${C.panel} var(--cw-term, 100%), transparent)`, fontFamily: nav, minHeight: 0 }}>   {/* glassy like the terminal: the same terminal-opacity setting of Appearance */}
      <div ref={box} onScroll={() => { const e = box.current; if (e) stick.current = e.scrollHeight - e.scrollTop - e.clientHeight < 80; }} style={{ flex: 1, minHeight: 0, overflowY: "auto", margin: "4px 8px 4px 0", scrollbarWidth: "thin", padding: "14px max(16px, calc((100% - 760px) / 2))", display: "flex", flexDirection: "column", gap: 14 }}>
        {!loaded && slow && turns.length === 0 && <Skeleton lines={6} testid="chat-skeleton" />}
        {mirror && <TermMirror rows={screen} />}
        {loaded && !mirror && turns.length === 0 && pending.length === 0 && <div data-testid="chat-empty" style={{ margin: "auto", color: C.muted, fontSize: 12.5 }}>{note || `Say something to ${who}.`}</div>}
        {turns.map((t, i) => t.by === "antiloki" ? (
          <div key={i} data-testid="chat-antiloki" title={t.text} style={{ alignSelf: "center", maxWidth: "92%", fontFamily: mono, fontSize: 10.5, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{antilokiLine(t.text)}</div>
        ) : t.role === "user" ? (
          <div key={i} data-testid="chat-user" style={{ alignSelf: "flex-end", maxWidth: "78%", padding: "8px 12px", borderRadius: 12, background: `color-mix(in srgb, ${C.brand} 18%, ${C.panel})`, color: C.fg, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{t.text}</div>
        ) : (
          <div key={i} data-testid="chat-assistant" style={{ alignSelf: "flex-start", maxWidth: "92%", display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            {t.text && <div style={{ fontSize: 13, lineHeight: 1.55, color: C.fg, overflowWrap: "anywhere" }}><Markdown text={t.text} /></div>}
            {t.tools.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{t.tools.map((x, j) => <ToolChip key={j} t={x} />)}</div>}
            <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim }}>{when(t.t)}{t.model ? ` · ${String(t.model).replace(/^claude-/, "")}` : ""}{t.tokens_out ? ` · ${t.tokens_out} tok out` : ""}</div>
          </div>
        ))}
        {pending.map((t, i) => <div key={`p${i}`} data-testid="chat-user" data-pending="1" style={{ alignSelf: "flex-end", maxWidth: "78%", padding: "8px 12px", borderRadius: 12, background: `color-mix(in srgb, ${C.brand} 18%, ${C.panel})`, color: C.fg, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere", opacity: 0.85 }}>{t}</div>)}
        {failed && <div data-testid="chat-agent-error" role="alert" style={{ alignSelf: "flex-start", maxWidth: "92%", padding: "8px 12px", borderRadius: 12, border: `1px solid color-mix(in srgb, ${C.bad} 55%, transparent)`, background: `color-mix(in srgb, ${C.bad} 10%, transparent)`, color: C.fg, fontSize: 13, lineHeight: 1.5, overflowWrap: "anywhere" }}><b style={{ color: C.bad, fontWeight: 600 }}>{who}: </b>{failed}</div>}
        {!held && !failed && (working || pending.length > 0 || (!idleAgy(engine, screen) && turns.length > 0 && (turns[turns.length - 1].role === "user" || turns[turns.length - 1].tools.some((x) => !x.done)))) && <Reasoning color={accent} />}
        <div ref={endRef} />
      </div>
      {readOnly ? <div data-testid="chat-readonly" style={{ padding: "10px 16px 14px", textAlign: "center", fontFamily: mono, fontSize: 11, color: C.muted }}>{readOnly}</div> : <div style={{ padding: "6px 16px 14px", display: "flex", justifyContent: "center" }}>
        <div data-testid="chat-composer" style={{ position: "relative", width: "100%", maxWidth: 760, display: "flex", alignItems: tall ? "flex-end" : "center", gap: 6, padding: "8px", borderRadius: 14, border: `1px solid ${C.border}`, background: `color-mix(in srgb, ${C.fg} 6%, transparent)`, backdropFilter: "blur(var(--cw-blur, 10px))" }}
          onMouseDown={(e) => { if ((e.target as HTMLElement).tagName !== "BUTTON" && e.target !== input.current) { e.preventDefault(); input.current?.focus(); } }}>
          <button data-testid="chat-attach" aria-label="attach an image or file" title="Add an image or a file" disabled={held} onClick={() => fileInput.current?.click()} style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, border: "none", background: "transparent", display: "grid", placeItems: "center", cursor: "pointer", color: C.muted }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <input ref={fileInput} data-testid="chat-file" type="file" accept="image/*,application/pdf,text/plain" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void attach(f); e.target.value = ""; }} />
          <textarea ref={input} data-testid="chat-input" data-chat-input="1" value={text} rows={1} onChange={(e) => { setText(e.target.value); setSlashAt(0); setSlashOff(false); }} disabled={held} placeholder={held ? "Paused: press Continue to write" : "Start vibing..."} aria-label={`message ${who}`} onKeyDown={onKey}
            style={{ flex: 1, resize: "none", background: "transparent", color: C.fg, border: "none", padding: "7px 0", margin: 0, fontFamily: nav, fontSize: 14, lineHeight: "20px", outline: "none", maxHeight: INPUT_MAX, minHeight: 20, minWidth: 0, overflowY: "auto", alignSelf: "center" }} />
          {slash.length > 0 && <div data-testid="chat-slash" role="listbox" aria-label="commands" style={{ position: "absolute", left: 0, right: 0, bottom: "calc(100% + 6px)", maxHeight: 240, overflowY: "auto", padding: 4, borderRadius: 12, border: `1px solid ${C.border}`, background: `color-mix(in srgb, ${C.panel} 88%, transparent)`, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", boxShadow: "0 8px 28px rgba(0,0,0,.4)" }}>
            {slash.map((c, i) => <div key={c.insert} role="option" aria-selected={i === slashSel} data-testid={`chat-slash-${c.insert.trim().slice(1).replace(/\s+/g, "-")}`} onMouseDown={(e) => { e.preventDefault(); completeSlash(c.insert); }} onMouseEnter={() => setSlashAt(i)}
              style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "5px 10px", borderRadius: 8, cursor: "pointer", background: i === slashSel ? `color-mix(in srgb, ${C.fg} 10%, transparent)` : "transparent" }}>
              <span style={{ fontFamily: mono, fontSize: 12.5, color: C.fg, minWidth: 96 }}>{c.name}</span><span style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.hint}</span>
            </div>)}
          </div>}
          {/* one group, so that in a tall box it folds into two rows */}
          <div data-testid="chat-buttons" data-rows={tall ? 2 : 1} style={tall ? { display: "flex", flexWrap: "wrap", justifyContent: "flex-end", alignContent: "flex-end", alignItems: "center", gap: 6, width: 132, flexShrink: 0 } : { display: "contents" }}>
          {engine && <ModeSwitch paneId={paneId} engine={engine} screen={screen} held={held || !!menu || !!blocked} />}
          {held ? <span data-testid="chat-tools-held" aria-disabled style={{ display: "contents" }}><span style={{ display: "inline-flex", gap: 6, opacity: 0.45, pointerEvents: "none" }} inert>{tools}</span></span> : tools}
          <button data-testid="chat-send" aria-label="send" onClick={() => void send()} disabled={held || !text.trim()} style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 17, border: "none", display: "grid", placeItems: "center", background: text.trim() ? C.fg : `color-mix(in srgb, ${C.fg} 18%, transparent)`, color: text.trim() ? C.panel : C.dim, cursor: text.trim() ? "pointer" : "default" }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
          </button>
          </div>
        </div>
      </div>}
      {menu && !blocked?.startsWith("Switch model?") && !blocked?.startsWith("MCP approval") && <TermMenuCard paneId={paneId} menu={menu} who={who} />}
      {!held && blocked?.startsWith("Switch model?") && <div data-testid="chat-switch" role="alert" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "0 auto 8px", maxWidth: 760, width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 12, border: `1px solid ${C.border}`, background: `color-mix(in srgb, ${C.fg} 6%, transparent)`, fontSize: 12.5, color: C.fg }}>
        <span style={{ flex: 1, minWidth: 220, lineHeight: 1.45 }}>{who} asks before switching the model: the conversation is cached for the current one, so the next reply is slower and uses more tokens (the history is read again).</span>
        <button data-testid="chat-switch-yes" onClick={() => void ptyInput(paneId, "\r")} style={{ border: "none", borderRadius: 8, padding: "5px 12px", background: C.fg, color: C.panel, cursor: "pointer", fontSize: 12.5 }}>Switch</button>
        <button data-testid="chat-switch-no" onClick={() => void ptyInput(paneId, "\x1b")} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", background: "transparent", color: C.fg, cursor: "pointer", fontSize: 12.5 }}>Keep the current model</button>
      </div>}
      {!held && blocked?.startsWith("MCP approval") && <div data-testid="chat-mcp" role="alert" style={{ margin: "0 auto 8px", maxWidth: 760, width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 12, border: `1px solid ${C.border}`, background: `color-mix(in srgb, ${C.fg} 6%, transparent)`, fontSize: 12.5, color: C.fg, lineHeight: 1.45 }}>
        {who} needs you: approve the antiloki MCP server, so it can use antiloki's tools. <button data-testid="chat-mcp-approve" onClick={() => void ptyInput(paneId, "a")} style={{ border: "none", borderRadius: 8, padding: "4px 12px", margin: "0 6px", background: C.fg, color: C.panel, cursor: "pointer", fontSize: 12.5 }}>Approve</button> answers its question with <b>Approve all servers</b> (every server it lists, normally only antiloki). Or open the terminal (the icon at the top right) and choose yourself. If the terminal has stopped, press <b>start again</b> there first.
      </div>}
      {/* what the CLI answered (as its terminal shows it) once it has; until then, that the command went */}
      {info && <div data-testid="chat-info" style={{ padding: "4px 14px 8px", color: C.muted, fontSize: 12 }}>{info}</div>}
      {(notice || cmd) && <div data-testid="chat-cmd" style={{ padding: "4px 14px 8px", color: C.muted, fontSize: 12 }}>{notice ? <>✓ {notice}</> : <>sent <span style={{ fontFamily: mono }}>{cmd}</span> to the agent</>}</div>}
      {err && <div role="alert" style={{ padding: "4px 14px 8px", color: C.bad, fontSize: 11.5 }}>{err}</div>}
    </div>
  );
}
