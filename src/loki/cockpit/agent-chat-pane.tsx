// THE CHAT AGENT PANE (operator 2026-09-20: "would I lose anything replacing the Claude Code agent for a
// chatbot — a different UI like antiChat, keeping all the power?"). Claude Code's own programmatic session
// (serve/agent.rs), rendered as a conversation: the operator's turns, the assistant's text as it streams,
// every tool call as a card, the tool results folded, each turn's cost. No PTY: nothing to resize, no
// scrambled keys, no composer to intercept — the ask goes through the pane's own composer, so Heimdall
// reads it first when the router is on.
import { traceOf, oneLine, type TraceLine } from "@/loki/chat/turn-trace";
import { TwoWays } from "@/loki/chat/two-ways";
import { confidenceOf, confidenceLabel } from "@/loki/chat/confidence";
import * as React from "react";
import { createPortal } from "react-dom";
import { EPISODE_CLOSING, EPISODE_CLOSED, EPISODE_FAILED } from "@/loki/shell/workspace-veil";
import { useTourUnlock } from "@/loki/shell/mini-tour";
import { apiGet, apiPost, isNotWired } from "@/loki/api/client";
import { C } from "@/loki/theme";
import { CommitPushButton } from "@/loki/cockpit/commit-push-button";
import { MainWelcome } from "./main-welcome";
import { followBottom } from "./follow-bottom";
import { WorkStory, fetchStory, type Story, type PlanInfo } from "@/loki/chat/work-story";
import { SIDE_OPS, type SideKind } from "@/loki/chat/side-questions";
import { AgentsTimeline } from "@/loki/widgets/agents-timeline";
import { subscribeAgent } from "./pty-streams";
// antiChat's own chrome (operator 2026-09-20: "use the looks, the UI of antiChat on the agents — keep the
// agent power, add looks, feel and some capabilities"): the same bubbles (markdown replies, the meta line),
// the same composer card with @ context / # widget chips, the same folds
import { Bubble } from "@/loki/chat/chat-thread";
import { LiveLine, ScreeningCard, RunResult, liveRunOf, resultHomes, threadIdle } from "./agent-live";
import { FlowBlock, FlowReply, TaskCard, ReplyMeta, metaOf, sumMeta, metaLine, totalLine } from "./chat-flow";
import { MentionInput } from "@/loki/chat/mention-input";
// # WIDGETS (2026-09-20): the thread's other cells are referable; a referenced cell's content rides with the ask
import { useThreadRefables, threadCellOf, ghostCell, widgetTokens, displayText } from "@/loki/chat/thread-refables";
import { articleFromNode } from "@/loki/widgets/artefact-compose";
// THE REPLY'S BUTTONS (operator 2026-09-21: "buttons below each response like antiChat has — simplify, expand,
// summary"): a display-only rewrite of ONE reply through the operator's own engine at the low tier (the
// session is never touched; ↩ original always there), a summary, and copy. Same look as antiChat's ✂/⤢ row.
import { askEngine } from "@/loki/api/engine";
import { isDesktop, pickFile } from "@/loki/desktop/shell";
import { uploadFile, type UploadResult } from "@/loki/api/dispatch";
import { apiPost as apiPostRaw } from "@/loki/api/client";
import { apiPostStrict, reasonOf } from "@/loki/api/post-strict";
import { Markdown } from "@/loki/components/Markdown";
import { LensReply, parseLens } from "./lens-reply";
import { Logo } from "@/loki/shell/logo";
import { RoleSwitcher, shownRoleOf, workingLine } from "@/loki/chat/role-switcher";
import type { RoleAdapter } from "@/loki/chat/roles";
import { minSavings, spawnSubagents, isRunDelivery, type GoalRun } from "@/loki/widgets/subagents";
import { AGENT_THEMES, AGENT_THEME_KEYS, agentTheme, doneLine, engineTheme, loadTheme, saveTheme, validThemeOr, type AgentTheme, type AgentThemeKey } from "./agent-themes";

// ── @ context, exactly antiChat's references (the wizard, the tray, the server-side resolver) ──
type TrayRef = { kind: "card"; slug: string } | { kind: "knowledge"; docId: number; label: string } | { kind: "db_row"; table: string; id: string; label: string } | { kind: "code_file"; path: string } | { kind: "source"; source: string; label: string } | { kind: "attachment"; docId: number; label: string };
export const refKey = (r: TrayRef) => r.kind === "card" ? `card:${r.slug}` : r.kind === "knowledge" ? `knowledge:${r.docId}` : r.kind === "db_row" ? `db_row:${r.table}:${r.id}` : r.kind === "code_file" ? `code_file:${r.path}` : r.kind === "source" ? `source:${r.source}` : `attachment:${r.docId}`;
export const trayLabel = (r: TrayRef) => r.kind === "card" ? `@${r.slug}` : r.kind === "knowledge" ? `@${r.label}` : r.kind === "code_file" ? `@${r.path.split("/").pop() ?? r.path}` : r.kind === "source" ? `🔌 ${r.label}` : r.kind === "attachment" ? `📎 ${r.label}` : `@${r.table}#${r.id}`;
export function buildRefPayload(refs: TrayRef[]): { references: any[]; attachments: any[] } {
  const references: any[] = []; const attachments: any[] = [];
  for (const r of refs) {
    if (r.kind === "card") references.push({ ref_type: "card", id: r.slug });
    else if (r.kind === "knowledge") references.push({ ref_type: "knowledge", id: r.docId });
    else if (r.kind === "db_row") references.push({ ref_type: "db_row", table: r.table, id: r.id });
    else if (r.kind === "code_file") references.push({ ref_type: "code_file", id: r.path });
    else if (r.kind === "source") references.push({ ref_type: "source", id: r.source });
    else if (r.kind === "attachment") attachments.push({ document_id: r.docId });
  }
  return { references, attachments };
}
/** The message the agent receives: the ask, then the pinned context rendered by the chat's resolver, and
 *  the code files by path (the agent has tools — it reads the rest itself). Pure. */
export const CONTEXT_MARKER = "\n---\nContext pinned by the operator (read it before answering):";
/** the ask alone out of a composed message (the bubble shows this; the route matches on it). Pure. */
export function askOf(full: string): string { const i = full.indexOf(CONTEXT_MARKER); return (i < 0 ? full : full.slice(0, i)).trim(); }
export function withContext(ask: string, refs: TrayRef[], referencesMd: string, attachmentsMd: string, widgetsMd = ""): string {
  if (!refs.length && !widgetsMd.trim()) return ask;
  const files = refs.filter((r): r is Extract<TrayRef, { kind: "code_file" }> => r.kind === "code_file").map((r) => `- ${r.path}`);
  const parts = [ask, CONTEXT_MARKER];
  if (files.length) parts.push(`Files:\n${files.join("\n")}`);
  if (referencesMd.trim()) parts.push(referencesMd.trim());
  if (attachmentsMd.trim()) parts.push(attachmentsMd.trim());
  if (widgetsMd.trim()) parts.push(widgetsMd.trim());
  return parts.join("\n\n");
}
/** The `#` widgets of an ask as markdown: each referenced cell of the thread reshaped into an article, as it reads
 *  right now (the same deterministic pass the artefacts use; no AI). `cellOf` finds the cell — injectable, tested. */
export function widgetsContext(text: string, cellOf: (refId: string) => HTMLElement | null = threadCellOf): string {
  const toks = widgetTokens(text);
  if (!toks.length) return "";
  const parts = toks.map(({ refId, label }) => { const el = cellOf(refId); return el ? articleFromNode(el, label) : `# ${label}\n\n(the widget ${label} is not on screen right now)`; });
  return `Widgets of this thread the operator pointed at (#):\n\n${parts.join("\n\n")}`;
}
/** The same, for ANY docked widget (2026-09-21): an on-screen cell is read as is; an agent widget (any thread)
 *  becomes its transcript; any other off-screen widget is ghost-rendered for one read. `deps` injectable — tested. */
export async function widgetsContextAsync(text: string, deps: {
  refables: { refId: string; label: string; thread?: string; onScreen?: boolean; agentKey?: string }[];
  cellOf?: (refId: string) => HTMLElement | null;
  ghost?: (refId: string) => Promise<{ el: HTMLElement; release: () => void } | null>;
  transcriptOfKey?: (agentKey: string) => Promise<{ name: string; transcript: string } | null>;
}): Promise<string> {
  const toks = widgetTokens(text);
  if (!toks.length) return "";
  const cellOf = deps.cellOf ?? threadCellOf;
  const parts: string[] = [];
  for (const { refId, label } of toks) {
    const ref = deps.refables.find((r) => r.refId === refId);
    const where = ref?.thread ? ` (thread "${ref.thread}")` : "";
    const on = cellOf(refId);
    if (on) { parts.push(articleFromNode(on, label)); continue; }
    if (ref?.agentKey && deps.transcriptOfKey) {
      const t = await deps.transcriptOfKey(ref.agentKey).catch(() => null);
      parts.push(t ? `# ${label}${where} — the chat of the agent ${t.name}\n\n${t.transcript.trim() || "(nothing said yet)"}` : `# ${label}${where}\n\n(the agent's chat could not be read)`);
      continue;
    }
    const g = deps.ghost ? await deps.ghost(refId).catch(() => null) : null;
    if (g) { try { parts.push(articleFromNode(g.el, `${label}${where}`)); } finally { g.release(); } continue; }
    parts.push(`# ${label}${where}\n\n(the widget ${label} could not be rendered for reading)`);
  }
  return `Widgets the operator pointed at (#):\n\n${parts.join("\n\n")}`;
}

// THE `@` EXTRAS (operator 2026-09-21): `@agent:<pane_id> (Label)` — another agent, any thread: its transcript rides as
// context; `@specialist:<id> (Label)` — an isolated sub-agent with THIS ask as its prompt, in the caller's box (its
// scope, its hooks); the ask never reaches the pane's own agent. Pure token readers — tested.
export const AT_TOKEN = /@(agent|specialist):([\w.:/-]+) \(([^)]*)\)/g;
export function atTokens(text: string): { kind: "agent" | "specialist"; id: string; label: string }[] {
  const out: { kind: "agent" | "specialist"; id: string; label: string }[] = []; const seen = new Set<string>();
  for (const m of text.matchAll(AT_TOKEN)) { const k = `${m[1]}:${m[2]}`; if (!seen.has(k)) { seen.add(k); out.push({ kind: m[1] as "agent" | "specialist", id: m[2], label: m[3] }); } }
  return out;
}
/** the ask as the agent (or the specialist) reads it: `@agent:… (Label)` → `@Label`; `#` tokens → `#Label`; `!episode:N (Label)` → `!Label` */
/** A MACHINE ASK (operator 2026-09-23: "inside the agents I see their config in the chat — hide it"): a prompt antiloki
 *  itself sent through the pane (a review template, a specialist brief, a routine's instructions) — long, and shaped
 *  like instructions rather than a sentence. The chat folds it to one line; the role tab holds the config. Pure — tested. */
export function isMachineAsk(text: string): boolean {
  const t = String(text ?? "");
  if (t.length < 900) return false;
  return /respond with (a single|only) json|single json object only|^you are (the|a|an) |^ROUTINE\b|^MISSION:|write the review json|return only json|no prose before or after/im.test(t);
}
/** the folded line of a machine ask. Pure. */
export function machineAskLine(text: string): string { const t = String(text ?? ""); const first = t.split("\n").map((l) => l.trim()).find(Boolean) ?? ""; return `⚙ instructions from antiloki · ${first.length > 60 ? `${first.slice(0, 59)}…` : first} · ${t.length.toLocaleString()} chars`; }
/** a "you" line that folds when it is a machine ask — click to unfold */
export function AskBody({ text, style }: { text: string; style?: React.CSSProperties }) {
  const [open, setOpen] = React.useState(false);
  if (!isMachineAsk(text)) return <>{text}</>;
  return <span data-testid="machine-ask" data-open={open ? "1" : "0"} onClick={() => setOpen((o) => !o)} title={open ? "click to fold" : "click to unfold the instructions"} style={{ cursor: "pointer", ...(open ? {} : { opacity: .75, fontStyle: "italic" }), ...style }}>{open ? text : machineAskLine(text)}</span>;
}
export function askText(text: string): string { return displayText(text.replace(AT_TOKEN, (_m, _k, _id, label) => `@${label}`).replace(BANG_TOKEN, (_m, _n, label) => `!${label}`)); }
// THE `!` EPISODES (operator 2026-09-21): `!episode:<n> (Label)` — a chat's consolidation rides as a context section
export const BANG_TOKEN = /!episode:(\d+) \(([^)]*)\)/g;
export function bangTokens(text: string): number[] { const out: number[] = []; for (const m of text.matchAll(BANG_TOKEN)) { const n = Number(m[1]); if (!out.includes(n)) out.push(n); } return out; }
export type EpisodeRef = { n: number; title: string; subtitle: string; snapshot: string; turns: number };
/** THE PROVIDER CHIP of a chat (operator 2026-09-21): where the model chip sits on an agent pane — ✦ the provider; a click
 *  lists the three; picking another consolidates the episode and opens the next on it (the serve's chat/switch) */
export type ChatSwitch = { engines: string[]; busy: boolean; pick: (engine: string) => void };
/** the sections for the `!` episodes named in the ask: an episode's record is the snapshot the NEXT one's marker carries;
 *  the open episode has none (its turns are this very conversation). Pure. */
export function episodesContext(text: string, episodes: EpisodeRef[]): string {
  return bangTokens(text).map((n) => {
    const ep = episodes.find((e) => e.n === n); if (!ep) return "";
    const rec = episodes.find((e) => e.n === n + 1)?.snapshot?.trim() ?? "";
    return `# !episode #${n}${ep.title ? ` — ${ep.title}` : ""}${ep.subtitle ? `\n_${ep.subtitle}_` : ""}\n\n${rec || "(the open episode — its turns are this conversation)"}`;
  }).filter(Boolean).join("\n\n");
}
/** the specialist's brief: who it is, the box rule, then the operator's ask. Pure — tested. */
export function specialistPrompt(sp: { title: string; category?: string; description?: string }, ask: string): string {
  return [`You are the specialist "${sp.title}"${sp.category ? ` (${sp.category})` : ""}${sp.description ? ` — ${sp.description}` : ""}.`,
    "You run as an isolated sub-agent of the agent that owns this box: work only inside its scope (the box's hooks refuse anything else), do not delegate, do not ask — decide and report. End with a short report: what you found or changed, file by file, and what you did not do.",
    "", ask.replace(/@specialist:[^ ]* \([^)]*\)/g, "").trim()].join("\n");
}
/** another agent's chat as a context section. Pure. */
export function transcriptSection(label: string, name: string, transcript: string): string {
  return `# @${label} — the chat of the agent ${name}\n\n${transcript.trim() || "(nothing said yet)"}`;
}
const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';

/** A MOUSE CLICK ON A TOGGLE MUST NOT TAKE THE KEYBOARD (Grokbot QA 2026-10-12, bug 5: "typing after clicking the Heimdall pill toggles its switch (space = toggle)"). A button keeps focus after a click, so the next space
 *  re-pressed it. Preventing the default of mousedown keeps the click and keeps the focus where it was (the composer); Tab, Enter and Space on a button the keyboard focused still work. */
const NO_FOCUS_ON_CLICK = (e: React.MouseEvent) => e.preventDefault();
// THE MODE TOGGLES (operator 2026-09-21: "the preview, QA, MIN and MAX rounded buttons still get ugly on
// small widths — take out the border and background, use the colour on the text when active, a subtle
// animation"): text-only, one line each (never wraps into a blob), the colour on the letters when on,
// a soft glow that settles when the state flips. The Heimdall chip is the same, read-only.
const MODE_KEYFRAMES = "@keyframes antilokiModeOn{0%{transform:scale(.92);filter:brightness(1.6);text-shadow:0 0 0 currentColor}60%{transform:scale(1.06);text-shadow:0 0 10px currentColor}100%{transform:none;text-shadow:0 0 0 transparent}}";
function ModeToggle({ testId, on, color, off, onClick, title, children, font = mono }: { testId: string; on: boolean; color: string; off: string; onClick?: () => void; /** undefined when the chip is only a label — its wrapper owns the click and the tooltip */ title?: string; children: React.ReactNode; font?: string }) {
  const flips = React.useRef(0); const prev = React.useRef(on);
  if (prev.current !== on) { prev.current = on; flips.current += 1; }
  return (
    <button data-testid={testId} data-on={on ? "1" : "0"} onClick={onClick} onMouseDown={NO_FOCUS_ON_CLICK} title={title}
      style={{ fontFamily: font, fontSize: 9, fontWeight: 700, letterSpacing: 1, whiteSpace: "nowrap", color: on ? color : off, opacity: on ? 1 : 0.75, background: "transparent", border: "none", borderRadius: 6, padding: "2px 4px", cursor: onClick ? "pointer" : "default", transition: "color .25s ease, opacity .25s ease, transform .2s ease", animation: on && flips.current ? "antilokiModeOn .5s ease" : "none" }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = on ? "1" : "0.75"; e.currentTarget.style.transform = "none"; }}>
      <style>{MODE_KEYFRAMES}</style>{children}
    </button>
  );
}

/** THE DIAL (operator 2026-09-21: "MIN and MAX are opposites — a switcher: MIN, SCOPE, MAX"): three words on one
 *  line, the active one lit in its colour with a thin underline that glides to it. SCOPE is the normal mode. */
/** THE BARS (operator 2026-09-22, with a picture of a segmented slider): Heimdall is no longer on/off — it holds
 *  THREE bars of three stops. Two axes: CONTEXT (MIN · BALANCED · MAX, as the operator defines them 2026-09-22:
 *  MIN = exploration through antiloki's intel only, and the intel decides which files are to be touched; BALANCED =
 *  the pane's scoped files in full PLUS antiloki's intel over them; MAX = the whole codebase and the whole intel,
 *  with exploration available on top) and COST (CHEAPER · BALANCED · FASTER — which model each role runs, from
 *  the list on the Costs page). Above them the super-bar LOW · MID · HIGH ("high" being smarter) moves both at once;
 *  moving an axis by hand leaves the super-bar reading `custom`. Stored on the pane as `settings.dial`. */
export type Stop = 0 | 1 | 2;
export type DialState = { position: Stop | null; context: Stop; cost: Stop };
// FASTER · BALANCED · PRECISER (operator 2026-09-22, replacing LOW · MID · HIGH: "do you agree? makes sense?").
// It does, in this direction: the high stop buys MORE context and STRONGER models, which is more accurate and
// measurably SLOWER and dearer (2026-09-22: ten flash workers 677 s · $1.02 against raw Opus 926 s · $6.47; the
// strong model earned its price only as the reviewer that caught the bug). So speed lives at the low stop and
// precision at the high one — calling the high stop "faster" would have been a lie the benches disprove.
export const SUPER_STOPS: { label: string; context: Stop; cost: Stop; why: string }[] = [
  { label: "FASTER", context: 0, cost: 0, why: "exploration through antiloki's intel alone — it decides which files are touched · the cheapest model that passes for every role — quickest and cheapest. MIN is only as good as this box's index: measured 11/50 against 44/50 on a box with no generated summaries (bench/min)" },
  { label: "BALANCED", context: 1, cost: 1, why: "the pane's scoped files in full plus antiloki's intel over them · the models you bound on the Costs page" },
  { label: "PRECISER", context: 2, cost: 2, why: "the whole codebase and the whole intel, exploration on top · the strongest models — surest, slowest, dearest" },
];
// EFFORT (operator 2026-09-23: "change model name for Effort"), FREED FROM THE PROVIDER (operator 2026-09-26:
// "Make it all effort → Cheaper Balanced Faster … because effort already routes through providers merge and model
// inside provider. makes sense? so smarter is the wrong word").
//
// It used to move a tier WITHIN the merge you were bound to. It now chooses the merge itself, across providers,
// from the record — so the stops are the only thing actually left to choose: which resource you would rather
// spend. SMARTER is gone, and its absence is the point: quality became a GATE (the band), not a score. A row
// outside the band is disqualified rather than expensive, and differences inside it are smaller than the record
// can measure — `merges::separated` says so. A SMARTER stop would have sold the right to buy noise.
const LABELS = { context: ["MIN", "BALANCED", "MAX"], cost: ["CHEAPER", "BALANCED", "FASTER"] } as const;
const TITLES = {
  context: "MIN: exploration through antiloki's intel ALONE — the intel decides which files are to be touched, the tree is never walked (worth it only where the index carries summaries and symbols: measured 11/50 vs 44/50 where it does not) · BALANCED: the pane's scoped files in full, plus antiloki's intel over them · MAX: the whole codebase and the whole intel, with exploration available on top",
  cost: "EFFORT — which merge does this role's work, chosen from the record across every provider. CHEAPER: the cheapest pairing whose measured quality is inside the band · BALANCED: the table's own weight — cost first, then time · FASTER: the quickest inside the band. Quality is not a stop here: anything outside the band is refused outright, and inside it the differences are smaller than the bench can measure.",
  sup: "FASTER · BALANCED · PRECISER — one bar over both axes: right buys context and model strength, and pays in time and money",
};

