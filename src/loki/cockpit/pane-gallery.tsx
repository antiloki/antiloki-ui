// PANE GALLERY (operator 2026-07-12: "redesign the add pane window to be a
// complete wizard with all options and each option with a mini image").
// The widget-studio GenCard pattern, applied to vibe panes: one card per pane
// kind with an SVG mini-image that symbolizes it, a label, and a collapsible
// "what it does". Selecting a card drives the config below (in cockpit-view).
import * as React from "react";
import { C, mono } from "@/loki/theme";

const sv = { width: "100%", height: 42 } as React.CSSProperties;
const bar = (x: number, y: number, w: number, c: string, o = 0.8) => <rect key={`${x}-${y}`} x={x} y={y} width={w} height="3.5" rx="1.75" fill={c} opacity={o} />;

// ── the mini-images, one per pane kind ──────────────────────────────────────
const AgentSample = () => (<svg viewBox="0 0 120 42" style={sv}><rect x="46" y="6" width="28" height="20" rx="5" fill="none" stroke={C.brand} /><circle cx="55" cy="16" r="2" fill={C.brand} /><circle cx="65" cy="16" r="2" fill={C.brand} /><line x1="60" y1="6" x2="60" y2="2" stroke={C.brand} /><circle cx="60" cy="2" r="1.6" fill={C.brand} /><path d="M52 30 h16 l-4 5 z" fill={C.brand} opacity="0.5" /></svg>);
const TerminalSample = (accent: string) => () => (<svg viewBox="0 0 120 42" style={sv}><rect x="14" y="6" width="92" height="30" rx="3" fill="#0b0f16" stroke={accent} /><path d="M22 16 l6 4 l-6 4" fill="none" stroke={accent} strokeWidth="1.6" />{bar(32, 22, 22, accent, 0.7)}{bar(22, 30, 40, C.dim, 0.5)}</svg>);
const ScriptSample = () => (<svg viewBox="0 0 120 42" style={sv}><circle cx="60" cy="21" r="13" fill="none" stroke={C.ok} /><path d="M56 15 l10 6 l-10 6 z" fill={C.ok} /></svg>);
const GitSample = () => (<svg viewBox="0 0 120 42" style={sv}><line x1="40" y1="8" x2="40" y2="34" stroke={C.dim} /><circle cx="40" cy="10" r="3.5" fill="none" stroke={C.brand} /><circle cx="40" cy="21" r="3.5" fill="none" stroke={C.brand} /><circle cx="40" cy="33" r="3.5" fill="none" stroke={C.brand} /><path d="M40 21 q20 0 20 -11" fill="none" stroke={C.dim} /><circle cx="62" cy="10" r="3.5" fill="none" stroke={C.ok} /></svg>);
const ContextSample = () => (<svg viewBox="0 0 120 42" style={sv}><path d="M60 8 q-14 0 -14 10 q0 8 6 10 q0 6 8 6 q8 0 8 -6 q6 -2 6 -10 q0 -10 -14 -10 z" fill="none" stroke={C.brand} />{bar(52, 18, 16, C.brand, 0.5)}{bar(52, 24, 12, C.brand, 0.5)}</svg>);
const NotesSample = () => (<svg viewBox="0 0 120 42" style={sv}><rect x="42" y="6" width="30" height="30" rx="3" fill="none" stroke={C.warn} />{bar(47, 13, 20, C.warn, 0.7)}{bar(47, 20, 16, C.dim, 0.6)}{bar(47, 27, 18, C.dim, 0.6)}<path d="M66 6 l6 6 h-6 z" fill={C.warn} opacity="0.6" /></svg>);
const StateSample = () => (<svg viewBox="0 0 120 42" style={sv}><rect x="14" y="8" width="30" height="12" rx="2" fill="none" stroke={C.brand} /><rect x="48" y="8" width="30" height="12" rx="2" fill="none" stroke={C.ok} /><rect x="82" y="8" width="24" height="12" rx="2" fill="none" stroke={C.warn} /><rect x="14" y="24" width="92" height="10" rx="2" fill="none" stroke={C.dim} opacity="0.6" /></svg>);
const IdeSample = () => (<svg viewBox="0 0 120 42" style={sv}><rect x="14" y="6" width="26" height="30" rx="2" fill="none" stroke={C.dim} />{bar(18, 12, 14, C.dim, 0.6)}{bar(18, 18, 12, C.dim, 0.5)}{bar(18, 24, 14, C.dim, 0.5)}<rect x="44" y="6" width="62" height="30" rx="2" fill="#0b0f16" stroke={C.brand} />{bar(50, 12, 30, C.brand, 0.7)}{bar(50, 19, 44, C.dim, 0.5)}{bar(50, 26, 36, C.dim, 0.5)}</svg>);
const DiagramSample = () => (<svg viewBox="0 0 120 42" style={sv}><rect x="48" y="5" width="24" height="10" rx="2" fill="none" stroke={C.brand} /><rect x="22" y="27" width="24" height="10" rx="2" fill="none" stroke={C.ok} /><rect x="74" y="27" width="24" height="10" rx="2" fill="none" stroke={C.warn} /><line x1="55" y1="15" x2="38" y2="27" stroke={C.dim} /><line x1="65" y1="15" x2="82" y2="27" stroke={C.dim} /></svg>);
const GraphSample = () => (<svg viewBox="0 0 120 42" style={sv}><circle cx="40" cy="14" r="4" fill="none" stroke={C.brand} /><circle cx="70" cy="10" r="4" fill="none" stroke={C.ok} /><circle cx="88" cy="24" r="4" fill="none" stroke={C.warn} /><circle cx="54" cy="32" r="4" fill="none" stroke={C.dim} /><line x1="44" y1="15" x2="66" y2="11" stroke={C.dim} opacity="0.7" /><line x1="73" y1="13" x2="85" y2="21" stroke={C.dim} opacity="0.7" /><line x1="44" y1="17" x2="51" y2="29" stroke={C.dim} opacity="0.7" /><line x1="58" y1="30" x2="84" y2="26" stroke={C.dim} opacity="0.7" /></svg>);
const KanbanSample = () => (<svg viewBox="0 0 120 42" style={sv}><rect x="18" y="6" width="26" height="30" rx="2" fill="none" stroke={C.dim} /><rect x="48" y="6" width="26" height="30" rx="2" fill="none" stroke={C.brand} /><rect x="78" y="6" width="26" height="30" rx="2" fill="none" stroke={C.ok} />{bar(22, 12, 18, C.dim, 0.6)}{bar(22, 19, 18, C.dim, 0.5)}{bar(52, 12, 18, C.brand, 0.7)}{bar(82, 12, 18, C.ok, 0.6)}{bar(82, 19, 18, C.ok, 0.5)}</svg>);
const StandupSample = () => (<svg viewBox="0 0 120 42" style={sv}><path d="M22 12 l14 -6 v26 l-14 -6 z" fill="none" stroke={C.warn} /><rect x="14" y="14" width="8" height="10" rx="2" fill="none" stroke={C.warn} /><rect x="48" y="8" width="24" height="26" rx="2" fill="none" stroke={C.dim} />{bar(52, 14, 16, C.dim, 0.6)}{bar(52, 21, 12, C.dim, 0.5)}<rect x="78" y="8" width="24" height="26" rx="2" fill="none" stroke={C.dim} />{bar(82, 14, 16, C.dim, 0.6)}{bar(82, 21, 14, C.dim, 0.5)}</svg>);
const ShellSample = () => (<svg viewBox="0 0 120 42" style={sv}><rect x="20" y="6" width="80" height="30" rx="3" fill="#0b0f16" stroke={C.fg} /><path d="M28 16 l6 4 l-6 4" fill="none" stroke={C.ok} strokeWidth="1.6" />{bar(38, 22, 18, C.ok, 0.7)}<rect x="58" y="20" width="5" height="7" fill={C.ok} opacity="0.8" /></svg>);
const ReviewSample = () => (<svg viewBox="0 0 120 42" style={sv}><rect x="24" y="6" width="72" height="30" rx="3" fill="none" stroke={C.brand} /><line x1="60" y1="6" x2="60" y2="36" stroke={C.border} />{bar(30, 12, 22, C.ok, 0.8)}{bar(30, 19, 18, C.ok, 0.6)}{bar(66, 12, 22, C.bad, 0.8)}{bar(66, 19, 14, C.bad, 0.6)}{bar(30, 27, 20, C.dim, 0.5)}{bar(66, 27, 20, C.dim, 0.5)}</svg>);
const TodoSample = () => (<svg viewBox="0 0 120 42" style={sv}><rect x="34" y="7" width="7" height="7" rx="1.5" fill="none" stroke={C.ok} /><path d="M35.5 10.5 l2 2 l3.5 -4" fill="none" stroke={C.ok} strokeWidth="1.4" />{bar(47, 9, 36, C.dim, 0.5)}<rect x="34" y="19" width="7" height="7" rx="1.5" fill="none" stroke={C.muted} />{bar(47, 21, 40, C.fg, 0.7)}<rect x="34" y="31" width="7" height="7" rx="1.5" fill="none" stroke={C.muted} />{bar(47, 33, 30, C.fg, 0.7)}</svg>);
const RaceSample = () => (<svg viewBox="0 0 120 42" style={sv}><line x1="20" y1="10" x2="86" y2="10" stroke={C.brand} strokeWidth="2.5" strokeLinecap="round" /><line x1="20" y1="21" x2="72" y2="21" stroke={C.ok} strokeWidth="2.5" strokeLinecap="round" /><line x1="20" y1="32" x2="60" y2="32" stroke={C.warn} strokeWidth="2.5" strokeLinecap="round" /><path d="M92 4 v12 M92 4 h8 l-2.5 3 l2.5 3 h-8" fill="none" stroke={C.fg} /></svg>);
const TimelineSample = () => (<svg viewBox="0 0 120 42" style={sv}><line x1="30" y1="6" x2="30" y2="36" stroke={C.dim} /><circle cx="30" cy="10" r="2.5" fill={C.brand} /><circle cx="30" cy="21" r="2.5" fill={C.ok} /><circle cx="30" cy="32" r="2.5" fill={C.warn} />{bar(38, 8, 40, C.dim, 0.6)}{bar(38, 19, 32, C.dim, 0.5)}{bar(38, 30, 36, C.dim, 0.5)}</svg>);
const DocsSliceSample = () => (<svg viewBox="0 0 120 42" style={sv}><rect x="40" y="5" width="40" height="32" rx="2" fill="none" stroke={C.brand} />{bar(46, 11, 22, C.brand, 0.8)}{bar(46, 18, 28, C.dim, 0.5)}{bar(46, 24, 24, C.dim, 0.5)}{bar(46, 30, 18, C.dim, 0.5)}<path d="M84 12 l8 0 M88 8 l0 8" stroke={C.ok} strokeWidth="1.6" /></svg>);
const SketchSample = () => (<svg viewBox="0 0 120 42" style={sv}><path d="M20 30 q14 -22 30 -8 q10 8 18 -6" fill="none" stroke={C.warn} strokeWidth="2" strokeLinecap="round" /><rect x="76" y="8" width="22" height="14" rx="3" fill="none" stroke={C.brand} /><path d="M84 28 l16 6 M100 34 l-4 -1 M100 34 l-1 -4" stroke={C.ok} strokeWidth="1.6" fill="none" /></svg>);
const FuelSample = () => (<svg viewBox="0 0 120 42" style={sv}><rect x="22" y="8" width="76" height="10" rx="5" fill="none" stroke={C.border} /><rect x="22" y="8" width="46" height="10" rx="5" fill={C.ok} opacity="0.8" />{bar(22, 26, 30, C.brand, 0.8)}{bar(22, 33, 20, C.warn, 0.7)}<text x="86" y="35" style={{ font: "700 9px monospace" }} fill={C.fg}>$</text></svg>);
const NotebookSample = () => (<svg viewBox="0 0 120 42" style={sv}><rect x="38" y="6" width="44" height="30" rx="3" fill="none" stroke={C.brand} /><line x1="60" y1="6" x2="60" y2="36" stroke={C.brand} opacity="0.5" />{bar(43, 13, 12, C.dim, 0.6)}{bar(43, 20, 12, C.dim, 0.5)}{bar(65, 13, 12, C.ok, 0.6)}{bar(65, 20, 12, C.ok, 0.5)}<circle cx="88" cy="12" r="5" fill="none" stroke={C.warn} /><text x="86" y="15" style={{ font: "700 8px monospace" }} fill={C.warn}>?</text></svg>);
const RadarSample = () => (<svg viewBox="0 0 120 42" style={sv}><circle cx="60" cy="21" r="15" fill="none" stroke={C.dim} opacity="0.5" /><circle cx="60" cy="21" r="9" fill="none" stroke={C.dim} opacity="0.5" /><line x1="60" y1="21" x2="72" y2="10" stroke={C.ok} /><circle cx="52" cy="16" r="2" fill={C.bad} /><circle cx="67" cy="27" r="2" fill={C.warn} /></svg>);
const bugWave = (accent: string, n: number) => () => (<svg viewBox="0 0 120 42" style={sv}><ellipse cx="60" cy="23" rx="9" ry="11" fill="none" stroke={accent} /><line x1="60" y1="12" x2="60" y2="34" stroke={accent} opacity="0.6" /><path d="M52 16 l-8 -5 M52 23 h-10 M52 30 l-8 5 M68 16 l8 -5 M68 23 h10 M68 30 l8 5" stroke={accent} opacity="0.7" /><circle cx="60" cy="10" r="3" fill="none" stroke={accent} /><text x="60" y="27" textAnchor="middle" style={{ font: "700 11px monospace" }} fill={accent}>{n}</text></svg>);
const IntentSample = () => (<svg viewBox="0 0 120 42" style={sv}><circle cx="60" cy="21" r="14" fill="none" stroke={C.brand} /><circle cx="60" cy="21" r="8" fill="none" stroke={C.brand} opacity="0.6" /><circle cx="60" cy="21" r="2.5" fill={C.warn} />{bar(16, 10, 18, C.dim, 0.5)}{bar(16, 18, 14, C.dim, 0.5)}{bar(88, 10, 18, C.dim, 0.5)}{bar(88, 18, 14, C.dim, 0.5)}</svg>);
const CollectionSample = () => (<svg viewBox="0 0 120 42" style={sv}><rect x="12" y="6" width="96" height="30" rx="5" fill="none" stroke={C.brand} strokeDasharray="5 3" /><rect x="18" y="12" width="18" height="18" rx="2" fill="none" stroke={C.warn} /><rect x="42" y="12" width="18" height="18" rx="2" fill="none" stroke={C.brand} /><rect x="66" y="12" width="18" height="18" rx="2" fill="none" stroke={C.ok} /><rect x="90" y="12" width="12" height="18" rx="2" fill="none" stroke={C.bad} /><path d="M37 21 h4 M61 21 h4 M85 21 h4" stroke={C.dim} /></svg>);
const UltraPlanSample = () => (<svg viewBox="0 0 120 42" style={sv}><rect x="20" y="6" width="80" height="8" rx="2" fill="none" stroke={C.brand} />{bar(24, 9, 30, C.brand, 0.7)}<rect x="28" y="18" width="64" height="7" rx="2" fill="none" stroke={C.dim} /><rect x="28" y="28" width="64" height="7" rx="2" fill="none" stroke={C.dim} /><path d="M22 21 l3 3 l5 -6" stroke={C.ok} fill="none" strokeWidth="1.5" /><path d="M22 31 l3 3 l5 -6" stroke={C.warn} fill="none" strokeWidth="1.5" /></svg>);
const BreakdownSample = () => (<svg viewBox="0 0 120 42" style={sv}><rect x="46" y="5" width="28" height="10" rx="2" fill="none" stroke={C.brand} /><rect x="18" y="26" width="22" height="9" rx="2" fill="none" stroke={C.ok} /><rect x="49" y="26" width="22" height="9" rx="2" fill="none" stroke={C.warn} /><rect x="80" y="26" width="22" height="9" rx="2" fill="none" stroke={C.bad} /><line x1="60" y1="15" x2="29" y2="26" stroke={C.dim} /><line x1="60" y1="15" x2="60" y2="26" stroke={C.dim} /><line x1="60" y1="15" x2="91" y2="26" stroke={C.dim} /></svg>);
const JudgmentSample = () => (<svg viewBox="0 0 120 42" style={sv}><line x1="60" y1="7" x2="60" y2="30" stroke={C.fg} /><line x1="44" y1="12" x2="76" y2="12" stroke={C.fg} /><path d="M44 12 l-6 10 h12 z" fill="none" stroke={C.ok} /><path d="M76 12 l-6 10 h12 z" fill="none" stroke={C.bad} /><rect x="50" y="30" width="20" height="4" rx="2" fill={C.fg} opacity="0.7" /></svg>);
const SwarmSample = () => (<svg viewBox="0 0 120 42" style={sv}><rect x="34" y="8" width="52" height="26" rx="3" fill="none" stroke={C.warn} /><circle cx="46" cy="16" r="3" fill={C.warn} opacity="0.9" /><circle cx="58" cy="22" r="3" fill={C.warn} opacity="0.7" /><circle cx="70" cy="15" r="3" fill={C.warn} opacity="0.8" /><path d="M46 16 L58 22 L70 15" fill="none" stroke={C.dim} strokeDasharray="2 2" /><path d="M92 14 l6 0 M95 11 l0 6" stroke={C.ok} strokeWidth="1.4" /></svg>);
const DesignSample = () => (<svg viewBox="0 0 120 42" style={sv}><rect x="18" y="6" width="66" height="30" rx="3" fill="#0b0f16" stroke={C.warn} /><rect x="24" y="11" width="26" height="9" rx="1.5" fill="none" stroke={C.warn} strokeDasharray="3 2" /><rect x="24" y="24" width="40" height="8" rx="1.5" fill="none" stroke={C.brand} strokeDasharray="3 2" /><circle cx="94" cy="11" r="3.5" fill={C.brand} /><circle cx="103" cy="11" r="3.5" fill={C.ok} /><circle cx="94" cy="21" r="3.5" fill={C.warn} /><circle cx="103" cy="21" r="3.5" fill={C.bad} /><path d="M90 30 l6 6 M96 30 l-6 6" stroke={C.dim} /></svg>);
const RunSample = () => (<svg viewBox="0 0 120 42" style={sv}><rect x="24" y="7" width="72" height="28" rx="3" fill="#0b0f16" stroke={C.ok} /><line x1="24" y1="14" x2="96" y2="14" stroke={C.ok} opacity="0.6" /><circle cx="29" cy="10.5" r="1.3" fill={C.bad} /><circle cx="34" cy="10.5" r="1.3" fill={C.warn} /><circle cx="39" cy="10.5" r="1.3" fill={C.ok} /><path d="M56 20 l8 5 l-8 5 z" fill={C.ok} opacity="0.8" /></svg>);
const GateSample = () => (<svg viewBox="0 0 120 42" style={sv}><path d="M60 6 l14 5 v9 q0 11 -14 16 q-14 -5 -14 -16 v-9 z" fill="none" stroke={C.ok} /><path d="M53 21 l5 5 l10 -10" fill="none" stroke={C.ok} strokeWidth="2" /></svg>);

