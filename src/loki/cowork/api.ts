// THE COWORK SCREEN'S CALLS (RFC 0007). Every one goes through the shared client (`apiGet` / `apiPost`: timeouts, the session header,
// never a throw into the React tree), and every reply is read defensively: what the serve sends is checked here, not trusted by the screen.
import { apiGet, apiPost, BE_URL, isNotWired } from "@/loki/api/client";
import { parseVerdict, type Verdict } from "./precheck";
import type { Usage } from "./strip-model";
import { parseLayout, serializeLayout, type Layout } from "./layout";
import { parseWorkers, type WorkerTask } from "./workers";
import { commandsOf, type Command, type Report } from "./commands";
import { parseSkillshare, type SkillshareState } from "./skillshare";
import { parseInspection, parseWebApps, type Inspection, type WebApps } from "./webapps";

const un = (r: any) => (r && typeof r === "object" && r.result && typeof r.result === "object" && !Array.isArray(r.result) && !("ok" in r) ? r.result : r);

export type PtyHost = { mode: "sidecar" | "in-process" | "error"; reachable: boolean; terminals: { id: string; pane_id: number | null; alive: boolean; exit: number | null; clients: number }[] };
export async function ptyHost(): Promise<PtyHost | null> { const r: any = un(await apiGet("/api/v1/cockpit/pty/host")); return r && typeof r.mode === "string" ? r : null; }

/** What agents have asked the screen to do (open a pane, close one). Asking is also how the serve learns a screen is open to do it, so the screen asks on a timer for as long as it is up. */
export async function listCommands(): Promise<Command[]> {
  try { const r: any = un(await apiGet("/api/v1/cockpit/cowork/commands")); return commandsOf(r?.commands); } catch { return []; }
}
/** Say what a command came to. Never throws: if the serve is gone the agent's wait times out and says so. */
export async function reportCommand(id: number, report: Report): Promise<boolean> {
  try { const r: any = un(await apiPost("/api/v1/cockpit/cowork/commands/result", { ...report, id }, { timeoutMs: 8000 })); return r?.ok === true; } catch { return false; }
}

/** What the `skillshare` CLI manages here (or that it is not installed). `checks` also asks what has an update upstream: slow, so a second read. Never throws. */
export async function loadSkillshare(project: boolean, checks = false): Promise<SkillshareState> {
  try { return parseSkillshare(un(await apiGet(`/api/v1/skillshare/state?project=${project ? 1 : 0}${checks ? "&checks=1" : ""}`, { timeoutMs: 300_000 }))); } catch { return { installed: false, hint: "the serve could not be asked about skillshare" }; }
}
/** Press a button: `{op: "sync"|"check"|"update"|"uninstall"|"install"|"hook", scope, ...}`. The raw answer: the pane reads it with `runLine`. */
export async function runSkillshare(req: Record<string, unknown>): Promise<unknown> {
  try { return un(await apiPost("/api/v1/skillshare/run", req, { timeoutMs: 320_000 })); } catch { return { ok: false, error: "the serve could not be reached" }; }
}

/** A question the pre-check parked for the person: the engine's prompt hook is waiting for it, and `paneId` says which terminal it is about. */
export type OpenAsk = { id: number; paneId: number; text: string; verdict: Extract<Verdict, { verdict: "ask" }> };
/** The open questions. Asking is also how the serve learns a screen is open to show them, so the screen asks on a timer for as long as it is up. */
export async function listAsks(): Promise<OpenAsk[]> {
  try {
    const r: any = un(await apiGet("/api/v1/cockpit/cowork/asks"));
    const out: OpenAsk[] = [];
    for (const a of Array.isArray(r?.asks) ? r.asks : []) {
      const v = parseVerdict({ verdict: "ask", notes: a?.notes, questions: a?.questions });
      if (v.verdict === "ask" && typeof a?.id === "number" && typeof a?.pane_id === "number") out.push({ id: a.id, paneId: a.pane_id, text: String(a.text ?? ""), verdict: v });
    }
    return out;
  } catch { return []; }
}
/** The person's answer: each question's chosen option (a deferred one left out), or a dismissal. */
export async function answerAsk(id: number, answers: Record<string, string>, skip = false): Promise<boolean> {
  try { const r: any = un(await apiPost("/api/v1/cockpit/cowork/asks/answer", skip ? { id, skip: true } : { id, answers }, { timeoutMs: 8000 })); return r?.ok === true; } catch { return false; }
}
export const ptyInput = (paneId: number, data: string) => apiPost("/api/v1/cockpit/pty/input", { pane_id: paneId, data }, { timeoutMs: 8_000 });   // typing waits at most 8 s on a stuck request, then the next keys go
/** The rows the pane's terminal shows now; null when there is no live terminal. */
export async function ptyScreen(paneId: number): Promise<string[] | null> { try { const r: any = un(await apiGet(`/api/v1/cockpit/pty/screen?pane_id=${paneId}`)); return Array.isArray(r?.rows) ? r.rows.map(String) : null; } catch { return null; } }
export const ptyResize = (paneId: number, cols: number, rows: number) => apiPost("/api/v1/cockpit/pty/resize", { pane_id: paneId, cols, rows });
export const ptyKill = (paneId: number) => apiPost("/api/v1/cockpit/pty/kill", { pane_id: paneId });
export async function ptyStatus(paneId: number): Promise<{ running: boolean; ready: boolean } | null> {
  const r: any = un(await apiGet(`/api/v1/cockpit/pty/status?pane_id=${paneId}`));
  return r && typeof r.running === "boolean" ? { running: r.running, ready: !!r.ready } : null;
}
export async function ptyStart(paneId: number, engine: string | null, cols: number, rows: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const r: any = un(await apiPost("/api/v1/cockpit/pty/start", { pane_id: paneId, ...(engine ? { agent: engine } : {}), cols, rows }, { timeoutMs: 60_000 }));
    return r && r.ok === true ? { ok: true } : { ok: false, error: String(r?.error ?? "the terminal did not start") };
  } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}
/** A plain shell in the workspace, for a pane that is not an engine's (the same door the Studio terminal uses). */
export async function shellStart(paneId: number, cols: number, rows: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const r: any = un(await apiPost("/api/v1/workspace/pty/start", { pane_id: paneId, cols, rows }, { timeoutMs: 60_000 }));
    return r && r.ok === true ? { ok: true } : { ok: false, error: String(r?.error ?? "the shell did not start") };
  } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}