/** One bar: three stops on a hairline track, a small knob, the stop's name at the right. Discreet on purpose
 *  (operator 2026-09-22: "make the heimdall bars more discrete, pretty and animated") — 6 px of track, the fill
 *  and the knob on the same spring, the label crossfading as the stop changes. */
function Bar({ value, onChange, accent, track, knob, label, right, title, font }: { value: number; onChange?: (v: Stop) => void; accent: string; track: string; knob: string; label: string; right: string; title: string; font: string }) {
  const stops = 3, pct = (value / (stops - 1)) * 100;
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [hot, setHot] = React.useState(false);
  const pick = (clientX: number) => {
    const el = ref.current; if (!el || !onChange) return;
    const r = el.getBoundingClientRect(); const t = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(r.width, 1)));
    onChange(Math.round(t * (stops - 1)) as Stop);
  };
  const spring = "cubic-bezier(.2,.9,.25,1)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }} title={title}
      onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}>
      <span style={{ fontFamily: font, fontSize: 8.5, letterSpacing: 1, color: C.dim, width: 44, flex: "0 0 44px", textTransform: "uppercase" }}>{label}</span>
      <div ref={ref} role="slider" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={2} aria-valuetext={right} tabIndex={0}
        onKeyDown={(e) => { if (!onChange) return; if (e.key === "ArrowLeft" && value > 0) onChange((value - 1) as Stop); if (e.key === "ArrowRight" && value < 2) onChange((value + 1) as Stop); }}
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); pick(e.clientX); }}
        onPointerMove={(e) => { if (e.buttons === 1) pick(e.clientX); }}
        style={{ position: "relative", flex: 1, height: 14, display: "flex", alignItems: "center", cursor: onChange ? "pointer" : "default", touchAction: "none", outline: "none" }}>
        <i aria-hidden style={{ position: "absolute", left: 0, right: 0, height: 3, borderRadius: 999, background: track, transition: `background .2s ease` }} />
        <i aria-hidden style={{ position: "absolute", left: 0, height: 3, borderRadius: 999, width: `${pct}%`, background: accent, opacity: hot ? 1 : 0.8, transition: `width .26s ${spring}, opacity .2s ease` }} />
        {[0, 1, 2].map((i) => (
          <span key={i} aria-hidden style={{ position: "absolute", left: `calc(${(i / 2) * 100}% + ${2.5 - i * 2.5}px)`, width: 3, height: 3, borderRadius: 99,
            background: i === value ? "transparent" : i < value ? accent : C.dim, opacity: i === value ? 0 : i < value ? 0.9 : hot ? 0.75 : 0.35, transition: "opacity .2s ease, background .2s ease" }} />
        ))}
        <i aria-hidden style={{ position: "absolute", left: `calc(${pct}% + ${4.5 - value * 4.5}px)`, transform: "translateX(-50%)", width: 9, height: 9, borderRadius: 999,
          background: knob, boxShadow: hot ? `0 0 0 3px color-mix(in oklab, ${accent} 22%, transparent), 0 1px 2px rgba(0,0,0,.5)` : "0 1px 2px rgba(0,0,0,.45)",
          transition: `left .26s ${spring}, box-shadow .2s ease` }} />
      </div>
      <span key={right} style={{ fontFamily: font, fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: accent, width: 58, flex: "0 0 58px", textAlign: "right", animation: "antilokiStopIn .2s ease both" }}>{right}</span>
    </div>
  );
}

export type HeimdallMode = "auto" | "on" | "off";
export const HEIMDALL_WHY: Record<HeimdallMode, string> = {
  auto: "AUTO: Heimdall picks the models itself — the roles as you bound them, a worker always cheaper than its planner, sub-agents only when the ask projects over 15 minutes",
  on: "ON, not AUTO: Heimdall still reads every ask, but the bars below are yours — the models stop you set is the one it runs",
  off: "OFF: the raw agent. Nothing is routed, nothing is projected, the ask goes straight to this pane's model",
};

/** A SWITCH — the on/off of one thing, 22×12, the knob on a spring (operator 2026-09-22: "on off is a switch"). */
function Switch({ on, onClick, accent, label, title, font, testId }: { on: boolean; onClick?: () => void; accent: string; label?: string; title: string; font: string; testId: string }) {
  return (
    <button data-testid={testId} data-on={on ? "1" : "0"} role="switch" aria-checked={on} aria-label={label ?? testId} onClick={onClick} onMouseDown={NO_FOCUS_ON_CLICK} title={title}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "transparent", border: "none", padding: 0, cursor: onClick ? "pointer" : "default" }}>
      <i aria-hidden style={{ position: "relative", width: 22, height: 12, borderRadius: 999, flex: "0 0 22px",
        background: on ? accent : "rgba(255,255,255,.12)", opacity: on ? 0.9 : 1, transition: "background .2s ease" }}>
        <i style={{ position: "absolute", top: 2, left: on ? 12 : 2, width: 8, height: 8, borderRadius: 999, background: on ? "#0d0d0f" : "#9a9a9f",
          boxShadow: "0 1px 2px rgba(0,0,0,.4)", transition: "left .2s cubic-bezier(.2,.9,.25,1), background .2s ease" }} />
      </i>
      {label && <span style={{ fontFamily: font, fontSize: 9.5, letterSpacing: .6, color: on ? C.fg : C.dim, transition: "color .2s ease" }}>{label}</span>}
    </button>
  );
}

/** A PILL — one option of the menu, on or off, in AUTO's own clothes (operator 2026-09-22: "the others buttons
 *  not switch, like auto the border colors etc"). Only Heimdall itself is a switch; everything else is one of these. */
function Pill({ on, onClick, accent, label, title, font, testId, disabled = false }: { on: boolean; onClick?: () => void; accent: string; label: string; title: string; font: string; testId: string; disabled?: boolean }) {
  return (
    <button data-testid={testId} data-on={on ? "1" : "0"} aria-pressed={on} disabled={disabled} onClick={onClick} onMouseDown={NO_FOCUS_ON_CLICK} title={title}
      style={{ fontFamily: font, fontSize: 9, fontWeight: 700, letterSpacing: 1, padding: "3px 9px", borderRadius: 999,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? .4 : 1,
        border: `1px solid ${on && !disabled ? accent : C.border}`,
        background: on && !disabled ? `color-mix(in oklab, ${accent} 15%, transparent)` : "transparent",
        color: on && !disabled ? accent : C.dim,
        transition: "background .18s ease, color .18s ease, border-color .18s ease, opacity .18s ease" }}>{label}</button>
  );
}

/** HEIMDALL'S MENU (operator 2026-09-22: the word opens it; ON/OFF is a switch for Heimdall itself and AUTO is a
 *  button beside it; QA and sub-agents are options of this menu too). OFF is the raw agent — no routing at all. */
/** The three deterministic gates, and what each one is actually worth saying about. */
export const GATE_PILLS: { key: "test" | "build" | "lint" | "laws"; on: string; off: string }[] = [
  { key: "test", on: "TEST is on — the project's own runner over the files the turn changed, after the agent says it is done.", off: "TEST is off — click to run the project's own tests on the agent's claim." },
  { key: "build", on: "BUILD is on — the project's own build script, so it compiles as shipped and not just as edited.", off: "BUILD is off — click to run the project's own build on the agent's claim." },
  { key: "lint", on: "LINT is on — the project's own linter: the house rules, not a model's taste.", off: "LINT is off — click to run the project's own linter on the agent's claim." },
  // THE LAWS GATE (operator 2026-09-25: "a gate validation about the laws x-ray has on the new code, it should
  // be seconds because is deterministic and only on the diff with approve or reject guard"). It runs in process
  // over the changed files, so it costs no subprocess and no model; with no laws written it reports a skip,
  // because "no laws" and "no violations" are opposite facts.
  { key: "laws", on: "LAWS is on — X-ray's own code laws, judged on the files this turn changed. Deterministic and quick; a repo with no laws written reports that rather than passing.", off: "LAWS is off — click to judge each turn's changed files against X-ray's code laws." },
];

/** A warning/error note's id as a small dim suffix — only when the event has one (older events have none). */
export function NoteId({ id, tone }: { id?: string; tone?: string }) {
  if (!id || (tone !== "warn" && tone !== "bad")) return null;
  return <span data-testid="note-id" title="id — quote this to refer to this exact warning" style={{ fontFamily: mono, fontSize: 8, color: C.dim, opacity: 0.7, marginLeft: 6 }}>{id}</span>;
}
/** THE WIRE, FOLDED (operator 2026-09-28: "the stack trace should be collapsed on the agent chat, but appears a
 *  lot of telemetry and info that the user doesnt need to see").
 *
 *  One line saying how many, opening onto the lot. Consecutive stderr lines are the reason this exists — the serve
 *  emits one event per line, so a backtrace arrived as thirty separate red notes in the middle of the conversation.
 *  Nothing is dropped: everything here is still on the record and one click away, it simply stops interrupting.
 *  Pure over the notes it is given. */
export function WireNotes({ notes, font = mono }: { notes: { text: string; tone?: "ok" | "warn" | "bad" | "dim"; id?: string }[]; font?: string }) {
  const [open, setOpen] = React.useState(false);
  // the two skins each have their own local `tone`; this one is shared, so it carries its own
  const tone = (x?: string) => (x === "ok" ? C.ok : x === "warn" ? C.warn : x === "bad" ? C.bad : C.dim);
  if (!notes.length) return null;
  const bad = notes.filter((n) => n.tone === "bad").length;
  // the summary names the worst thing in there, because that is what decides whether to open it
  const label = bad > 0
    ? `${bad} line${bad === 1 ? "" : "s"} of error output${notes.length > bad ? ` · ${notes.length - bad} more` : ""}`
    : `${notes.length} telemetry line${notes.length === 1 ? "" : "s"}`;
  return (
    <div style={{ margin: "2px 0" }}>
      <button data-testid="wire-notes-toggle" onClick={() => setOpen((o) => !o)}
        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: font, fontSize: 9.5, color: bad > 0 ? C.bad : C.dim }}>
        {open ? "▾" : "▸"} {label}
      </button>
      {open && (
        <div data-testid="wire-notes" style={{ marginTop: 3, paddingLeft: 10, borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 1 }}>
          {notes.map((n, i) => (
            <div key={i} style={{ fontFamily: font, fontSize: 9.5, color: tone(n.tone), whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{n.text}<NoteId id={(n as any).id} tone={n.tone} /></div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HeimdallChip({ menu, children }: { menu: { dial: DialState; onChange: (d: DialState) => void; mode: HeimdallMode; onMode: (m: HeimdallMode) => void; qa?: boolean; onQa?: () => void; subagents?: boolean; onSubagents?: () => void; roles?: boolean; onRoles?: () => void;
  /** THE THREE DETERMINISTIC GATES (operator 2026-09-24): test · build · lint, run on the agent's claim */
  gates?: { test: boolean; build: boolean; lint: boolean; laws: boolean }; onGate?: (g: "test" | "build" | "lint" | "laws") => void; /** the line under the mode in the tooltip: what this pane saved, and whether that number is arithmetic or an estimate */ savedWhy?: string; /** the merge this pane runs as — "Claude × DeepSeek", or solo */ pairLabel?: string; font?: string; colors?: { accent: string; track: string; knob: string; /** the agent's own surface — the menu wears the pane's theme, not the app's (2026-09-23) */ panel?: string; border?: string; fg?: string; dim?: string } } | null; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const box = React.useRef<HTMLSpanElement | null>(null);
  const panelRef = React.useRef<HTMLSpanElement | null>(null);
  // THE MENU IS NOT CLIPPED BY ITS PANE (operator 2026-09-23: "the heimdall menu is cut for not having space on the
  // screen"). It used to be absolutely positioned inside the footer of a pane that can be narrow and clips its
  // overflow. It is a portal on the body now — fixed, measured from the chip, clamped to the viewport: it opens
  // upward where there is room, slides in from the right edge when the pane sits there, and scrolls inside itself
  // on a short window instead of being cut off.
  const [pos, setPos] = React.useState<{ left: number; bottom: number; maxH: number } | null>(null);
  React.useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const b = box.current; if (!b) return;
      const r = b.getBoundingClientRect();
      const w = panelRef.current?.offsetWidth || 268;
      const vw = window.innerWidth || 1024, vh = window.innerHeight || 768;
      setPos({ left: Math.max(8, Math.min(r.left, vw - w - 8)), bottom: Math.max(8, vh - r.top + 9), maxH: Math.max(160, r.top - 18) });
    };
    place();
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const inside = (t: Node) => !!(box.current?.contains(t) || panelRef.current?.contains(t));
    const away = (e: MouseEvent) => { if (!inside(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (!menu) return <>{children}</>;
  const c = menu.colors ?? { accent: C.brand, track: "rgba(255,255,255,.08)", knob: "#f3f3f3" };
  const font = menu.font ?? mono;
  const routing = menu.mode !== "off";
  const auto = menu.mode === "auto";
  // the agent's own surface, when its theme gave us one — else antiChat's chrome
  const surface = { panel: c.panel ?? C.panel, border: c.border ?? C.border, fg: c.fg ?? C.fg };
  const rule: React.CSSProperties = { height: 1, background: surface.border, opacity: .7, margin: "9px -11px" };
  return (
    <span ref={box} data-testid="heimdall-chip" style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      {/* A WRAPPER IS NOT A SECOND BUTTON (QA report A11Y-003): this span used to carry role="button" around the mode switch, which is itself a focusable switch - axe's nested-interactive. The switch inside is
          the control (it takes focus, and Enter/Space on it fire the same click that bubbles here), so the wrapper only listens. */}
      <span data-testid="heimdall-open" onClick={() => setOpen((o) => !o)}
        title={[HEIMDALL_WHY[menu.mode], menu.savedWhy].filter(Boolean).join("\n\n")} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
        {children}
      </span>
      {open && createPortal(
        <span ref={panelRef} data-testid="heimdall-menu" style={{ position: "fixed", left: pos?.left ?? -9999, bottom: pos?.bottom ?? 0, maxHeight: pos?.maxH, overflowY: "auto", zIndex: 400, color: surface.fg, background: surface.panel, border: `1px solid ${surface.border}`, borderRadius: 13, padding: "10px 11px 11px", boxShadow: "0 14px 34px rgba(0,0,0,.42)", backdropFilter: "blur(6px)", visibility: pos ? "visible" : "hidden", animation: "antilokiMenuIn .17s cubic-bezier(.2,.9,.25,1) both" }}>
          <style>{"@keyframes antilokiMenuIn{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}"}</style>
          {/* Heimdall itself: the switch. Turning it back on returns it to AUTO, which is what AUTO means — best. */}
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Switch testId="heimdall-switch" on={routing} accent={c.accent} font={font} label={menu.pairLabel && menu.pairLabel !== "solo" ? `heimdall · ${menu.pairLabel}` : "heimdall"}
              title={routing ? HEIMDALL_WHY[menu.mode] : HEIMDALL_WHY.off}
              onClick={() => menu.onMode(routing ? "off" : "auto")} />
            <span style={{ marginLeft: "auto" }}>
              <Pill testId="heimdall-mode-auto" on={auto} disabled={!routing} accent={c.accent} font={font} label="AUTO"
                title={!routing ? "Heimdall is off — nothing to decide" : auto ? HEIMDALL_WHY.auto : HEIMDALL_WHY.on}
                onClick={() => menu.onMode(auto ? "on" : "auto")} />
            </span>
          </div>
          {menu.onGate && <><i aria-hidden style={rule} />
            {/* THE PROOF ROW (operator 2026-09-24: "add another button to click test and build and lint gates.
                3 buttons. They turn on and off 3 more gates deterministically to run after the agent claim
                completition and force re-run in case of error with the error logs"). QA above is a judgement;
                these three are the project's own commands, and they do not have opinions. */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: font, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: c.dim ?? "#888", marginRight: 2 }}>on “done”</span>
              {GATE_PILLS.map((g) => <Pill key={g.key} testId={`heimdall-gate-${g.key}`} on={!!menu.gates?.[g.key]} accent={c.accent} font={font} label={g.key.toUpperCase()} onClick={() => menu.onGate?.(g.key)}
                title={menu.gates?.[g.key] ? `${g.on} A failure hands the agent the real log and it goes again — once.` : g.off} />)}
            </div></>}
          {(menu.onQa || menu.onSubagents || menu.onRoles) && <><i aria-hidden style={rule} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* THE BATON (operator 2026-09-26: "add a flag roles like qa on the heimdall menu"). ON is the
                  default, unlike QA: QA spends a judge's call on every run, while this only decides WHICH measured
                  winner a job was going to route to anyway. Off is for the operator who wants the role they picked
                  and nothing else. */}
              {menu.onRoles && <Pill testId="heimdall-roles" on={menu.roles !== false} accent={c.accent} font={font} label="ROLES" onClick={menu.onRoles}
                title={menu.roles !== false ? "ROLES is ON — the ask names the work, Heimdall picks the role that does it and that role's measured winner; the speed dial decides cheaper, balanced or faster" : "ROLES is OFF — no role is chosen for you; this agent keeps the binding it was given"} />}
              {menu.onSubagents && <Pill testId="heimdall-subagents" on={!!menu.subagents} accent={c.accent} font={font} label="SUB-AGENTS" onClick={menu.onSubagents}
                title={menu.subagents ? "sub-agents may be dispatched — and with Heimdall on they are, only when the ask projects over 15 minutes of one worker's time" : "sub-agents OFF — the tool refuses; whatever is asked, one agent does it"} />}
              {/* QA IS OPTIONAL (operator 2026-10-10: "make it a normal single QA button and now QA is optional not obligatory; confidence is displayed after the results and a suggestion to run independent QA can be
                  shown like a button"). This replaces the obligatory QA and its double pass: ON = one isolated judge reviews the run after it ends; OFF (the default) = no QA pass, the result shows its confidence
                  and offers to run QA from there. */}
              {menu.onQa && <Pill testId="heimdall-qa" on={!!menu.qa} accent={c.accent} font={font} label="QA" onClick={menu.onQa}
                title={menu.qa
                  ? "QA is ON — after the run ends one isolated judge reviews the whole result (the claims, the browser evidence, the design). Click to turn it off."
                  : "QA is OFF — runs end with a confidence reading, and you can run an independent QA from the result. Click to have every run judged automatically."} />}
              </div></>}
          <i aria-hidden style={rule} />
          {/* ON AUTO THE MODELS BAR IS NOT INERT (operator 2026-09-22: "on auto i can't change the bars value"):
              moving it IS the operator taking the models back, so it moves Heimdall to ON in the same gesture.
              The context bar is always theirs — AUTO decides models and delegation, never what may be read. */}
          <HeimdallBars dial={menu.dial} font={font} colors={c} onClose={() => setOpen(false)} dimmed={auto}
            onChange={(d) => { if (auto && d.cost !== menu.dial.cost) menu.onMode("on"); menu.onChange(d); }} />
        </span>, document.body)}
    </span>
  );
}

/** The three bars, in the popover the heimdall chip opens (operator 2026-09-22: "they just suppose to appear on
 *  clicking heimdall at the bottom"). The super-bar is always there; `Advanced ›` unfolds the two axes. */
export function HeimdallBars({ dial, onChange, font = mono, colors, onClose, dimmed = false }: { dial: DialState; onChange?: (d: DialState) => void; font?: string; colors?: { accent: string; track: string; knob: string; /** the agent's own surface — the menu wears the pane's theme, not the app's (2026-09-23) */ panel?: string; border?: string; fg?: string; dim?: string }; onClose?: () => void; dimmed?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const c = colors ?? { accent: C.brand, track: "rgba(255,255,255,.08)", knob: "#f3f3f3" };
  const sup = dial.position === null ? null : SUPER_STOPS[dial.position];
  const setSuper = (v: Stop) => onChange?.({ position: v, context: SUPER_STOPS[v].context, cost: SUPER_STOPS[v].cost });
  const setAxis = (k: "context" | "cost") => (v: Stop) => {
    const next = { ...dial, [k]: v } as DialState;
    const match = SUPER_STOPS.findIndex((s) => s.context === next.context && s.cost === next.cost);
    onChange?.({ ...next, position: match >= 0 ? (match as Stop) : null });
  };
  return (
    <div data-testid="heimdall-bars" onKeyDown={(e) => { if (e.key === "Escape") onClose?.(); }}
      style={{ display: "flex", flexDirection: "column", gap: 7, width: 244, fontFamily: font, animation: "antilokiBarsIn .18s cubic-bezier(.2,.9,.25,1) both" }}>
      <style>{"@keyframes antilokiBarsIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}@keyframes antilokiBarsFold{from{opacity:0;max-height:0;transform:translateY(-3px)}to{opacity:1;max-height:110px;transform:none}}@keyframes antilokiStopIn{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}"}</style>
      <Bar value={dial.position ?? Math.round((dial.context + dial.cost) / 2)} onChange={setSuper} accent={c.accent} track={c.track} knob={c.knob} font={font}
        label="heimdall" right={sup ? sup.label : "CUSTOM"} title={sup ? sup.why : TITLES.sup} />
      <button data-testid="heimdall-advanced" onClick={() => setOpen((o) => !o)}
        style={{ alignSelf: "flex-start", background: "transparent", border: "none", padding: 0, color: open ? c.accent : C.dim, fontFamily: font, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", transition: "color .18s ease" }}>
        <span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform .2s cubic-bezier(.2,.9,.25,1)", marginRight: 4 }}>›</span>advanced
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, overflow: "hidden", animation: "antilokiBarsFold .2s cubic-bezier(.2,.9,.25,1) both" }}>
          <Bar value={dial.context} onChange={setAxis("context")} accent={c.accent} track={c.track} knob={c.knob} font={font} label="context" right={LABELS.context[dial.context]} title={TITLES.context} />
          <div style={{ opacity: dimmed ? 0.45 : 1, transition: "opacity .2s ease" }} title={dimmed ? "AUTO is picking the effort right now — move this bar and you take it back (Heimdall goes to ON)" : TITLES.cost}>
            <Bar value={dial.cost} onChange={setAxis("cost")} accent={c.accent} track={c.track} knob={c.knob} font={font} label="effort" right={LABELS.cost[dial.cost]} title={dimmed ? "AUTO is picking the effort right now — move this bar and you take it back (Heimdall goes to ON)" : TITLES.cost} />
          </div>
        </div>
      )}
    </div>
  );
}

/** THE SPEED DIAL (operator 2026-09-22: "like MIN·SCOPE·MAX — cheaper · balanced · faster"): what the run optimises for.
 *  Stored on the pane as `settings.speed`; the serve records it on every run. WIRED 2026-09-26: it is the objective
 *  Heimdall routes a ROLE by (`Delegation::role_objective` → `roles::route_role`) — cheaper and faster pick that
 *  role's cheapest or fastest measured merge, balanced picks the table's own weight. It sat here doing nothing for
 *  three days; a second setting was nearly added beside it before anyone noticed. The bench of
 *  2026-09-22 decides what "cheaper" and "faster" mean (blueprint mode, worker engine, judge); until then it is a preference. */
export type Speed = "cheaper" | "balanced" | "faster";
function SpeedDial({ value, onChange, font = mono, colors, off }: { value: Speed; onChange?: (s: Speed) => void; font?: string; colors: { cheaper: string; balanced: string; faster: string }; off: string }) {
  const items: Speed[] = ["cheaper", "balanced", "faster"];
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const [bar, setBar] = React.useState<{ left: number; width: number } | null>(null);
  React.useLayoutEffect(() => { const el = refs.current[value]; if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth }); }, [value]);
  const titles: Record<Speed, string> = { cheaper: "CHEAPER: the cheapest model and provider that passes — measured, not guessed (not wired yet)", balanced: "BALANCED: the router's own choice", faster: "FASTER: the fastest configuration measured for this size of work (not wired yet)" };
  return (
    <span data-testid="agent-speed" data-value={value} title="CHEAPER · BALANCED · FASTER — what the run optimises for" style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 2, whiteSpace: "nowrap" }}>
      {items.map((m) => { const on = value === m; return (
        <button key={m} ref={(el) => { refs.current[m] = el; }} data-testid={`agent-speed-${m}`} data-on={on ? "1" : "0"} onClick={() => onChange?.(m)} title={titles[m]}
          style={{ fontFamily: font, fontSize: 9, fontWeight: 700, letterSpacing: 1, color: on ? colors[m] : off, opacity: on ? 1 : 0.6, background: "transparent", border: "none", padding: "2px 5px", cursor: "pointer", transition: "color .25s ease, opacity .25s ease" }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = on ? "1" : "0.6"; }}>{m.toUpperCase()}</button>); })}
      {bar && <i aria-hidden style={{ position: "absolute", bottom: -1, height: 1.5, borderRadius: 1, background: colors[value], left: bar.left, width: bar.width, transition: "left .3s cubic-bezier(.2,.8,.2,1), width .3s ease, background .25s ease" }} />}
    </span>
  );
}
function Dial({ value, onChange, minLabel, font = mono, colors, off }: { value: "min" | "scope" | "max"; onChange?: (m: "min" | "scope" | "max") => void; minLabel: string; font?: string; colors: { min: string; scope: string; max: string }; off: string }) {
  const items: ("min" | "scope" | "max")[] = ["min", "scope", "max"];
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const [bar, setBar] = React.useState<{ left: number; width: number } | null>(null);
  React.useLayoutEffect(() => { const el = refs.current[value]; if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth }); }, [value, minLabel]);
  const titles = { min: "MIN: exploration off — the agent reads antiloki's intel (reviews, graph, docs, ASTs) instead of the files; it touches the disk only to edit, inside its scope. Fewer tokens, less cognition.", scope: "SCOPE: the normal mode — the pane's scope is the boundary, the pack and the files are both in reach", max: "MAX: this agent may do anything to any file — everything in scope, antiloki's intel and the raw files, all permissions, all specialists, the most sub-agents" };
  return (
    <span data-testid="agent-dial" data-value={value} title="MIN · SCOPE · MAX — one dial" style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 2, whiteSpace: "nowrap" }}>
      <style>{MODE_KEYFRAMES}</style>
      {items.map((m) => { const on = value === m; return (
        <button key={m} ref={(el) => { refs.current[m] = el; }} data-testid={`agent-${m}`} data-on={on ? "1" : "0"} onClick={() => onChange?.(m)} title={titles[m]}
          style={{ fontFamily: font, fontSize: 9, fontWeight: 700, letterSpacing: 1, color: on ? colors[m] : off, opacity: on ? 1 : 0.6, background: "transparent", border: "none", padding: "2px 5px", cursor: "pointer", transition: "color .25s ease, opacity .25s ease", animation: on ? "antilokiModeOn .5s ease" : "none" }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = on ? "1" : "0.6"; }}>{m === "min" ? minLabel : m.toUpperCase()}</button>); })}
      {bar && <i aria-hidden style={{ position: "absolute", bottom: -1, height: 1.5, borderRadius: 1, background: colors[value], left: bar.left, width: bar.width, transition: "left .3s cubic-bezier(.2,.8,.2,1), width .3s ease, background .25s ease" }} />}
    </span>
  );
}
// the markdown component paints code in antiloki's dark palette — inside a light theme it follows the theme
if (typeof document !== "undefined" && !document.getElementById("antiloki-agent-themes")) {
  const st = document.createElement("style"); st.id = "antiloki-agent-themes";
  st.textContent = ["windows", "linux", "mac", "xp"].map((k) => `[data-theme="${k}"] code{background:rgba(0,0,0,.07)!important;color:inherit!important;border-color:rgba(0,0,0,.12)!important}[data-theme="${k}"] pre{background:rgba(0,0,0,.05)!important;color:inherit!important;border-color:rgba(0,0,0,.12)!important}[data-theme="${k}"] a{color:inherit;text-decoration:underline}[data-theme="${k}"] [contenteditable]{color:inherit}`).join("") +
    `[data-theme="xp"] button:active{box-shadow:inset 1px 1px #7f9db9!important}`;
  document.head.appendChild(st);
}

