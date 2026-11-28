// studio-kit — the shared visual kit for the Studio (the in-chat overlay AND the notebook research view):
// a generator CARD with a sample thumbnail, a name, a collapsible "what it does", and a spinning loading
// border. One place so both surfaces stay consistent.
import React from "react";
import { C, mono } from "@/loki/theme";

const sv = { width: "100%", height: 44 } as any;
const bar = (x: number, y: number, w: number, c: string, o = 0.8) => <rect x={x} y={y} width={w} height="4" rx="2" fill={c} opacity={o} />;
const DocSample = () => (<svg viewBox="0 0 120 44" style={sv}>{bar(12, 8, 40, C.brand)}{bar(12, 18, 96, C.dim, 0.5)}{bar(12, 26, 88, C.dim, 0.5)}{bar(12, 34, 70, C.dim, 0.5)}</svg>);
const DiagramSample = () => (<svg viewBox="0 0 120 44" style={sv}><rect x="8" y="15" width="24" height="14" rx="3" fill="none" stroke={C.brand} /><rect x="48" y="5" width="24" height="14" rx="3" fill="none" stroke={C.brand} /><rect x="48" y="25" width="24" height="14" rx="3" fill="none" stroke={C.dim} /><rect x="88" y="15" width="24" height="14" rx="3" fill="none" stroke={C.brand} /><line x1="32" y1="22" x2="48" y2="13" stroke={C.dim} /><line x1="32" y1="22" x2="48" y2="32" stroke={C.dim} /><line x1="72" y1="13" x2="88" y2="22" stroke={C.dim} /></svg>);
const CodeSample = () => (<svg viewBox="0 0 120 44" style={sv}>{bar(10, 7, 54, "oklch(0.78 0.13 300)")}{bar(20, 15, 80, "oklch(0.80 0.12 150)")}{bar(20, 23, 44, C.dim, 0.6)}{bar(10, 31, 62, "oklch(0.82 0.10 65)")}</svg>);
const ImprovementsSample = () => (<svg viewBox="0 0 120 44" style={sv}><rect x="8" y="7" width="48" height="30" rx="3" fill="none" stroke="oklch(0.7 0.12 25)" opacity="0.7" />{bar(14, 15, 34, "oklch(0.7 0.12 25)", 0.6)}{bar(14, 25, 26, "oklch(0.7 0.12 25)", 0.6)}<rect x="64" y="7" width="48" height="30" rx="3" fill="none" stroke={C.ok} opacity="0.8" />{bar(70, 15, 34, C.ok, 0.7)}{bar(70, 25, 30, C.ok, 0.7)}</svg>);
const MindmapSample = () => (<svg viewBox="0 0 120 44" style={sv}><circle cx="60" cy="22" r="7" fill="none" stroke={C.brand} /><circle cx="20" cy="11" r="4" fill="none" stroke={C.dim} /><circle cx="20" cy="33" r="4" fill="none" stroke={C.dim} /><circle cx="100" cy="11" r="4" fill="none" stroke={C.dim} /><circle cx="100" cy="33" r="4" fill="none" stroke={C.dim} /><line x1="53" y1="19" x2="24" y2="12" stroke={C.dim} /><line x1="53" y1="25" x2="24" y2="32" stroke={C.dim} /><line x1="67" y1="19" x2="96" y2="12" stroke={C.dim} /><line x1="67" y1="25" x2="96" y2="32" stroke={C.dim} /></svg>);
const QuizSample = () => (<svg viewBox="0 0 120 44" style={sv}><text x="10" y="27" fontSize="20" fill={C.brand} fontFamily="monospace">?</text>{bar(34, 11, 76, C.dim, 0.5)}<rect x="34" y="21" width="76" height="6" rx="3" fill="none" stroke={C.ok} opacity="0.7" />{bar(34, 33, 60, C.dim, 0.5)}</svg>);
const FlashSample = () => (<svg viewBox="0 0 120 44" style={sv}><rect x="30" y="5" width="60" height="30" rx="4" fill="none" stroke={C.dim} opacity="0.5" /><rect x="24" y="9" width="60" height="30" rx="4" fill={C.panel2} stroke={C.brand} />{bar(32, 21, 44, C.brand, 0.6)}</svg>);
const TableSample = () => (<svg viewBox="0 0 120 44" style={sv}><rect x="10" y="7" width="100" height="30" rx="2" fill="none" stroke={C.dim} opacity="0.6" /><line x1="10" y1="17" x2="110" y2="17" stroke={C.brand} opacity="0.6" /><line x1="44" y1="7" x2="44" y2="37" stroke={C.dim} opacity="0.4" /><line x1="77" y1="7" x2="77" y2="37" stroke={C.dim} opacity="0.4" /></svg>);
const TimelineSample = () => (<svg viewBox="0 0 120 44" style={sv}><line x1="12" y1="22" x2="108" y2="22" stroke={C.dim} /><circle cx="24" cy="22" r="4" fill={C.brand} /><circle cx="60" cy="22" r="4" fill={C.brand} opacity="0.7" /><circle cx="96" cy="22" r="4" fill={C.dim} /></svg>);
// inputs → steps → outputs: the SHAPE of the logic before any code exists.
const LogicSample = () => (<svg viewBox="0 0 120 44" style={sv}><rect x="8" y="16" width="20" height="12" rx="2" fill="none" stroke={C.dim} /><rect x="40" y="9" width="40" height="10" rx="2" fill="none" stroke={C.brand} />{bar(45, 25, 30, "oklch(0.80 0.15 150)", 0.7)}<rect x="92" y="16" width="20" height="12" rx="2" fill="none" stroke={C.brand} /><line x1="28" y1="22" x2="40" y2="15" stroke={C.dim} /><line x1="80" y1="14" x2="92" y2="22" stroke={C.dim} /></svg>);