// ── what the strip shows ───────────────────────────────────────────────────────────────────────────────────────
export type Limit = { label: string; used_pct: number | null };
export type PaneUsage = {
  known: boolean; engine?: string; reason?: string; working: boolean; blocked: string | null; /** what the router read the last ask as ("a small change"), noted by the engine's prompt hook */ route?: string; /** the pane runs in the chat sandbox: no project files, edits and shell refused */ sandbox?: boolean;
  model?: string; /** the last thing the CLI said in answer to a setting command ("Set model to Sonnet 5.5 and saved..."), for 30 s */ notice?: string; contextPct: number | null; limits: Limit[]; sessionCost: number | null;
  run: null | (Usage & { startedT: string; finishedT: string | null; prompt: string });
};
const n = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
export function parseUsage(raw: any): PaneUsage | null {
  const r = un(raw);
  if (!r || typeof r !== "object" || r.ok !== true) return null;
  const blocked = typeof r.blocked === "string" && r.blocked ? r.blocked : null;
  if (r.known !== true) return { known: false, engine: r.engine, reason: r.reason, working: false, blocked, sandbox: r.sandbox === true, route: typeof r.route === "string" ? r.route : undefined, contextPct: null, limits: [], sessionCost: null, run: null };
  const run = r.run && typeof r.run === "object" && typeof r.run.started_t === "string" ? r.run : null;
  return {
    known: true, engine: typeof r.engine === "string" ? r.engine : "claude-code", working: r.working === true, blocked, sandbox: r.sandbox === true, route: typeof r.route === "string" ? r.route : undefined,
    model: typeof r.model === "string" ? r.model : undefined, notice: typeof r.notice === "string" && r.notice ? r.notice : undefined,
    contextPct: n(r.context?.used_pct) ?? null, sessionCost: n(r.session_cost) ?? null,
    limits: (Array.isArray(r.limits) ? r.limits : []).filter((l: any) => l && typeof l.label === "string").map((l: any) => ({ label: l.label, used_pct: n(l.used_pct) ?? null })),
    run: run ? {
      startedT: run.started_t, finishedT: typeof run.finished_t === "string" ? run.finished_t : null, prompt: String(run.prompt ?? ""),
      // the numbers come from the engine's transcript; until it can be read they are unknown (a dash), never zero
      tokensIn: run.transcript ? n(run.tokens_in) : undefined, tokensOut: run.transcript ? n(run.tokens_out) : undefined, cost: run.transcript ? n(run.cost) : undefined, baseline: run.transcript ? n(run.baseline) : undefined,
      ms: n(run.ms), turns: n(run.turns), tools: n(run.tools), engine: typeof r.engine === "string" ? r.engine : "claude-code", against: typeof run.against === "string" ? run.against : undefined,
      costSource: typeof run.cost_source === "string" ? run.cost_source : undefined,
    } : null,
  };
}
export async function ptyUsage(paneId: number): Promise<PaneUsage | null> { try { return parseUsage(await apiGet(`/api/v1/cockpit/pty/usage?pane_id=${paneId}`)); } catch { return null; } }

// ── layout and the agents' sagas ────────────────────────────────────────────────────────────────────────────────────────
/** The open workspace's layout, and the root it belongs to (a save must name it, so one that was on its way while the space changed never lands in the new space). */
/** The saved layout, and WHETHER THE SERVE ANSWERED (`ok`): a request that timed out on a busy serve is not an empty layout. Treating it as one made the screen seed a new team pane and a new Leader terminal (with no brief) and save THAT over the real layout (found 2026-11-15: "the Leader lost its memory on reload"). */
export async function getLayout(): Promise<{ ok: boolean; layout: Layout; workspace: string; thread: string }> { try { const r: any = un(await apiGet("/api/v1/cockpit/cowork/layout")); if (!r || typeof r !== "object" || isNotWired(r)) return { ok: false, layout: parseLayout(null), workspace: "", thread: "" }; return { ok: true, layout: parseLayout(r?.layout), workspace: typeof r?.workspace === "string" ? r.workspace : "", thread: typeof r?.thread === "string" ? r.thread : "" }; } catch { return { ok: false, layout: parseLayout(null), workspace: "", thread: "" }; } }
export async function putLayout(l: Layout, workspace = "", thread = ""): Promise<boolean> { try { const r: any = un(await apiPost("/api/v1/cockpit/cowork/layout", { layout: JSON.parse(serializeLayout(l)), ...(workspace ? { workspace } : {}), ...(thread ? { thread } : {}) })); return r?.ok === true; } catch { return false; } }

/** An agent's own saga (RFC 0008 §4.10; operator 2026-11-11): made by itself as the agent works, an episode for every ask, on the workspace's one timeline. (Sagas an older build made by closing an episode are listed too.) The sidebar lists them; the Sagas screen shows each. */
export type AgentSaga = { id: number; title: string; summary: string; status: string; open: boolean; pane: string; paneId: number; engine: string; model: string; turns: number; usd: number; tokens: number; updated: number; source: string; /** what the agent belongs to, said by the serve: a thread, a pair or a team (and the role in it), the Leader of a team */ member?: Member[] };
export type Member = { kind: "thread" | "team-thread" | "pair" | "team" | "leader"; name: string; role?: string };
export type SagaEpisode = { id: number; title: string; status: string; usd: number; ms: number };
/** What is inside one saga: its episodes (one per answer), oldest first. Never throws. */
export async function listSagaEpisodes(id: number): Promise<SagaEpisode[]> {
  try {
    const r: any = un(await apiGet(`/api/v1/sagas/detail?id=${id}`, { timeoutMs: 15_000 }));
    return (Array.isArray(r?.episodes) ? r.episodes : []).filter((e: any) => e && Number.isFinite(Number(e.id))).map((e: any) => ({ id: Number(e.id), title: typeof e.title === "string" ? e.title : "", status: typeof e.status === "string" ? e.status : "", usd: Number(e.usd_total) || 0, ms: Number(e.ms_total) || 0 }));
  } catch { return []; }
}
/** The agents' own sagas among the workspace's, newest first. Never throws. */
export async function listAgentSagas(limit = 20): Promise<AgentSaga[]> {
  try {
    const r: any = un(await apiGet("/api/v1/sagas", { timeoutMs: 20_000 }));
    const out: AgentSaga[] = [];
    for (const s of Array.isArray(r?.sagas) ? r.sagas : []) {
      const m = s?.meta; if (typeof s?.id !== "number" || !String(s?.plan_ref ?? "").startsWith("ep:") || !m || m.kind !== "episode") continue;
      const t = m.tokens ?? {};
      out.push({ id: s.id, title: String(s.title || "episode").slice(0, 120), summary: String(s.objective ?? "").slice(0, 400), status: String(s.status ?? ""), open: m.open === true, pane: String(m.pane ?? ""), paneId: Number(m.pane_id) || 0, engine: String(m.engine ?? ""), model: String(m.model ?? ""),
        turns: Number(m.turns) || 0, usd: Number(m.usd) || 0, tokens: (Number(t.in) || 0) + (Number(t.out) || 0) + (Number(t.cache_read) || 0) + (Number(t.cache_write) || 0), updated: Number(s.updated_ms) || 0, source: String(m.summary_source ?? ""), member: Array.isArray(m.member_of) ? m.member_of.filter((x: any) => x && typeof x.name === "string").map((x: any) => ({ kind: x.kind, name: String(x.name), role: typeof x.role === "string" ? x.role : undefined })) : undefined });
    }
    return out.sort((a, b) => b.updated - a.updated).slice(0, limit);
  } catch { return []; }
}