// ── the conversation model, pure ────────────────────────────────────────────────────────────────
export type Turn =
  /** `pending` = shown the moment you pressed enter, before the serve has echoed it back (2026-09-25).
   *  `from: "heimdall"` = NOT the human's words: the organised prompt Heimdall wrote from them (the serve marks that echo with
   *  `source: "heimdall"`, 2026-10-08) — drawn as a task card, never as a second human bubble. */
  | { kind: "user"; seq: number; t: number; text: string; pending?: boolean; from?: "heimdall" }
  | { kind: "assistant"; seq: number; t: number; text: string; model?: string; streaming?: boolean }
  | { kind: "tool"; seq: number; t: number; id: string; name: string; input: any; result?: string; error?: boolean }
  | { kind: "result"; seq: number; t: number; cost: number; ms: number; turns: number; error?: string }
  // WHICH CHANNEL A NOTE BELONGS TO (operator 2026-09-28: "the stack trace should be collapsed on the agent chat,
  // but appears a lot of telemetry and info that the user doesnt need to see").
  //
  // `talk` is the conversation — something the operator would want said out loud. `wire` is telemetry: the audit
  // line, gate transitions, retriever picks, session bookkeeping, and above all RAW STDERR, which the serve emits
  // one event PER LINE, so a thirty-line backtrace became thirty red lines in the middle of the chat. Every one of
  // these is already inside the collapsed `TurnTrace`; they were simply printed a second time, expanded.
  //
  // Absent means `talk`, so anything added later is visible until someone decides it is noise.
  | { kind: "note"; seq: number; t: number; text: string; tone?: "ok" | "warn" | "bad" | "dim"; chan?: "talk" | "wire" | "saving"; /** the event's unique id (warnings start with "W") — absent on older events */ id?: string;
      /** the numbers behind an `audit` line (the serve's own arithmetic) and a `saving` line — read by the reply's one-line meta (cockpit/chat-flow.tsx) */ audit?: { cost: number; ms: number; tokens: number }; saving?: { cost: number; baseline: number } }
  // OPENCODE (2026-09-20): a permission the engine asks before a tool runs — answered from the pane
  | { kind: "permission"; seq: number; t: number; id: string; permission: string; patterns: string[]; answered?: string }
  // THE STORY OF A RUN (2026-09-24): the turn went through the pipeline, and run #N holds its ledger
  | { kind: "story"; seq: number; t: number; run: number };