export type PaneKindMeta = { key: string; label: string; sample: React.ReactNode; desc: string; group: "agents" | "tools" | "collections"; cat?: string; soon?: boolean };

// ── VIBE AGENTS (operator 2026-07-14: "the base identity should have more
// personality… personalized agents for this screen") — a vibe-native roster
// instead of the pipeline roles (dev/qa/pl/tl are WORKFLOW agents; vibe is
// operator-driven parallel building). Each is a crafted persona over the dev
// grant profile, tuned to one dimension the substrate actually knows: the
// atlas (code screen) and the design system (design screen). The persona is
// injected as the pane's extra prompt — visible + editable in the prompt
// window, never hidden.
export type VibeAgent = { key: string; name: string; avatar: string; color: string; base: string; tagline: string; persona: string; vibes: string };
export const VIBE_AGENTS: VibeAgent[] = [
  {
    key: "forge", name: "Forge", avatar: "🔨", color: C.brand, base: "dev",
    tagline: "the builder — ships features end-to-end",
    persona: "You are FORGE, the builder. Ship the feature end-to-end: the smallest COMPLETE slice first, wired all the way (UI → state → data). Finish what you start — no TODOs for things you can do now. Pragmatic, direct, zero ceremony.",
    vibes: "Entry points · Digest",
  },
  {
    key: "muse", name: "Muse", avatar: "🎨", color: C.warn, base: "dev",
    tagline: "the designer — the design system is law",
    persona: "You are MUSE, the designer. Every change must BELONG to this codebase's design system: reuse its components, tokens, spacing and palette before inventing anything new, and say which tokens you used. When the ask is vague, propose two bolder alternatives in words before touching code.",
    vibes: "Design · Docs",
  },
  {
    key: "patch", name: "Patch", avatar: "🩹", color: C.bad, base: "dev",
    tagline: "the fixer — root causes, not symptoms",
    persona: "You are PATCH, the fixer. Reproduce before you fix; fix the ROOT CAUSE, not the symptom; leave behind a test that would have caught it. Smallest possible diff, and explain the failure chain in one line.",
    vibes: "Tests · Failures · Git",
  },
  {
    key: "prism", name: "Prism", avatar: "🔷", color: C.ok, base: "dev",
    tagline: "the refactorer — structure without behavior change",
    persona: "You are PRISM, the refactorer. Improve structure WITHOUT changing behavior: name the smell you're removing, make the minimal safe transformation, keep every move traceable. Never mix refactoring with features in one change.",
    vibes: "AST · Digest",
  },
  {
    key: "sage", name: "Sage", avatar: "🦉", color: C.fg, base: "dev",
    tagline: "the scout — reads, explains, plans; writes no code",
    persona: "You are SAGE, the scout. You research, explain and plan — you write MARKDOWN, never code. Ground every claim in files you actually read (cite paths), and end with a concrete next-step list another agent could execute verbatim.",
    vibes: "Docs · Memory · Decisions",
  },
  {
    key: "metro", name: "Metro", avatar: "🚇", color: C.muted, base: "dev",
    tagline: "the integrator — APIs, data flows, contracts",
    persona: "You are METRO, the integrator. You own the boundaries: APIs, data flows, payload shapes. Make every boundary explicit, validate at the edges, and document the exact shape of everything you touch.",
    vibes: "Data stories · Contracts",
  },
];