// ── panes ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** `off`: installed, but the person switched the seat off in Settings (it must not read as "not installed": the cause is a switch, not a missing program). */
/** THE OFFICIAL INSTALL PAGE OF EACH AGENT (operator 2026-11-23: a CLI that is not found links its own docs). Each is the vendor's page, checked 2026-11-23 (Claude Code and Codex from the vendors' own docs, not re-checked that day); the local model server's is Ollama's download page. */
export const ENGINE_DOCS: Record<string, string> = {
  "claude-code": "https://code.claude.com/docs/en/setup", codex: "https://developers.openai.com/codex/cli", cursor: "https://cursor.com/docs/cli/installation",
  gemini: "https://antigravity.google/docs/cli/install", grok: "https://docs.x.ai/build/overview", opencode: "https://opencode.ai/docs",
};
export const OLLAMA_DOWNLOAD = "https://ollama.com/download";
export type Engine = { key: string; label: string; installed: boolean; seat: boolean; off?: boolean; /** found on disk but it will not run: the reason */ broken?: string; /** what is missing, in the serve's words (what to install or run, and what was searched) */ missing?: string };
/** Not offered in the agent lists (operator 2026-11-26: "drop deepseek harness from the agents list, and grok too"). */
export const ENGINES_NOT_LISTED = new Set(["deepseek", "grok"]);
/** THE AGENTS FOUND LAST TIME (operator 2026-11-27: "why is it taking so long to look for installed agents? it should remember"): shown at once, while the serve looks again. */
const ENGINES_SEEN = "antiloki.engines.seen";
export function rememberedEngines(): Engine[] { try { const l = JSON.parse(localStorage.getItem(ENGINES_SEEN) ?? "[]"); return Array.isArray(l) ? l.filter((e: any) => e && typeof e.key === "string" && typeof e.label === "string") : []; } catch { return []; } }
export async function listEngines(): Promise<Engine[]> {
  try {
    const r: any = un(await apiGet("/api/v1/engines"));
    const found: Engine[] = (Array.isArray(r?.engines) ? r.engines : []).filter((e: any) => e && typeof e.key === "string" && !ENGINES_NOT_LISTED.has(e.key)).map((e: any): Engine => ({ key: e.key, label: String(e.label ?? e.name ?? e.key), installed: e.installed === true && e.off !== true, seat: e.seat !== false, off: e.installed === true && e.off === true, broken: typeof e.broken === "string" && e.broken ? e.broken : undefined, missing: typeof e.missing === "string" && e.missing ? e.missing : undefined }));
    if (found.length) { try { localStorage.setItem(ENGINES_SEEN, JSON.stringify(found)); } catch { /* it is looked for again, no more */ } }
    return found;
  } catch { return []; }
}
/** Rename a workspace (the registry's own name; its folder, panes and layout are untouched). */
export async function renameWorkspace(name: string, newName: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r: any = un(await apiPost("/api/v1/workspaces/rename", { name, new_name: newName }, { timeoutMs: 15_000 }));
    return r?.ok === true ? { ok: true } : { ok: false, error: String(r?.error ?? r?.message ?? "could not rename") };
  } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}
/** The delegated tasks of one pane's runs (who works on what, then how it went): the temporary worker panes' data. */
export async function listWorkers(paneId: number): Promise<WorkerTask[]> {
  try { return parseWorkers(await apiGet(`/api/v1/cockpit/cowork/workers?pane_id=${paneId}`)); } catch { return []; }
}
/** The cockpit session every Cowork pane hangs on: the one named "Cowork" that is not closed, made when there is none. */
export async function ensureSession(): Promise<number | null> {
  try {
    const r: any = un(await apiPost("/api/v1/cockpit/session/get", {}, { timeoutMs: 15_000 }));
    const open = (Array.isArray(r?.sessions) ? r.sessions : []).filter((x: any) => x && typeof x.id === "number" && x.status !== "closed");
    const mine = open.find((x: any) => x.name === COWORK_SESSION);
    if (mine) return mine.id;
    const made: any = un(await apiPost("/api/v1/cockpit/session/create", { name: COWORK_SESSION, mission_md: "Terminals opened from the Cowork screen." }, { timeoutMs: 30_000 }));
    return typeof made?.session?.id === "number" ? made.session.id : null;
  } catch { return null; }
}
const COWORK_SESSION = "Cowork";
/** An engine's terminal in a REAL box: its own git worktree of the project (every file, empty scope), the user's own CLI config, antiloki's hooks and
 *  tools on top. NOT the chat door (`chat/create`): that makes an empty, read-only sandbox for the conversational chat, which left the agent knowing only
 *  the workspace's name. The same call the Cockpit's code agents use. */
export async function createEnginePane(engine: string, title: string, thread = "main", retried = false): Promise<{ paneId: number; sessionId: number } | null> {
  paneError = ""; paneNote = ""; paneCrowded = [];
  try {
    const sessionId = await ensureSession();
    if (!sessionId) { paneError = "antiloki's server did not open a session"; return null; }
    // an agent works in its thread's folder: the thread's worktree when the person made one, else the project folder
    const r: any = un(await apiPost("/api/v1/cockpit/agent/new", { session_id: sessionId, engine, title, thread }, { timeoutMs: 180_000, throwOnError: true }));
    const id = r?.pane_id ?? r?.pane?.id;
    if (typeof id === "number") { paneNote = typeof r?.note === "string" ? r.note : ""; paneCrowded = Array.isArray(r?.crowded) ? r.crowded.map(String) : []; return { paneId: id, sessionId }; }
    // THE SESSION'S PANE CAP: agents closed before panes were released still hold their slots: free the ones nothing shows or runs, and try once more
    if (!retried && /pane cap reached/i.test(String(r?.error ?? ""))) { await releasePane(null); return createEnginePane(engine, title, thread, true); }
    paneError = String(r?.error?.message ?? r?.error ?? r?.message ?? "antiloki's server did not answer");
    return null;
  } catch (e: any) { paneError = String(e?.message ?? e); return null; }
}
/** Why the last `createEnginePane` gave nothing, for the screen to say ("" when it worked). */
let paneError = "";
export const lastPaneError = (): string => paneError;
/** What the server has to say about the agent `createEnginePane` just made (tools helper missing), or "". */
let paneNote = "";
export const lastPaneNote = (): string => paneNote;
let paneCrowded: string[] = [];
/** The OTHER threads that already had agents in the project folder when the last agent joined it. */
export const lastPaneCrowded = (): string[] => paneCrowded;
/** The person's "Start Git": a repository and one commit of the open workspace's files. */
export async function startGit(): Promise<{ ok: boolean; error?: string }> {
  try { const raw: any = await apiPost("/api/v1/cockpit/cowork/git/start", {}, { timeoutMs: 180_000 }); const r: any = un(raw); return r?.ok === true ? { ok: true } : { ok: false, error: String(r?.error ?? "Git could not be started") }; } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}
/** An agent pane was closed on the screen: let its cockpit row go (it keeps its slot in the session's cap until it does). With no pane: sweep every open agent pane that no screen shows and no terminal runs. */
export async function releasePane(paneId: number | null): Promise<void> { try { await apiPost("/api/v1/cockpit/pane/release", paneId ? { pane_id: paneId } : {}, { timeoutMs: 30_000 }); } catch { /* a slot that stays is only a slot */ } }
/** A pane row for a Studio tool (notes, issues); no worktree is provisioned for it. */
export async function createToolPane(sessionId: number, kind: string, name: string): Promise<number | null> {
  try {
    const r: any = un(await apiPost("/api/v1/cockpit/pane/add", { session_id: sessionId, base_agent: "dev", subagent_name: name, pane_kind: kind, scope: [], grants: [], provision: false }, { timeoutMs: 30_000 }));
    return typeof r?.pane?.id === "number" ? r.pane.id : null;
  } catch { return null; }
}