const short = (v: any, n = 160) => { const s = typeof v === "string" ? v : JSON.stringify(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
/** The one-line summary of a tool call's input — the file for Read/Edit/Write, the command for Bash, the pattern for Grep. Pure. */
export function toolSummary(name: string, input: any): string {
  if (!input || typeof input !== "object") return short(input);
  const i = input as Record<string, any>;
  if (typeof i.raw === "string") { try { return toolSummary(name, JSON.parse(i.raw)); } catch { return short(i.raw); } }
  if (i.file_path) return String(i.file_path);
  if (i.command) return short(i.command, 200);
  if (i.pattern) return `${i.pattern}${i.path ? ` in ${i.path}` : ""}`;
  if (i.query) return short(i.query);
  if (i.prompt) return short(i.prompt);
  if (i.goal) return short(i.goal);
  return short(input);
}
/** Fold one persisted/live event into the turns. Pure — tested. */
/** THE LINK TO SERVE, AS ONE WORD (operator 2026-09-27: "if the server is down, the agent should restart itself and
 *  a loading appear on the screen; not be able to send a message while the connection is restored"). The 3 s status
 *  poll is the probe: a failed poll is `down`; the first poll that answers after that finds the engine gone (serve
 *  restarts drop every session) and the pane asks for it back — `restarting` until status says running. A chat pane
 *  (main, a fork) is always on, so it asks for its engine back whenever status says it is not running. Pure — tested. */
export type Link = "up" | "down" | "restarting";
export function nextLink(prev: Link, probe: { ok: false } | { ok: true; running: boolean }, alwaysOn: boolean): { link: Link; start: boolean } {
  if (!probe.ok) return { link: "down", start: false };
  if (probe.running) return { link: "up", start: false };
  // serve answers but the engine is not there: after an outage, or on a chat pane that must never be off
  if (prev !== "up" || alwaysOn) return { link: "restarting", start: prev !== "restarting" };
  return { link: "up", start: false };
}
/** What the composer says while the link is not up; the caller's own hint otherwise. */
export function linkHint(link: Link, hint: string | null | undefined): string | null | undefined {
  return link === "down" ? "reconnecting to antiloki…" : link === "restarting" ? "the agent is starting again…" : hint;
}
export function LinkBanner({ link, error }: { link: Link; /** why the serve could not start the agent, when it said (Grokbot QA 2026-10-12, item 5: the banner spun for ever with no reason) */ error?: string }) {
  const [dots, setDots] = React.useState(1);
  React.useEffect(() => { if (link === "up") return; const h = setInterval(() => setDots((n) => (n % 3) + 1), 450); return () => clearInterval(h); }, [link]);
  if (link === "up") return null;
  if (link === "restarting" && error) return (
    <div data-testid="agent-link" data-link="failed" role="alert"
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", fontFamily: mono, fontSize: 10.5, color: C.bad, background: `color-mix(in oklab, ${C.bad} 10%, transparent)`, borderBottom: `1px solid ${C.border}` }}>
      <span>✕</span><span data-testid="agent-link-error">the agent could not start: {error}</span>
    </div>
  );
  return (
    <div data-testid="agent-link" data-link={link} role="status"
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", fontFamily: mono, fontSize: 10.5, color: C.warn, background: `color-mix(in oklab, ${C.warn} 10%, transparent)`, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
      <span style={{ display: "inline-block", animation: "antiloki-spin 1s linear infinite" }}>◌</span>
      <span>{link === "down" ? "antiloki is not answering — reconnecting · your work is still on this machine" : "connection is back — the agent is starting again"}{".".repeat(dots)}</span>
      <style>{`@keyframes antiloki-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
/** The event's unique id (2026-09-29) rides on the wrapper `{seq,t,id,ev}`; every note it produces carries it, so a warning can be quoted by id. */
export function applyEvent(turns: Turn[], seq: number, wrapped: any): Turn[] {
  const out = applyEventInner(turns, seq, wrapped);
  const id = typeof wrapped?.id === "string" && wrapped.id ? wrapped.id : "";
  if (id && out !== turns) for (let i = turns.length; i < out.length; i += 1) { const x = out[i]; if (x.kind === "note" && !x.id) out[i] = { ...x, id }; }
  return out;
}
function applyEventInner(turns: Turn[], seq: number, wrapped: any): Turn[] {
  const ev = wrapped?.ev ?? wrapped; const t = Number(wrapped?.t) || Date.now();
  if (!ev || typeof ev !== "object") return turns;
  const out = turns.slice();
  const type = String(ev.type ?? "");
  if (type === "antiloki") {
    const sub = String(ev.subtype ?? "");
    if (sub === "user") {
      // THE ECHO ADOPTS THE OPTIMISTIC TURN (2026-09-25). `send` shows the ask the instant it is submitted, so
      // the transcript is never blank while Heimdall thinks; when the serve echoes the same ask back this
      // replaces that placeholder rather than printing the operator's words twice.
      const text = String(ev.text ?? "");
      // …but only the HUMAN's words are adopted that way: the prompt Heimdall wrote (source "heimdall") is a turn of its own
      const from = ev.source === "heimdall" ? "heimdall" as const : undefined;
      const i = from ? -1 : out.findIndex((x) => x.kind === "user" && x.pending && x.text === text);
      if (i >= 0) { out[i] = { kind: "user", seq, t, text }; return out; }
      out.push({ kind: "user", seq, t, text, ...(from ? { from } : {}) });
      return out;
    }
    // DID THE LAST ANSWER HOLD? (operator 2026-09-25). The serve notices when an ask repeats a recent one and
    // says so — the one correctness signal a repo with no tests can still give. A note, in the warn tone,
    // because it is a suggestion the operator can read and dismiss, not a verdict on their work.
    if (sub === "reask") { out.push({ kind: "note", seq, t, text: String(ev.text ?? "asked again"), tone: "warn" }); return out; }
    // A NOTE THE FRONT DOOR LEFT (2026-09-27): what happened to a message on its way in — Heimdall refused, so it went to the agent as is
    if (sub === "note") { const tone = String(ev.tone ?? "dim"); out.push({ kind: "note", seq, t, text: String(ev.text ?? ""), tone: tone === "ok" || tone === "warn" || tone === "bad" ? tone : "dim" }); return out; }
    if (sub === "imported") { out.push({ kind: "note", seq, t, text: `${ev.turns} turns brought over from the terminal session`, tone: "dim" }); return out; }
    if (sub === "started") { out.push({ kind: "note", seq, t, text: `session started${ev.model ? ` · ${ev.model}` : ""}`, tone: "dim", chan: "wire" }); return out; }
    if (sub === "resumed") { out.push({ kind: "note", seq, t, text: "session resumed — the conversation continues", tone: "dim", chan: "wire" }); return out; }
    if (sub === "model") { out.push({ kind: "note", seq, t, text: `model → ${ev.model}`, tone: "ok", chan: "wire" }); return out; }
    if (sub === "exited") { out.push({ kind: "note", seq, t, text: `the agent's process exited${ev.code != null ? ` (${ev.code})` : ""}`, tone: "warn" }); return out; }
    if (sub === "stopped") { out.push({ kind: "note", seq, t, text: "stopped by the operator", tone: "dim" }); return out; }
    if (sub === "stderr") { out.push({ kind: "note", seq, t, text: String(ev.text ?? ""), tone: "bad", chan: "wire" }); return out; }
    if (sub === "permission") { out.push({ kind: "permission", seq, t, id: String(ev.id ?? ""), permission: String(ev.permission ?? "tool"), patterns: Array.isArray(ev.patterns) ? ev.patterns.map(String) : [] }); return out; }
    if (sub === "permission_reply") { const i = out.findIndex((x) => x.kind === "permission" && x.id === String(ev.id ?? "")); if (i >= 0) out[i] = { ...(out[i] as any), answered: String(ev.reply ?? "once") }; return out; }
    // THE RUN BEHIND THE TURN (operator 2026-09-24: "at the chat must be very clear who is working … like stages").
    // This event was thrown away, and with it the only pointer the transcript had to the ledger that knows who
    // worked, which gates ran and what it cost. It names the run; WorkStory reads the rest from the run itself.
    // A RUN THAT STARTED HERE GETS ITS BOX AT ONCE (operator 2026-09-28: "the stats detail box didnt show after
    // completion of my prompt"). `savings` only ever arrives for a turn the PANE's own session answered; a
    // delegated run is done by sub-agents in the box, so nothing about it ever reached this reducer and the chat
    // stayed blank while the work happened. `run` is the marker the serve sends when it starts one — same story
    // turn, same polling, just told at the beginning instead of never.
    if (sub === "savings" || sub === "run") {
      const run = Number(ev.run);
      if (Number.isFinite(run) && run > 0 && !out.some((x) => x.kind === "story" && x.run === run)) out.push({ kind: "story", seq, t, run });
      return out;
    }
    // THE AUDIT LINE (2026-09-23): under every answer — the model, the serve's timer, the token count, the deterministic price
    if (sub === "audit") {
      const ms = Number(ev.ms ?? 0), tok = Number(ev.tokens ?? 0), cost = Number(ev.cost ?? 0);
      out.push({ kind: "note", seq, t, text: `✦ ${String(ev.model || ev.engine || "")} · ${ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`} · ${tok >= 1000 ? `${(tok / 1000).toFixed(1)}k` : tok} tokens · $${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(3)}`, tone: "dim", chan: "wire", audit: { cost, ms, tokens: tok } });
      // THE SAVING UNDER THE ANSWER (operator 2026-09-28: "in the open" · 2026-10-08: "a little repetitive") — its own channel,
      // `saving`: not the telemetry fold, and no longer a line of its own under every answer; the reply's one-line meta
      // pulls it out of the notes and shows it in full on hover. The same tokens at the frontier model's list price,
      // beside what this turn cost. The serve does the arithmetic (cli::frontier_price).
      const base = Number(ev.baseline_usd ?? 0);
      if (base > 0) out.push({ kind: "note", seq, t, text: savedLine(cost, base, String(ev.baseline ?? "the frontier model")), tone: "ok", chan: "saving", saving: { cost, baseline: base } });
      return out;
    }
    // QA v2: the inline route's turn is being judged (agent.rs on_turn_result → goals.judge_inline_later)
    if (sub === "qa") { out.push({ kind: "note", seq, t, text: `⚖ ${String(ev.text ?? "QA judges this turn")}`, tone: "dim", chan: "wire" }); return out; }
    // CHATS (chat_pane.rs, 2026-09-21): an episode boundary — the next message carries the snapshot; the retriever's
    // picks under the ask they served
    if (sub === "episode") { const from = String(ev.from_engine ?? ""), to = String(ev.engine ?? ""); out.push({ kind: "note", seq, t, text: from && to && from !== to ? `↻ episode ${ev.n ?? ""} — continued on ${to} (it gets the conversation so far with your next message)` : `↻ episode ${ev.n ?? ""} — ${String(ev.reason ?? "new topic")} · the previous one is consolidated in the timeline; the conversation goes on (! adds it back)`, tone: "ok" }); return out; }
    // THE DETERMINISTIC GATES (2026-09-24). The agent claimed the work was done and the project's own commands
    // were asked whether that is true. Each state gets a note the operator can read at a glance; the full logs
    // stay in the event, one click away in the rail, rather than dumped into the conversation.
    if (sub === "gates") {
      const state = String(ev.state ?? "");
      const text = String(ev.text ?? "");
      if (!text) return out;
      const tone: Turn extends never ? never : "ok" | "warn" | "bad" | "dim" =
        state === "running" ? "warn" : state === "rerun" ? "warn" : state === "stop" ? "bad"
        : state === "done" ? (ev.ok === false ? "bad" : "ok") : "dim";
      const glyph = state === "running" ? "◌" : state === "rerun" ? "↻" : state === "stop" ? "✗" : ev.ok === false ? "✗" : "✓";
      out.push({ kind: "note", seq, t, text: `${glyph} ${text}`, tone, chan: "wire" });
      return out;
    }
    if (sub === "context") { const used: any[] = Array.isArray(ev.used) ? ev.used : []; if (used.length) out.push({ kind: "note", seq, t, text: `⌕ looked up: ${used.map((u) => String(u.label ?? u.ref ?? "")).join(" · ")}`, tone: "dim", chan: "wire" }); return out; }
    // NOTHING THE SERVE SAYS IS THROWN AWAY (operator 2026-09-28: "Dont hide the model response, show real logs
    // from the agent"). Everything that reached here and matched nothing above fell off the end of this reducer in
    // silence — `role` (the chameleon changing form), `handoff` (what a provider switch cost), `min`, `survival`,
    // `episode_named`, `paused`. The serve was emitting them, writing them to the log, and the chat discarded
    // them, so the only way to know what the agent had done was to read the .jsonl by hand.
    //
    // They go on the WIRE, not into the conversation: still one click away, never nothing. A subtype nobody has
    // written a line for yet prints as itself rather than vanishing, which is how the next one gets noticed.
    if (sub) {
      const said = String(ev.text ?? ev.note ?? "").trim();
      out.push({ kind: "note", seq, t, text: said ? `${sub} · ${said}` : sub, tone: "dim", chan: "wire" });
      return out;
    }
    return out;
  }
  if (type === "stream_event") {
    const e = ev.event ?? {};
    if (e.type === "content_block_delta" && e.delta?.type === "text_delta") {
      const last = out[out.length - 1];
      if (last && last.kind === "assistant" && last.streaming) out[out.length - 1] = { ...last, text: last.text + String(e.delta.text ?? "") };
      else out.push({ kind: "assistant", seq: 0, t, text: String(e.delta.text ?? ""), streaming: true });
    }
    return out;
  }
  if (type === "assistant") {
    const blocks: any[] = Array.isArray(ev.message?.content) ? ev.message.content : [];
    const model = ev.message?.model;
    // the streamed draft is replaced by the message it became
    const last = out[out.length - 1]; if (last && last.kind === "assistant" && last.streaming) out.pop();
    for (const b of blocks) {
      if (b.type === "text" && String(b.text ?? "").trim()) out.push({ kind: "assistant", seq, t, text: String(b.text), model });
      else if (b.type === "tool_use") out.push({ kind: "tool", seq, t, id: String(b.id ?? ""), name: String(b.name ?? "tool"), input: b.input, ...(b.input?.imported ? { result: "" } : {}) }); // an imported call has no result to wait for
    }
    return out;
  }
  if (type === "user") {
    const blocks: any[] = Array.isArray(ev.message?.content) ? ev.message.content : [];
    for (const b of blocks) {
      if (b.type !== "tool_result") continue;
      const text = Array.isArray(b.content) ? b.content.map((c: any) => (c?.type === "text" ? c.text : "")).join("\n") : String(b.content ?? "");
      const i = out.findIndex((x) => x.kind === "tool" && x.id === b.tool_use_id);
      if (i >= 0) out[i] = { ...(out[i] as any), result: text, error: !!b.is_error };
    }
    return out;
  }
  if (type === "result") {
    out.push({ kind: "result", seq, t, cost: Number(ev.total_cost_usd) || 0, ms: Number(ev.duration_ms) || 0, turns: Number(ev.num_turns) || 0, error: ev.is_error ? String(ev.result ?? ev.subtype ?? "error") : undefined });
    return out;
  }
  if (type === "rate_limit_event") {
    const r = ev.rate_limit_info ?? {}; const pct = Math.round((Number(r.utilization) || 0) * 100);
    if (pct >= 80) out.push({ kind: "note", seq, t, text: `usage: ${pct}% of the ${String(r.rateLimitType ?? "").replace("_", " ")} window`, tone: pct >= 95 ? "bad" : "warn" });
    return out;
  }
  return out;
}

// ── the pane ────────────────────────────────────────────────────────────────────────────────────
const TOOL_GLYPH: Record<string, string> = { Read: "📄", Edit: "✎", Write: "✎", MultiEdit: "✎", Bash: "$", Grep: "⌕", Glob: "⌕", WebFetch: "⇣", WebSearch: "⌕", Task: "⋔", TodoWrite: "☑" };
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
function ToolRow({ t }: { t: Extract<Turn, { kind: "tool" }> }) {
  const [open, setOpen] = React.useState(false);
  const name = t.name.replace(/^mcp__antiloki__/, "antiloki · ");
  return (
    <div data-testid="chat-tool" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", gap: 8, alignItems: "baseline", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>
        <span style={{ color: C.dim, width: 14 }}>{TOOL_GLYPH[t.name] ?? "⚙"}</span>
        <span style={{ color: C.muted, fontWeight: 700 }}>{name}</span>
        <span style={{ color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{toolSummary(t.name, t.input)}</span>
        <span style={{ color: t.result == null ? C.warn : t.error ? C.bad : C.ok }}>{t.result == null ? "…" : t.error ? "✗" : "✓"}</span>
      </div>
      {open && <pre style={{ margin: 0, fontFamily: mono, fontSize: 9.5, color: C.dim, whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto", lineHeight: 1.45 }}>{JSON.stringify(t.input, null, 1).slice(0, 2000)}{t.result != null ? `\n\n→ ${t.result.slice(0, 3000)}` : ""}</pre>}
    </div>
  );
}
/** The tool calls of one reply, folded like antiChat's "reasoning · audit" trail. */
function ToolTrail({ tools }: { tools: Extract<Turn, { kind: "tool" }>[] }) {
  const [open, setOpen] = React.useState(false);
  if (!tools.length) return null;
  const done = tools.filter((t) => t.result != null).length; const failed = tools.filter((t) => t.error).length;
  return (
    <div style={{ marginBottom: 4 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: 0 }}>
        {open ? "▾" : "▸"} tools · {tools.length} call{tools.length === 1 ? "" : "s"}{done < tools.length ? ` · ${tools.length - done} running` : ""}{failed ? ` · ${failed} failed` : ""}
      </button>
      {open && <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "4px 0 2px 12px", borderLeft: `2px solid ${C.border}`, marginTop: 2 }}>{tools.map((t, i) => <ToolRow key={i} t={t} />)}</div>}
    </div>
  );
}
/** THE STORY OF A RUN, fetched once the transcript names it. A run that is still moving is re-read every few
 *  seconds so the stages fill in as they happen; a settled one is read once and left alone. */
/** THE MESSAGES WAITING TO BE SENT (the outbox): one dim block each, numbered, in the order they will go, each with cancel and move up / down (operator 2026-10-09: "build it" - a queued
 *  message can be taken back or put ahead of another before it goes). Nothing drawn when it is empty. Pure over its props - tested. */
export function OutboxList({ items, onCancel, onMove }: { items: string[]; onCancel?: (i: number) => void; onMove?: (i: number, dir: -1 | 1) => void }) {
  if (!items.length) return null;
  const btn = (enabled: boolean): React.CSSProperties => ({ background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: enabled ? C.dim : C.border, cursor: enabled ? "pointer" : "default", fontFamily: mono, fontSize: 10, lineHeight: 1, padding: "2px 5px" });
  return (
    <div data-testid="outbox">
      {items.map((t, i) => (
        <FlowBlock key={`${i}-${t.slice(0, 24)}`} kind="note" label={`queued ${i + 1} of ${items.length}`} testId={`outbox-${i}`}>
          <span style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ flex: 1, minWidth: 0, fontFamily: mono, fontSize: 12, color: C.dim, whiteSpace: "pre-wrap" }}>{t.length > 400 ? t.slice(0, 400) + "…" : t}</span>
            <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button data-testid={`outbox-up-${i}`} disabled={i === 0} onClick={() => onMove?.(i, -1)} title="send this one earlier" style={btn(i > 0)}>▲</button>
              <button data-testid={`outbox-down-${i}`} disabled={i === items.length - 1} onClick={() => onMove?.(i, 1)} title="send this one later" style={btn(i < items.length - 1)}>▼</button>
              <button data-testid={`outbox-cancel-${i}`} onClick={() => onCancel?.(i)} title="take this message back - it is not sent" style={btn(true)}>✕</button>
            </span>
          </span>
        </FlowBlock>
      ))}
    </div>
  );
}
/** the two edits the outbox's buttons make, pure so they are tested without a pane */
export function outboxWithout(o: string[], i: number): string[] { return o.filter((_, k) => k !== i); }
export function outboxMoved(o: string[], i: number, dir: -1 | 1): string[] { const j = i + dir; if (i < 0 || i >= o.length || j < 0 || j >= o.length) return o; const c = [...o]; [c[i], c[j]] = [c[j], c[i]]; return c; }
/** WHICH RUNS' STORIES HAVE LOADED (module-level, read through useSyncExternalStore): the task card is dropped for an exchange only once the story - where the plan now lives - is really on screen. A story that
 *  fails to load must never take Heimdall's rewrite with it. */
const storyLoaded = new Set<number>(); const storyListeners = new Set<() => void>();
export const markStoryLoaded = (run: number) => { if (!storyLoaded.has(run)) { storyLoaded.add(run); storyListeners.forEach((f) => f()); } };
export function useStoryLoaded(runs: number[]): boolean {
  return React.useSyncExternalStore((cb) => { storyListeners.add(cb); return () => { storyListeners.delete(cb); }; }, () => runs.some((r) => storyLoaded.has(r)), () => false);
}
/** the task card, unless the run's story (with its Plan section) is already drawn below it */
function TaskGate({ stories, children }: { stories: number[]; children: React.ReactNode }) { return useStoryLoaded(stories) ? null : <>{children}</>; }
/** KEEP POLLING A STORY WHILE QA IS STILL JUDGING (operator 2026-10-09, live test: the card said "QA judging... - stop the QA" for minutes after QA had settled): the run's status is "done" when the work
 *  is, but QA judges AFTER that, so stopping at "done" froze the card on its last reading. A story is finished only when the run is over AND QA is not pending. Pure - tested. */
export function storyIsMoving(s: { status: string; qa?: { pending?: boolean } | null } | null): boolean {
  return !s || !["done", "failed", "cancelled", "inline"].includes(s.status) || !!s.qa?.pending;
}
function StoryOfRun({ run, plan }: { run: number; plan?: PlanInfo | null }) {
  const [story, setStory] = React.useState<Story | null>(null);
  React.useEffect(() => {
    let stop = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const s = await fetchStory(run);
      if (stop) return;
      if (s) { setStory(s); markStoryLoaded(run); }
      const moving = storyIsMoving(s);
      if (moving) timer = setTimeout(() => void tick(), 4000);
    };
    void tick();
    return () => { stop = true; if (timer) clearTimeout(timer); };
  }, [run]);
  if (!story) return null;
  return <FlowBlock kind="story" label={`run #${run}`} testId={`story-of-run-${run}`}><WorkStory story={story} plan={plan} /></FlowBlock>;
}

/** "saved $0.031 (86%) vs claude · opus — $0.005 instead of $0.036". Deterministic: both prices are the serve's arithmetic on
 *  the turn's own tokens. Says "same price as" rather than "saved $0" when the model IS the yardstick. Pure — tested. */
export function savedLine(cost: number, baseline: number, against: string): string {
  const fmt = (n: number) => `$${n < 0.01 ? n.toFixed(4) : n.toFixed(3)}`;
  const saved = Math.max(0, baseline - cost);
  if (saved < 0.00005) return `≈ this turn cost ${fmt(cost)} — the same as ${against}, so nothing saved`;
  return `≈ saved ${fmt(saved)} (${Math.round((saved / baseline) * 100)}%) vs ${against} — ${fmt(cost)} instead of ${fmt(baseline)} for the same tokens`;
}
/** The conversation as antiChat shows it: a human bubble, the tools it took (folded), the reply bubble
 *  with its meta line — grouped per exchange. Pure — tested. */
export type Exchange = { user?: Extract<Turn, { kind: "user" }>;
  /** the prompt Heimdall organised from the human's ask, when it landed right after it (2026-10-08) — folded into the human's exchange so the two read as one; a task that has no human ask before it is the exchange's `user` with `from: "heimdall"` */
  task?: Extract<Turn, { kind: "user" }>;
  tools: Extract<Turn, { kind: "tool" }>[]; replies: Extract<Turn, { kind: "assistant" }>[]; result?: Extract<Turn, { kind: "result" }>; notes: Extract<Turn, { kind: "note" }>[]; permissions: Extract<Turn, { kind: "permission" }>[]; stories: number[] };
/** `isTask` is the fallback for a serve that does not mark Heimdall's prompt: the pane says "this user turn is a run's goal and the turn before it was a user turn too". */
export function groupExchanges(turns: Turn[], isTask?: (t: Extract<Turn, { kind: "user" }>, prev: Turn | undefined) => boolean): Exchange[] {
  const out: Exchange[] = []; let cur: Exchange | null = null;
  const fresh = (): Exchange => ({ tools: [], replies: [], notes: [], permissions: [], stories: [] });
  for (let i = 0; i < turns.length; i += 1) {
    const t = turns[i];
    if (t.kind === "user") {
      const task = t.from === "heimdall" || !!isTask?.(t, turns[i - 1]);
      const tk = task ? { ...t, from: "heimdall" as const } : t;
      // the organised prompt belongs to the ask it organises: nothing has answered that ask yet
      if (task && cur?.user && !cur.user.from && !cur.replies.length && !cur.tools.length && !cur.result) { cur.task = tk; continue; }
      cur = { ...fresh(), user: tk }; out.push(cur); continue;
    }
    if (!cur) { cur = fresh(); out.push(cur); }
    if (t.kind === "tool") cur.tools.push(t);
    else if (t.kind === "assistant") cur.replies.push(t);
    // AN ERROR IS NEVER OVERWRITTEN BY A LATER "SUCCESS" IN THE SAME EXCHANGE (operator 2026-09-27: "i send a message
    // and nothing happens"). OpenCode answered "hi" with `result error · Insufficient account funds`, then the gates'
    // follow-ups landed two empty `result success` lines behind it — the last one won, and the thread showed
    // "haiku · 72.6 s · $0.0000" with the error gone. The error rides on whichever result is drawn.
    else if (t.kind === "result") cur.result = cur.result?.error && !t.error ? { ...t, error: cur.result.error } : t;
    else if (t.kind === "permission") cur.permissions.push(t);
    else if (t.kind === "story") { if (!cur.stories.includes(t.run)) cur.stories.push(t.run); }
    else cur.notes.push(t);
  }
  return out;
}

// ── the reply's buttons: ✂ simplify · ⤢ expand · ≡ summary · ⁇ side question · ⧉ copy ──────────
// THEY DO NOT TOUCH THE CONVERSATION (operator 2026-09-24: "simplify, expand and summary buttons shouldn't run
// in the same agent pane, it should spawn a sidebar mini agent like a parallel subtask"). They used to rewrite
// the reply in place, which quietly overwrote what the agent actually said with a small model's paraphrase of
// it — and the ↩ original toggle only made that reversible, not honest. Each one is now a side question in the
// pane's rail: its own little agent, on the cheap tier, with a copy of the reply. The transcript never moves.
function ReplyActions({ text, onSide, muted, font }: { text: string; onSide: (kind: SideKind, context: string) => void; muted: string; font: string }) {
  const [copied, setCopied] = React.useState(false);
  const btn: React.CSSProperties = { background: "transparent", border: "none", color: muted, cursor: "pointer", fontFamily: font, fontSize: 10, padding: "0 2px" };
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* no clipboard */ } };
  return (
    <div data-testid="reply-actions" style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0 6px", flexWrap: "wrap" }}>
      {SIDE_OPS.map((o) => <button key={o.kind} data-testid={`reply-${o.kind}`} onClick={() => onSide(o.kind, text)} title={o.hint} style={btn}>{o.glyph} {o.label}</button>)}
      <button data-testid="reply-copy" onClick={() => void copy()} title="copy this reply" style={btn}>{copied ? "✓ copied" : "⧉ copy"}</button>
    </div>
  );
}
// ── ⊕ a file on the ask (operator 2026-09-21: "the plus button opens the PC window explorer so we can choose any
// file"): the OS dialog on the desktop (a real path: inside the box → an @chip and the edit scope; outside → the
// file is ingested as an attachment), the browser's own picker in a tab (no path → an attachment).
/** Where a picked absolute path sits relative to the box: the relative path, or null when it is outside. Pure — tested. */
export function boxRelative(worktree: string | null | undefined, abs: string): string | null {
  if (!worktree) return null;
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const w = norm(worktree); const a = norm(abs);
  if (a === w) return null;
  if (!a.startsWith(w + "/")) return null;
  return a.slice(w.length + 1);
}
// ── a permission the engine asks (OpenCode's bash/edit "ask" policy · Codex's command/file approvals) — once · always · reject ──
export async function answerPermission(paneId: number, id: string, reply: "once" | "always" | "reject"): Promise<boolean> {
  try { const r: any = await apiPost(`/api/v1/cockpit/agent/permission`, { pane_id: paneId, id, reply }, { timeoutMs: 10_000 }); return !!(r?.result ?? r)?.ok; } catch { return false; }
}
function PermissionCard({ p, paneId, accent, font }: { p: Extract<Turn, { kind: "permission" }>; paneId: number; accent: string; font: string }) {
  const [busy, setBusy] = React.useState(false);
  const what = `${p.permission}${p.patterns.length ? ` · ${p.patterns.join(", ")}` : ""}`;
  const btn: React.CSSProperties = { fontFamily: font, fontSize: 10.5, padding: "2px 9px", borderRadius: 6, border: `1px solid ${accent}`, background: "transparent", color: accent, cursor: "pointer" };
  return (
    <div data-testid={`permission-${p.id}`} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "6px 0", padding: "6px 10px", borderRadius: 8, border: `1px solid ${p.answered ? "transparent" : accent}`, fontFamily: font, fontSize: 11, opacity: p.answered ? 0.6 : 1 }}>
      <span>🔐 {p.answered ? `${what} — ${p.answered === "reject" ? "refused" : p.answered === "always" ? "allowed, always" : "allowed once"}` : `the agent asks to run ${what}`}</span>
      {!p.answered && <span style={{ display: "flex", gap: 6 }}>
        <button disabled={busy} style={btn} onClick={async () => { setBusy(true); await answerPermission(paneId, p.id, "once"); setBusy(false); }}>allow once</button>
        <button disabled={busy} style={btn} onClick={async () => { setBusy(true); await answerPermission(paneId, p.id, "always"); setBusy(false); }}>always</button>
        <button disabled={busy} style={{ ...btn, borderColor: "#ff6b6b", color: "#ff6b6b" }} onClick={async () => { setBusy(true); await answerPermission(paneId, p.id, "reject"); setBusy(false); }}>refuse</button>
      </span>}
    </div>
  );
}

// ── the OS chrome a theme may put around the pane ─────────────────────────────────────────────
function Chrome({ theme, children }: { theme: AgentTheme; children: React.ReactNode }) {
  const c = theme.chrome; if (!c) return <>{children}</>;
  const title = c.title;
  if (c.kind === "xp") return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", border: "1px solid #0831d9", borderRadius: "8px 8px 0 0", overflow: "hidden", background: theme.bg }}>
      <div style={{ height: 26, background: "linear-gradient(#0a5fd8, #0058ee 40%, #3d95ff 60%, #0a5fd8)", color: "#fff", fontFamily: "Trebuchet MS, Tahoma, sans-serif", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", padding: "0 6px", gap: 6, textShadow: "1px 1px #0a246a" }}>
        <span style={{ width: 14, height: 14, background: "#fff", borderRadius: 2, display: "inline-block" }} /><span style={{ flex: 1 }}>{title}</span>
        {["_", "□", "✕"].map((g) => <span key={g} style={{ width: 20, height: 20, border: "1px solid #fff", borderRadius: 3, background: g === "✕" ? "linear-gradient(#e46a4a,#c43b1a)" : "linear-gradient(#3d95ff,#0a5fd8)", display: "grid", placeItems: "center", fontSize: 11 }}>{g}</span>)}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", margin: "0 3px 3px", background: theme.bg, border: "1px solid #0831d9", borderTop: "none" }}>{children}</div>
    </div>
  );
  if (c.kind === "mac") return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: theme.bg }}>
      <div style={{ height: 34, background: "#f6f6f6", borderBottom: "1px solid #dcdcdc", display: "flex", alignItems: "center", padding: "0 12px", gap: 8 }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((col) => <span key={col} style={{ width: 12, height: 12, borderRadius: 6, background: col, display: "inline-block" }} />)}
        <span style={{ flex: 1, textAlign: "center", fontFamily: theme.font, fontSize: 13, color: "#4a4a4a", fontWeight: 600 }}>{title}</span><span style={{ width: 52 }} />
      </div>
      {children}
    </div>
  );
  if (c.kind === "win") return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: theme.bg }}>
      <div style={{ height: 32, background: "#f3f3f3", borderBottom: "1px solid #e5e5e5", display: "flex", alignItems: "center", padding: "0 12px", gap: 8, fontFamily: theme.font, fontSize: 12, color: "#1b1b1b" }}>
        <span style={{ width: 16, height: 16, background: "#0067c0", borderRadius: 3, display: "inline-block" }} /><span style={{ flex: 1 }}>{title}</span>
        {["—", "☐", "✕"].map((g) => <span key={g} style={{ width: 36, textAlign: "center", fontSize: 12, color: "#1b1b1b" }}>{g}</span>)}
      </div>
      {children}
    </div>
  );
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: theme.bg }}>
      <div style={{ height: 38, background: "linear-gradient(#f9f9f8, #ebe9e7)", borderBottom: "1px solid #d8d4d0", display: "flex", alignItems: "center", padding: "0 10px", gap: 8, fontFamily: theme.font, fontSize: 13.5, fontWeight: 700, color: "#2e3436" }}>
        <span style={{ width: 26, height: 26, borderRadius: 13, border: "1px solid #c8c4c0", background: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 400 }}>≡</span><span style={{ flex: 1, textAlign: "center" }}>{title}</span>
        <span style={{ width: 26, height: 26, borderRadius: 13, border: "1px solid #c8c4c0", background: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 400 }}>✕</span>
      </div>
      {children}
    </div>
  );
}