// ordered — agents first (the common case), tools after.
export const PANE_KINDS: PaneKindMeta[] = [
  { key: "agent", label: "🤖 Agent", sample: <AgentSample />, group: "agents", desc: "A native antiloki agent: inherits a base persona, stages file-edits as plans (or auto-applies), converses. Its scope is the files it may WRITE — it reads the whole repo." },
  { key: "opencode", label: "OpenCode", sample: TerminalSample(C.brand)(), group: "agents", desc: "The real OpenCode CLI in an antiloki terminal on YOUR OpenCode login (Go/Zen — its own default model, e.g. deepseek); with an OpenRouter key on the box it runs metered through the pane proxy instead. Scope = its edit whitelist." },
  { key: "opencode-direct", label: "OpenCode · OpenAI", sample: TerminalSample(C.ok)(), group: "agents", desc: "OpenCode wired straight to your OpenAI key (.antiloki/auth/openai.key). Same terminal + edit-whitelist boundary, no proxy." },
  { key: "claude-code", label: "✦ Claude Code", sample: TerminalSample("oklch(0.78 0.13 300)")(), group: "agents", desc: "Claude Code on YOUR subscription, in an antiloki terminal. Context via AGENTS.md + CLAUDE.md; scope enforced at the merge gate. No proxy — the CLI's own login." },
  { key: "codex", label: "◇ Codex", sample: TerminalSample(C.warn)(), group: "agents", desc: "OpenAI Codex CLI on your subscription, in an antiloki terminal. Same rails as Claude Code." },
  { key: "gemini", label: "✧ Gemini", sample: TerminalSample("oklch(0.78 0.13 280)")(), group: "agents", desc: "Gemini through Antigravity (`agy`) on your Google AI plan, in an antiloki terminal. Same rails as Claude Code." },
  { key: "grok", label: "✕ Grok", sample: TerminalSample("oklch(0.78 0.13 10)")(), group: "agents", desc: "The Grok CLI on your xAI subscription, in an antiloki terminal. Same rails as Claude Code." },
  { key: "cursor", label: "▣ Cursor", sample: TerminalSample("oklch(0.82 0.12 90)")(), group: "agents", desc: "cursor-agent on your Cursor plan (Composer and cursor-grok, its own pool), in an antiloki terminal. Same rails as Claude Code." },
  { key: "script", cat: "run & verify", label: "▶ Script runner", sample: <ScriptSample />, group: "tools", desc: "Runs a registered script (build / dev / test) live in a sibling pane's worktree. No agent turn, no edits of its own." },
  { key: "git", cat: "session ops", label: "⎇ Git graph", sample: <GitSample />, group: "tools", desc: "The base branch + one lane per pane worktree — ahead commits, dirty files, diffstat — live. 📂 opens a worktree." },
  { key: "context", cat: "session ops", label: "🧠 Context", sample: <ContextSample />, group: "tools", desc: "The session's shared memory: mission + context/knowledge docs every agent receives. Opens the full Context Studio." },
  { key: "notes", cat: "boards & canvases", label: "📝 Notes", sample: <NotesSample />, group: "tools", desc: "A private annotation pad for this session — jot reminders, decisions, anything. Yours; not injected into agent prompts." },
  { key: "state", cat: "session ops", label: "📊 State", sample: <StateSample />, group: "tools", desc: "A mini-dashboard for the whole super-session: per-agent worktree diffstat, ahead branches, spend, and PR readiness — at a glance." },
  { key: "run", cat: "run & verify", label: "🖥 Run preview", sample: <RunSample />, group: "tools", desc: "Boots the workspace's dev script in the root or a pane's worktree (the same preview manager the Pulls screen uses) and flips into the live app on its detected port. ↗ opens a tab if the app refuses iframes." },
  { key: "gate", cat: "run & verify", label: "✓ Gate", sample: <GateSample />, group: "tools", desc: "The session's quality gate: runs the registry build + test scripts in a chosen pane's worktree and shows PASS/FAIL verdict chips. ▶ gate chains build → test." },
  { key: "code", cat: "code intel", label: "⌨ Code IDE", sample: <IdeSample />, group: "tools", desc: "The whole workspace as a read-only mini-IDE (the Code screen's tree + viewer) — inspect any file beside the agents without leaving the session." },
  { key: "diagram", cat: "code intel", label: "◫ Diagrams", sample: <DiagramSample />, group: "tools", desc: "The code structure diagrams from the Code screen — navigate folders, drill into files, see the shape of the codebase the agents are changing." },
  { key: "graph", cat: "code intel", label: "◉ Graph", sample: <GraphSample />, group: "tools", desc: "The atlas import graph (the Code screen's), live in the session — modules, edges, zones." },
  { key: "kanban", cat: "boards & canvases", label: "▦ Kanban", sample: <KanbanSample />, group: "tools", desc: "YOUR Trello for the session: add cards, drag them between To do / Doing / Done, edit, delete. Stored with the session; never injected into agent prompts." },
  { key: "standup", cat: "orchestrate", label: "📣 Standup", sample: <StandupSample />, group: "tools", desc: "One click: every turn-capable agent reports done / now / blocked, answers lined up side by side. Each round costs one AI turn per agent." },
  { key: "shell", cat: "run & verify", label: "$ Shell", sample: <ShellSample />, group: "tools", desc: "A real terminal in the workspace root or any pane's worktree (docker exec into the container when the runtime is docker). Poke deps, run one-offs." },
  { key: "review", cat: "session ops", label: "◨ Review", sample: <ReviewSample />, group: "tools", desc: "The reviewer's seat: every pane's worktree diff in ONE place — load, read, commit or discard per pane. (Per-pane diff buttons moved here.)" },
  { key: "todo", cat: "boards & canvases", label: "☑ Todo", sample: <TodoSample />, group: "tools", desc: "A checkable session todolist — add, check off, clear. Yours; not injected into agent prompts." },
  { key: "race", cat: "orchestrate", label: "🏁 Race", sample: <RaceSample />, group: "tools", desc: "Give the SAME task to 2+ agents, watch the lanes (elapsed + dirty diffstat), compare replies, then 👑 crown the winner: merge its worktree, discard the rest." },
  { key: "timeline", cat: "session ops", label: "⛓ Session timeline", sample: <TimelineSample />, group: "tools", desc: "This session's audit trail: every cockpit skill fired, every AI call (model, tokens, $), every sacred-timeline row — filterable, live." },
  { key: "design", cat: "boards & canvases", label: "🎨 Design canvas", sample: <DesignSample />, group: "tools", desc: "The REAL app running as a design canvas: boot the dev server, flip to draw mode, mark areas + write intent on them, then send the annotated strategy to the shared context — the agents read it. Palette truth from the Design screen rides along." },
  { key: "docs", cat: "code intel", label: "📄 Docs slice", sample: <DocsSliceSample />, group: "tools", desc: "One page of the SELF-GENERATED docs (the deterministic doc model built from the atlas): pick any folder or file page, read it as didactic markdown beside the agents. The slice persists on the pane." },
  { key: "sketch", cat: "boards & canvases", label: "✏ Sketch", sample: <SketchSample />, group: "tools", desc: "An excalidraw-style thinking canvas: freehand, boxes, ellipses, arrows, text — theme colors, undo, clear. The drawing persists with the session." },
  { key: "fuel", cat: "session ops", label: "⛽ Fuel", sample: <FuelSample />, group: "tools", desc: "The session's cost control center: LIVE spend, burn rate, per-pane and per-model breakdowns, and a spend PLAN — set a budget, watch the bar, remaining and the burn-down ETA. Advisory, never blocks." },
  { key: "notebook", cat: "code intel", label: "📓 Notebook", sample: <NotebookSample />, group: "tools", desc: "The notebooks engine in a pane: pick a notebook, read its artifacts, mint new ones — overview, quiz, flashcards, mindmap. Each mint is ONE AI call." },
  { key: "radar", cat: "session ops", label: "🚨 Error radar", sample: <RadarSample />, group: "tools", desc: "The unified failure feed, live: every recorded failure pattern-grouped, severity-filterable (error/warn), 1–30 day window." },
  { key: "bfw1", cat: "run & verify", label: "🔍 Wave 1 · determinism", sample: bugWave(C.ok, 1)(), group: "tools", desc: "BUG FINDER wave 1 ($0, instant): lint · typecheck · hallucinated imports/symbols resolved against disk + the atlas · structural smells ∩ scope. Counted facts. Inside a 🐞 Bug finder automation it OPENS the shared run; waves 2 & 3 append to it. One-click classify feeds the Bug Finder precision ledger." },
  { key: "bfw2", cat: "run & verify", label: "🐝 Wave 2 · shard swarm", sample: bugWave(C.warn, 2)(), group: "tools", desc: "BUG FINDER wave 2 (low tier): narrow finders, ONE bug species each (checking · algorithm · timing · interface · security · test-oracle); every lead must quote the offending code verbatim or it is void by rule. Appends to wave 1's run in an automation; runs standalone otherwise." },
  { key: "bfw3", cat: "run & verify", label: "🎯 Wave 3 · sweep", sample: bugWave(C.brand, 3)(), group: "tools", desc: "BUG FINDER wave 3 (one mid call): the sweep for anything OUTSIDE the covered categories — told what waves 1+2 already found so it never re-buys a covered defect. Appends to the shared run. Advisory: never blocks." },
  { key: "ultraplan", cat: "orchestrate", label: "🧩 Shape", sample: <UltraPlanSample />, group: "tools", desc: "The RFC generator: the base plan grows into a TREE CANVAS — the artifact at the root, dimension branches of microtask circles, alternatives-with-justifications you choose the path through, a context branch, excalidraw-style phase arrows. Pan/zoom, edit every node, 📜 press the complete RFC as a session doc every agent receives." },
  { key: "intent", cat: "orchestrate", label: "🧠 Brainstorm", sample: <IntentSample />, group: "tools", desc: "Step ① of Ultra Plan, as a chat: pick what/where/how bold/musts from the brain, say it in a line, and the plan lands on the collection's shape pane — the planner's depth is chosen by the size of the ask. ✨ explores ideas first." },
  { key: "swarm", cat: "orchestrate", label: "🐝 Execute", sample: <SwarmSample />, group: "tools", desc: "The execution queue in THIS pane's OWN worktree — sequential, one writer, one coherent diff; ▶▶ auto drains it. Provisions the worktree on add." },
  { key: "col-ultra-dev", label: "🗼 Ultra Plan", sample: <CollectionSample />, group: "collections", desc: "THE AUTOMATION: a titled frame wiring 🎯 Intent → 🧩 Shape → ⚖ Judge into one planning line. Its PRODUCT is the plan: brainstorm and forge the base plan, shape the microtasks and their decisions, try it before the tribunal, publish the RFC — a session-scoped doc every agent receives as required reading." },
  { key: "col-bug-hunt", label: "🩹 Bug hunt", sample: <CollectionSample />, group: "collections", desc: "SYNC formation: 🚨 Error radar → 🩹 Patch agent → ✓ Gate → ⚖ Judge. THE WIRE: every failure row on the radar grows a '→ hunt' button that becomes the Patch agent's next brief (reproduce, fix the root cause, leave a test). Gate verifies, Judge rules." },
  { key: "col-bug-finder", label: "🐞 Bug finder", sample: <CollectionSample />, group: "collections", desc: "THE 3-WAVE DEFECT GATE as an automation — 'is this code defective?', the question no other gate asks. 🔍 wave 1 (determinism · $0) → 🐝 wave 2 (shard swarm · low) → 🎯 wave 3 (sweep · one mid call). THE WIRE: the waves share ONE run through the blackboard — wave 1 opens it, 2 and 3 append; the sweep excludes what 1+2 already found. One-click classify feeds the Bug Finder precision ledger. Advisory — never blocks." },
  { key: "col-bake-off", label: "🏁 Bake-off", sample: <CollectionSample />, group: "collections", desc: "PARALLEL formation: 🏁 Race + two agent lanes (🔨 Forge vs 🔷 Prism) + ◨ Review + ⚖ Judge. The race pre-selects its formation lanes; same brief fans out, Review compares the worktrees, Judge helps crown the merge." },
  { key: "col-design-studio", label: "🎨 Design studio", sample: <CollectionSample />, group: "collections", desc: "SYNC formation: 🎨 Design canvas → 🎨 Muse agent → 🖥 Run. THE WIRE: draw areas on the RUNNING app and send the annotated strategy STRAIGHT to Muse (→ muse) — or to the shared memory; watch it live in Run." },
  { key: "col-understanding-lab", label: "🔬 Understanding lab", sample: <CollectionSample />, group: "collections", desc: "PARALLEL formation: 📓 Notebook + 📄 Docs slice + ◉ Graph + 🦉 Sage agent — 'understand this area before touching it'. Mint artifacts, read the generated docs, see the graph, ask Sage — all beside each other." },
  { key: "col-release-check", label: "📦 Release check", sample: <CollectionSample />, group: "collections", desc: "PARALLEL formation: ◨ Review (all diffs) + ✓ Gate (build+test) + ⛽ Fuel (spend) + ⛓ Session timeline (audit) — the pre-PR cockpit in one frame." },
  { key: "judgment", cat: "orchestrate", label: "⚖ Judgment", sample: <JudgmentSample />, group: "tools", desc: "The TRIBUNAL over the whole ultra plan: a 🛡 defender and a ⚔ prosecutor (mid) argue the case from the intent context + full plan, then a HIGH judge rules — a verdict, both pleas, a scorecard and the opinion. Three AI calls; the case persists." },
];