// ── Omarchy themes (RFC 0007 §17.8) ───────────────────────────────────────────────────────────────────────────────
/** One moving place of a custom theme: an effect from a short list, its colours, its speed and its strength */
export type ThemeFx = { effect: string; colors: string[]; speed_s: number; intensity: number };
export type OmarchyTheme = { id: string; name: string; source: "downloaded" | "omarchy" | "system" | "custom"; mode: "dark" | "light"; colors: Record<string, string>; backgrounds: string[]; preview: boolean; /** a custom theme: made by an agent through the MCP, kept in the person's database */ custom?: boolean; look?: "pixel" | "shadow" | "liquid" | "minimal"; animations?: Record<string, ThemeFx>; wallpaper_css?: string | null };
export type ThemeList = { current: string | null; themes: OmarchyTheme[]; dir: string };
/** The themes this machine has (Omarchy's own and the ones antiloki downloaded), read defensively. `null` when the serve cannot say. */
export async function listThemes(): Promise<ThemeList | null> {
  try {
    const r: any = un(await apiGet("/api/v1/themes/omarchy"));
    if (!r || r.ok !== true || !Array.isArray(r.themes)) return null;
    const themes: OmarchyTheme[] = r.themes.filter((t: any) => t && typeof t.id === "string" && t.colors && typeof t.colors === "object").map((t: any): OmarchyTheme => ({
      id: t.id, name: typeof t.name === "string" ? t.name : t.id, source: t.source === "downloaded" || t.source === "omarchy" || t.source === "custom" ? t.source : "system", mode: t.mode === "light" ? "light" : "dark",
      // A CUSTOM THEME KEEPS WHAT MAKES IT ONE (found 2026-11-26: these four were dropped here, so its look, painted wallpaper and animations never reached the screen)
      ...(t.custom === true ? { custom: true, look: ["pixel", "shadow", "liquid", "minimal"].includes(t.look) ? t.look : undefined, animations: t.animations && typeof t.animations === "object" ? t.animations : undefined, wallpaper_css: typeof t.wallpaper_css === "string" ? t.wallpaper_css : null } : {}),
      colors: Object.fromEntries(Object.entries(t.colors).filter(([, v]) => typeof v === "string")) as Record<string, string>,
      backgrounds: (Array.isArray(t.backgrounds) ? t.backgrounds : []).filter((b: unknown) => typeof b === "string"), preview: t.preview === true,
    }));
    return { current: typeof r.current === "string" ? r.current : null, themes, dir: typeof r.dir === "string" ? r.dir : "" };
  } catch { return null; }
}
/** Download a theme from a git address into antiloki's own store. The serve says why when it will not (a bad address, no network, not a theme). */
export async function installTheme(url: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const r: any = un(await apiPost("/api/v1/themes/omarchy/install", { url }, { timeoutMs: 150_000 }));
    return r?.ok === true && typeof r.id === "string" ? { ok: true, id: r.id } : { ok: false, error: String(r?.error ?? r?.message ?? "could not download it") };
  } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}

export type ModelChoice = { id: string; label: string; /** a local model the running server cannot load (it is too old): why */ unavailable?: string };
export type PaneModels = { engine: string; current: string; models: ModelChoice[]; live: boolean; /** is Heimdall (the pre-check and router) screening this agent, and is that what its provider gets by default */ heimdall: boolean; heimdallDefault: boolean };
/** The models this agent's engine offers, and the one chosen for it ("" = the engine's own default). `null` when the serve does not know the pane. */
export async function paneModels(paneId: number): Promise<PaneModels | null> {
  try {
    const r: any = un(await apiGet(`/api/v1/cockpit/pane/models?pane_id=${paneId}`, { timeoutMs: 30_000 }));
    if (!r || r.ok !== true || !Array.isArray(r.models)) return null;
    return { engine: String(r.engine ?? ""), current: String(r.current ?? ""), live: r.live === true, heimdall: r.heimdall === true, heimdallDefault: r.heimdall_default === true, models: r.models.filter((m: any) => m && typeof m.id === "string").map((m: any) => ({ id: m.id, label: String(m.label ?? m.id), ...(typeof m.unavailable === "string" && m.unavailable ? { unavailable: m.unavailable } : {}) })) };
  } catch { return null; }
}
/** Choose the model of an agent. `applied`: "live" (the running CLI switched), "restart" (its terminal must be started again with it) or "next start". */
export async function setPaneModel(paneId: number, model: string): Promise<{ ok: boolean; applied?: "live" | "restart" | "next start"; error?: string; note?: string }> {
  try {
    const r: any = un(await apiPost("/api/v1/cockpit/pane/model", { pane_id: paneId, model }, { timeoutMs: 30_000 }));
    return r && r.ok === true ? { ok: true, applied: r.applied, note: typeof r.note === "string" ? r.note : undefined } : { ok: false, error: String(r?.error ?? "could not change the model") };
  } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}

/** Switch the provider of an agent pane in the middle of its conversation: the serve closes an episode, writes the reconciliation pack and starts the new provider on its default model. */
export async function switchProvider(paneId: number, engine: string, model?: string): Promise<{ ok: boolean; changed?: boolean; label?: string; episodeClosed?: boolean; error?: string }> {
  try {
    const r: any = un(await apiPost("/api/v1/cockpit/pane/provider", { pane_id: paneId, engine, ...(model ? { model } : {}) }, { timeoutMs: 60_000 }));
    return r && r.ok === true ? { ok: true, changed: r.changed !== false, label: typeof r.label === "string" ? r.label : undefined, episodeClosed: r.episode_closed === true } : { ok: false, error: String(r?.error ?? "could not switch the provider") };
  } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}

// ── threads: a space (project) holds threads, each a screen of its own ──────────────────────────────────────────────
export type ThreadTree = { worktree: string; branch: string; /** commits it has that the workspace does not */ ahead: number; dirty: boolean; /** commits the workspace has that it lacks */ behind?: number; /** days since it last had the workspace's work */ age_days?: number; /** its own change against that point */ files?: number; lines?: number };
export type Thread = { id: string; name: string; active: boolean; /** a TEAM THREAD (RFC 0008 §4.15): the id of the team that is this thread's own */ team?: string | null; /** its own branch and worktree (every thread but Main, once an agent is opened in it) */ tree?: ThreadTree | null; /** an agent asked for a worktree; nothing is made until the person says so */ suggest?: { paneId: number; reason: string } | null; /** the agents that work in a copy of their own, not in the thread's folder */ copies?: string[]; /** how many panes it holds, and what they are */ panes: { id: string; kind: string; engine?: string | null; title?: string | null; paneId?: number | null }[] };
export type ThreadList = { active: string; threads: Thread[]; /** the project is a Git repository (unsaid by an older server) */ git?: boolean };
export function parseThreads(r: any): ThreadList | null {
  if (!r || r.ok === false || !Array.isArray(r.threads)) return null;
  const threads: Thread[] = r.threads.filter((t: any) => t && typeof t.id === "string").map((t: any) => ({ id: t.id, name: String(t.name ?? t.id), active: !!t.active, team: typeof t.team === "string" && t.team ? t.team : null, panes: Array.isArray(t.panes) ? t.panes : [], copies: Array.isArray(t.copies) ? t.copies.map((x: any) => String(x ?? "an agent")) : [], suggest: t.suggest && typeof t.suggest.reason === "string" ? { paneId: Number(t.suggest.pane_id) || 0, reason: String(t.suggest.reason) } : null, tree: t.tree && typeof t.tree.worktree === "string" ? { worktree: t.tree.worktree, branch: String(t.tree.branch ?? ""), ahead: Number(t.tree.ahead) || 0, dirty: t.tree.dirty === true, behind: Number(t.tree.behind) || 0, age_days: Number(t.tree.age_days) || 0, files: Number(t.tree.files) || 0, lines: Number(t.tree.lines) || 0 } : null }));
  return threads.length ? { active: typeof r.active === "string" ? r.active : threads[0].id, threads, ...(typeof r.git === "boolean" ? { git: r.git } : {}) } : null;
}
/** The open space's threads (`op` list), or a change to them. `error` carries the serve's own sentence when it refuses. */
export async function threadsOp(body: { op: "list" | "create" | "rename" | "select" | "delete"; thread?: string; name?: string; /** delete a thread that still holds panes (the caller has stopped them) */ force?: boolean }): Promise<{ list: ThreadList | null; error?: string }> {
  try { const r: any = un(await apiPost("/api/v1/cockpit/cowork/threads", body, { timeoutMs: 15_000 })); return r?.ok === false ? { list: null, error: String(r.error ?? "could not change the threads") } : { list: parseThreads(r) }; } catch (e: any) { return { list: null, error: String(e?.message ?? e) }; }
}