const SAMPLE: Record<string, any> = {
  diagram: <DiagramSample />, code: <CodeSample />, improvements: <ImprovementsSample />, logic: <LogicSample />,
  mindmap: <MindmapSample />, quiz: <QuizSample />, flashcards: <FlashSample />,
  table: <TableSample />, timeline: <TimelineSample />,
  // ANTIIDE deterministic panels (reuse the closest existing thumbnail)
  "atlas-graph": <DiagramSample />, "atlas-authors": <MindmapSample />, "atlas-review": <ImprovementsSample />,
  "atlas-xray": <TableSample />, "atlas-docs": <DocSample />, "atlas-constitution": <DocSample />, "skill-library": <DocSample />, "shared-diff": <TableSample />, "automation": <TableSample />,
  // ANTIVIBE standalone session tools
  "vibe-kanban": <TableSample />, "vibe-issues": <TableSample />, "vibe-sketch": <DiagramSample />, "vibe-todo": <QuizSample />, "vibe-notes": <DocSample />,
  // ANTIIDE code + git reads
  "atlas-code": <CodeSample />, "atlas-git": <TimelineSample />, "design-view": <DocSample />, "design-frames": <DocSample />,
};
export const sampleFor = (k: string) => SAMPLE[k] || <DocSample />;

export const DESC: Record<string, string> = {
  diagram: "An architecture / data-flow diagram — boxes and labeled arrows.",
  code: "A real, line-numbered code excerpt from the most relevant file.",
  improvements: "Concrete before/after suggestions, grounded in real source.",
  logic: "The shape of a change — inputs → steps → outputs — designed before any code exists.",
  overview: "A high-level overview of the scoped sources.",
  briefing: "An executive briefing of the scoped material.",
  walkthrough: "A step-by-step walkthrough of how it works.",
  onboarding: "An onboarding guide for someone new to this.",
  faq: "Frequently-asked questions, answered from the sources.",
  glossary: "The key terms, defined.",
  runbook: "An operational runbook.",
  adr: "An architecture decision record.",
  testplan: "A test plan for the scoped material.",
  eli5: "Explained simply — like you're five.",
  table: "An info table of the structured facts.",
  slides: "A slide deck summarizing the scope.",
  timeline: "A timeline of the relevant events.",
  questions: "Open questions worth resolving.",
  risks: "Risks and how to mitigate them.",
  critique: "A critical review of the material.",
  mindmap: "A mind map of the concepts and how they relate.",
  quiz: "A quiz to check understanding.",
  flashcards: "Flippable study flashcards.",
  compare: "Compare this notebook with another.",
  // ANTIIDE — deterministic panels reused inline; $0, instant, no model call.
  "atlas-review": "The court-grade file review — health + ranked findings, straight from the atlas. $0. (check a file on the left)",
  "atlas-graph": "The whole import graph — every file and connection, deterministic. $0.",
  "atlas-diagram": "The system design — the antiIDE architecture diagram: boxes + arrows, navigate folders, drill into a file's internals. $0.",
  "atlas-authors": "Ownership: the author↔file graph, profiles, co-dependency and bus-factor. $0.",
  "atlas-xray": "The riskiest files, smells and the repo digest — deterministic. $0.",
  "atlas-docs": "The self-generated docs for a page (folder or file). $0. (check a file to scope it)",
  "atlas-constitution": "The laws book — optionally scoped to one file. $0. (check a file to scope it)",
  "skill-library": "Teachable agent skills — when-to-use index + method + runnable assets. Materializes into agent worktrees; indexes into the chat AI. $0.",
  "shared-diff": "The cross-agent git view — files×agents matrix, deterministic conflicts (merge-tree), integration order, and the merge-agent spawner. $0.",
  "automation": "antiFlow — the automation pipeline: the driver's queue (next card, why the others wait) and every active card moving through PL → TL → DEV → QA → MAN → GIT. Live.",
  // ANTIVIBE — standalone session tools; inline, durable, never sent to the AI.
  "vibe-issues": "Issues — one Linear-style tracker for the session: a list by status or a board, with priorities. Inline & yours.",
  "vibe-todo": "A checkable session todolist — add, check off, clear. Inline & yours.",
  "vibe-kanban": "Your Trello for the session — cards across To do / Doing / Done. Inline & yours.",
  "vibe-notes": "A private annotation pad — jot reminders and decisions. Inline & yours.",
  "vibe-sketch": "A quick sketch pad — draw ideas inline. Yours.",
  "atlas-code": "The read-only mini-IDE — the Code screen's tree + viewer, inline. $0.",
  "design-view": "antiIDE's Design screen, one tab per widget. $0.",
  "design-frames": "The captured screens as editable frames — Figma over your real DOM. $0.",
  "atlas-git": "The codebase git graph — branches + history, inline. $0.",
  // ANTIVIBE execution + pipeline panels — inline via the generic cockpit-pane widget.
  shell: "A real terminal (a PTY in the workspace). Inline.",
  run: "Boot the dev server + a live preview. Inline.",
  design: "The running app as a design canvas. Inline.",
  intent: "Capture the intent of a change — the ask, before any code. Inline.",
  shape: "The RFC Drawer — grow the plan tree, resolve the paths, press the RFC. Inline.",
  judgment: "Judge the results — the reviewer's verdict. Inline.",
  fuel: "The session's cost + token fuel gauge. Inline.",
  context: "The shared context / knowledge docs. Inline.",
  standup: "Every agent reports done / now / blocked. Inline.",
  diff: "Every pane's diff in one seat. Inline.",
  state: "The super-session dashboard. Inline.",
  gate: "The quality gate — build + test verdicts. Inline.",
  chat: "antiChat — the conversation with antiloki: ask, @ context, # widgets; the sessions live in its own sidebar. Inline.",
  // the CLI agents — a real terminal (PTY) per pane, BYOK-proxied. Inline.
  opencode: "The OpenCode CLI in a terminal, BYOK-proxied. Inline.",
  "claude-code": "Claude Code on your subscription, in a terminal. Inline.",
  codex: "The OpenAI Codex CLI, in a terminal. Inline.",
  // these need a provisioned worktree + agent turn-loop → open in the cockpit.
  script: "Run a build / dev / test script live. → opens in the cockpit.",
  agent: "The native antiloki agent (worktree + staged edits + merge gate). → opens in the cockpit.",
};