// ── the themed conversation (every theme but antiloki's own) ─────────────────────────────────
/** THE TURN'S TRACE, on screen (operator 2026-09-25: "some info like stack trace of the gates, like heimdall
 *  deciding, routing, than wich AI was chose, than what is doing, than the actual logs from the AI chosen, then
 *  the final result"). Derived from the turns already in the transcript, so it cannot describe a stage the log
 *  does not have. Folded by default: it is a trace, not the conversation. */
function TurnTrace({ lines, font, ask, summary, isLast = false }: { lines: TraceLine[]; font?: string; ask?: string; summary?: string; /** the newest turn — the only one whose ask it still makes sense to run raw */ isLast?: boolean }) {
  const [open, setOpen] = React.useState(false);
  if (lines.length < 2) return null;   // an ask with nothing after it is not a trace
  const last = lines[lines.length - 1];
  const tone = (t?: string) => (t === "ok" ? C.ok : t === "warn" ? C.warn : t === "bad" ? C.bad : C.dim);
  return (
    <div data-testid="turn-trace" style={{ fontFamily: font ?? mono, fontSize: 9, lineHeight: 1.6 }}>
      {/* READ INSTEAD OF WATCH (operator's queue): one line saying what the turn DID, with the stage-by-stage trace
          folded behind it. The summary is derived from the same turns, so it cannot describe a stage the log lacks;
          when there is nothing to summarise the old last-stage line is shown instead of an empty one. */}
      <button data-testid="turn-trace-toggle" onClick={() => setOpen((o) => !o)}
        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: tone(last.tone), fontFamily: "inherit", fontSize: "inherit" }}>
        {open ? "▾" : "▸"} {summary && summary.length > 0
          ? <span data-testid="turn-one-line">{summary}</span>
          : <>{lines.length} stages · {last.glyph} {last.text}{last.detail ? ` · ${last.detail}` : ""}</>}
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1, paddingLeft: 10, marginTop: 2, borderLeft: `1px solid ${C.border}` }}>
          {lines.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 6, color: tone(l.tone) }}>
              <span style={{ width: 9, flexShrink: 0 }}>{l.glyph}</span>
              <span style={{ color: l.tone ? tone(l.tone) : C.muted, flexShrink: 0 }}>{l.text}</span>
              {l.detail && <span style={{ color: C.dim, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.detail}</span>}
            </div>
          ))}
        </div>
      )}
      {/* RUN THIS ONE RAW (II.6): the same ask, on a raw frontier model, in its own copy of the repo — offered only
          where the record says the comparison could still change a decision, and priced before it spends.
          ONLY ON THE LAST TURN (2026-09-26, found auditing): mounted on every turn it asked the serve for an offer
          once per turn in the transcript — fifty turns, fifty sampler reads on every render — and re-running a turn
          from an hour ago against a repository that has moved on compares two different things anyway. */}
    </div>
  );
}

/** 2026-10-13: whole-message checkpoint phrases only — not "save a checkpoint before refactoring …". Pure — tested. */
export function isCheckpointAsk(text: string): boolean {
  const t = text.trim().replace(/[.!?]+$/g, "").replace(/^\s*(please\s+)?/i, "").replace(/\s+now\s*$/i, "").trim().toLowerCase();
  return t === "save a checkpoint" || t === "take a checkpoint" || t === "checkpoint";
}

/** The goal run a user turn's text belongs to: the run's goal IS the (organised) ask, or the inline route that typed it. Pure — tested. */
export function routeForText(routes: GoalRun[], text: string): GoalRun | undefined {
  return routes.find((r) => r.goal === text || askOf(r.goal) === text || (r.status === "inline" && text.startsWith(r.goal)));
}
/** A run's plan as the task card's checklist; a run with no plan (one job, or not routed yet) has none. Pure — tested. */
export function taskLines(run: GoalRun | undefined): { id: string; title: string; status: string }[] {
  return (run?.tasks ?? []).map((t) => ({ id: t.id, title: t.title, status: t.status }));
}
/** Is Heimdall's prompt long enough to fold behind "▸ the whole task"? Pure. */
export const isLongTask = (text: string): boolean => text.length > 420 || text.split("\n").length > 7;
/** WHICH USER TURN IS A RUN'S GOAL, when the serve did not say so (2026-10-08, until every serve marks `source: "heimdall"`):
 *  its text is a run's goal and the turn right before it was a user turn too — the human's ask, then the prompt written from it. Pure — tested. */
export function looksLikeTask(routes: GoalRun[]): (t: Extract<Turn, { kind: "user" }>, prev: Turn | undefined) => boolean {
  return (t, prev) => !t.pending && prev?.kind === "user" && !prev.from && routes.some((r) => r.goal === t.text || askOf(r.goal) === t.text);
}

/** WHAT SITS UNDER AN ANSWER, FOLDED TO ONE LINE (operator 2026-10-08: the buttons, the telemetry, "≈ saved $0.101 (90%) vs
 *  claude · opus …" and the rest "is shown all the time. It should collapse because it is a little repetitive. And on mouse
 *  over it expands. … expanded by default only at the end of everything"). Both skins mount it under the exchange. The line
 *  is derived from the exchange's own numbers (`$0.011 · saved 90% · 4.1 s`); the trace, the tools, the reply's buttons, the
 *  full saved sentence, the wire, the result line and the run's story live behind it. `final` + `total` come from the pane:
 *  the last exchange of an idle thread starts open, and its line is the thread's total. Nothing to show → nothing drawn. */
function ExchangeMeta({ routes = [], x, routeLine, sending = false, isLast = false, final = false, total = null, onSide, themed }: { routes?: GoalRun[]; x: Exchange; routeLine: string | null; sending?: boolean; isLast?: boolean; final?: boolean; total?: string | null; onSide?: (kind: SideKind, context: string) => void; /** the themed skin's colours; absent = antiChat's own */ themed?: AgentTheme }) {
  const lines = traceOf(x as any, routeLine, sending);
  const saving = x.notes.filter((n) => n.chan === "saving");
  const wire = x.notes.filter((n) => n.chan === "wire");
  const texts = x.replies.filter((r) => !r.streaming && r.text.trim());
  const hasMeta = lines.length >= 2 || x.tools.length > 0 || texts.length > 0 || saving.length > 0 || wire.length > 0 || !!x.result;
  if (!hasMeta && !x.stories.length) return null;
  const summary = oneLine(x as any);
  const line = metaLine(metaOf(x)) || summary;
  const font = themed?.mono ?? mono;
  // THE RUN'S STATS DETAIL STAYS INLINE (operator 2026-10-08: "don't drop the stats detail inline detail, that was right"): it is the one block that is NOT folded behind the line.
  return (<>
    {hasMeta && <ReplyMeta line={line} totalLine={final ? total : null} final={final} font={font}
      colors={themed ? { dim: themed.dim, muted: themed.muted, fg: themed.fg, border: themed.border, panel: themed.panel } : undefined}>
      <TurnTrace lines={lines} font={font} ask={x.user?.text} summary={summary} isLast={isLast} />
      {!themed && <ToolTrail tools={x.tools} />}
      {onSide && texts.map((r, j) => <ReplyActions key={j} text={r.text} onSide={onSide} muted={themed?.dim ?? C.dim} font={font} />)}
      {saving.map((n, j) => <div key={j} data-testid="saved-line" style={{ fontFamily: font, fontSize: 9.5, color: themed ? themed.dim : C.ok }}>{n.text}</div>)}
      {themed && x.result && !x.result.error && <div data-testid="done-line" style={{ fontFamily: font, fontSize: 9.5, color: themed.dim }}>{doneLine(themed, x.result.ms, x.result.cost)}</div>}
      <WireNotes notes={wire} font={font} />
    </ReplyMeta>}
    {x.stories.map((run) => { const gr = routes.find((r) => r.id === run); return <StoryOfRun key={run} run={run} plan={gr ? { goal: gr.goal, tasks: taskLines(gr) } : null} />; })}
  </>);
}

function ThemedExchange({ x, theme, routeLine, routeWhy, paneId, onSide, routes = [], isLast = false, homed = [], final = false, total = null }: { /** the newest exchange of an idle thread: its details start open, and its line is the thread's total (ReplyMeta) */ final?: boolean; total?: string | null; x: Exchange; /** the runs whose RESULT is drawn in this exchange (resultHomes) */ homed?: number[]; routes?: GoalRun[]; theme: AgentTheme; routeLine: string | null; routeWhy?: string; paneId: number; onSide?: (kind: SideKind, context: string) => void; /** the newest exchange — the raw comparison is offered on it alone */ isLast?: boolean }) {
  const [toolsOpen, setToolsOpen] = React.useState(false);
  const T = theme; const transcript = T.layout === "transcript";
  const meta: React.CSSProperties = { fontFamily: T.mono, fontSize: Math.max(9, T.size - 3), color: T.dim, marginTop: 2 };
  const bubble = (side: "user" | "reply"): React.CSSProperties => transcript
    ? { fontFamily: T.font, fontSize: T.size, color: side === "user" ? T.user.fg : T.reply.fg, background: side === "user" && T.user.band ? T.user.bg : "transparent", borderLeft: side === "user" && T.user.border ? `3px solid ${T.accent}` : undefined, padding: side === "user" && T.user.band ? "4px 8px" : "2px 0", whiteSpace: "pre-wrap", lineHeight: 1.55 }
    : { fontFamily: T.font, fontSize: T.size, color: side === "user" ? T.user.fg : T.reply.fg, background: side === "user" ? T.user.bg : T.reply.bg, border: (side === "user" ? T.user.border : T.reply.border) ? `1px solid ${side === "user" ? T.user.border : T.reply.border}` : undefined, borderRadius: T.radius, padding: "8px 12px", maxWidth: "80%", lineHeight: 1.5, boxShadow: T.key === "xp" ? "inset 1px 1px #fff, 1px 1px #919b9c" : undefined };
  const toolLine = (t: Extract<Turn, { kind: "tool" }>) => {
    const name = t.name.replace(/^mcp__antiloki__/, "antiloki·");
    const st = t.result == null ? "…" : t.error ? "✗" : "✓";
    if (T.tool.style === "cmd") return `${T.tool.glyph}${name === "Bash" ? "" : name + " "}${toolSummary(t.name, t.input)}  ${st}`;
    return `${T.tool.glyph}${name}(${toolSummary(t.name, t.input)})  ${st}`;
  };
  const human = x.user && !x.user.from ? x.user : undefined;
  const task = x.task ?? (x.user?.from ? x.user : undefined);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: transcript ? 10 : 14 }}>
      {x.user && isRunDelivery(x.user.text) && (
        <details data-testid="run-delivery" style={{ fontFamily: T.mono, fontSize: 10, color: T.dim, margin: "0 0 6px" }}><summary style={{ cursor: "pointer" }}>↳ {x.user.text.match(/^\[antiloki\] goal run #\d+ finished: [^.]*/)?.[0].replace("[antiloki] ", "") ?? "a run finished"} — handed to the agent</summary><div style={{ padding: "4px 0 2px 12px", whiteSpace: "pre-wrap", color: T.muted }}>{x.user.text}</div></details>
      )}
      {human && !isRunDelivery(human.text) && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: transcript || T.user.align === "left" ? "flex-start" : "flex-end" }}>
          <div style={bubble("user")}>{transcript ? <span style={{ color: T.accent }}>{T.user.glyph}</span> : null}<AskBody text={human.text} /></div>
          <div title={routeWhy} style={{ ...meta, textAlign: transcript || T.user.align === "left" ? "left" : "right" }}>{routeLine ?? ""}{routeLine ? " · " : ""}{hhmm(human.t)}</div>
        </div>
      )}
      {/* THE PROMPT HEIMDALL WROTE is a task view, not a second "you" (operator 2026-10-08) — the trace of the turn
          (2026-09-25) moved under the answer, into ExchangeMeta, with the rest of the details */}
      {task && <TaskGate stories={x.stories}><TaskCard meta={human ? null : routeLine} ts={hhmm(task.t)} tasks={taskLines(routeForText(routes, task.text))} long={isLongTask(task.text)} colors={{ fg: T.fg, dim: T.dim, muted: T.muted, border: T.border, accent: T.accent, font: T.font, mono: T.mono, radius: T.radius }}><AskBody text={task.text} /></TaskCard></TaskGate>}
      {x.tools.length > 0 && (
        <div style={{ fontFamily: T.mono, fontSize: Math.max(9.5, T.size - 2), color: T.muted, paddingLeft: transcript ? 12 : 0 }}>
          {T.tool.style === "box" ? (
            <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius, background: T.panel, padding: "4px 8px" }}>
              <div onClick={() => setToolsOpen((o) => !o)} style={{ cursor: "pointer", color: T.muted }}>{toolsOpen ? "▾" : "▸"} {x.tools.length} tool call{x.tools.length === 1 ? "" : "s"}</div>
              {toolsOpen && x.tools.map((t, i) => <div key={i} style={{ color: t.error ? "#c0392b" : T.muted, whiteSpace: "pre-wrap" }}>{toolLine(t)}</div>)}
            </div>
          ) : x.tools.map((t, i) => <div key={i} style={{ color: t.error ? "#ff6b6b" : T.muted, whiteSpace: "pre-wrap" }}>{transcript && T.key === "claude" ? "  " : ""}{toolLine(t)}</div>)}
        </div>
      )}
      {x.replies.map((r, j) => (
        <div key={j} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <div style={{ ...bubble("reply"), display: transcript ? "flex" : undefined, gap: transcript ? 6 : undefined, animation: r.streaming ? "antilokiPulse 1.3s ease-in-out infinite" : undefined }}>
            {transcript && T.reply.glyph ? <span style={{ color: T.accent, flexShrink: 0 }}>{T.reply.glyph}</span> : null}
            <div style={{ minWidth: 0, fontFamily: T.font }}>{(() => {
              const shown = r.text;
              // A LENS ANSWERS WITH A VERDICT (2026-09-24): a specialist replies with a JSON object, and printing it
              // verbatim put a wall of braces in the middle of the screen. Rendered as a verdict, with the raw
              // object one click away. Anything that is not a lens falls through to markdown, as before.
              // a verdict is a verdict in every layout — the transcript theme prints replies pre-wrapped, which is
              // exactly the wall of braces this exists to stop, so it is NOT excluded here
              const lens = T.key === "terminal" ? null : parseLens(shown);
              if (lens) return <LensReply lens={lens} raw={shown} colors={{ fg: T.fg, dim: T.dim, muted: T.muted, border: T.border, panel: T.panel, accent: T.accent, bad: "#ff6b6b", warn: "#e0a030", ok: T.accent, mono: T.mono, font: T.font }} />;
              return transcript || T.key === "terminal" ? <span style={{ whiteSpace: "pre-wrap" }}>{shown}</span> : <Markdown text={shown} compact />;
            })()}{r.streaming ? <span style={{ color: T.accent }}>▍</span> : null}</div>
          </div>
        </div>
      ))}
      {/* an error is never folded away; the "done in 4 s · $0.01" line is a detail and lives in ExchangeMeta */}
      {x.result?.error && <div style={{ ...meta, color: "#ff6b6b", paddingLeft: transcript ? 2 : 0 }}>{`error: ${x.result.error}`}</div>}
      {/* what the conversation said stays; the wire, the price and the buttons are folded — see ExchangeMeta */}
      {x.notes.filter((n) => n.chan !== "wire" && n.chan !== "saving").map((n, j) => <div key={j} style={{ ...meta, color: n.tone === "bad" ? "#ff6b6b" : n.tone === "warn" ? "#e0a030" : T.dim }}>· {n.text}<NoteId id={n.id} tone={n.tone} /></div>)}
      {x.permissions.map((pm) => <PermissionCard key={pm.id} p={pm} paneId={paneId} accent={T.accent} font={T.font} />)}
      {homed.map((run) => <RunResult key={`res-${run}`} run={routes.find((r) => r.id === run)} />)}
      <ExchangeMeta routes={routes} x={x} routeLine={routeLine} isLast={isLast} final={final} total={total} onSide={onSide} themed={T} />
    </div>
  );
}