/** A SIDE QUESTION (a button on an agent's pane): a read-only helper agent of the same engine, bound to it, briefed with what it has done. `error` is the serve's own sentence when it refuses. */
/** What to say when a route the screen needs is not on the serve it is talking to: the screen is newer than the serve (a serve started before the update). */
export const OUT_OF_DATE = (what: string) => `this serve is out of date: it does not have ${what}. Restart antiloki's serve so it runs the same version as this screen`;
export async function openSideQuestion(parentPaneId: number, parentTitle = ""): Promise<{ ok: true; paneId: number; sessionId: number; title: string; engine: string } | { ok: false; error: string }> {
  try {
    const raw: any = await apiPost("/api/v1/cockpit/side/open", { parent_pane_id: parentPaneId, ...(parentTitle ? { parent_title: parentTitle } : {}) }, { timeoutMs: 180_000 });
    if (raw === null || isNotWired(raw)) return { ok: false, error: raw === null ? "the serve did not answer" : OUT_OF_DATE("side questions") };
    const r: any = un(raw);
    return r?.ok === true && typeof r.pane_id === "number" ? { ok: true, paneId: r.pane_id, sessionId: Number(r.session_id) || 0, title: String(r.title ?? "Side question"), engine: String(r.engine ?? "") } : { ok: false, error: String(r?.error ?? "could not open the side question") };
  } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}

/** Turn Heimdall's screening and routing on or off for this agent (`null`: back to its provider's default - off for the frontier providers, which screen their own work; on for open and local models). */
export async function setPaneHeimdall(paneId: number, on: boolean | null): Promise<{ ok: boolean; heimdall?: boolean; heimdallDefault?: boolean; error?: string }> {
  try { const r: any = un(await apiPost("/api/v1/cockpit/pane/heimdall", { pane_id: paneId, on }, { timeoutMs: 30_000 })); return r?.ok === true ? { ok: true, heimdall: r.heimdall === true, heimdallDefault: r.heimdall_default === true } : { ok: false, error: String(r?.error ?? "could not change it") }; } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}

// ── the microphone ──────────────────────────────────────────────────────────────────────────────────────────────────
export type VoiceStatus = { available: boolean; engine: string | null; hint: string | null };
/** Can this machine turn speech into words (a local whisper and ffmpeg), and if not, what to install. */
export async function voiceStatus(): Promise<VoiceStatus> {
  try { const raw: any = await apiGet("/api/v1/voice/status"); if (isNotWired(raw)) return { available: false, engine: null, hint: OUT_OF_DATE("the microphone") }; const r: any = un(raw); return { available: r?.available === true, engine: typeof r?.engine === "string" ? r.engine : null, hint: typeof r?.hint === "string" ? r.hint : null }; } catch { return { available: false, engine: null, hint: "the machine did not answer" }; }
}
/** A recording to words, on this machine. */
export async function transcribe(blob: Blob, lang = ""): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const r = await fetch(`${BE_URL}/api/v1/voice/transcribe${lang ? `?lang=${encodeURIComponent(lang)}` : ""}`, { method: "POST", body: blob, headers: { "content-type": blob.type || "audio/webm" } });
    const j: any = await r.json().catch(() => null); return j?.ok === true ? { ok: true, text: String(j.text ?? "") } : { ok: false, error: r.status === 404 ? OUT_OF_DATE("the microphone") : String(j?.error ?? `the machine answered ${r.status}`) };
  } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}
/** Type words into an agent's terminal and send them, as if the person had. */
/** One turn of the engine's own conversation, as the chat skin draws it. */
export type ChatTurn = { role: "user" | "assistant"; t: string; text: string; tools: { id?: string; name: string; brief: string; done: boolean; ok: boolean }[]; model?: string; tokens_in?: number; tokens_out?: number; /** antiloki typed it (a handover, a setting command): not something the person said */ by?: "antiloki" };
/** The pane's conversation read from the engine's own transcript (Claude Code); `known: false` for an engine whose pane stays a terminal. */
export async function ptyTranscript(paneId: number, cap = 200): Promise<{ known: boolean; turns: ChatTurn[]; why?: string } | null> {
  try { const r: any = un(await apiGet(`/api/v1/cockpit/pty/transcript?pane_id=${paneId}&cap=${cap}`)); if (!r || r.ok !== true) return null; return { known: r.known === true, turns: Array.isArray(r.turns) ? r.turns : [], why: typeof r.why === "string" ? r.why : undefined }; } catch { return null; }
}
export async function sendToAgent(paneId: number, text: string): Promise<{ ok: boolean; error?: string }> {
  try { const r: any = un(await apiPost("/api/v1/cockpit/pty/send", { pane_id: paneId, text }, { timeoutMs: 60_000 })); return r?.ok === true ? { ok: true } : { ok: false, error: String(r?.error ?? "could not send it") }; } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}