export const STUDIO_CSS = `
@keyframes studioSpin { to { transform: rotate(1turn); } }
.studio-card { position: relative; transition: border-color .15s, transform .1s; }
.studio-card:hover { border-color: ${C.brand}; transform: translateY(-1px); }
.studio-card.loading::after {
  content:""; position:absolute; inset:0; border-radius:10px; padding:1.5px; pointer-events:none;
  background: conic-gradient(transparent 0 62%, ${C.brand} 80%, transparent 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  animation: studioSpin 1.05s linear infinite;
}`;

export function GenCard({ k, label, desc, sample, busy, disabled, selected, onClick }: any) {
  const [open, setOpen] = React.useState(false);
  const d = desc ?? DESC[k] ?? "";
  return (
    <div className={`studio-card${busy ? " loading" : ""}`} style={{ border: `1px solid ${selected ? C.brand : C.border}`, borderRadius: 10, overflow: "hidden", background: selected ? `color-mix(in oklab, ${C.brand} 7%, ${C.bg})` : C.bg, opacity: disabled && !busy ? 0.5 : 1 }}>
      <div onClick={disabled ? undefined : onClick} style={{ cursor: disabled ? "default" : "pointer" }}>
        <div style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "center", padding: "2px 8px", background: C.panel2, borderBottom: `1px solid ${selected ? C.brand : C.border}` }}>{sample ?? sampleFor(k)}</div>
      </div>
      <div style={{ padding: "5px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span onClick={disabled ? undefined : onClick} style={{ fontFamily: mono, fontSize: 10.5, color: selected ? C.brand : C.fg, fontWeight: 600, flex: 1, cursor: disabled ? "default" : "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected ? "✓ " : ""}{label}</span>
          {d && <button onClick={() => setOpen((o) => !o)} title="what it does" style={{ width: 15, height: 15, borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.dim, cursor: "pointer", fontSize: 9, lineHeight: "13px", padding: 0, fontFamily: mono, flexShrink: 0 }}>{open ? "–" : "i"}</button>}
        </div>
        {open && d && <div style={{ marginTop: 5, fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 10, color: C.muted, lineHeight: 1.5 }}>{d}</div>}
      </div>
    </div>
  );
}