/** THE PROVIDER SWITCH, ABOVE EVERYTHING (operator 2026-09-24: "the change dropdown on agents is showing below
 *  sidebar right, it should be above on click").
 *
 *  It was `position: absolute` with `z-index: 20` inside the chat pane, and the pane's right rail is a SIBLING
 *  with its own stacking context — no z-index inside the pane can climb over it. The same trap the full-screen
 *  widget and the hire window both hit. Portalled to the body and placed against the button's own rect, it is
 *  over everything by construction rather than by out-bidding somebody. */
/** exported for its own test (2026-09-25): the hand-off is a verb on every agent now, and the chip's behaviour —
 *  busy, disabled, the menu of engines — is worth holding on its own rather than through a whole pane. */
export function ProviderSwitch({ sw, engine, open, setOpen }: { sw: ChatSwitch; engine: string; open: boolean; setOpen: (f: (o: boolean) => boolean) => void }) {
  const btn = React.useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = React.useState<{ right: number; bottom: number } | null>(null);
  React.useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const r = btn.current?.getBoundingClientRect(); if (!r) return;
      const vw = window.innerWidth || 1024, vh = window.innerHeight || 768;
      // anchored to the button's right edge and opening upward, which is where the composer sits
      setPos({ right: Math.max(8, vw - r.right), bottom: Math.max(8, vh - r.top + 6) });
    };
    place();
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(() => false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, setOpen]);
  return (
    <span style={{ position: "relative" }}>
      <button ref={btn} data-testid="chat-provider" onClick={() => setOpen((o) => !o)} disabled={sw.busy}
        title="this chat's provider — pick another to start a new topic on it (it gets the conversation so far)"
        style={{ fontFamily: mono, fontSize: 10, color: C.muted, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 999, padding: "1px 8px", cursor: sw.busy ? "wait" : "pointer" }}>✦ {sw.busy ? "handing over…" : engine}</button>
      {open && pos && createPortal(
        <>
          <div onClick={() => setOpen(() => false)} style={{ position: "fixed", inset: 0, zIndex: 400 }} />
          <div data-testid="chat-provider-menu" style={{ position: "fixed", right: pos.right, bottom: pos.bottom, zIndex: 401,
            background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 4, display: "flex", flexDirection: "column", gap: 2, minWidth: 190, boxShadow: "0 12px 34px rgba(0,0,0,.45)" }}>
            <div style={{ padding: "3px 8px 4px", fontFamily: mono, fontSize: 8.5, letterSpacing: 0.6, textTransform: "uppercase", color: C.dim }}>new topic on</div>
            {sw.engines.map((e) => (
              <button key={e} data-testid={`chat-provider-${e}`} onClick={() => { setOpen(() => false); if (e !== engine) sw.pick(e); }}
                title={e === engine ? "the current provider" : `consolidate this episode and continue on ${e}`}
                style={{ textAlign: "left", background: e === engine ? `color-mix(in oklab, ${C.brand} 16%, transparent)` : "transparent", border: "none", color: C.fg, borderRadius: 5, padding: "4px 8px", cursor: "pointer", fontFamily: mono, fontSize: 10.5, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: e === engine ? C.brand : C.dim }}>{e === engine ? "●" : "○"}</span>{e}
              </button>
            ))}
          </div>
        </>, document.body)}
    </span>
  );
}

/** CLOSE THE EPISODE (operator 2026-09-23: "add a button Close episode on the agent chat at the bottom"). The serve
 *  consolidates the open episode into a summary and a journey, then opens the next one on the same conversation —
 *  nothing is lost and `!` adds the closed one back as context. An empty episode is already a fresh topic, and the
 *  serve says so rather than making a second empty one. */
/** HOW THE WORK LEAVES (operator 2026-09-24). `merge` lands it in the workspace, which is what closing an episode
 *  has always meant; `patch` writes a series and its review document to the outbox — no forge, no token, no
 *  account; `pr` files it on whatever forge the remote points at, falling back to a patch when that is nothing we
 *  can talk to. */
export type Deliver = "merge" | "patch" | "pr";
export const DELIVERIES: { key: Deliver; label: string; hint: string }[] = [
  { key: "merge", label: "merge it here", hint: "land the episode in your workspace — what closing an episode has always done" },
  { key: "patch", label: "write a patch", hint: "a git patch series plus the review document, in .antiloki/outbox — needs no forge and no token" },
  { key: "pr", label: "open a pull request", hint: "push the branch and file it on your remote, with the run's own ledger as the body and the gates as checks" },
];
/** WHAT "OPEN A PULL REQUEST" WILL DO FOR THIS REPO, asked of the serve before the click (operator 2026-09-30: the PR button "didnt create it" - the repo had no remote, so it quietly wrote a patch). */
export type Preflight = { ok?: boolean; /** one-time token the serve hands out with the preflight; publishing a repo must echo it (core b295a75, 2026-10-01) so a page that never asked cannot create one */ publish_nonce?: string; publish_nonce_ttl_s?: number; remote?: string; kind?: string; repo?: string; base?: string; branch?: string; local_only?: boolean; can_pr?: boolean; publish_available?: boolean; gh_account?: string | null; label?: string; why?: string; root_name?: string };
export async function fetchPreflight(paneId: number): Promise<Preflight | null> {
  try { const r: any = await apiGet(`/api/v1/cockpit/deliver/preflight?pane_id=${paneId}`); const d = r?.result?.result ?? r?.result ?? r; return d && d.ok !== false ? d as Preflight : null; } catch { return null; }
}
/** The "pull request" row of the menu, from the preflight: what it says, what a click does. Pure - tested.
 *  pr = open it now · publish = create the online repo first (needs a second, confirming click) · blocked = cannot, and why · patch = no forge to talk to. */
export function prChoice(pf: Preflight | null): { action: "pr" | "publish" | "blocked" | "patch"; label: string; hint: string } {
  const base = DELIVERIES.find((d) => d.key === "pr")!;
  if (!pf) return { action: "pr", label: base.label, hint: base.hint };
  if (pf.can_pr) return { action: "pr", label: `open a pull request on ${pf.repo}`, hint: `push ${pf.branch || "the branch"} and file it against ${pf.base || "main"} - the page opens when it is done` };
  if (pf.local_only && pf.publish_available) return { action: "publish", label: "create a private GitHub repo, then open the PR", hint: `${pf.why ?? "this repo is local only"} (click again to confirm)` };
  if (pf.local_only) return { action: "blocked", label: "no online repo for this project", hint: pf.why ?? "this repo is local only - merge it here" };
  if (pf.kind && pf.kind !== "patch") return { action: "blocked", label: "a pull request needs a token", hint: pf.why ?? "no token for the forge" };
  return { action: "patch", label: "no forge to file on - write a patch", hint: pf.why ?? base.hint };
}
/** Create the online repo for a local-only workspace (explicitly confirmed by the caller).
 *  STRICT (audit 2026-10-01): `apiPost` answers null for a refusal, a timeout or a dead serve, and this read `d?.ok !== false` on that null as success - so the flow went on to open a
 *  pull request on a repo that had no remote. Any failure is now `ok: false` with the serve's own reason. */
export async function publishRepo(paneId: number, name?: string, nonce?: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  try { const r: any = await apiPostStrict(`/api/v1/cockpit/deliver/publish`, { pane_id: paneId, confirm: true, ...(nonce ? { nonce } : {}), ...(name ? { name } : {}) }, { timeoutMs: 120_000 }); const d = r?.result?.result ?? r?.result ?? r; return d?.ok === false ? { ok: false, error: String(d?.error ?? "the serve would not create it") } : { ok: true, url: d?.url }; }
  catch (e) { return { ok: false, error: reasonOf(e) }; }
}
async function closeEpisode(paneId: number, deliver: Deliver): Promise<{ ok: boolean; unchanged?: boolean; why?: string; error?: string; merge?: any; delivered?: any }> {
  try {
    const r: any = await apiPostStrict(`/api/v1/cockpit/chat/episode`, { pane_id: paneId, deliver }, { timeoutMs: 180_000 });
    const d = r?.result ?? r;
    return { ok: d?.ok !== false, unchanged: !!d?.unchanged, why: d?.why, error: d?.error, merge: d?.merge, delivered: d?.delivered };
  } catch (e) { return { ok: false, error: `could not close the episode: ${reasonOf(e)}` }; }
}
/** WHAT CLOSING IT ACTUALLY DID (2026-09-24). For an agent in the shared workspace, the old sentence. For one with
 *  a box of its own, closing an episode is a merge, and a merge that did not happen is the thing the operator most
 *  needs to be told — with the branch the work is safe on, never just "failed". Pure — tested. */
export function episodeNote(r: { ok: boolean; unchanged?: boolean; why?: string; error?: string; merge?: any; delivered?: any }, deliver?: Deliver): string {
  if (!r.ok) return r.error ?? "could not close it";
  if (r.unchanged) return r.why ?? "already a fresh topic";
  // a delivery says what it did with the work, and where it put it
  const d = r.delivered;
  if (d) {
    if (d.ok === false) return `episode closed, but it was not delivered: ${String(d.error ?? "unknown").slice(0, 150)}`;
    const files = (d.sealed?.files ?? []).length;
    const count = files ? ` · ${files} file${files === 1 ? "" : "s"}` : "";
    if (d.kind === "github") return `pull request opened${count}${d.statuses ? ` · ${d.statuses} check${d.statuses === 1 ? "" : "s"} posted` : ""} — ${d.url}`;
    // a PULL REQUEST that became a patch is said plainly - not as a button that did nothing. But "write a patch" never asked for a pull request (audit 2026-10-01): its `why`, if the serve
    // sends one, is a note on the patch, not an apology for a PR that was not opened.
    if (d.why && deliver !== "patch") return `no pull request was opened: ${String(d.why).replace(/^this workspace's remote/, "this repo's remote")} Patch written to ${String(d.path ?? "the outbox")}${count}.`;
    return `episode closed · patch written to ${String(d.path ?? "the outbox")}${count}${d.why ? ` (${d.why})` : ""}`;
  }
  const m = r.merge;
  if (!m) return "episode closed — the next one is open";
  if (m.error) return `episode closed, but the merge failed: ${String(m.error).slice(0, 120)}`;
  const inner = m.merge ?? {};
  if (inner.note) return String(inner.note);
  const files = (m.sealed?.files ?? []).length;
  return `episode closed and merged into ${inner.workspace ?? inner.merged_into ?? "the workspace"}${files ? ` · ${files} file${files === 1 ? "" : "s"}` : ""}`;
}

/** the note, with its URL as a real link (a pull request is something you GO to) */
function noteWithLink(note: string): React.ReactNode {
  const m = note.match(/https?:\/\/\S+/); if (!m) return note;
  const i = note.indexOf(m[0]);
  return <>{note.slice(0, i)}<a data-testid="episode-note-link" href={m[0]} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "inherit", textDecoration: "underline" }}>{m[0]}</a>{note.slice(i + m[0].length)}</>;
}

/** The button itself: it says what it did rather than going quiet, because an empty episode is a no-op and the
 *  operator would otherwise wonder whether the click registered. */