/** What to do with a thread's own tree: bring its agents' work together (`integrate`), merge it into the workspace (`land`), or throw it away (`discard`). The serve's own sentence when it refuses or a merge conflicts. */
/** The person asks for a worktree for a thread. `carry` is their answer about uncommitted changes; without it the server asks first (`ask_carry`). `restart` lists the agents that moved. */
export type Isolated = { ok: boolean; error?: string; noGit?: boolean; askCarry?: { files: string[]; count: number }; restart: number[]; copied: number };
export async function isolateThread(thread: string, carry?: boolean): Promise<Isolated> {
  try {
    const r: any = un(await apiPost("/api/v1/cockpit/cowork/threads/tree", { op: "isolate", thread, ...(carry === undefined ? {} : { carry }) }, { timeoutMs: 300_000 }));
    if (!r) return { ok: false, error: "the serve did not answer", restart: [], copied: 0 };
    return { ok: r.ok === true, error: typeof r.error === "string" ? r.error : undefined, noGit: r.no_git === true, askCarry: r.ask_carry === true ? { files: Array.isArray(r.files) ? r.files.map(String) : [], count: Number(r.count) || 0 } : undefined, restart: Array.isArray(r.restart) ? r.restart.map(Number) : [], copied: Number(r.copied) || 0 };
  } catch (e: any) { return { ok: false, error: String(e?.message ?? e), restart: [], copied: 0 }; }
}
/** "Not now" to an agent's suggestion. */
export async function dismissWorktreeSuggestion(thread: string): Promise<void> { try { await apiPost("/api/v1/cockpit/cowork/threads/tree", { op: "dismiss", thread }, { timeoutMs: 15_000 }); } catch { /* it is still shown, and can be said again */ } }
export async function threadTree(op: "integrate" | "land" | "update" | "discard", thread: string): Promise<{ ok: boolean; line: string; raw: any }> {
  try {
    const r: any = un(await apiPost("/api/v1/cockpit/cowork/threads/tree", { op, thread }, { timeoutMs: 300_000 }));
    if (!r) return { ok: false, line: "the serve did not answer", raw: r };
    const conflicts = Array.isArray(r.conflicts) ? r.conflicts : []; const errors = Array.isArray(r.errors) ? r.errors : [];
    if (op === "integrate" && r.ok !== undefined) return { ok: r.ok === true, line: `${(r.merged ?? []).length} agent${(r.merged ?? []).length === 1 ? "" : "s"} brought together${conflicts.length ? `; conflicts: ${conflicts.map((c: any) => `${c.agent} (${(c.files ?? []).join(", ")})`).join("; ")}` : ""}${errors.length ? `; ${errors.map((e: any) => `${e.agent}: ${e.error}`).join("; ")}` : ""}`, raw: r };
    return r.ok === true ? { ok: true, line: op === "land" ? "landed in the workspace" : op === "update" ? (r.already ? "already up to date with the workspace" : "updated from the workspace") : op === "discard" ? "discarded" : "done", raw: r } : { ok: false, line: String(r.error ?? "that did not work"), raw: r };
  } catch (e: any) { return { ok: false, line: String(e?.message ?? e), raw: null }; }
}

// WEB APPS: the store, what is installed, install / uninstall / inspect (serve/src/webapps.rs). Never throws.
export async function loadWebApps(): Promise<WebApps | null> { try { const r: any = un(await apiGet("/api/v1/webapps")); return r?.ok === true ? parseWebApps(r) : null; } catch { return null; } }
export async function webAppOp(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; mcp_reach?: any; webapps: WebApps | null }> {
  try { const raw: any = await apiPost("/api/v1/webapps", body, { timeoutMs: 30_000 }); const r: any = un(raw); if (r?.ok !== true) return { ok: false, error: typeof r?.error === "string" ? r.error : isNotWired(raw) ? OUT_OF_DATE("web apps") : "the serve did not accept that", webapps: null }; return { ok: true, mcp_reach: r.mcp_reach ?? null, webapps: Array.isArray(r.installed) ? parseWebApps({ catalog: [], installed: r.installed }) : null }; } catch { return { ok: false, error: "the serve could not be reached", webapps: null }; }
}
/** Connect check: list an installed app's tools through the serve's MCP client (op "tools"), or keep/forget its token (op "token_set"/"token_forget"). */
export type AppTest = { ok: boolean; needsSignin: boolean; error: string; signedIn: boolean; tools: { name: string; risk: string }[] };
export async function webAppConnect(body: Record<string, unknown>): Promise<AppTest> {
  const none: AppTest = { ok: false, needsSignin: false, error: "the serve could not be reached", signedIn: false, tools: [] };
  try {
    const r: any = un(await apiPost("/api/v1/webapps", body, { timeoutMs: 30_000 }));
    const tools = Array.isArray(r?.tools) ? r.tools.filter((t: any) => t && typeof t.name === "string").map((t: any) => ({ name: String(t.name).slice(0, 80), risk: typeof t.risk === "string" ? t.risk : "read" })) : [];
    return { ok: r?.ok === true, needsSignin: r?.needs_signin === true, error: typeof r?.error === "string" ? r.error.slice(0, 300) : "", signedIn: r?.signed_in === true, tools };
  } catch { return none; }
}
/** Read an installed app's data: one READ tool of its MCP through the serve (op "call"), the JSON it answers parsed. The serve refuses a tool that writes unless it is confirmed. */
export async function appRead(app: string, tool: string, args: Record<string, unknown> = {}, confirm = false): Promise<{ ok: boolean; data: any; error: string; needsSignin: boolean }> {
  try {
    const r: any = un(await apiPost("/api/v1/webapps", { op: "call", app, tool, args, ...(confirm ? { confirm: true } : {}) }, { timeoutMs: 45_000 }));
    if (r?.ok !== true) return { ok: false, data: null, error: typeof r?.error === "string" ? r.error.slice(0, 300) : "that did not work", needsSignin: r?.needs_signin === true };
    const res = r.result ?? {}; if (res.is_error) return { ok: false, data: null, error: String(res.text ?? "the app said error").slice(0, 300), needsSignin: false };
    let data = res.structured ?? null; if (data == null && typeof res.text === "string") { try { data = JSON.parse(res.text); } catch { data = res.text; } }
    if (typeof data === "string" && Array.isArray(res.content)) { const f = res.content.find((c: any) => c?.type === "resource" && typeof c.resource?.text === "string"); if (f) data = f.resource.text; }   // a file read (GitHub get_file_contents): the words are in the resource block, the text block only says it was downloaded
    return { ok: true, data, error: "", needsSignin: false };
  } catch { return { ok: false, data: null, error: "the serve could not be reached", needsSignin: false }; }
}
/** Sign in to an installed app by its own OAuth (serve op oauth_begin): the serve opens the app's sign-in in the person's browser; when it is not able to, the address comes back to show. */
export async function webAppSignIn(app: string): Promise<{ ok: boolean; error: string; url: string | null }> {
  try { const r: any = un(await apiPost("/api/v1/webapps", { op: "oauth_begin", app }, { timeoutMs: 45_000 })); return r?.ok === true ? { ok: true, error: "", url: typeof r.url === "string" ? r.url : null } : { ok: false, error: typeof r?.error === "string" ? r.error.slice(0, 300) : "the sign-in did not start", url: null }; }
  catch { return { ok: false, error: "the serve could not be reached", url: null }; }
}
/** Free panes (RFC 0016): the folders of the project and what the serve says of one (op list, read, approve, revoke). */
/** The models of this machine's own server (Ollama): each can be an agent's brain (Claude Code on a local model). */
export type LocalModel = { id: string; tag: string; label: string; size_gb: number; params: string; family?: string; /** the server is too old to load it: why */ unavailable?: string };
/** `gpu_mb`: the VRAM of the GPU(s) in MB, null when there is none to read (local models then run on the CPU). `loaded`: the models Ollama holds now and how much of each is on the GPU. */
export async function localModels(): Promise<{ reachable: boolean; base: string; models: LocalModel[]; error?: string; gpuMb?: number | null; loaded?: { name: string; gpu_pct: number }[] }> {
  try { const r: any = un(await apiGet("/api/v1/local/models")); return { reachable: r?.reachable === true, base: String(r?.base ?? ""), models: Array.isArray(r?.models) ? r.models : [], error: typeof r?.error === "string" ? r.error : undefined, gpuMb: typeof r?.gpu_mb === "number" ? r.gpu_mb : r && "gpu_mb" in r ? null : undefined, loaded: Array.isArray(r?.loaded) ? r.loaded.filter((x: any) => x && typeof x.name === "string").map((x: any) => ({ name: x.name, gpu_pct: Number(x.gpu_pct) || 0 })) : undefined }; } catch { return { reachable: false, base: "", models: [] }; }
}
/** The specialists of this project that can be opened (approved ones), with their mascot. */
export type SpecialistRow = { id: string; name: string; purpose: string; shape?: string; color?: string; notes: number; /** a team's Leader: it opens only in its own team */ leader?: boolean };
export async function specialistsOpenable(): Promise<SpecialistRow[]> {
  try { const r: any = un(await apiPost("/api/v1/cockpit/team-graph", { op: "specialist_list", pane_id: 0 }, { timeoutMs: 8_000 })); return (Array.isArray(r?.specialists) ? r.specialists : []).filter((x: any) => x?.usable === true).map((x: any) => ({ id: String(x.specialist.id), name: String(x.specialist.name), purpose: String(x.specialist.purpose ?? ""), leader: x.specialist.kind === "leader" || undefined, shape: x.specialist.shape || undefined, color: x.specialist.color || undefined, notes: Number(x.notes) || 0 })); } catch { return []; }
}
/** Specialists that exist but are not approved yet (a draft an agent proposed): they wait for the person. */
export async function specialistDrafts(): Promise<{ id: string; name: string }[]> {
  try { const r: any = un(await apiPost("/api/v1/cockpit/team-graph", { op: "specialist_list", pane_id: 0 }, { timeoutMs: 8_000 })); return (Array.isArray(r?.specialists) ? r.specialists : []).filter((x: any) => x?.usable !== true && x?.specialist?.status !== "approved" && x?.specialist?.kind !== "leader").map((x: any) => ({ id: String(x.specialist?.id ?? ""), name: String(x.specialist?.name ?? x.specialist?.id ?? "") })).filter((x: any) => x.id); } catch { return []; }
}
export type SpecialistDef = { model?: string; skill_docs?: { name: string; when: string; prompt: string }[]; own_tools?: { name: string; description: string; code: string }[]; seed_notes?: string[]; kind?: string; team?: string; id: string; name: string; purpose: string; seat: string; memory_scope: string; persona?: string; prompt?: string; context?: string[]; mcps?: string[]; assistants?: string[]; packs: string[]; tools: string[]; skills: string[]; limits: { budget_usd: number; turns: number }; shape?: string; color?: string; status?: string };
export type SpecialistNote = { n: number; t_ms: number; kind: string; text: string; reason: string; by: string };
export type SpecialistFull = { memory?: { notes: number; last_note_ms: number | null; chunks: number; tokens: number; consolidation?: { due?: boolean; tokens?: number } | null }; warnings?: { path: string; message: string }[]; specialist: SpecialistDef; usable: boolean; notes: SpecialistNote[]; allowed: { tools: string[]; shapes: string[]; colors: string[] } };
export async function specialistGet(id: string): Promise<SpecialistFull | null> {
  try { const r: any = un(await apiPost("/api/v1/cockpit/team-graph", { op: "specialist_get", pane_id: 0, id }, { timeoutMs: 8_000 })); return r?.ok === true ? { memory: r.memory, warnings: Array.isArray(r.warnings) ? r.warnings : [], specialist: r.specialist, usable: r.usable === true, notes: Array.isArray(r.notes) ? r.notes : [], allowed: r.allowed ?? { tools: [], shapes: [], colors: [] } } : null; } catch { return null; }
}
/** Save a specialist as the person: it is approved at once (the person looked at it). The serve's own sentence when it refuses. */
export async function specialistSave(def: SpecialistDef): Promise<{ ok: boolean; error?: string }> {
  try { const r: any = un(await apiPost("/api/v1/cockpit/team-graph", { op: "specialist_save", pane_id: 0, specialist: def }, { timeoutMs: 8_000 })); return r?.ok === true ? { ok: true } : { ok: false, error: String(r?.error ?? "could not save") }; } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}
