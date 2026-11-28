// THE REPLAY OF WHAT AGENTS WROTE (the Editor view, 2026-11-21): the serve records every write, edit, read and command of a run as an event; this turns the events into a deterministic schedule, a pure function of the events, so a live run and a replay afterwards play the same.
// Each agent has a queue: an event starts when it arrived or when the agent finished the one before, whichever is later; adding later events never moves earlier ones. Typing speed and pauses come from a seeded pattern per event. Time is in seconds from the first event.
export type RunEvent = { i: number; t_ms: number; node: string; kind: "write" | "edit" | "read" | "run"; file?: string; text?: string; old?: string; new?: string; cmd?: string };
export type StepKind = "create" | "type" | "select" | "replace" | "read" | "run" | "close";
export type Step = { id: string; ev: number; node: string; k: StepKind; file?: string; start: number; end: number; cmd?: string };
export type Schedule = { steps: Step[]; nodes: string[]; end: number; first: number; before: Record<number, string>; after: Record<number, string>; evs: RunEvent[]; times: Record<number, number[]> };
export type Agent = { file: string | null; line: number; col: number; doing: string; typing: boolean; sel: { file: string; from: number; to: number } | null };
export type State = { files: Record<string, string>; tabs: string[]; agents: Record<string, Agent>; term: { node: string; cmd: string; done: boolean }[]; who: Record<string, string[]>; running: boolean };

/** A repeatable number sequence from a seed (xorshift), so the same event always types the same way. Pure. */
export function rng(seed: number): () => number { let x = (seed >>> 0) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
/** When each character of `n` lands, as shares of the typing time (0..1, increasing): a pause after a line, a lighter one after punctuation, a quicker space. Pure. */
export function charTimes(text: string, seed: number): number[] {
  const r = rng(seed * 2654435761 + 7); const w: number[] = []; let sum = 0;
  for (const ch of text) { let b = 0.55 + r() * 0.9; if (ch === "\n") b *= 3.2; else if ("({,;".includes(ch)) b *= 1.7; else if (ch === " ") b *= 0.8; w.push(b); sum += b; }
  let c = 0; return w.map((x) => (c += x / (sum || 1)));
}
/** How many characters are typed by share `p` of the time. Pure. */
export function shown(times: number[], p: number): number { if (p <= 0) return 0; if (p >= 1) return times.length; let lo = 0, hi = times.length; while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] <= p) lo = m + 1; else hi = m; } return lo; }
const typeSecs = (n: number) => Math.min(14, 0.4 + n / 55);   // about 55 characters a second, never more than 14 s for one file

/** The schedule of a list of events. `base` gives a file's content when the run started (missing = new file). Pure. */
export function buildSchedule(events: RunEvent[], base: Record<string, string> = {}): Schedule {
  const evs = [...events].sort((a, b) => a.i - b.i); const first = evs.length ? evs[0].t_ms : 0; const nodes: string[] = []; for (const e of evs) if (!nodes.includes(e.node)) nodes.push(e.node);
  const content: Record<string, string> = { ...base }; const before: Record<number, string> = {}; const after: Record<number, string> = {}; const times: Record<number, number[]> = {};
  const free: Record<string, number> = {}; const lastFile: Record<string, string | null> = {}; const known = new Set(Object.keys(base)); const steps: Step[] = []; let end = 0;
  for (const e of evs) {
    const arrive = (e.t_ms - first) / 1000; const f = e.file ?? ""; const prev = content[f] ?? ""; before[e.i] = prev;
    let t = Math.max(arrive, free[e.node] ?? 0); const push = (k: StepKind, d: number, file?: string) => { steps.push({ id: `${e.i}:${k}`, ev: e.i, node: e.node, k, file, start: t, end: t + d, cmd: e.cmd }); t += d; };
    // moving on from a file closes its tab (after the agent finished with it)
    const lf = lastFile[e.node]; if (lf && e.kind !== "run" && e.file && lf !== e.file) { steps.push({ id: `${e.i}:close`, ev: e.i, node: e.node, k: "close", file: lf, start: t, end: t + 0.3 }); t += 0.3; }
    if (e.kind === "write") { const txt = e.text ?? ""; if (!known.has(f)) { push("create", 0.3, f); known.add(f); } content[f] = txt; after[e.i] = txt; times[e.i] = charTimes(txt, e.i + 1); push("type", typeSecs(txt.length), f); lastFile[e.node] = f; }
    else if (e.kind === "edit") { const idx = prev.indexOf(e.old ?? ""); const next = idx >= 0 ? prev.slice(0, idx) + (e.new ?? "") + prev.slice(idx + (e.old ?? "").length) : prev; content[f] = next; after[e.i] = next; times[e.i] = charTimes(e.new ?? "", e.i + 1); known.add(f); push("select", 0.5, f); push("replace", Math.min(6, 0.3 + (e.new ?? "").length / 55), f); lastFile[e.node] = f; }
    else if (e.kind === "read") { const n = prev.split("\n").length; push("read", Math.min(3, 0.4 + n * 0.03), f); after[e.i] = prev; lastFile[e.node] = f; }
    else { push("run", 1.0); after[e.i] = prev; }
    free[e.node] = t + 0.15; end = Math.max(end, t);
  }
  steps.sort((a, b) => a.start - b.start || a.ev - b.ev);
  return { steps, nodes, end, first, before, after, evs, times };
}