export function EpisodeButton({ paneId }: { paneId?: number | null }) {
  const [busy, setBusy] = React.useState(false);
  const [pick, setPick] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [pf, setPf] = React.useState<Preflight | null>(null);
  const [confirmPublish, setConfirmPublish] = React.useState(false);
  // what the PR row will do, asked when the menu opens (and forgotten when it closes, so a stale answer is never read)
  React.useEffect(() => { if (!pick || !paneId) { setConfirmPublish(false); setPf(null); return; } let live = true; void fetchPreflight(paneId).then((r) => { if (live) setPf(r); }); return () => { live = false; }; }, [pick, paneId]);
  // it stays until it is read: a result that vanishes in four seconds is one the operator will swear never appeared
  React.useEffect(() => { if (!note) return; const h = setTimeout(() => setNote(null), 30_000); return () => clearTimeout(h); }, [note]);
  // ESCAPE CLOSES THE MENU (Grokbot QA 2026-10-12, item 30): the other popups of this file do; this one closed only by a click on the backdrop
  React.useEffect(() => { if (!pick) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setPick(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [pick]);
  if (!paneId) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {/* WHAT CLOSING IT DID, SAID OUT LOUD (operator 2026-09-27: "i clicked close episode and merge here and did
          absolutely nothing"). It DID answer — `unchanged: true · "the open episode is empty"` — but the answer was
          9px of dim grey on one clipped line in a crowded footer, gone in four seconds. An outcome nobody can see is
          indistinguishable from a button that does not work, and the operator read it exactly that way.
          Now it is legible, it wraps, it is coloured by what happened, and it waits to be dismissed. */}
      {note && (
        <span data-testid="episode-close-note" title={note} onClick={() => setNote(null)}
          style={{ fontFamily: mono, fontSize: 10.5, lineHeight: 1.45, cursor: "pointer",
            color: /could not|failed|not delivered/i.test(note) ? C.bad : /already|empty|unchanged/i.test(note) ? C.warn : C.ok,
            border: `1px solid ${/could not|failed|not delivered/i.test(note) ? C.bad : /already|empty|unchanged/i.test(note) ? C.warn : C.ok}`,
            borderRadius: 6, padding: "3px 8px", maxWidth: 520, whiteSpace: "normal", wordBreak: "break-word" }}>{noteWithLink(note)}</span>
      )}
      {pick && createPortal(
        <>
          <div onClick={() => setPick(false)} style={{ position: "fixed", inset: 0, zIndex: 400 }} />
          <div data-testid="episode-deliver" style={{ position: "fixed", right: 20, bottom: 66, zIndex: 401, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 9, padding: 5, display: "flex", flexDirection: "column", gap: 2, minWidth: 250, boxShadow: "0 12px 34px rgba(0,0,0,.45)" }}>
            <span style={{ padding: "3px 8px 4px", fontFamily: mono, fontSize: 8.5, letterSpacing: .6, textTransform: "uppercase", color: C.dim }}>close it, and…</span>
            {DELIVERIES.map((d0) => {
              const pc = d0.key === "pr" ? prChoice(pf) : null;
              const d = pc ? { ...d0, label: confirmPublish && pc.action === "publish" ? "yes - create the private repo and open the PR" : pc.label, hint: pc.hint } : d0;
              const blocked = pc?.action === "blocked";
              return (
              <button key={d.key} data-testid={`episode-deliver-${d.key}`} title={d.hint} disabled={blocked || busy} data-action={pc?.action}
                // THE WHOLE SCREEN WAITS, NOT JUST THIS PILL (operator 2026-09-28: "should at least show the page
                // loading with no option of click and make mistakes"). Closing an episode is a consolidation call
                // with a three-minute ceiling, and `busy` was local to this button — the composer stayed live, so
                // an ask could be typed into an episode that was being folded up underneath it.
                onClick={() => {
                  if (busy) return;
                  // CREATING A REPOSITORY ON THE OPERATOR'S ACCOUNT NEEDS A SECOND CLICK that says so
                  if (pc?.action === "publish" && !confirmPublish) { setConfirmPublish(true); return; }
                  setBusy(true);
                  window.dispatchEvent(new CustomEvent(EPISODE_CLOSING));
                  const go = async (): Promise<any> => {
                    if (pc?.action === "publish") {
                      const p = await publishRepo(paneId, pf?.root_name, pf?.publish_nonce);
                      // A REPO THAT WAS NOT CREATED STOPS THE FLOW HERE (audit 2026-10-01): the menu stays open on the same confirming step, so the operator can retry or pick another way out
                      if (!p.ok) return { publishFailed: true, ok: false, error: `could not create the repo: ${p.error ?? "unknown"}` };
                    }
                    setPick(false);
                    return closeEpisode(paneId, d.key);
                  };
                  void go()
                    .then((r) => {
                      setBusy(false); setNote(episodeNote(r, d.key));
                      window.dispatchEvent(new CustomEvent(r.ok === false ? EPISODE_FAILED : EPISODE_CLOSED));
                      const u = r?.delivered?.url; if (typeof u === "string" && /^https:\/\//.test(u)) { try { window.open(u, "_blank", "noopener"); } catch { /* the link in the note still works */ } }
                    })
                    .catch((e) => { setBusy(false); setPick(false); setNote(String(e?.message ?? e)); window.dispatchEvent(new CustomEvent(EPISODE_FAILED)); });
                }}
                style={{ textAlign: "left", background: confirmPublish && pc?.action === "publish" ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: "none", color: blocked ? C.dim : C.fg, borderRadius: 6, padding: "5px 8px", cursor: blocked ? "not-allowed" : "pointer", fontFamily: mono, fontSize: 10.5, opacity: blocked ? 0.75 : 1 }}>
                {d.label}
                <span style={{ display: "block", fontSize: 9, color: C.dim, lineHeight: 1.45, marginTop: 1 }}>{d.hint}</span>
              </button>
              );
            })}
          </div>
        </>, document.body)}
      <button data-testid="episode-close" disabled={busy} onClick={() => setPick((o) => !o)}
        title="close this episode — consolidated into a summary and a journey, then delivered: merged here, written as a patch, or opened as a pull request"
        style={{ fontFamily: mono, fontSize: 9.5, background: "transparent", border: `1px solid ${C.border}`, color: busy ? C.dim : C.muted, borderRadius: 999, padding: "1px 9px", cursor: busy ? "default" : "pointer", whiteSpace: "nowrap" }}>
        {busy ? "closing…" : "⧉ close episode"}
      </button>
    </span>
  );
}

export function AgentChatPane({ p, onSubmit, busyHint: busyHintProp, routes = [], roles = [], currentRole = null, roleWhy = null, onPickRole, heimdallOn = false, onToggleHeimdall, heimdallMode, onHeimdallMode, pairLabel, heimdallSaved = 0, subagentsOn = true, onToggleSubagents, maxOn = false, minOn = false, onDial, speed, onSpeed, dial, onDialChange, qaOn = false, onToggleQa, rolesOn = true, onToggleRoles, gates, onGate, previewOn = false, onTogglePreview, onAddToScope, chat = false, readonly = false, mainAgent = false, episodes, chatSwitch, widgetSplit, onSide, onRoutesChanged }: { p: any; /** re-read the pane's goal runs now — the inline screening card calls it after an answer */ onRoutesChanged?: () => void;
  /** MAIN'S OPENING (operator 2026-09-24): the read-only agent explains itself and the merge before the first
   *  ask, deterministically — see cockpit/main-welcome.tsx */ mainAgent?: boolean; chatSwitch?: ChatSwitch; /** A CHAT (chats-tab.tsx, 2026-09-21): antiChat's own chrome — no theme picker, no status row, no start/stop, no model chip; `!` lists its episodes */ chat?: boolean; /** it cannot write (a plain chat); main and its forks are chats that CAN */ readonly?: boolean; episodes?: EpisodeRef[]; /** the front door: returns true when it took the line (Heimdall), false to send it to the agent as is */ onSubmit?: (text: string, full?: string, force?: boolean) => boolean; busyHint?: string | null; /** this pane's routed runs — the verdict rides under the ask it routed */ routes?: GoalRun[];
   /** THE CHAMELEON'S ROLE, IN ITS OWN HEADER (2026-09-26). RoleSwitcher was built, tested and mounted NOWHERE — a
    *  component with passing tests is not a shipped feature, and the landing copy described a dropdown no user could
    *  see. `roles` is the serve's list, `currentRole` what is active, `roleWhy` Heimdall's one-line reason, and
    *  `onPickRole(key, takeover)` carries the intent so the caller turns role routing off in the same gesture.
    *  Without `onPickRole` the chip still reads the state; it simply cannot pick. */
   roles?: RoleAdapter[]; currentRole?: RoleAdapter | null; roleWhy?: string | null; onPickRole?: (key: string, takeover: boolean) => void;
   heimdallOn?: boolean; /** ⚡ the router, flipped from the footer; `heimdallSaved` = what it saved on this pane (API-equivalent USD) */ onToggleHeimdall?: () => void; /** HEIMDALL'S THREE STATES (2026-09-22): AUTO picks the models itself · ON obeys the bars · OFF routes nothing. With `onHeimdallMode` the chip opens the menu instead of toggling. */ heimdallMode?: HeimdallMode; onHeimdallMode?: (m: HeimdallMode) => void; /** the merge the pane runs as (Studio › agents › merge) */ pairLabel?: string; heimdallSaved?: number; /** ⋔ sub-agents: may the agent fan work out */ subagentsOn?: boolean; onToggleSubagents?: () => void; /** THE DIAL — MIN (intel only, no exploration) · SCOPE (the normal mode) · MAX (everything, every permission): one of three */ maxOn?: boolean; minOn?: boolean; onDial?: (mode: "min" | "scope" | "max") => void;
  /** the speed dial (cheaper · balanced · faster) — stored on the pane, not wired to behaviour yet */
  speed?: Speed; onSpeed?: (s: Speed) => void;
  /** THE SPLIT HALF (2026-09-23): a widget opened beside the chat from its card. One at a time; the caller owns it. */
  widgetSplit?: React.ReactNode;
  /** THE BARS: the super-bar and its two axes (context · models), stored on the pane as `settings.dial` */
  dial?: DialState; onDialChange?: (d: DialState) => void; /** QA: an isolated judge reviews every finished plan against its criteria */ qaOn?: boolean; onToggleQa?: () => void; /** ROLES: Heimdall picks the role for the ask and that role's measured winner (default on) */ rolesOn?: boolean; onToggleRoles?: () => void; /** the three deterministic gates on the agent's claim (2026-09-24) */ gates?: { test: boolean; build: boolean; lint: boolean; laws: boolean }; onGate?: (g: "test" | "build" | "lint" | "laws") => void; /** ▶ preview: a linked run cell for this pane's worktree, at the side */ previewOn?: boolean; onTogglePreview?: () => void; /** ⊕: a file attached to the ask also joins the edit scope */ onAddToScope?: (path: string) => Promise<void>;
  /** SIDE QUESTIONS (2026-09-24): ✂ ⤢ ≡ ⁇ under a reply open a little agent in the PANE's rail, never in here */
  onSide?: (kind: SideKind, context: string) => void }) {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  /** the role key the serve named on the newest turn — see the subscription below */
  const [liveRole, setLiveRole] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<any>(null);
  const [draft, setDraft] = React.useState("");
  useTourUnlock("agent"); // the progressive tour: the first chat pane the user reaches
  const [sending, setSending] = React.useState(false);
  // THE OUTBOX (operator 2026-10-09: "when sending more messages while in the middle of an execution it should queue my tasks"). A message sent while another send is in flight or the agent is
  // busy used to be DROPPED (the `sending` guard returned silently) or sent straight into the engine mid-turn. It is held here, drawn as "queued", and sent in order the moment the pane is free;
  // the refs are the truth for a call made before the next render.
  const [outbox, setOutbox] = React.useState<string[]>([]);
  const sendingRef = React.useRef(false); const busyRef = React.useRef(false); const sendRef = React.useRef<(t: string) => Promise<void>>(async () => {});
  const paneTheme = React.useMemo(() => { try { return JSON.parse(p?.settings_json ?? "{}")?.theme ?? null; } catch { return null; } }, [p?.settings_json]);
  const paneModel = React.useMemo(() => { try { return JSON.parse(p?.settings_json ?? "{}")?.model ?? null; } catch { return null; } }, [p?.settings_json]);
  // EVERY agent, antiChat included, spawns dressed as its engine (its model, for OpenCode); there is no house theme any more (operator 2026-10-11: "remove the antiloki
  // theme completely"). A pane that carries a theme the app no longer has (an old "antiloki") falls back to its engine's own look.
  const [themeKeyRaw, setThemeKey] = React.useState<AgentThemeKey>(() => loadTheme(p.id, validThemeOr(paneTheme, engineTheme(p?.pane_kind, paneModel))));
  const themeKey: AgentThemeKey = themeKeyRaw;
  const [themeOpen, setThemeOpen] = React.useState(false);
  const pickTheme = (k: AgentThemeKey) => { setThemeKey(k); saveTheme(p.id, k); setThemeOpen(false); };
  const [providerOpen, setProviderOpen] = React.useState(false);
  const [refs, setRefs] = React.useState<TrayRef[]>([]);
  const [attaching, setAttaching] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement | null>(null);
  const addRef = (r: TrayRef) => setRefs((rs) => (rs.some((x) => refKey(x) === refKey(r)) ? rs : [...rs, r]));
  /** a file INSIDE the box: its @chip on the ask and its path into the edit scope */
  const attachBoxFile = (rel: string) => { addRef({ kind: "code_file", path: rel }); void onAddToScope?.(rel); };
  /** a file ANYWHERE: ingested as an attachment the resolver renders under the ask */
  const attachDoc = (d: UploadResult | null, label: string) => { if (d?.document_id) addRef({ kind: "attachment", docId: d.document_id, label: d.title || label }); };
  const attach = async () => {
    if (attaching) return;
    if (isDesktop()) {
      const abs = await pickFile("attach a file to the ask");
      if (!abs) return;
      const rel = boxRelative(p?.worktree_path, abs);
      if (rel) { attachBoxFile(rel); return; }
      setAttaching(true);
      try { const r: any = await apiPostRaw(`/api/v1/upload/path`, { path: abs }, { timeoutMs: 120_000 }); attachDoc((r?.result ?? r) as UploadResult, abs.split(/[\\/]/).pop() ?? abs); }
      finally { setAttaching(false); }
      return;
    }
    fileInput.current?.click(); // the browser's own OS dialog — the bytes come, the path does not
  };
  const onBrowserFile = async (f: File | undefined) => {
    if (!f) return; setAttaching(true);
    try { attachDoc(await uploadFile(f), f.name); } finally { setAttaching(false); if (fileInput.current) fileInput.current.value = ""; }
  };
  // `#` lists every docked widget — never this pane's own cell; other threads' are named by thread
  const threadRefables = useThreadRefables();
  const ownCell = React.useRef<string | null>(null);
  const ownKey = String(p?.subagent_name ?? "").replace(/^chat-/, "");
  const refables = React.useMemo(() => threadRefables.filter((r) => r.refId !== ownCell.current && r.agentKey !== ownKey).map((r) => ({ refId: r.refId, label: r.thread && !r.onScreen ? `${r.label} · ${r.thread}` : r.label, hint: r.onScreen ? undefined : r.agentKey ? "agent · its chat" : "off screen · read once" })), [threadRefables, ownKey]);
  // `@` extras: the workspace's other agents (any thread) and the specialists this box may use
  const [liveAgents, setLiveAgents] = React.useState<{ pane_id: number; key: string; name?: string | null; session_name?: string; kind: string; running: boolean }[]>([]);
  const [specialists, setSpecialists] = React.useState<{ id: string; title: string; category?: string; description?: string; ready?: boolean }[]>([]);
  React.useEffect(() => {
    let live = true;
    const pull = () => apiGet(`/api/v1/cockpit/agents/live`, { timeoutMs: 10_000 }).then((r: any) => { const d = r?.result ?? r; if (live && Array.isArray(d?.agents)) setLiveAgents(d.agents); }).catch(() => {});
    void pull(); const t = setInterval(pull, 20_000);
    void apiPost(`/api/v1/dispatch`, { action_name: "system.constitution.agents", input: {} }, { timeoutMs: 20_000 }).then((r: any) => { const d = r?.result?.result ?? r?.result ?? r; if (live && Array.isArray(d?.agents)) setSpecialists(d.agents); }).catch(() => {});
    return () => { live = false; clearInterval(t); };
  }, []);
  const paneSettings = React.useMemo(() => { try { return JSON.parse(p?.settings_json ?? "{}") ?? {}; } catch { return {}; } }, [p?.settings_json]);
  const atExtras = React.useMemo(() => {
    const threadLabel = (key: string) => threadRefables.find((r) => r.agentKey === key);
    // one entry per agent key (a box reopened under a second pane row shares the key): the running one, else the latest
    const byKey = new Map<string, typeof liveAgents[number]>();
    for (const a of liveAgents) { if (a.pane_id === p.id) continue; const k = String(a.key ?? a.pane_id); const cur = byKey.get(k); if (!cur || (a.running && !cur.running) || (a.running === cur.running && a.pane_id > cur.pane_id)) byKey.set(k, a); }
    const agents = Array.from(byKey.values()).map((a) => { const tr = threadLabel(String(a.key ?? "").replace(/^chat-/, "")); const label = tr?.label ?? a.name ?? a.session_name ?? `pane ${a.pane_id}`; return { label: `${label}${tr?.thread ? ` · ${tr.thread}` : ""}`, refId: `agent:${a.pane_id}`, token: `@agent:${a.pane_id} (${label})`, hint: `${a.kind}${a.running ? " · live" : ""} · its chat as context` }; });
    const allowed: string[] | null = Array.isArray(paneSettings.specialists) ? paneSettings.specialists.map(String) : null;
    const specs = specialists.filter((x) => x.ready !== false && (!allowed || allowed.includes(x.id))).map((x) => ({ label: `⚉ ${x.title}`, refId: `specialist:${x.id}`, token: `@specialist:${x.id} (${x.title})`, hint: `${x.category ?? "specialist"} · isolated sub-agent` }));
    return [...agents, ...specs];
  }, [liveAgents, specialists, threadRefables, paneSettings, p.id]);
  const transcriptOf = async (paneId: number) => { const r: any = await apiGet(`/api/v1/cockpit/agent/transcript?pane_id=${paneId}&chars=9000`, { timeoutMs: 15_000 }); const d = r?.result ?? r; return d?.transcript != null ? { name: String(d.name ?? ""), transcript: String(d.transcript) } : null; };
  const transcriptOfKey = async (agentKey: string) => { const a = liveAgents.find((x) => String(x.key ?? "").replace(/^chat-/, "") === agentKey); return a ? transcriptOf(a.pane_id) : null; };
  const theme = agentTheme(themeKey);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const stick = React.useRef(true);
  const [link, setLink] = React.useState<Link>("up");
  const [startErr, setStartErr] = React.useState("");
  const linkRef = React.useRef<Link>("up");
  React.useEffect(() => {
    let stop = false;
    setTurns([]);
    setLiveRole(null);        // another pane's role is not this one's
    // THE THREAD MUST NOT DEPEND ON ONE STREAM ALONE (Grokbot QA 2026-10-12, item 7: "the episode shows 3 replies, the chat pane stays blank"). The history is on disk and the status says how far it goes
    // (`last_seq`); the stream (a SharedWorker, which a webview may start without ever delivering a frame) is the fast path, not the only one. `seen` is the highest event shown, so the stream and the
    // backfill below can overlap without a turn appearing twice.
    let seen = 0;
    const feed = (seq: number, data: any) => {
      if (stop) return;
      if (seq > 0 && seq <= seen) return;
      if (seq > seen) seen = seq;
      setTurns((ts) => applyEvent(ts, seq, data));
    };
    let backfilling = false;
    const backfill = async (last: number) => {
      if (backfilling || stop || !(last > seen)) return;
      backfilling = true;
      try {
        const r: any = await apiGet(`/api/v1/cockpit/agent/events?pane_id=${p.id}&after=${seen}&limit=400`, { timeoutMs: 20_000 } as any);
        const evs = (r?.result ?? r)?.events;
        for (const e of Array.isArray(evs) ? evs : []) feed(Number(e.seq) || 0, e);
      } catch { /* the next probe tries again */ }
      finally { backfilling = false; }
    };
    const off = subscribeAgent(p.id, 0, {
      event: (seq, data) => {
        if (stop) return;
        feed(seq, data);
        // THE ROLE THAT IS ACTUALLY WORKING (operator 2026-09-28: "at this part where is written role . route -->
        // should show the current role that is working. Every task can switch the role, that is the whole idea
        // behind heimdall"). The prop is derived from GOAL RUNS, and a chat turn routed inline never makes one —
        // so the chip fell back to the placeholder "role · routed" on exactly the asks the chameleon was reshaping
        // for. The serve names the role on every turn; this is the pane listening.
        const ev = (data as any)?.ev ?? data;
        if (ev?.type === "antiloki" && ev?.subtype === "role" && typeof ev?.role === "string" && ev.role) setLiveRole(ev.role);
      },
      ready: (_last, st) => { if (stop) return; setStatus(st); },
    });
    // THE PROBE MUST NOT BE ABLE TO FIGHT THE THING IT IS WATCHING (audit 2026-09-28). Three faults, each of
    // which alone could lock the composer for ever:
    //   · a 4 s timeout on a route that shares serve's single writer connection — a burst made the poll time out,
    //     which read as "serve is down", which disabled the composer. The standing timeout here is 30 s for
    //     exactly that reason.
    //   · `agent::start` calls `stop()` before it spawns, so an unguarded re-start races the spawn it is waiting
    //     for: down → ok-not-running → START → (still spawning) → down → START … for ever. One start at a time,
    //     and never a second within the cold-start window.
    //   · a 404 comes back as the `__not_wired` sentinel, which is truthy — an older serve read as "the engine
    //     is dead" rather than "this route is not here", and the pane never recovered.
    let inflight = false; let startedAt = 0;
    setStartErr("");
    const probe = async () => {
      if (stop || inflight) return;
      inflight = true;
      let st: any = null;
      try { const r: any = await apiGet(`/api/v1/cockpit/agent/status?pane_id=${p.id}`, { timeoutMs: 20_000 } as any); st = isNotWired(r) ? "unwired" : (r?.result ?? r); }
      catch { st = null; }
      finally { inflight = false; }
      if (stop) return;
      // an older serve without the route: say nothing, change nothing, never disable the composer
      if (st === "unwired") { if (linkRef.current !== "up") { linkRef.current = "up"; setLink("up"); } return; }
      if (st) setStatus(st);
      if (st && Number(st.last_seq) > seen) void backfill(Number(st.last_seq));
      const n = nextLink(linkRef.current, st ? { ok: true, running: !!st.running } : { ok: false }, !!chat);
      if (n.link !== linkRef.current) { linkRef.current = n.link; setLink(n.link); }
      // THE AGENT RESTARTS ITSELF (operator 2026-09-27). A serve restart drops every engine session; the pane asks
      // for its own back the moment serve answers again, instead of waiting for the next message to trip over it.
      if (n.start && Date.now() - startedAt > 30_000) {
        startedAt = Date.now();
        try {
          const r: any = await apiPost(`/api/v1/cockpit/agent/start`, { pane_id: p.id }, { timeoutMs: 60_000 });
          const d = r?.result ?? r;
          if (!stop) setStartErr(d && d.ok === false && d.error ? String(d.error) : "");     // the serve answers 201 + {ok:false,error} when it cannot start the engine: say why instead of spinning
        } catch { /* the next probe says where we are */ }
      }
    };
    void probe();                        // …and the first answer arrives now, not in three seconds
    const t = setInterval(probe, 3000);
    return () => { stop = true; clearInterval(t); off(); };
  }, [p.id, chat]);
  // …and it is reset when the pane changes, or a tab switch inherits the previous pane's verdict and refuses to
  // send on a pane that is perfectly healthy (audit 2026-09-28).
  React.useEffect(() => { linkRef.current = "up"; setLink("up"); }, [p.id]);
  const busyHint = linkHint(link, busyHintProp);
  React.useEffect(() => { const el = listRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [turns]);
  // the list grows after `turns` change (run cards, stories, results are drawn later): keep following the bottom until the reader scrolls up (follow-bottom.ts)
  React.useEffect(() => { const el = listRef.current; return el ? followBottom(el, () => stick.current) : undefined; }, [turns.length > 0]);
  React.useEffect(() => { ownCell.current = (listRef.current?.closest("[data-thread-cell]") as HTMLElement | null)?.getAttribute("data-thread-cell") ?? null; }, []);
  const onScroll = () => { const el = listRef.current; if (!el) return; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; };
  // AN ASK THAT GOES NOWHERE SAYS WHY (QA report BUG-002): an empty message and a message sent while antiloki is not answering both returned in silence
  const [sendHint, setSendHint] = React.useState<string | null>(null);
  const hintTimer = React.useRef<any>(null);
  const flashHint = (m: string) => { setSendHint(m); clearTimeout(hintTimer.current); hintTimer.current = setTimeout(() => setSendHint(null), 3500); };
  React.useEffect(() => () => clearTimeout(hintTimer.current), []);
  const send = async (text: string) => {
    const t = text.trim();
    if (!t) { flashHint("Write something first — an empty message is not sent."); return; }
    if (sendingRef.current || busyRef.current) {
      setOutbox((o) => [...o, t]); setDraft("");
      flashHint("queued — it goes when the current work is done");
      return;
    }
    sendingRef.current = true;
    try { await sendNow(t); } finally { sendingRef.current = false; }
  };
  const sendNow = async (t: string) => {
    if (linkRef.current !== "up") { flashHint("antiloki is not answering yet — your message is still here; send it again when the connection is back."); return; }
    // 2026-10-13: a whole-message checkpoint ask saves via the checkpoint door — not the agent front/send path.
    if (isCheckpointAsk(t)) {
      setDraft("");
      setSending(true);
      try {
        await apiPost(`/api/v1/cockpit/checkpoints/save`, { pane_id: p.id, label: "from chat" }, { timeoutMs: 30_000 });
        setTurns((ts) => [...ts, { kind: "note", seq: (ts[ts.length - 1]?.seq ?? 0) + 0.5, t: Date.now(), text: "checkpoint saved", tone: "ok" }]);
      } finally { setSending(false); }
      return;
    }
    setDraft("");
    const ats = atTokens(t);
    // `@specialist` — the ask becomes the brief of an isolated sub-agent in this box; its report lands here when it is done
    const specs = ats.filter((a) => a.kind === "specialist");
    if (specs.length) {
      setSending(true);
      try {
        const ask = askText(t);
        const tasks = specs.map((a) => { const sp = specialists.find((x) => x.id === a.id) ?? { id: a.id, title: a.label }; return { title: `⚉ ${sp.title}`, prompt: specialistPrompt(sp, ask) }; });
        const jobs = await spawnSubagents({ parent: ownKey, goal: ask.slice(0, 200), tasks, engine: String(p?.pane_kind ?? ""), cwd: String(p?.worktree_path ?? ""), write: true });
        const now = Date.now();
        setTurns((ts) => [...ts, { kind: "note", seq: (ts[ts.length - 1]?.seq ?? 0) + 0.5, t: now, text: jobs.length ? `⚉ ${tasks.map((x) => x.title.replace(/^⚉ /, "")).join(", ")} spawned as ${jobs.length === 1 ? "an isolated sub-agent" : `${jobs.length} isolated sub-agents`} in this box — the report lands here when it is done` : "could not spawn the specialist — is the serve running?", tone: jobs.length ? "ok" : "bad" }]);
      } finally { setSending(false); }
      return;
    }
    // the context first — `#` cells (on screen as they are, agents as transcripts, off-screen widgets ghost-rendered
    // once), `@agent` chats, the pinned refs — so it rides whichever door the ask goes through: Heimdall or the agent
    setSending(true);
    try {
      const widgetsMd = await widgetsContextAsync(t, { refables: threadRefables, ghost: ghostCell, transcriptOfKey });
      const agentsMd = (await Promise.all(ats.filter((a) => a.kind === "agent").map(async (a) => { const tr = await transcriptOf(Number(a.id)).catch(() => null); return transcriptSection(a.label, tr?.name ?? a.label, tr?.transcript ?? "(the chat could not be read)"); }))).join("\n\n");
      const ask = askText(t);
      const episodesMd = episodes ? episodesContext(t, episodes) : "";
      const extraMd = [widgetsMd, agentsMd, episodesMd].filter((x) => x.trim()).join("\n\n");
      let full = withContext(ask, [], "", "", extraMd);
      if (refs.length) {
        const { references, attachments } = buildRefPayload(refs);
        try { const r: any = await apiPost(`/api/v1/cockpit/agent/context`, { references, attachments }, { timeoutMs: 30_000 }); const d = r?.result ?? r; full = withContext(ask, refs, String(d?.references_md ?? ""), String(d?.attachments_md ?? ""), extraMd); } catch { /* the ask goes without the resolver's text */ }
      }
      // THE ASK APPEARS THE MOMENT IT IS SENT (operator 2026-09-25: "the chat shows nothing, even my prompt").
      // Every turn in this pane used to come from the serve's event log, so nothing was drawn until the engine
      // echoed the ask back. On the Heimdall door that echo comes only once a model has been picked and started
      // — the rail visibly blinked while the transcript stayed empty, which reads as a send that did nothing.
      // The placeholder is adopted by the real event when it lands (applyEvent above), never duplicated.
      setTurns((ts) => [...ts, { kind: "user", seq: (ts[ts.length - 1]?.seq ?? 0) + 0.5, t: Date.now(), text: ask, pending: true }]);
      // THE FRONT (serve/src/front.rs, operator 2026-09-29: "go" reached a chat that had never heard of the run it was answering). Closed replies -
      // go / yes / cancel / a chip - are state transitions resolved in code; a short referring message after a run becomes a typed intent a low
      // model wrote and code linted. `handled`: the serve did it. A `task`: Heimdall gets the self-contained ask the conversation settled. Any
      // failure is the ordinary road - the front is an aid, never a gate.
      let askEff = ask; let fullEff = full; let front = { kind: "", source: "" };
      try {
        const f: any = await apiPost(`/api/v1/cockpit/agent/front`, { pane_id: p.id, text: ask }, { timeoutMs: 90_000 });
        const d = f?.result ?? f;
        if (d?.handled) return;
        if (d?.kind === "task" && typeof d.ask === "string" && d.ask.trim()) { askEff = d.ask.trim(); fullEff = withContext(askEff, [], "", "", extraMd); }
        front = { kind: String(d?.kind ?? ""), source: String(d?.source ?? "") };
      } catch { /* ordinary road */ }
      // the layer's verdict, when it is sure: a TASK goes to Heimdall however short; CHAT (an acknowledgement, a pleasantry) is never planned
      if (front.kind !== "chat" && onSubmit && onSubmit(askEff, fullEff, front.kind === "task")) return; // Heimdall took it — with the same context (2026-09-21: `#` used to ride only on a direct send)
      await apiPost(`/api/v1/cockpit/agent/send`, { pane_id: p.id, text: fullEff, display: ask }, { timeoutMs: 60_000 });
    } finally { setSending(false); }
  };
  const running = !!status?.running; const busy = !!status?.busy;
  busyRef.current = busy; sendRef.current = send;
  React.useEffect(() => {
    if (!outbox.length || busy || sending) return;
    const [next, ...rest] = outbox; setOutbox(rest); void sendRef.current(next);
  }, [outbox, busy, sending]);
  const model = String(status?.model ?? "").replace(/^claude-/, "");
  const engine = String(p?.pane_kind ?? "");
  const exchanges = groupExchanges(turns, looksLikeTask(routes));
  const homes = resultHomes(exchanges, routes);   // where each run's RESULT is drawn: after the last thing the operator said before it landed
  // THE END OF EVERYTHING (operator 2026-10-08): the details under an answer start folded, except on the last block once nothing
  // is moving - not the agent, not a send in flight, not a run (or its QA) - and that block's line is the thread's TOTAL.
  const idle = threadIdle({ busy, sending, routes });
  const threadTotal = totalLine(sumMeta(exchanges.map(metaOf)));
  const sessionCost = Number(status?.cost_usd) || 0;
  const replies = turns.filter((t) => t.kind === "assistant").length;
  const tone = (x?: string) => (x === "ok" ? C.ok : x === "warn" ? C.warn : x === "bad" ? C.bad : C.dim);
  const routeFor = (text: string) => routeForText(routes, text);
  // CONFIDENCE AS A NUMBER, WITH ITS PROVENANCE (operator 2026-09-25: "every answer of AI should show
  // confidence %"). Measured where the record has runs behind the routing choice; the model's own word where
  // it does not; nothing at all where there is neither — because a made-up percentage beside a real one is
  // indistinguishable from it, and this pane has already shipped two numbers that were confidently wrong.
  const routeLineOf = (text: string) => {
    const route = routeFor(text);
    if (!route?.route) return null;
    const c = confidenceOf(route.route, { runs: Number((route as { runs?: number }).runs) || 0 });
    return `⚡ ${route.route.delegate ? `${route.tasks.length} sub-agents` : "one job"} · tier ${route.route.tier}${c ? ` · ${confidenceLabel(c)}` : ""}`;
  };
  const routeWhyOf = (text: string) => {
    const route = routeFor(text);
    if (!route?.route) return undefined;
    const c = confidenceOf(route.route, { runs: Number((route as { runs?: number }).runs) || 0 });
    return c?.why;
  };
  const T = theme;
  const minSv = minSavings(routes); // MIN's column: what the turns taken with exploration off saved (an estimate)
  const minLabel = minSv.turns ? `MIN $${minSv.saved.toFixed(2)}` : "MIN";
  // WHAT HEIMDALL SAVED, ON THE BUTTON (operator 2026-09-22: "one feature of heimdall at chats should be added on
  // the heimdall button the same way on the agents — the saved money value"). Two different numbers, never added
  // together: the routed runs' saving is arithmetic (the tokens that ran, priced at the models that ran them,
  // against the same tokens at the baseline model), and MIN's is an estimate (the measured 50% exploration share
  // put back). A chat only ever produces the second — every chat turn is a MIN turn — so a chat shows "~$".
  // WHO IS ACTUALLY WORKING (2026-09-26). The chameleon changes form silently unless you open the run log; while an
  // ask is in flight the header answers "who is writing this" without a click — the role AND the merge under it.
  const pairSides = (pairLabel && pairLabel !== "solo") ? pairLabel.split(" × ") : [];
  // the live role wins while routing is on, because that is the one that changed most recently; a PINNED role
  // (routing off) is the operator's own choice and nothing may move it.
  const shownRole = React.useMemo(() => shownRoleOf(rolesOn, liveRole, roles, currentRole), [rolesOn, liveRole, roles, currentRole]);
  const working = workingLine(shownRole, pairSides.length ? { brain: pairSides[0], hands: pairSides[1] ?? null } : null, !!busyHint);
  const savedTag = heimdallSaved > 0 ? ` $${heimdallSaved.toFixed(2)}` : minSv.saved > 0 ? ` ~$${minSv.saved.toFixed(2)}` : "";
  const savedWhy = heimdallSaved > 0
    ? `saved $${heimdallSaved.toFixed(2)} on this pane — the tokens that ran, priced at the models that ran them, against the same tokens at the baseline model (API-equivalent, arithmetic)`
    : minSv.saved > 0
      ? `≈ $${minSv.saved.toFixed(2)} saved over ${minSv.turns} MIN turn${minSv.turns === 1 ? "" : "s"} — an estimate: the same turns with exploration on, using the measured 50% share`
      : "";
  const ghost: React.CSSProperties = { background: "transparent", border: "none", color: T.muted, cursor: "pointer", width: 28, height: 28, borderRadius: 7, display: "grid", placeItems: "center", fontSize: 14 };
  // THE TIMELINE MOVED HERE (operator 2026-09-26: "take out timeline icon from the switcher and place it on the
  // header of the agent"). It belongs beside the work it narrates: the timeline is this agent's reads, writes,
  // refusals and verdicts, and it was sitting in a global header two screens away from any of them.
  const timelineButton = <AgentsTimeline variant="icon" />;
  // NO PER-AGENT THEME ANY MORE (operator 2026-09-27: "the theme button is not required on the agent anymore, we
  // will use the theme of antiloki settings"). The 🎨 picker made every agent dress differently, which was worth
  // something when the sidebar held a ROSTER and a glance had to tell them apart. There is one agent now, so the
  // only thing it distinguished was the app from itself. The theme is antiloki's, set once in Settings.
  //
  // `agent-themes` stays where it is: `engineTheme` still colours a face and an accent by provider, and the stored
  // per-pane key is still READ, so a pane themed before today keeps its look until Settings says otherwise. What is
  // gone is the control that let this screen set it.
  // THE THEME BUTTON IS BACK (operator 2026-09-28: "add all agents theme back, the agent theme button — look on git"). Restored from d002c85^.
  const themeButton = (
    <span style={{ position: "relative" }}>
      <button data-testid="agent-theme" onClick={() => setThemeOpen((o) => !o)} title={`theme: ${T.label} — ${T.hint}`} style={{ ...ghost, fontSize: 13 }}>🎨</button>
      {themeOpen && (
        <div data-testid="agent-theme-menu" onMouseLeave={() => setThemeOpen(false)} style={{ position: "absolute", right: 0, bottom: "100%", marginBottom: 6, zIndex: 20, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, padding: 4, display: "flex", flexDirection: "column", width: 260, maxWidth: "80vw", maxHeight: "min(420px, 60vh)", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}>
          {AGENT_THEME_KEYS.map((k) => <button key={k} data-testid={`agent-theme-${k}`} onClick={() => pickTheme(k)} title={AGENT_THEMES[k].hint} style={{ textAlign: "left", background: k === themeKey ? `color-mix(in oklab, ${T.accent} 16%, transparent)` : "transparent", border: "none", color: T.fg, cursor: "pointer", padding: "5px 8px", borderRadius: 5, fontFamily: AGENT_THEMES[k].font, fontSize: 11.5 }}>{k === themeKey ? "● " : "○ "}{AGENT_THEMES[k].label}<span style={{ opacity: 0.55, fontSize: 9.5 }}> — {AGENT_THEMES[k].hint}</span></button>)}
        </div>
      )}
    </span>
  );
  const tray = refs.length > 0 && (
    <div data-testid="agent-refs" style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "0 2px 4px" }}>
      {refs.map((r) => <span key={refKey(r)} style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, border: `1px solid ${T.accent}`, borderRadius: 999, padding: "1px 8px", display: "inline-flex", gap: 6, alignItems: "center" }}>{trayLabel(r)}<span onClick={() => setRefs((rs) => rs.filter((x) => refKey(x) !== refKey(r)))} style={{ cursor: "pointer", opacity: 0.7 }}>✕</span></span>)}
    </div>
  );
  const mention = (
    <MentionInput value={draft} onChange={setDraft} onEnter={(text: string) => void send(text)} editorRef={editorRef} disabled={!!busyHint} hint={sendHint}
      refs={refs} refKey={refKey as any} trayLabel={trayLabel as any} sessionRefables={refables} atExtras={atExtras}
      bangItems={episodes ? episodes.filter((e) => episodes.some((x) => x.n === e.n + 1)).reverse().map((e) => ({ label: `episode #${e.n}${e.title ? ` — ${e.title}` : ""}`, refId: `episode:${e.n}`, hint: `${e.turns} turn${e.turns === 1 ? "" : "s"}`, token: `!episode:${e.n} (episode #${e.n})` })) : undefined}
      placeholder={busyHint ? busyHint : chat ? (heimdallOn ? "Message antiloki…  Heimdall routes it first (@ context · # widget · ! episode)" : "Message antiloki…  (@ context · # widget · ! episode)") : T.composer.placeholder || (heimdallOn ? "Heimdall routes it first…" : "…")} />
  );
  // the @ wizard left with the @ button (2026-09-21): the context lives in ⚙ › context; typing @ opens the references

  // ── a themed personality ──
  const transcript = T.layout === "transcript";
  const btn: React.CSSProperties = T.key === "xp"
    ? { fontFamily: T.font, fontSize: 11, background: "linear-gradient(#fff, #ece9d8)", border: "1px solid #003c74", borderRadius: 3, padding: "2px 12px", cursor: "pointer", color: "#000", boxShadow: "inset 1px 1px #fff" }
    : T.key === "windows" ? { fontFamily: T.font, fontSize: 12, background: T.accent, border: `1px solid ${T.accent}`, borderRadius: 4, padding: "4px 14px", cursor: "pointer", color: "#fff" }
    : T.key === "mac" ? { fontFamily: T.font, fontSize: 14, background: T.accent, border: "none", borderRadius: 14, width: 28, height: 28, cursor: "pointer", color: "#fff", display: "grid", placeItems: "center" }
    : T.key === "linux" ? { fontFamily: T.font, fontSize: 12.5, background: T.accent, border: "none", borderRadius: 6, padding: "5px 14px", cursor: "pointer", color: "#fff" }
    : { fontFamily: T.mono, fontSize: 11, background: "transparent", border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "2px 10px", cursor: "pointer", color: T.accent };
  const small: React.CSSProperties = { fontFamily: T.mono, fontSize: Math.max(9.5, T.size - 2.5), color: T.dim };
  // THE SPLIT (operator 2026-09-23: "widgets as message but a button on them to open in split screen with the
  // chat"). One widget at a time, beside the conversation, half the screen each — the whole of what threads used to
  // do, with nothing to compose. The pane renders the chat it always rendered; the half is a sibling.
  const splitHalf = widgetSplit ?? null;
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", minWidth: 0 }}>
    <div data-testid="agent-chat" data-theme={T.key} style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column", background: T.bg, color: T.fg }}>
      <LinkBanner link={link} error={startErr} />
      <Chrome theme={T}>
        {/* NO ▶ START, NO ⏹ STOP, NO "○ idle" (operator 2026-09-27: "The agent is always ON. ALWAYS. THERE IS NO
            START OR STOP"). The serve starts the engine on the first message and resumes it after a restart; a
            button that says otherwise describes a machine the operator does not have to operate. The row is gone
            from this chrome exactly as it is from the chat one — the model and the cost are on the stats box. */}
        <div ref={listRef} onScroll={onScroll} data-testid="agent-turns" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: transcript ? "8px 12px" : "10px 14px", display: "flex", flexDirection: "column" }}>
          {!turns.length && mainAgent && <MainWelcome font={T.mono} />}
          {!turns.length && !mainAgent && <div style={{ margin: "auto", ...small, fontSize: T.size - 1, textAlign: "center", lineHeight: 1.6 }}>{transcript ? `${T.composer.prompt}${running ? "say what the agent should do" : "the agent starts with your first message"}` : running ? "Say what the agent should do." : "The agent starts with your first message."}</div>}
          {exchanges.map((x, i) => {
            const lastX = i === exchanges.length - 1;
            const ask = x.user?.text ?? x.task?.text; const askT = x.task?.text ?? x.user?.text;   // the human's words, else the organised task: either names the run
            return <ThemedExchange key={i} isLast={lastX} final={lastX && idle} total={lastX && idle ? threadTotal : null} homed={homes.get(i) ?? []} routes={routes} x={x} theme={T} routeLine={(ask ? routeLineOf(ask) : null) ?? (askT ? routeLineOf(askT) : null)} routeWhy={(ask ? routeWhyOf(ask) : undefined) ?? (askT ? routeWhyOf(askT) : undefined)} paneId={p.id} onSide={onSide} />;
          })}
          {/* the same live part as antiChat's chrome, in every theme: the question to answer here, the working line */}
          {routes.filter((r) => r.status === "awaiting-answers").map((r) => <ScreeningCard key={r.id} run={r} paneId={p.id} onChanged={onRoutesChanged} />)}
          <OutboxList items={outbox} onCancel={(i) => setOutbox((o) => outboxWithout(o, i))} onMove={(i, d) => setOutbox((o) => outboxMoved(o, i, d))} /><LiveLine run={liveRunOf(routes)} since={(() => { const lr = liveRunOf(routes); if (lr) return lr.started ?? lr.created; const lu = [...exchanges].reverse().find((e) => e.user)?.user?.t; return Number(lu) || Date.now(); })()} agentBusy={busy || sending} />
        </div>
        <div style={{ flexShrink: 0, padding: transcript ? "6px 12px 8px" : "8px 12px 12px", borderTop: transcript ? `1px solid ${T.border}` : "none", background: T.key === "mac" ? "#fff" : T.key === "windows" ? "#f3f3f3" : "transparent" }}>
          {tray}
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.composer.bg, border: `1px solid ${T.composer.border}`, borderRadius: T.composer.radius, padding: transcript ? "6px 10px" : "6px 12px", boxShadow: T.key === "xp" ? "inset 1px 1px #7f9db9" : undefined }}>
            {T.composer.prompt && <span style={{ fontFamily: T.mono, fontSize: T.size, color: T.accent, alignSelf: "flex-start", paddingTop: 2 }}>{T.composer.prompt}</span>}
            <div style={{ flex: 1, minWidth: 0, fontFamily: T.font, fontSize: T.size, color: T.fg }}>{mention}</div>
            <button data-testid="agent-attach" onClick={() => void attach()} disabled={attaching} title="⊕ attach a file — the OS dialog: a file of this box rides on the ask as @file and joins the edit scope; any other file is attached as a document" style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 14, fontFamily: T.mono, opacity: attaching ? 0.5 : 1 }}>{attaching ? "…" : "⊕"}</button>
            <input ref={fileInput} type="file" hidden onChange={(e) => void onBrowserFile(e.target.files?.[0])} />
            {themeButton}
            {timelineButton}
            {(T.composer.button || !transcript) && <button data-testid="agent-send" disabled={!draft.trim() || sending || !!busyHint} onClick={() => void send(draft)} style={{ ...btn, opacity: !draft.trim() || sending || busyHint ? 0.5 : 1 }}>{T.composer.button ?? "Send"}</button>}
          </div>
          <div style={{ display: "flex", gap: 10, rowGap: 2, flexWrap: "wrap", alignItems: "center", ...small, marginTop: 4 }}>
            <span>{T.composer.hint}</span><span style={{ flex: 1 }} /><CommitPushButton paneId={p?.id} /><EpisodeButton paneId={p?.id} />{onTogglePreview && <ModeToggle testId="agent-preview" on={previewOn} color={"#3fb26f"} off={T.dim} font={T.mono} onClick={onTogglePreview} title={previewOn ? "preview is on — click to close the linked run cell" : "preview: a linked run cell of this worktree, at the side"}>▶ preview</ModeToggle>}
            {/* QA and sub-agents are no longer chips of their own: both are switches inside Heimdall's menu (2026-09-22) */}
            {roles.length > 0 && <RoleSwitcher roles={roles} current={shownRole} auto={rolesOn} why={roleWhy} onPick={onPickRole} font={T.mono} colors={{ fg: T.fg, dim: T.dim, panel: T.panel, border: T.border, accent: T.accent }} />}
            {working && <span data-testid="agent-working-line" style={{ fontFamily: T.mono, fontSize: 11, color: T.dim, marginRight: 6 }}>{working}</span>}
            {onToggleHeimdall && <HeimdallChip menu={onDialChange && onHeimdallMode ? { dial: dial ?? { position: 1, context: 1, cost: 1 }, onChange: onDialChange, mode: heimdallMode ?? (heimdallOn ? "auto" : "off"), onMode: onHeimdallMode, qa: qaOn, onQa: onToggleQa, roles: rolesOn, onRoles: onToggleRoles, gates, onGate, subagents: subagentsOn, onSubagents: onToggleSubagents, savedWhy, pairLabel, font: T.mono, colors: { accent: T.accent, track: `color-mix(in oklab, ${T.fg} 12%, transparent)`, knob: T.fg, panel: T.panel, border: T.border, fg: T.fg, dim: T.dim } } : null}><ModeToggle testId="agent-heimdall-chip" on={heimdallOn} color={T.accent} off={T.dim} font={T.mono} onClick={onHeimdallMode ? undefined : onToggleHeimdall} title={onHeimdallMode ? undefined : heimdallOn ? "Heimdall reads every ask first — click to turn off" : "Heimdall is off — click to turn on"}>⚡ heimdall{onHeimdallMode ? ` ${(heimdallMode ?? (heimdallOn ? "auto" : "off")).toUpperCase()}` : ""}{savedTag}</ModeToggle></HeimdallChip>}
            {/* THE ENGINE SWITCH IS BACK (Grokbot QA 2026-10-12, item 6: "no way to change an existing agent's engine"): commit 1f8aa9c removed the only place it was drawn, with the antiChat chrome it sat in. */}
            {chatSwitch && <ProviderSwitch sw={chatSwitch} engine={engine} open={providerOpen} setOpen={setProviderOpen} />}
            {!onDialChange && onDial && <Dial value={minOn ? "min" : maxOn ? "max" : "scope"} onChange={onDial} minLabel={minLabel} font={T.mono} colors={{ min: "#3fb26f", scope: T.fg, max: "#c94a3a" }} off={T.dim} />}
          </div>
        </div>
      </Chrome>
    </div>
    {splitHalf}
    </div>
  );
}