// kind → accent glyph+color for the BOARD pane headers (operator 2026-07-14:
// "each pane should have at its header its icon with its color").
const CAT_COLOR: Record<string, string> = { "run & verify": C.ok, "code intel": C.brand, "session ops": C.muted, "boards & canvases": C.warn, orchestrate: C.bad };
export const KIND_IDENT: Record<string, { glyph: string; color: string }> = Object.fromEntries(PANE_KINDS.map((m) => {
  const glyph = [...m.label][0];
  const color = m.group === "agents" ? C.brand : CAT_COLOR[m.cat ?? ""] ?? C.dim;
  return [m.key, { glyph, color }];
}));

export function PaneCard({ meta, selected, disabled, onSelect }: { meta: PaneKindMeta; selected: boolean; disabled?: boolean; onSelect: () => void }) {
  const [info, setInfo] = React.useState(false);
  return (
    <div style={{ border: `1px solid ${selected ? C.brand : C.border}`, borderRadius: 9, overflow: "hidden", background: selected ? `color-mix(in oklab, ${C.brand} 8%, ${C.bg})` : C.bg, opacity: disabled ? 0.55 : 1 }}>
      <div data-testid={`pane-card-${meta.key}`} onClick={disabled ? undefined : onSelect} style={{ cursor: disabled ? "not-allowed" : "pointer" }}>
        <div style={{ height: 44, display: "grid", placeItems: "center", padding: "2px 8px", background: C.panel2, borderBottom: `1px solid ${C.border}` }}>{meta.sample}</div>
      </div>
      <div style={{ padding: "5px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span onClick={disabled ? undefined : onSelect} style={{ fontFamily: mono, fontSize: 10, color: selected ? C.brand : C.fg, fontWeight: 600, flex: 1, cursor: disabled ? "default" : "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.label}</span>
          {meta.soon && <span style={{ fontFamily: mono, fontSize: 7.5, color: C.warn, border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 5px" }}>soon</span>}
          <button onClick={() => setInfo((o) => !o)} title="what it does" style={{ width: 15, height: 15, borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.dim, cursor: "pointer", fontSize: 9, lineHeight: "13px", padding: 0, fontFamily: mono, flexShrink: 0 }}>{info ? "–" : "i"}</button>
        </div>
        {info && <div style={{ marginTop: 5, fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 9.5, color: C.muted, lineHeight: 1.45 }}>{meta.desc}</div>}
      </div>
    </div>
  );
}