const blank = (): Agent => ({ file: null, line: 0, col: 0, doing: "idle", typing: false, sel: null });
const lc = (text: string) => { const l = text.split("\n"); return { line: l.length, col: l[l.length - 1].length }; };
/** What the editor shows at time `t`: every file's text, the open tabs in the order they were opened, where each agent's pointer is and what it is doing, the commands run. Pure. */
export function stateAt(sc: Schedule, t: number): State {
  const files: Record<string, string> = {}; const tabs: string[] = []; const agents: Record<string, Agent> = {}; const term: State["term"] = []; const who: Record<string, string[]> = {};
  for (const n of sc.nodes) agents[n] = blank();
  const mark = (f: string, n: string) => { const w = (who[f] ??= []); if (!w.includes(n)) w.push(n); };
  const open = (f: string) => { if (!tabs.includes(f)) tabs.push(f); };
  for (const s of sc.steps) {
    if (t < s.start) continue; const active = t < s.end; const p = Math.max(0, Math.min(1, (t - s.start) / Math.max(1e-6, s.end - s.start))); const A = agents[s.node]; const ev = sc.evs.find((e) => e.i === s.ev)!; const f = s.file ?? "";
    if (s.k === "create") { files[f] = files[f] ?? ""; open(f); mark(f, s.node); if (active) { A.file = f; A.doing = "creating"; A.typing = false; } }
    else if (s.k === "type") { const txt = sc.after[s.ev]; const n = shown(sc.times[s.ev], p); files[f] = txt.slice(0, n); open(f); mark(f, s.node); if (active) { A.file = f; A.doing = "writing"; A.typing = true; Object.assign(A, lc(files[f])); } }
    else if (s.k === "select") { const prev = sc.before[s.ev]; const i = prev.indexOf(ev.old ?? ""); files[f] = prev; open(f); mark(f, s.node); if (active) { A.file = f; A.doing = "selecting"; A.typing = false; if (i >= 0) { A.sel = { file: f, from: i, to: i + Math.round((ev.old ?? "").length * p) }; Object.assign(A, lc(prev.slice(0, A.sel.to))); } } }
    else if (s.k === "replace") { const prev = sc.before[s.ev]; const i = prev.indexOf(ev.old ?? ""); open(f); mark(f, s.node); if (i < 0) { files[f] = sc.after[s.ev]; } else { const n = shown(sc.times[s.ev], p); const nw = (ev.new ?? "").slice(0, n); files[f] = prev.slice(0, i) + nw + (p >= 1 ? "" : "") + prev.slice(i + (ev.old ?? "").length); if (active) { A.file = f; A.doing = "fixing"; A.typing = true; Object.assign(A, lc(prev.slice(0, i) + nw)); } } }
    else if (s.k === "read") { open(f); mark(f, s.node); files[f] = files[f] ?? sc.before[s.ev]; if (active) { A.file = f; A.doing = "reading"; A.typing = false; A.line = 1 + Math.floor(p * Math.max(0, (files[f] ?? "").split("\n").length - 1)); A.col = 0; } }
    else if (s.k === "run") { term.push({ node: s.node, cmd: s.cmd ?? "", done: !active }); if (active) { A.doing = "running"; A.typing = false; } }
    else if (s.k === "close") { if (t >= s.start + (s.end - s.start) * 0.3) { const ix = tabs.indexOf(f); if (ix >= 0) tabs.splice(ix, 1); } if (active) { A.doing = "saving"; A.file = f; } }
    if (!active && s.k !== "close") { A.sel = null; }
  }
  const running = t < sc.end;
  for (const n of sc.nodes) { const a = agents[n]; const act = sc.steps.some((s) => s.node === n && t >= s.start && t < s.end); if (!act) { a.doing = running ? "idle" : "done"; a.typing = false; a.sel = null; if (!running) a.file = null; } }
  return { files, tabs, agents, term, who, running };
}
/** The palette an agent gets by its order of appearance. Pure. */
export const AGENT_COLORS = ["#7aa7ff", "#f0a46b", "#58c9b3", "#b79cf0", "#e3c16f", "#d98fa8", "#8fd0c0", "#c97c5c"];
export const colorOfAgent = (sc: Schedule, node: string) => AGENT_COLORS[Math.max(0, sc.nodes.indexOf(node)) % AGENT_COLORS.length];

/** Characters an agent has typed by time `t` (whole files, retyped text), and in all: the counter on its pointer ticks with them. Pure. */
export function typedChars(sc: Schedule, t: number, node: string): { now: number; all: number } {
  let now = 0, all = 0;
  for (const s of sc.steps) {
    if (s.node !== node || (s.k !== "type" && s.k !== "replace")) continue;
    const full = s.k === "type" ? (sc.after[s.ev] ?? "").length : (sc.evs.find((e) => e.i === s.ev)?.new ?? "").length; all += full;
    if (t >= s.end) now += full; else if (t > s.start) now += shown(sc.times[s.ev], (t - s.start) / Math.max(1e-6, s.end - s.start)) * (s.k === "type" ? 1 : 1);
  }
  return { now, all };
}
/** What the pointer's counter says: tokens written (about 4 characters each) and the money so far, as a share of what the agent's step cost when that is known. Pure. */
export function counterOf(chars: { now: number; all: number }, costUsd?: number): { tokens: number; usd: number | null } {
  return { tokens: Math.round(chars.now / 4), usd: costUsd && costUsd > 0 && chars.all > 0 ? costUsd * Math.min(1, chars.now / chars.all) : null };
}