/** Takes a specialist out of the lists; its memory stays on disk. */
export async function specialistRetire(id: string): Promise<{ ok: boolean; error?: string }> {
  try { const r: any = un(await apiPost("/api/v1/cockpit/team-graph", { op: "specialist_retire", pane_id: 0, id }, { timeoutMs: 8_000 })); return r?.ok === true ? { ok: true } : { ok: false, error: String(r?.error ?? "could not remove it") }; } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}
export async function specialistFork(id: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  try { const r: any = un(await apiPost("/api/v1/cockpit/team-graph", { op: "specialist_fork", pane_id: 0, id }, { timeoutMs: 8_000 })); return r?.ok === true ? { ok: true, id: String(r.specialist?.id) } : { ok: false, error: String(r?.error ?? "could not fork") }; } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}
/** The team's Leader is a specialist: make it the first time (a persona, a memory, an avatar) and tie this pane to it. */
export async function bindLeaderSpecialist(team: string, paneId: number): Promise<{ id: string; shape?: string; color?: string } | null> {
  try { const r: any = un(await apiPost("/api/v1/cockpit/team-graph", { op: "specialist_bind_leader", pane_id: 0, team, bind_pane: paneId }, { timeoutMs: 8_000 })); return r?.ok === true && r.specialist?.id ? { id: String(r.specialist.id), shape: r.specialist.shape || undefined, color: r.specialist.color || undefined } : null; } catch { return null; }
}
export async function specialistNote(id: string, kind: string, text: string, reason = ""): Promise<{ ok: boolean; error?: string }> {
  try { const r: any = un(await apiPost("/api/v1/cockpit/team-graph", { op: "specialist_note", pane_id: 0, id, kind, text, reason }, { timeoutMs: 8_000 })); return r?.ok === true ? { ok: true } : { ok: false, error: String(r?.error ?? "could not add the note") }; } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}
/** Give a specialist another avatar: its definition keeps the shape and colour (the person's own save). */
export async function setSpecialistLook(id: string, shape: string, color: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const g: any = un(await apiPost("/api/v1/cockpit/team-graph", { op: "specialist_get", pane_id: 0, id }, { timeoutMs: 8_000 })); if (g?.ok !== true || !g.specialist) return { ok: false, error: String(g?.error ?? "no such specialist") };
    const r: any = un(await apiPost("/api/v1/cockpit/team-graph", { op: "specialist_save", pane_id: 0, specialist: { ...g.specialist, shape, color } }, { timeoutMs: 8_000 })); return r?.ok === true ? { ok: true } : { ok: false, error: String(r?.error ?? "could not save") };
  } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}
/** Open a specialist as a pane: the serve opens the agent with its brief and binds the pane to it (the same path an agent's `antiloki_pane_open {specialist}` takes). */
export async function openSpecialist(id: string, side: string): Promise<{ ok: boolean; error?: string }> {
  try { const r: any = await apiPost("/api/v1/cockpit/cowork/mcp", { pane_id: 1, tool: "antiloki_pane_open", args: { specialist: id, side } }, { timeoutMs: 60_000 }); const j: any = un(r); return j?.ok === false ? { ok: false, error: String(j?.error ?? "could not open it") } : { ok: true }; } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}
export async function panesOp(body: Record<string, unknown>): Promise<any> {
  try { return un(await apiPost("/api/v1/panes", body, { timeoutMs: 20_000 })); } catch { return { ok: false, error: "the serve could not be reached" }; }
}
export async function inspectWebApp(app_url: string, openapi_url = ""): Promise<{ inspection: Inspection | null; error?: string }> {
  try { const r: any = un(await apiPost("/api/v1/webapps", { op: "inspect", app_url, openapi_url }, { timeoutMs: 30_000 })); const i = parseInspection(r); return i ? { inspection: i } : { inspection: null, error: typeof r?.error === "string" ? r.error : "could not look at that address" }; } catch { return { inspection: null, error: "the serve could not be reached" }; }
}

/** Can the app's page be shown inside this app? (its frame headers, read by the serve). `unknown` when the serve cannot say: the pane then tries the frame. */
export async function checkFrame(app_url: string): Promise<{ frameable: boolean | "unknown"; why: string }> {
  try { const r: any = un(await apiPost("/api/v1/webapps", { op: "frame", app_url }, { timeoutMs: 15_000 })); if (r?.ok !== true) return { frameable: "unknown", why: "" }; return { frameable: r.frameable === false ? false : true, why: typeof r.why === "string" ? r.why : "" }; } catch { return { frameable: "unknown", why: "" }; }
}

/** Open a site as an APP WINDOW of its own (a Chromium-family browser started by the serve on this machine, with a profile of its own per app, so its sign-in is kept). `ok:false` says why (no browser, a phone asking). */
export async function launchAppWindow(app: { id: string; url: string }): Promise<{ ok: boolean; error?: string }> {
  try { const r: any = un(await apiPost("/api/v1/webapps/launch", { id: app.id, app_url: app.url }, { timeoutMs: 15_000 })); if (r?.ok === true) return { ok: true }; return { ok: false, error: typeof r?.error === "string" ? r.error : "the serve could not start a window" }; } catch { return { ok: false, error: "the serve could not be reached" }; }
}

/** Give an agent a file (an image pasted, imported or dropped on its terminal): saved in its box, and the path to type into its input comes back. */
export async function attachFile(paneId: number, file: File): Promise<{ ok: true; path: string; kind: string } | { ok: false; error: string }> {
  try {
    const { fileToBase64 } = await import("./terminal-input");
    const r: any = un(await apiPost("/api/v1/cockpit/pane/attach", { pane_id: paneId, name: file.name || "pasted", data_base64: await fileToBase64(file) }, { timeoutMs: 60_000 }));
    return r?.ok === true && typeof r.path === "string" ? { ok: true, path: r.path, kind: String(r.kind ?? "") } : { ok: false, error: typeof r?.error === "string" ? r.error : "the serve did not accept the file" };
  } catch { return { ok: false, error: "the serve could not be reached" }; }
}

// A WEB APP'S MCP TOOLS (RFC 0009, BL-12): the person reads an app's tools with their risk, signs in with a token (kept by the serve, never shown again), and calls one. The serve decides what each risk may do.
export type AppTool = { name: string; description: string; risk: "read" | "write" | "destructive"; input_schema?: any };
export type AppToolsReply = { ok: boolean; error?: string; tools: AppTool[]; signed_in: boolean; needs_signin: boolean };
export async function appTools(app: string): Promise<AppToolsReply> {
  try { const r: any = un(await apiPost("/api/v1/webapps", { op: "tools", app }, { timeoutMs: 30_000 })); return { ok: r?.ok === true, error: typeof r?.error === "string" ? r.error : undefined, tools: Array.isArray(r?.tools) ? r.tools : [], signed_in: r?.signed_in === true, needs_signin: r?.needs_signin === true }; } catch { return { ok: false, error: "the serve did not answer", tools: [], signed_in: false, needs_signin: false }; }
}
export async function appSignIn(app: string, token: string | null): Promise<{ ok: boolean; error?: string; signed_in?: boolean }> {
  try { const r: any = un(await apiPost("/api/v1/webapps", token === null ? { op: "token_forget", app } : { op: "token_set", app, token }, { timeoutMs: 15_000 })); return r?.ok === true ? { ok: true, signed_in: r.signed_in === true } : { ok: false, error: typeof r?.error === "string" ? r.error : "not saved" }; } catch { return { ok: false, error: "the serve did not answer" }; }
}
export async function appCall(app: string, tool: string, args: unknown, confirm: boolean): Promise<{ ok: boolean; error?: string; text?: string; is_error?: boolean; ms?: number }> {
  try { const r: any = un(await apiPost("/api/v1/webapps", { op: "call", app, tool, args, confirm }, { timeoutMs: 60_000 })); return r?.ok === true ? { ok: true, text: String(r.result?.text ?? ""), is_error: r.result?.is_error === true, ms: r.result?.ms } : { ok: false, error: typeof r?.error === "string" ? r.error : "the call failed" }; } catch { return { ok: false, error: "the serve did not answer" }; }
}
/** X-ray v2's own door (the board's data: sources, widgets, preview, save). The serve says why in `error`. */
export async function apiXrayV2(op: string, body: Record<string, unknown> = {}): Promise<any> {
  try { return un(await apiPost("/api/v1/xray/v2", { op, ...body }, { timeoutMs: 30_000 })); } catch { return { ok: false, error: "the serve could not be reached" }; }
}
/** Everything answering on this machine's dev ports (a web page has a title). */
export type RunningPort = { port: number; url: string; web: boolean; title: string | null };
/** `null` when the serve cannot say (an older serve has no such route) */
export async function runningPorts(): Promise<RunningPort[] | null> {
  try { const r: any = un(await apiGet("/api/v1/local/ports")); return Array.isArray(r?.ports) ? r.ports : null; } catch { return null; }
}
/** One entry of a folder on this computer (the Files pane). */
export type FileEntry = { name: string; kind: "dir" | "file"; link: boolean; size: number | null; mtime: number | null; hidden: boolean };
export type FileListing = { ok: boolean; error?: string; path: string; parent: string | null; home: string; entries: FileEntry[]; more: boolean; places: { name: string; path: string }[]; private: boolean };
export async function listFolder(path: string): Promise<FileListing | null> {
  try { const r: any = un(await apiGet(`/api/v1/files/list?path=${encodeURIComponent(path)}`)); return r && typeof r === "object" ? (r as FileListing) : null; } catch { return null; }
}
export type FileLook = { ok: boolean; error?: string; kind?: "text" | "image" | "binary" | "big" | "private"; size?: number; path?: string; text?: string; truncated?: boolean; data_url?: string; note?: string };
export async function lookAtFile(path: string): Promise<FileLook | null> {
  try { const r: any = un(await apiGet(`/api/v1/files/read?path=${encodeURIComponent(path)}`)); return r && typeof r === "object" ? (r as FileLook) : null; } catch { return null; }
}

/** A new team's leader: the agent pane is marked as onboarding, and its terminal is told to ask the person for the team's name and purpose. */
export async function onboardTeamLeader(paneId: number): Promise<{ ok: boolean; error?: string }> {
  try { const r: any = un(await apiPost("/api/v1/cockpit/team/onboard", { pane_id: paneId }, { timeoutMs: 30_000 })); return r && r.ok === true ? { ok: true } : { ok: false, error: String(r?.error ?? "could not start the team leader") }; }
  catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}
