// GENERIC COCKPIT PANE, inline in the chat — reuses the cockpit's OWN pane components (the same ones the
// board renders), so any self-contained pane_kind can appear inline in a chat widget. These panes key
// their state / PTY / dev-server off the (session, pane) id, so a stable minted pair (carried in the
// widget payload) gives each inline pane its own instance that survives reload.
//
// NOT here on purpose: the AGENT pane (it needs a provisioned worktree + the session's turn machinery —
// it's the cockpit's core, not a standalone component) and SCRIPT (no standalone export). Those stay in
// the cockpit; the Studio offers them as "open the cockpit" launchers.
import { ENGINE_KEYS } from "@/loki/api/engine";
import { devOnly } from "@/loki/dev-only";
import { currentRoleKeyOf } from "@/loki/chat/role-switcher";
import { fetchRoles, type RoleWithMerges } from "@/loki/chat/roles";
import { PaneDiffView, PaneCommitsView } from "@/loki/cockpit/pane-work";
import React from "react";
import { C, mono } from "@/loki/theme";
import { apiPost, apiGet } from "@/loki/api/client";
import type { Pane } from "@/loki/api/types";
import { paneDisplay } from "./types";
import {
  ShellPane, DesignPane, JudgmentPane, FuelPane, StandupPane, ReviewPane, SessionTimelinePane,
} from "@/loki/cockpit/cockpit-panes-tools";
import { BrainstormPane } from "@/loki/cockpit/brainstorm-pane";
import { RunPane, GatePane, ContextPane, StatePane } from "@/loki/cockpit/cockpit-panes-extra";
import { OpencodePane } from "@/loki/cockpit/opencode-pane";
/** the engines that run as a chat session (agent.rs · agent_codex.rs · agent_opencode.rs) — ALWAYS (operator 2026-09-21:
 *  the per-pane switch to the raw TUI is gone; the PTY is the Terminal widget's, for logins and the odd interactive
 *  prompt); the legacy `opencode-direct` kind of the old cockpit screen keeps its terminal */
// THE KINDS THAT RENDER AS A CHAT. All five seats since 2026-09-28 — a pane switched to Cursor or Gemini used to
// fall through to the terminal chrome, because this set had never heard of them.
import { useSeats, offered } from "@/loki/api/seats";
import { ShapeTreePane } from "@/loki/cockpit/shape-tree";
import { FileTree, ScriptPane } from "@/loki/cockpit/cockpit-view";
import { PackChips, useAtlasEntries, filesInScope, tokensInScope, fmtTok, covered, withDefaultScope } from "./scope-picker";
import { CopyButton, ArtifactWidget } from "./view-widgets";
import { Frame, CloseX } from "./window-frame";
import { readPair, pairLabel, AgentWizard, type WizardTab } from "./agent-wizard";
import { AgentCloseDialog, CLI_KINDS } from "./agent-close";
import { routedPrompt, claudeModelForTier, planGoalRun, queueAdd, listSubagents, planSubagents, spawnSubagents, cancelSubagent, markDelivered, deliveryMessage, jobGlyph, activeJobs, publishSubagents, subagentKey, listGoalRuns, publishGoalRuns, activeRuns, goalDelivery, goalOp, type SubagentJob, type SubagentTask, type GoalRun } from "./subagents";
import { QueueView, useQueue, activeCount } from "./queue-view";
import { GoalRunPanel } from "./goal-run-panel";
import { auditStory, auditHeadline } from "./audit-story";
import { SideQuestionsRail, useSideQuestions, type SideKind } from "@/loki/chat/side-questions";
import { RouteView, ScreenView, PlanView, QaView, useQaRailState } from "./heimdall-rail";
import { GoalStrip } from "./goal-strip";
import { Check } from "@/loki/codebase/checkbox-tree";
import { ModelPicker } from "@/loki/chat/chat-modes";
import { sayToAgent, typeToAgent, feedAgent, readBlockDrag, hasBlockDrag, markChatPane } from "./agent-interact";
import { AgentChatPane, askOf, type ChatSwitch } from "@/loki/cockpit/agent-chat-pane";
import { saveTurnWidget } from "@/loki/api/dispatch";
import { reportScreenState, clearScreenState } from "@/loki/chat/screen-manifest";
import { parsePack, withPack, toggleItem, itemKey, itemLabel, quickStats, bakeContextPack, fetchSources, fetchReads, fetchUsage, fetchPlans, fetchAnswers, fetchAudit, auditVerdict, usageChipTitle, expandOptions, quotaState, handoffTargets, handoffAsk, fetchPtyQuota, writeHandoff, KIND_GLYPH, DEFAULT_RULE, type ContextPack, type PackBake, type PackItem, type PackSource, type PackReads, type PackUsage, type PackPlan, type PackAnswer, type PackAudit, type PtyQuota } from "./context-pack";

const unwrap = (r: any) => r?.result?.result ?? r?.result ?? r;

// the provisioning spinner keyframes — injected once.
if (typeof document !== "undefined" && !document.getElementById("loki-pane-anim")) {
  const s = document.createElement("style");
  s.id = "loki-pane-anim";
  s.textContent = "@keyframes lokiPaneSpin{to{transform:rotate(360deg)}}@keyframes lokiZoneFade{from{opacity:0}to{opacity:1}}@keyframes lokiRailBlink{0%,100%{opacity:.35;box-shadow:none}50%{opacity:1;box-shadow:0 0 8px currentColor}}";
  document.head.appendChild(s);
}

// CLI AGENTS INLINE, FOR REAL (operator 2026-07-25: "▶ doesn't work — they should create the worktree,
// scoped access, receive the session context, and work like the terminal"). A minted pane id has no
// cockpit_panes row and no worktree, so the BE said "pane not found" and ▶ stayed disabled. This wrapper
// PROVISIONS through the real substrate path before rendering the terminal — idempotently:
//   1. find-or-create ONE cockpit session per chat session (name antichat#<chat id>),
//   2. find-or-create THIS widget's pane in it (subagent_name = the widget's stable key) via
//      system.cockpit.pane.add — which creates the pane row AND the scoped worktree + branch,
//      carrying the chat session's brief as the pane's extra prompt (the session context).
// Same widget after a reload resolves to the SAME pane → same worktree, same PTY state.
// ONE ensure per widget key, module-level: React double-mounts (StrictMode, card+window) share the same
// promise instead of racing duplicate sessions/panes into the DB (that race minted two antichat#16 rows).
const ensureInflight = new Map<string, Promise<any>>();
const LONG = { timeoutMs: 120_000 }; // `git worktree add` checks out the whole tree — 5s default aborted it

// PROVISIONING TRACE (operator 2026-07-25: "a building list of all steps, like reasoning does"): each
// ensure key gets a live step list; every mounted view of that pane subscribes and re-renders as steps land.
type Prog = { steps: { t: string; done: boolean }[]; listeners: Set<() => void> };
const progByKey = new Map<string, Prog>();
const progOf = (key: string): Prog => { let p = progByKey.get(key); if (!p) { p = { steps: [], listeners: new Set() }; progByKey.set(key, p); } return p; };
const step = (key: string, t: string) => { const p = progOf(key); for (const s of p.steps) s.done = true; p.steps.push({ t, done: false }); p.listeners.forEach((f) => f()); };
const stepsDone = (key: string) => { const p = progOf(key); for (const s of p.steps) s.done = true; p.listeners.forEach((f) => f()); };

// SCOPE IS OBLIGATORY (operator 2026-09-16): a code agent boots only with an edit whitelist. The gate
// below asks for it before provisioning; `scope` rides into pane/add (new pane) or pane/update
// (a legacy row with no scope) so the brief, the sentry and the context pack all start scoped.
async function findExistingPane(key: string, name: string): Promise<{ session: any; pane: any } | null> {
  const list = unwrap(await apiPost(`/api/v1/cockpit/session/get`, {}, { timeoutMs: 15_000 }));
  const matches = (Array.isArray(list?.sessions) ? list.sessions : []).filter((s: any) => s?.name === name && s?.status !== "closed");
  const cs: any = matches.sort((a: any, b: any) => a.id - b.id)[0];
  if (!cs?.id) return null;
  const got = unwrap(await apiPost(`/api/v1/cockpit/session/get`, { id: cs.id }, { timeoutMs: 15_000 }));
  const pane = (Array.isArray(got?.panes) ? got.panes : []).find((x: any) => x?.subagent_name === key) ?? null;
  return { session: cs, pane };
}
function paneScopeOf(pane: any): string[] {
  if (Array.isArray(pane?.scope) && pane.scope.length) return pane.scope.map(String);
  try { const s = JSON.parse(pane?.scope_json ?? "[]"); return Array.isArray(s) ? s.map(String) : []; } catch { return []; }
}

async function ensurePane(kind: string, key: string, name: string, brief: string | null | undefined, scope: string[] = [], recipe?: PaneRecipe): Promise<any> {
  const cached = ensureInflight.get(key);
  if (cached) return cached;
  const run = (async () => {
    // 1) find-or-create the chat's cockpit session (tolerate duplicates from the pre-dedupe era: lowest id wins)
    step(key, "connecting to the cockpit…");
    const list = unwrap(await apiPost(`/api/v1/cockpit/session/get`, {}, { timeoutMs: 15_000 }));
    const matches = (Array.isArray(list?.sessions) ? list.sessions : []).filter((s: any) => s?.name === name && s?.status !== "closed");
    let cs: any = matches.sort((a: any, b: any) => a.id - b.id)[0];
    if (cs) step(key, `found this chat's cockpit session · ${name} (#${cs.id})`);
    else {
      step(key, `creating the chat's cockpit session · ${name}…`);
      const made = unwrap(await apiPost(`/api/v1/cockpit/session/create`, { name, mission_md: brief || `Inline panes for ${name}.` }, LONG));
      cs = made?.session;
      if (!cs?.id && made?.error) throw new Error(`session/create: ${made.error}`);
      if (cs?.id) step(key, `session #${cs.id} ready · mission = the chat's brief`);
    }
    if (!cs?.id) throw new Error("session/create returned nothing (BE down or route missing)");
    // 2) find-or-create THIS widget's pane (worktree provisioning can be slow — long timeout)
    const findPane = async () => {
      const got = unwrap(await apiPost(`/api/v1/cockpit/session/get`, { id: cs.id }, { timeoutMs: 15_000 }));
      return (Array.isArray(got?.panes) ? got.panes : []).find((x: any) => x?.subagent_name === key) ?? null;
    };
    step(key, "looking for this pane in the box…");
    let p: any = await findPane();
    if (p?.worktree_path) {
      step(key, `pane #${p.id} already provisioned — reattaching`);
      if (scope.length && !paneScopeOf(p).length) {
        step(key, `setting the scope · ${scope.join(", ")}`);
        const u = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: p.id, scope }, { timeoutMs: 60_000 }));
        if (u?.pane) p = u.pane;
      }
    } else {
      // Either no row yet, or a row whose worktree never landed (worktree_path NULL). pane/add
      // is idempotent on subagent_name for the pending case: it re-provisions THAT row instead
      // of adding a second pane — so both paths are one call.
      step(key, p ? `pane #${p.id} has no box yet — provisioning its worktree…` : "provisioning — pane row · scoped branch · git worktree checkout (the slow part, up to ~1 min)…");
      const rs = recipeSettingsOf(recipe);
      const added = unwrap(await apiPost(`/api/v1/cockpit/pane/add`, { session_id: cs.id, subagent_name: key, pane_kind: kind, extra_prompt_md: brief || undefined, ...(scope.length ? { scope } : {}), ...(rs ? { settings: rs } : {}) }, LONG));
      p = added?.pane ?? p ?? null;
      if (!p && added?.error) throw new Error(`pane/add: ${added.error}`);
      // the call may have timed out AFTER the row landed server-side — recheck before declaring failure.
      if (!p) { step(key, "slow response — rechecking whether the pane landed anyway…"); p = await findPane(); }
      if (p && !p.worktree_path) {
        // The engine's own reason (e.g. "worktree pending: git worktree add failed: …") is the
        // only useful thing to show — the retry button on the error view re-runs this whole path.
        throw new Error(added?.warn ? String(added.warn) : "worktree pending — the engine gave no reason; check the BE log");
      }
      if (p) step(key, `worktree ready · ${p.branch ?? p.worktree_path ?? ""}`);
    }
    if (!p?.id) throw new Error("pane/add returned nothing — likely a timeout while the worktree checked out; reopen this pane to pick it up");
    // SKILL LIBRARY (P1): materialize the enabled skills into the box as REAL files —
    // .claude/skills/* (Claude Code native) + the AGENTS.md index (Codex/OpenCode). Best-effort.
    step(key, "installing the skill library into the box…");
    try {
      const m = unwrap(await apiPost(`/api/v1/skilllib/materialize`, { pane_id: p.id, ...(recipe?.skills?.length ? { slugs: recipe.skills } : {}) }, { timeoutMs: 30_000 }));
      step(key, m?.written?.length ? `skills installed · ${m.written.length} (${m.written.slice(0, 3).join(", ")}${m.written.length > 3 ? "…" : ""})` : "skill library empty — nothing to install");
    } catch { step(key, "skill install skipped (library unavailable)"); }
    // CONTEXT PACK (2026-09-14): pane/add already baked the default pack into the box; this call is
    // the hash-skip that returns its manifest for the chip (and the real bake if add skipped it).
    step(key, "baking the context pack (reviews · laws · graph · tests)…");
    try {
      const b = await bakeContextPack(p.id);
      const n = Array.isArray(b?.items) ? b.items.filter((i) => i.written).length : 0;
      step(key, b?.ok ? (n ? `context pack ready · ${n} file${n === 1 ? "" : "s"} in .antiloki/context/${b.live ? " · live tools" : ""}` : "context pack: nothing to bake (preset none or no snapshot)") : `context pack skipped (${b?.error ?? "engine said no"})`);
      p.__pack = b;
    } catch { step(key, "context pack skipped (engine unavailable)"); }
    step(key, "attaching the terminal…");
    stepsDone(key);
    return p;
  })();
  ensureInflight.set(key, run);
  try { return await run; }
  catch (e) { ensureInflight.delete(key); stepsDone(key); throw e; } // failed runs don't poison the cache — a reopen retries
}

// ✎ EDIT (operator 2026-07-25: "the antiVibe pane's edit opens a scope and some options — reuse it"):
// the cockpit's edit-agent semantics on the inline pane — label · edit SCOPE (files it may WRITE; reads
// the whole repo, out-of-scope edits are blocked at the merge gate) · extra guidance (AGENTS.md brief) ·
// tier. Saves through the SAME route the cockpit uses (system.cockpit.pane.update).

/** THE ROLE HEIMDALL NAMED ON THE NEWEST RUN THAT NAMED ONE (Grokbot QA 2026-10-12, item 8: the chip stayed "role · routed" while the queue showed Frontender). The serve stores the verdict on the RUN
 *  (`GoalRun.role = { role, name, why, ... }`); this read `run.route.role`, a field `Route` does not have, so it was always null. `route.role` is still honoured for an older serve. Pure - tested. */
export function routedRoleOf(goalRuns: any[]): string | null {
  const r = [...(goalRuns ?? [])].reverse().find((x: any) => x?.role?.role || x?.route?.role);
  return (r as any)?.role?.role ?? (r as any)?.route?.role ?? null;
}
export function roleWhyOf(goalRuns: any[]): string | null {
  const r = [...(goalRuns ?? [])].reverse().find((x: any) => x?.role?.why || x?.route?.why);
  return (r as any)?.role?.why ?? (r as any)?.route?.why ?? null;
}
/** THE BUDGET BOX KEEPS WHAT IS TYPED (Grokbot QA 2026-10-12, item 9: "clearing snaps to 1000, digits append, 150000 became 1000000"). It was controlled by the CLAMPED number, so clearing the box (0) wrote 1000 back
 *  and every digit then appended to it. The box holds its own text; a value of 1000 or more is passed up as it is typed, and the box is tidied (at least 1000) when it loses focus. */
export function BudgetField({ value, onChange, style }: { value: number; onChange: (n: number) => void; style?: React.CSSProperties }) {
  const [txt, setTxt] = React.useState(String(value));
  React.useEffect(() => { setTxt((t) => (Math.max(1000, Math.floor(Number(t)) || 1000) === value ? t : String(value))); }, [value]);
  return (
    <input type="number" min={1000} step={10000} value={txt} data-testid="budget-chars" style={style}
      onChange={(e) => { const v = e.target.value; setTxt(v); const n = Math.floor(Number(v)); if (v !== "" && n >= 1000) onChange(n); }}
      onBlur={() => { const n = Math.max(1000, Math.floor(Number(txt)) || 1000); setTxt(String(n)); onChange(n); }} />
  );
}
/// WHEN TO TYPE THE FIRST ASK — ms to wait before typing, or null (not yet). The serve reports `ready`
/// once the CLI's composer is painted (keystrokes before that are eaten by the TUI's boot); an older
/// serve without the flag gets the historical 5s beat; a CLI whose marker never shows gets it after
/// 20 polls (~40s) so a changed banner cannot strand the ask.
export function firstAskBeat(running: boolean, ready: boolean | undefined, tries: number): number | null {
  if (!running) return null;
  if (ready === true) return 800;
  if (ready === undefined || tries >= 20) return 5_000;
  return null;
}

export function PaneEditModal({ pane, bake, onClose, onSaved, embedded }: { pane: Pane; bake?: PackBake | null; onClose: () => void; onSaved: (p: any, bake?: PackBake | null) => void; embedded?: boolean }) {
  const [label, setLabel] = React.useState(String(pane.subagent_name ?? ""));
  const [scopeGlobs, setScopeGlobs] = React.useState<string[]>(withDefaultScope(Array.isArray(pane.scope) ? (pane.scope as any[]).map(String) : []));   // nothing declared = the whole project, ticked
  const [extra, setExtra] = React.useState(String((pane as any).extra_prompt_md ?? ""));
  const [tier, setTier] = React.useState(String(pane.tier ?? "low"));
  const [model, setModel] = React.useState<string | null>((pane as any).model_id ?? null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // a subscription CLI (Claude Code · Codex · OpenCode·OpenAI) has NO tier and doesn't ride Heimdall —
  // the vendor's login picks the model. Same as the cockpit's form for these engines.
  const isCli = ["claude-code", "codex", "opencode-direct"].includes(String((pane as any).pane_kind ?? ""));
  // SKILLS moved to ⚙ › subagents › "available to this agent" (2026-09-19) — with the specialists.
  const curSettings = React.useMemo(() => { try { return JSON.parse((pane as any).settings_json ?? "{}") ?? {}; } catch { return {}; } }, [pane]);
  // CONTEXT PACK (2026-09-14): what this agent reads before it explores — preset (scope-derived ·
  // custom · none), the resolved items with per-item toggles, extra paths, live MCP tools, budget.
  // The resolved list comes from the last bake (the engine derives the scope default); toggling an
  // item turns the selection custom.
  const [pack, setPack] = React.useState<ContextPack>(() => parsePack((pane as any).settings_json));
  const [resolved, setResolved] = React.useState<PackItem[]>(() => (Array.isArray(bake?.items) ? bake!.items : []));
  // the engine's catalog — every antiIDE feature that can be baked (AI-backed ones are live-only)
  const [sources, setSources] = React.useState<PackSource[]>([]);
  React.useEffect(() => { void fetchSources(pane.id).then(setSources); }, [pane.id]);
  // custom keeps the scope-derived rows visible (unticked) so a removed item can be brought back
  const shown: PackItem[] = pack.preset === "custom" ? [...pack.items, ...resolved.filter((r) => !pack.items.some((x) => itemKey(x) === itemKey(r)))] : pack.preset === "scope" ? resolved : [];
  const togglePackItem = (it: PackItem) => setPack((p) => ({ ...p, preset: "custom", items: toggleItem(p.preset === "custom" ? p.items : resolved, it) }));
  // a whole kind at once (file review of every scoped file, folder paper of every scoped folder)
  const setPackItems = (its: PackItem[], on: boolean) => setPack((p) => {
    const base = p.preset === "custom" ? p.items : resolved;
    const keys = new Set(its.map(itemKey));
    const kept = base.filter((x) => !keys.has(itemKey(x)));
    return { ...p, preset: "custom", items: on ? [...kept, ...its] : kept };
  });
  React.useEffect(() => { if (pack.preset === "scope" && !resolved.length && pane.worktree_path) { void bakeContextPack(pane.id).then((b) => { if (Array.isArray(b?.items)) setResolved(b.items); }).catch(() => {}); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // the atlas once — the scope chips and the pack chips both pick from it
  const { entries, loading: entriesLoading, tokens: fileTokens } = useAtlasEntries();
  const writes = React.useMemo(() => (scopeGlobs.length ? { files: filesInScope(entries, scopeGlobs).length, tokens: tokensInScope(entries, scopeGlobs, fileTokens) } : null), [scopeGlobs, entries, fileTokens]);
  const inp: React.CSSProperties = { background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 9px", fontFamily: mono, fontSize: 10.5, outline: "none", width: "100%" };
  const save = async () => {
    if (!scopeGlobs.length) { setErr("a scope is required — click at least one folder or file"); return; }
    setBusy(true); setErr(null);
    try {
      // settings always carry the pack (skills + specialists live in ⚙ › subagents). pane/update
      // re-bakes the pack itself (scope / guidance / settings changed) and returns the bake result.
      const settings = withPack({ ...curSettings }, pack);
      const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, {
        pane_id: pane.id,
        subagent_name: label.trim() || undefined,
        scope: scopeGlobs,
        extra_prompt_md: extra,
        settings,
        ...(isCli ? {} : { tier, model_id: model }),
      }, { timeoutMs: 60_000 }));
      if (!r?.pane) throw new Error(r?.error ?? "update returned nothing");
      // (re)place the built-in antiloki-context skill next to the pack (best-effort; the library
      // selection itself is saved from ⚙ › subagents)
      try { await apiPost(`/api/v1/skilllib/materialize`, { pane_id: pane.id, ...(Array.isArray(curSettings.skills) ? { slugs: curSettings.skills } : {}) }, { timeoutMs: 30_000 }); } catch { /* */ }
      onSaved(r.pane, r.context_pack && typeof r.context_pack === "object" ? (r.context_pack as PackBake) : undefined);
      onClose();
    } catch (e: any) { setErr(String(e?.message ?? "save failed")); }
    setBusy(false);
  };
  return (
    <Frame embedded={embedded} onClose={onClose} testId="pane-edit" width="min(560px, 94vw)" height="auto">
      <div style={{ flex: 1, minHeight: 0, padding: 16, display: "flex", flexDirection: "column", gap: 7, overflow: "hidden" }}>
        {!embedded && <span style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 600 }}>edit agent</span>}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7, paddingRight: 4 }}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="label (optional, defaults to the agent)" style={inp} />
          <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>edit scope · files this agent may WRITE (reads the whole repo)</span>
          {entriesLoading && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>loading the file tree…</span>}
          <FileTree value={scopeGlobs.join(", ")} onChange={(v) => setScopeGlobs(v.split(",").map((s) => s.trim()).filter(Boolean))} entries={entries} tokens={fileTokens} />
          <span style={{ fontFamily: mono, fontSize: 8.5, color: writes ? C.warn : C.bad }}>
            {writes ? `✍ WRITES: covers ${writes.files} file${writes.files === 1 ? "" : "s"}${writes.tokens ? ` · ≈${fmtTok(writes.tokens)} tokens of source (bytes/4)` : ""}` : "✍ WRITES: a scope is required — the agent boots only with one"}
          </span>
          <span style={{ fontFamily: mono, fontSize: 8.5, color: C.ok }}>👁 READS (context): the whole worktree + its AGENTS.md brief (mission + your guidance, written at provision time)</span>
          <textarea value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="extra prompt — extends the base agent for this session" style={{ ...inp, minHeight: 52, resize: "vertical" }} />
          {/* CONTEXT PACK — antiloki's measured view, materialised into .antiloki/context/ and listed
              in the brief. Deterministic, $0; the engine derives the scope default and prints its rule. */}
          <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>📦 context pack — what this agent reads before it explores (.antiloki/context/ + the brief; live MCP tools for the rest)</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 9px" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontFamily: mono, fontSize: 9.5 }}>
              {(["scope", "custom", "none"] as const).map((pr) => (
                <label key={pr} title={pr === "scope" ? `derived from the edit scope every bake:\n${DEFAULT_RULE}` : pr === "custom" ? "exactly the items below" : "no pack — the brief inlines the context docs as before"} style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", color: pack.preset === pr ? C.fg : C.dim }}>
                  <input type="radio" name="pack-preset" checked={pack.preset === pr} onChange={() => setPack((p) => ({ ...p, preset: pr, items: pr === "custom" && !p.items.length ? resolved : p.items }))} style={{ margin: 0 }} />{pr === "scope" ? "from scope" : pr}
                </label>
              ))}
              <span style={{ flex: 1 }} />
              <label title="wire the antiloki MCP server (file review · check · blast radius · laws) into the CLI" style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", color: pack.live ? C.ok : C.dim }}>
                <input type="checkbox" checked={pack.live} onChange={(e) => setPack((p) => ({ ...p, live: e.target.checked }))} style={{ margin: 0 }} />live tools
              </label>
              <label title="hard cap over the whole pack; items past it are listed as not materialised" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.dim }}>
                budget <BudgetField value={pack.budget_chars} onChange={(n) => setPack((p) => ({ ...p, budget_chars: n }))} style={{ ...inp, width: 78, padding: "1px 5px", fontSize: 9 }} /> chars
              </label>
            </div>
            {pack.preset === "scope" && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>rule: {DEFAULT_RULE} — untick an item to switch to custom</span>}
            {pack.preset !== "none" && shown.length === 0 && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>{pane.worktree_path ? "nothing resolved yet — save to bake, or add paths below" : "worktree pending — the pack bakes once the box exists"}</span>}
            {shown.map((it) => {
              const on = pack.preset === "scope" || pack.items.some((x) => itemKey(x) === itemKey(it));
              const m = (bake?.items ?? []).find((x) => itemKey(x) === itemKey(it));
              return (
                <div key={itemKey(it)} onClick={() => togglePackItem(it)} title={m ? `${m.written ? `.antiloki/context/${m.file}` : "not materialised (budget)"}\n${m.summary}` : itemLabel(it)}
                  style={{ display: "flex", alignItems: "center", gap: 7, minHeight: 19, cursor: "pointer", borderRadius: 4, padding: "1px 3px" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = C.panel2)}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
                  <span style={{ display: "grid", placeItems: "center" }}><Check on={on} /></span>
                  <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, width: 12, textAlign: "center" }}>{KIND_GLYPH[it.kind]}</span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: on ? C.fg : C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{itemLabel(it)}</span>
                  {m && <span style={{ fontFamily: mono, fontSize: 8, color: m.written ? C.muted : C.warn, flexShrink: 0 }} title={m.written ? `≈${Math.ceil(m.chars / 4).toLocaleString()} tokens (${m.chars.toLocaleString()} chars)` : "not materialised — over the budget"}>{m.written ? `≈${fmtTok(Math.ceil(m.chars / 4))} tok` : "cut"}</span>}
                </div>
              );
            })}
            {pack.preset !== "none" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, borderTop: `1px dashed ${C.border}`, paddingTop: 5 }}>
                <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>add more — a kind adds itself for every file / folder of the scope at once (file review + folder paper + … stack up); ▸ picks paths one by one; green kinds add at once</span>
                <PackChips items={pack.preset === "custom" ? pack.items : resolved} onToggle={togglePackItem} onSetMany={setPackItems} sources={sources} scope={scopeGlobs} entries={entries} />
                {sources.length > 0 && <span style={{ fontFamily: mono, fontSize: 8, color: C.muted }}>{sources.filter((s) => s.packable).length} bakeable sources · the agent can also query any of the {sources.length} live (antiloki_query), including the AI-backed ones</span>}
              </div>
            )}
          </div>
          {/* tier + Heimdall model apply only to antiloki-persona agents — a subscription CLI picks
              its model via the vendor's own login, so the row is meaningless there. */}
          {!isCli && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>tier</span>
              <select value={tier} onChange={(e) => setTier(e.target.value)} style={{ ...inp, width: "auto" }} title="complexity tier this agent needs">
                <option value="low">low · simple</option><option value="mid">mid · balanced</option><option value="high">high · complex</option>
              </select>
              <ModelPicker model={model} setModel={setModel} up />
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {err && <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>{err.slice(0, 60)}</span>}
          <span style={{ flex: 1 }} />
          {!embedded && <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: mono, fontSize: 10.5 }}>cancel</button>}
          <button disabled={busy} onClick={() => void save()} style={{ background: C.brand, border: "none", color: C.bg, borderRadius: 6, padding: "4px 14px", cursor: busy ? "wait" : "pointer", fontFamily: mono, fontSize: 10.5, fontWeight: 700 }}>{busy ? "saving…" : "save"}</button>
        </div>
        <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>save re-bakes the box's AGENTS.md brief and the context pack right away; a running CLI reads the new files on its next turn and gets the new system prompt on restart.</span>
      </div>
    </Frame>
  );
}

// 💬 ANSWERS (2026-09-16, "each answer of the AI should be easily copiable"): the final text of every
// turn (Claude/Codex: the Stop hook's log · OpenCode: its own db), newest first, one copy button each.
export function AnswersWindow({ paneId, engine, onClose, embedded }: { paneId: number; engine: string; onClose: () => void; embedded?: boolean }) {
  const [answers, setAnswers] = React.useState<PackAnswer[] | null>(null);
  React.useEffect(() => { let live = true; void fetchAnswers(paneId, 40).then((a) => { if (live) setAnswers(a); }); return () => { live = false; }; }, [paneId]);
  return (
    <Frame embedded={embedded} onClose={onClose} testId="answers-window" width="min(760px, 94vw)" height="auto">
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 700 }}>💬 answers</span>
          <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{engine} · pane #{paneId} · newest first</span>
          <span style={{ flex: 1 }} />
          {answers && answers.length > 0 && <CopyButton text={answers.map((a) => `── ${String(a.t ?? "").slice(0, 19).replace("T", " ")} ──\n${a.text}`).join("\n\n")} label="copy all" />}
          <CloseX embedded={embedded} onClose={onClose} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {answers === null && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>reading…</span>}
          {answers && answers.length === 0 && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>no answers recorded yet — {engine === "claude-code" || engine === "codex" ? "the Stop hook logs the final text of every turn from the next one on" : "OpenCode's own database has nothing for this worktree yet"}</span>}
          {(answers ?? []).map((a, i) => (
            <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{String(a.t ?? "").slice(0, 19).replace("T", " ")}</span>
                <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>≈{Math.ceil(a.text.length / 4)} tok</span>
                <span style={{ flex: 1 }} />
                <CopyButton text={a.text} />
              </div>
              <pre style={{ margin: 0, padding: "8px 10px", fontFamily: mono, fontSize: 10, lineHeight: 1.5, color: C.fg, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 320, overflowY: "auto" }}>{a.text}</pre>
            </div>
          ))}
        </div>
      </>
    </Frame>
  );
}

// THE AUDIT WINDOW (operator 2026-09-16: "auditability on agents panes — each file that an agent
// reads or writes"). Three layers on one screen: the hook log (every read / write / refused write /
// shell command the engine made, with the sha on disk after each write), git's own view of the box,
// and the cross-check between them — a file git says changed that no tool write explains is the
// one to look at. The log's sha256 lets an exported copy be verified against the box later.
const OPS = ["", "read", "write", "exec", "search", "tool"] as const;
// THE SUBAGENTS PANEL (operator 2026-09-17): a goal → N parallel mini-agents in this agent's box.
// Split the goal with the engine (or type the tasks), launch, watch them run, results are typed into
// the parent's terminal as they land. Jobs are temporary (the engine worker keeps them in memory).
export function SubagentsPanel({ parentKey, engine, worktree, jobs, runs, onClose, onRefresh, onSay, embedded }: { parentKey: string; engine: string; worktree: string; jobs: SubagentJob[]; runs: GoalRun[]; onClose: () => void; onRefresh: () => void; onSay: (text: string) => void; embedded?: boolean }) {
  const [mode, setMode] = React.useState<"goals" | "quick">(runs.length || !jobs.length ? "goals" : "quick");
  const [goal, setGoal] = React.useState("");
  const [n, setN] = React.useState(3);
  const [eng, setEng] = React.useState(engine);
  const seats = useSeats();
  const [write, setWrite] = React.useState(false);
  const [tasks, setTasks] = React.useState<SubagentTask[]>([]);
  const [busy, setBusy] = React.useState<"plan" | "spawn" | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<number | null>(null);
  const split = async () => {
    if (!goal.trim()) return; setBusy("plan"); setErr(null);
    const got = await planSubagents(goal.trim(), n, eng, worktree);
    if (!got.length) setErr("the engine returned no tasks — write them by hand below"); else setTasks(got);
    setBusy(null);
  };
  const launch = async () => {
    const list = tasks.filter((x) => x.title.trim());
    if (!goal.trim() || !list.length) return; setBusy("spawn"); setErr(null);
    const made = await spawnSubagents({ parent: parentKey, goal: goal.trim(), tasks: list, engine: eng, cwd: worktree, write });
    if (!made.length) setErr("could not launch — is the chat engine worker running?"); else { setTasks([]); onRefresh(); }
    setBusy(null);
  };
  const addTask = () => setTasks((ts) => [...ts, { title: "", prompt: "" }]);
  const chip = (on: boolean): React.CSSProperties => ({ background: on ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${on ? C.brand : C.border}`, color: on ? C.brand : C.muted, borderRadius: 6, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 });
  const active = activeJobs(jobs).length;
  return (
    <Frame embedded={embedded} onClose={onClose} testId="subagents-panel">
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 700 }}>⋔ subagents</span>
          <button data-testid="sub-mode-goals" onClick={() => setMode("goals")} style={chip(mode === "goals")} title="plan → waves → verify → join, with ownership and orchestration">goal runs{activeRuns(runs).length ? ` · ${activeRuns(runs).length} live` : runs.length ? ` · ${runs.length}` : ""}</button>
          <button data-testid="sub-mode-quick" onClick={() => setMode("quick")} style={chip(mode === "quick")} title="the simple fan-out: N independent mini-agents, results typed into the terminal">quick fan-out{active ? ` · ${active} running` : jobs.length ? ` · ${jobs.length}` : ""}</button>
          <span style={{ flex: 1 }} />
          <CloseX embedded={embedded} onClose={onClose} />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {mode === "goals" && <GoalRunPanel parentKey={parentKey} engine={engine} worktree={worktree} runs={runs} onRefresh={onRefresh} onSay={onSay} />}
          {mode === "quick" && <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", background: C.panel }}>
            <textarea value={goal} onChange={(e) => setGoal(e.target.value)} data-testid="subagents-goal" rows={2} spellCheck={false} placeholder="the goal — e.g. find every place that reads process.env and list the missing defaults"
              style={{ background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 9px", fontFamily: mono, fontSize: 10.5, lineHeight: 1.5, resize: "vertical", outline: "none" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontFamily: mono, fontSize: 9.5, color: C.dim }}>
              split into {[2, 3, 4, 6].map((k) => <button key={k} onClick={() => setN(k)} style={chip(n === k)}>{k}</button>)}
              <span style={{ marginLeft: 6 }}>engine</span>
              {offered(seats, eng).map((k) => <button key={k} onClick={() => setEng(k)} style={chip(eng === k)}>{paneDisplay(k).glyph} {paneDisplay(k).name}</button>)}
              <button onClick={() => setWrite((w) => !w)} title="read-only: they report; write: they may edit inside this agent's scope (the scope gate + audit apply)" style={chip(write)}>{write ? "✎ may write" : "👁 read-only"}</button>
              <span style={{ flex: 1 }} />
              <button data-testid="subagents-split" disabled={!goal.trim() || busy != null} onClick={() => void split()} style={{ ...chip(false), color: C.fg, borderColor: C.fg, padding: "2px 10px" }}>{busy === "plan" ? "splitting…" : "⋔ split with the engine"}</button>
              <button onClick={addTask} style={chip(false)}>+ task by hand</button>
            </div>
            {tasks.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {tasks.map((tk, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                    <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, width: 16, paddingTop: 6 }}>{i + 1}.</span>
                    <input value={tk.title} onChange={(e) => setTasks((ts) => ts.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="task title" data-testid={`subagent-task-${i}`}
                      style={{ flex: "0 0 240px", background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", fontFamily: mono, fontSize: 10 }} />
                    <input value={tk.prompt} onChange={(e) => setTasks((ts) => ts.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)))} placeholder="what exactly (files, acceptance) — optional"
                      style={{ flex: 1, background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", fontFamily: mono, fontSize: 10 }} />
                    <button onClick={() => setTasks((ts) => ts.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 11 }}>✕</button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>each runs {eng === "claude-code" ? "claude -p" : eng === "codex" ? "codex exec" : eng === "opencode" ? "opencode run" : `${eng} headless`} in {worktree.split("/").slice(-2).join("/")} · {write ? "edits allowed inside the scope" : "read-only"} · results are typed into this agent's terminal</span>
                  <span style={{ flex: 1 }} />
                  <button data-testid="subagents-launch" disabled={busy != null || !tasks.some((x) => x.title.trim())} onClick={() => void launch()}
                    style={{ background: C.brand, border: `1px solid ${C.brand}`, color: C.bg, borderRadius: 6, padding: "4px 14px", cursor: "pointer", fontFamily: mono, fontSize: 10.5, fontWeight: 700 }}>{busy === "spawn" ? "launching…" : `▶ launch ${tasks.filter((x) => x.title.trim()).length}`}</button>
                </div>
              </div>
            )}
            {err && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.bad }}>{err}</span>}
          </div>
          {jobs.length === 0 && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>no subagents yet — state a goal, split it, launch. They run in parallel and report back here and in the terminal.</span>}
          {jobs.slice().reverse().map((j) => {
            const g = jobGlyph(j);
            const tone = g.tone === "ok" ? C.ok : g.tone === "warn" ? C.warn : g.tone === "bad" ? C.bad : C.dim;
            return (
              <div key={j.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer" }} onClick={() => setOpen((o) => (o === j.id ? null : j.id))}>
                  <span style={{ color: tone, fontFamily: mono, fontSize: 11 }}>{g.glyph}</span>
                  <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.title}</span>
                  <span style={{ fontFamily: mono, fontSize: 9, color: tone }}>{g.state}</span>
                  <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{paneDisplay(j.engine).name}{j.write ? " · ✎" : ""}{j.trace?.tools?.length ? ` · ${j.trace.tools.length} tools` : ""}{j.trace?.cost != null ? ` · $${Number(j.trace.cost).toFixed(3)}` : ""}</span>
                  <span style={{ flex: 1 }} />
                  {(j.status === "queued" || j.status === "running") && <button onClick={(e) => { e.stopPropagation(); void cancelSubagent(j.id).then(onRefresh); }} style={{ ...chip(false), color: C.bad, borderColor: C.bad }}>■ cancel</button>}
                  {j.status === "done" && j.result && <CopyButton text={j.result} />}
                  {j.status === "done" && j.result && <button onClick={(e) => { e.stopPropagation(); onSay(deliveryMessage(j)); void markDelivered(j.id).then(onRefresh); }} title="type this report into the agent's terminal again" style={chip(false)}>→ tell the agent</button>}
                </div>
                {open === j.id && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>goal: {j.goal}</span>
                    {j.trace?.tools?.length ? <div style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{j.trace.tools.map((tl, i) => <div key={i}>· {tl.name} {tl.target}</div>)}</div> : null}
                    <pre style={{ margin: 0, fontFamily: mono, fontSize: 10, lineHeight: 1.5, color: j.status === "failed" ? C.bad : C.fg, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 260, overflowY: "auto" }}>{j.result ?? j.error ?? (j.status === "running" ? "working…" : "—")}</pre>
                  </div>
                )}
              </div>
            );
          })}
          </>}
        </div>
      </>
    </Frame>
  );
}

export function AuditWindow({ paneId, engine, onClose, embedded }: { paneId: number; engine: string; onClose: () => void; embedded?: boolean }) {
  const [audit, setAudit] = React.useState<PackAudit | null | undefined>(undefined);
  const [op, setOp] = React.useState<string>("");
  const [q, setQ] = React.useState("");
  // THE STORY FIRST (operator 2026-09-24: "the audit tab on settings is impossible to understand. You should
  // keep the complete logs of audit for AI, but display a summary in human natural language also"). The tables are
  // still there, unchanged — they are the evidence. This is the reading of them.
  const [tab, setTab] = React.useState<"story" | "events" | "files">("story");
  React.useEffect(() => {
    let live = true;
    void fetchAudit(paneId, { op: op || undefined, path: q.trim() || undefined, limit: 400 }).then((a) => { if (live) setAudit(a); });
    return () => { live = false; };
  }, [paneId, op, q]);
  const v = auditVerdict(audit);
  const tone = v.tone === "ok" ? C.ok : v.tone === "warn" ? C.warn : C.dim;
  const opColor = (o: string) => (o === "write" ? C.warn : o === "exec" ? C.brand : o === "read" ? C.fg : C.dim);
  const exportText = audit ? JSON.stringify({ pane_id: paneId, engine, exported: new Date().toISOString(), ...audit }, null, 2) : "";
  return (
    <Frame embedded={embedded} onClose={onClose} testId="audit-window" width="min(900px, 96vw)">
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 700 }}>🔍 audit</span>
          <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{engine} · pane #{paneId}</span>
          <span style={{ flex: 1 }} />
          {audit && <CopyButton text={exportText} label="copy JSON" />}
          <CloseX embedded={embedded} onClose={onClose} />
        </div>
        {audit === undefined && <span style={{ padding: 12, fontFamily: mono, fontSize: 10, color: C.dim }}>reading the box…</span>}
        {audit === null && <span style={{ padding: 12, fontFamily: mono, fontSize: 10, color: C.warn }}>no audit — the pane has no worktree yet</span>}
        {audit && (
          <>
            <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
              <span data-testid="audit-verdict" style={{ fontFamily: mono, fontSize: 11.5, color: tone, fontWeight: 600 }}>{v.tone === "ok" ? "✓" : v.tone === "warn" ? "⚠" : "·"} {auditHeadline(audit).text}</span>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontFamily: mono, fontSize: 9.5, color: C.muted }}>
                <span>reads <b style={{ color: C.fg }}>{audit.counts.reads}</b></span>
                <span>writes <b style={{ color: C.warn }}>{audit.counts.writes}</b></span>
                <span>refused <b style={{ color: audit.counts.blocked ? C.bad : C.fg }}>{audit.counts.blocked}</b></span>
                <span>shell <b style={{ color: C.fg }}>{audit.counts.exec}</b></span>
                <span>searches <b style={{ color: C.fg }}>{audit.counts.search}</b></span>
                <span>live tools <b style={{ color: C.fg }}>{audit.counts.tool}</b></span>
                <span style={{ flex: 1 }} />
                <span title={`sha256 of ${audit.log.file} — verify an exported copy against the box`}>log {audit.log.lines} lines · sha {audit.log.sha256.slice(0, 12)}…</span>
              </div>
              {(audit.cross.git_only.length > 0 || audit.cross.hook_only.length > 0) && (
                <div style={{ fontFamily: mono, fontSize: 9.5, lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 2 }}>
                  {audit.cross.git_only.length > 0 && <span style={{ color: C.warn }}>git only (changed, never a tool write — a script / redirect / generator): {audit.cross.git_only.join(", ")}</span>}
                  {audit.cross.hook_only.length > 0 && <span style={{ color: C.dim }}>hook only (tool wrote it, git shows no change now — reverted or ignored): {audit.cross.hook_only.join(", ")}</span>}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 14px", borderBottom: `1px solid ${C.border}` }}>
              {(["story", "files", "events"] as const).map((k) => (
                <button key={k} data-testid={`audit-tab-${k}`} onClick={() => setTab(k)} title={k === "story" ? "what happened, in words" : k === "files" ? "every file, with its counts — the evidence" : "every event as the hook logged it — what an AI reads"}
                  style={{ background: tab === k ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${tab === k ? C.brand : C.border}`, color: tab === k ? C.brand : C.dim, borderRadius: 6, padding: "1px 9px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 }}>{k === "story" ? "what happened" : k === "files" ? `files · ${audit.files.length}` : `events · ${audit.event_total}`}</button>
              ))}
              <span style={{ flex: 1 }} />
              {tab === "events" && OPS.map((o) => (
                <button key={o || "all"} onClick={() => setOp(o)} style={{ background: "transparent", border: `1px solid ${op === o ? C.brand : C.border}`, color: op === o ? C.brand : C.dim, borderRadius: 10, padding: "0 8px", cursor: "pointer", fontFamily: mono, fontSize: 9 }}>{o || "all"}</button>
              ))}
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter path…" spellCheck={false} style={{ width: 160, background: C.panel, border: `1px solid ${C.border}`, color: C.fg, borderRadius: 6, padding: "2px 8px", fontFamily: mono, fontSize: 9.5 }} />
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "6px 14px" }}>
              {tab === "story" ? (
                <div data-testid="audit-story" style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 0 10px", maxWidth: 680 }}>
                  {auditStory(audit).map((p) => (
                    <div key={p.key} style={{ display: "flex", gap: 9, alignItems: "baseline" }}>
                      <span style={{ width: 10, flexShrink: 0, fontFamily: mono, fontSize: 10, color: p.tone === "warn" ? C.warn : p.tone === "bad" ? C.bad : p.tone === "ok" ? C.ok : C.dim }}>
                        {p.tone === "warn" ? "⚠" : p.tone === "bad" ? "✗" : p.tone === "ok" ? "✓" : "·"}
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        <span style={{ fontFamily: mono, fontSize: 11, color: C.fg, lineHeight: 1.5 }}>{p.text}</span>
                        {p.detail && <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.6 }}>{p.detail}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : tab === "files" ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: mono, fontSize: 9.5 }}>
                  <thead><tr style={{ color: C.dim, textAlign: "left" }}><th style={{ padding: "3px 6px" }}>path</th><th style={{ padding: "3px 6px", textAlign: "right" }}>reads</th><th style={{ padding: "3px 6px", textAlign: "right" }}>writes</th><th style={{ padding: "3px 6px", textAlign: "right" }}>refused</th><th style={{ padding: "3px 6px" }}>git</th><th style={{ padding: "3px 6px" }}>last sha</th><th style={{ padding: "3px 6px" }}>last</th></tr></thead>
                  <tbody>
                    {audit.files.filter((f) => !q.trim() || f.path.includes(q.trim())).map((f) => {
                      const inGit = audit.git.changed.includes(f.path);
                      return (
                        <tr key={f.path} style={{ borderTop: `1px solid ${C.border}`, color: C.fg }}>
                          <td style={{ padding: "3px 6px", maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.path}>{f.path}</td>
                          <td style={{ padding: "3px 6px", textAlign: "right", color: C.muted }}>{f.reads}</td>
                          <td style={{ padding: "3px 6px", textAlign: "right", color: f.writes ? C.warn : C.muted }}>{f.writes}</td>
                          <td style={{ padding: "3px 6px", textAlign: "right", color: f.blocked ? C.bad : C.muted }}>{f.blocked}</td>
                          <td style={{ padding: "3px 6px", color: inGit ? (f.writes ? C.ok : C.warn) : C.dim }} title={inGit ? (f.writes ? "changed in the box, tool write seen" : "changed in the box, NO tool write seen") : "unchanged in git"}>{inGit ? (f.writes ? "✓ changed" : "⚠ changed") : "—"}</td>
                          <td style={{ padding: "3px 6px", color: C.dim }}>{f.sha ?? "—"}{f.bytes != null ? ` · ${f.bytes} B` : ""}</td>
                          <td style={{ padding: "3px 6px", color: C.dim, whiteSpace: "nowrap" }}>{String(f.last ?? "").slice(11, 19)}</td>
                        </tr>
                      );
                    })}
                    {audit.cross.git_only.filter((p) => !audit.files.some((f) => f.path === p)).map((p) => (
                      <tr key={`git-${p}`} style={{ borderTop: `1px solid ${C.border}`, color: C.warn }}>
                        <td style={{ padding: "3px 6px" }} title={p}>{p}</td><td style={{ padding: "3px 6px", textAlign: "right" }}>—</td><td style={{ padding: "3px 6px", textAlign: "right" }}>—</td><td style={{ padding: "3px 6px", textAlign: "right" }}>—</td>
                        <td style={{ padding: "3px 6px" }} title="changed in the box, never touched by a tool the hook saw">⚠ changed</td><td style={{ padding: "3px 6px" }}>—</td><td style={{ padding: "3px 6px" }}>—</td>
                      </tr>
                    ))}
                    {!audit.files.length && !audit.cross.git_only.length && <tr><td colSpan={7} style={{ padding: 8, color: C.dim }}>nothing yet — the agent has not touched a file</td></tr>}
                  </tbody>
                </table>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {audit.events.map((e, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "62px 46px 90px 1fr auto", gap: 8, alignItems: "baseline", fontFamily: mono, fontSize: 9.5, padding: "2px 0", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ color: C.dim }}>{String(e.t ?? "").slice(11, 19)}</span>
                      <span style={{ color: opColor(e.op), fontWeight: 600 }}>{e.kind === "blocked" ? "refused" : e.kind === "written" ? "wrote" : e.op}</span>
                      <span style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.tool}</span>
                      <span style={{ color: e.kind === "blocked" ? C.bad : C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.path}>{e.path}{e.kind === "pack" ? <span style={{ color: C.dim }}> · pack</span> : null}</span>
                      <span style={{ color: C.dim }}>{e.sha ? `sha ${e.sha}${e.bytes != null ? ` · ${e.bytes} B` : ""}` : e.exit != null ? `exit ${e.exit}` : e.nudged ? "nudged" : ""}</span>
                    </div>
                  ))}
                  {!audit.events.length && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>no events match</span>}
                </div>
              )}
            </div>
          </>
        )}
      </>
    </Frame>
  );
}

// THE SCOPE GATE — a code agent does not boot without an edit whitelist: the cockpit's own checkbox
// file tree (operator 2026-09-16: "the checkbox scope was good; chips are for the antiIDE
// functionalities"). "start" hands the scope to the provisioning path.
/** THE TWO TOGGLES on the strip: ⚡ the router (Heimdall decides delegation, each sub-agent's tier and
 *  the parent's own model) and ⋔ sub-agents (the agent may fan out at all). Both are pane settings the
 *  serve reads at plan time. The ⚡ chip also shows the API-equivalent the router saved on this pane. Pure
 *  helpers tested. */
/** AGENT RECIPES (2026-09-20): what a pane born from a Studio agent carries — its settings and its name */
export type PaneRecipe = { slug: string; name: string; icon: string; theme: string; specialists: string[]; skills: string[]; /** a base agent's preset model (DeepSeek · Kimi · Qwen, 2026-09-23) — agent::start reads `settings.model` */ model?: string };
export function recipeSettingsOf(r: PaneRecipe | undefined): Record<string, any> | undefined {
  if (!r) return undefined;
  const out: Record<string, any> = { ...(r.slug ? { recipe: r.slug } : {}), theme: r.theme };
  if (r.model) out.model = r.model;
  if (r.specialists?.length) out.specialists = r.specialists;
  if (r.skills?.length) out.skills = r.skills;
  return out;
}
export function readPolicy(settings: any): { router: boolean; subagents: boolean } {
  return { router: settings?.router?.enabled !== false, subagents: settings?.delegate?.enabled !== false };
}
/** HEIMDALL'S THREE STATES (2026-09-22): `settings.router.mode` — AUTO (the router picks the models too) · ON (the
 *  bars are yours) · OFF. A pane written before the menu existed carries only the boolean, which reads as auto/off.
 *  Pure, and the same reading serve does in `Delegation::of_pane`. */
/** IS THIS ASK WORK, OR IS IT TALK (found 2026-09-28)?
 *
 *  The old guard was length alone — under 12 characters, or no space — so "say exactly: ready" was sent to the
 *  planner, which screened it, asked which files it should touch, and parked the run. A router call costs more
 *  than a greeting is worth, and the screening gate makes it worse by blocking on it.
 *
 *  Routing asks for something to be DONE to the repository. The signal is a work verb or a file-ish token; a
 *  question about the code is work too ("why does X fail"), a pleasantry is not. Deliberately generous — when in
 *  doubt it routes, because Heimdall declining is cheap and a missed route is only a slower answer. Pure. */
export function worthRouting(line: string): boolean {
  const t = line.trim(); const l = t.toLowerCase();
  if (!t || t.startsWith("/")) return false;                       // a slash command is the engine's own
  if (!t.includes(" ") && !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0e00-\u0eff]/.test(t)) return false;   // one word is not an ask (scripts written without spaces have no words to count) ("go", "yes": the serve's front resolves those)
  // A SHORT IMPERATIVE IS AN ASK (operator 2026-09-29): the old rule wanted 12 characters, so "add filters" (11) never reached Heimdall - the
  // chat model answered it itself, and later wrote the code itself, with no run, no route and no stats box. Two words opening on an action verb count.
  if (t.length < 12 && !/^(add|fix|make|build|create|implement|remove|delete|rename|refactor|change|update|write|move|replace|split|extract|install|convert|migrate|optimi[sz]e|improve|clean|wire|enable|disable|style|document|test|redesign|restyle|debug)\b/.test(l)) return false;
  // A PLEASANTRY ONLY COUNTS WHEN THE LINE IS NOTHING BUT ONE (audit 2026-09-28). These were prefix tests on the
  // whole line, so "thanks — now delete the old table" and "ok now fix the parser" were dropped as chit-chat and
  // went to the raw agent un-routed, with no tier, no role and no gate, and nothing on screen to say so.
  const bare = l.replace(/[^a-z\s]/g, " ").trim();
  if (/^(hi|hey|hello|yo|thanks|thank you|ta|ok|okay|sure|cool|nice|great|good (morning|night|evening)|gm|gn)$/.test(bare)) return false;
  if (/^(say|repeat|echo)\b/.test(l) && !/\b(file|code|function|test|src)\b/.test(l)) return false;
  // "how are you" is not "how does checkout work" — a handful of social phrases, matched whole, because `how`
  // and `what` are genuine work words and must not be dropped from the list to make room for small talk.
  if (/\b(how (are|r) (you|u)|how'?s it going|what'?s up|hows things|nice to meet)\b/.test(l)) return false;
  // …and the verbs stem, because "the tests are still red" and "it crashes on submit" are work (the same audit:
  // \btest\b never matched "tests", so a bug report phrased as a symptom was never routed).
  const work = /\b(add|fix|chang|writ|refactor|renam|remov|delet|mov|creat|implement|build|test|updat|migrat|port|debug|why|how|where|what|explain|review|check|find|mak|run|install|upgrad|revert|optimi[sz]|document|crash|break|broke|fail|error|bug|wrong|red|slow|hang|miss)/;
  const fileish = /[\w-]+\.[a-z]{2,5}\b|\b\w+\/\w+|\bsrc\b|\bcomponent|\bfunction\b|\bclass\b|\bapi\b/;
  // NOT ENGLISH = NOT DECIDED HERE (operator 2026-09-29: the layer is agnostic). The verb list above is English; a line in another script or with accented
  // letters has no word to test, and dropping it would send an ask in Portuguese/Japanese/Russian to the raw chat un-routed. The serve's front reads those
  // (lexicon packs) and the voice covers the rest, so when in doubt it routes.
  // eslint-disable-next-line no-control-regex -- "any non-ASCII byte" is spelled with the NUL..DEL range
  if (/[^\x00-\x7f]/.test(t) && t.length >= 12) return true;
  return work.test(l) || fileish.test(l) || t.length > 60;         // a long ask is work by weight of words
}
export function readHeimdall(settings: any): "auto" | "on" | "off" {
  const m = settings?.router?.mode;
  if (m === "auto" || m === "on" || m === "off") return m;
  return settings?.router?.enabled === false ? "off" : "auto";
}
export function routerSavings(runs: { router?: boolean; min?: boolean; savings?: { saved_usd: number; baseline_usd: number } | null }[]): { saved: number; baseline: number; runs: number } {
  let saved = 0; let baseline = 0; let n = 0;
  for (const r of runs) { if (r.router === true && !r.min && r.savings) { saved += r.savings.saved_usd; baseline += r.savings.baseline_usd; n += 1; } }
  return { saved, baseline, runs: n };
}

function PolicyToggles({ pane, goalRuns, onSaved }: { pane: Pane; goalRuns: any[]; onSaved: (p: any) => void }) {
  const settings = React.useMemo(() => { try { return JSON.parse((pane as any).settings_json ?? "{}") ?? {}; } catch { return {}; } }, [pane]);
  const pol = readPolicy(settings);
  const sv = routerSavings(goalRuns);
  const [busy, setBusy] = React.useState(false);
  const flip = async (key: "router" | "delegate", on: boolean) => {
    setBusy(true);
    try {
      const next = { ...settings, [key]: { ...(settings[key] ?? {}), enabled: on } };
      const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, settings: next }, { timeoutMs: 30_000 }));
      if (r?.pane) onSaved(r.pane);
    } catch { /* the chip keeps the old state */ }
    setBusy(false);
  };
  const tog = (on: boolean, label: string, title: string, testId: string, onClick: () => void) => (
    <button data-testid={testId} data-on={on ? "1" : "0"} disabled={busy} onClick={onClick} title={title} style={{ background: on ? `color-mix(in oklab, ${C.brand} 12%, transparent)` : "transparent", border: `1px solid ${on ? C.brand : C.border}`, color: on ? C.fg : C.dim, borderRadius: 6, padding: "0 6px", cursor: "pointer", fontFamily: mono, fontSize: 9, lineHeight: "16px", whiteSpace: "nowrap", opacity: busy ? 0.6 : 1 }}>{label}</button>
  );
  return (
    <>
      {tog(pol.router, `⚡${sv.runs ? ` $${sv.saved.toFixed(2)}` : ""}`, pol.router ? `Heimdall's router is ON — a high-tier planner decides whether to delegate, each sub-agent's model and the one this terminal should use${sv.runs ? `; it saved $${sv.saved.toFixed(2)} of $${sv.baseline.toFixed(2)} (API-equivalent) over ${sv.runs} run${sv.runs === 1 ? "" : "s"} against one high-tier agent` : ""} — click to turn off` : "router OFF — every task runs at the pane's tier, no decisions, no savings measured — click to turn on", "toggle-router", () => void flip("router", !pol.router))}
      {tog(pol.subagents, "⋔", pol.subagents ? "sub-agents ON — the agent may fan work out (antiloki_delegate) — click to turn off" : "sub-agents OFF — the tool refuses; the agent does everything itself — click to turn on", "toggle-subagents", () => void flip("delegate", !pol.subagents))}
    </>
  );
}

function ScopeGate({ kind, onStart }: { kind: string; onStart: (scope: string[]) => void }) {
  const { entries, loading, tokens } = useAtlasEntries();
  const [scope, setScope] = React.useState<string[]>([]);
  const files = React.useMemo(() => filesInScope(entries, scope).length, [entries, scope]);
  const tok = React.useMemo(() => tokensInScope(entries, scope, tokens), [entries, scope, tokens]);
  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", height: "100%" }}>
      <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim }}>{paneDisplay(kind).glyph} {paneDisplay(kind).name} — define its scope before it starts</div>
      <span style={{ fontFamily: mono, fontSize: 10, color: C.fg, lineHeight: 1.5 }}>Tick the folders and files this agent may <b>write</b>. It reads the whole repo; a write outside the scope is refused and the pane offers to expand it. The scope also decides its context pack — the measured reviews it gets before it explores.</span>
      {loading && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>loading the file tree…</span>}
      {!loading && entries.length === 0 && <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>no atlas for this workspace yet — rebuild the codebase in antiIDE to pick from files, or type globs below</span>}
      <FileTree value={scope.join(", ")} onChange={(v) => setScope(v.split(",").map((s) => s.trim()).filter(Boolean))} entries={entries} tokens={tokens} />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontFamily: mono, fontSize: 9, color: scope.length ? C.ok : C.muted }}>{scope.length ? `${scope.length} glob${scope.length === 1 ? "" : "s"} · ${files} file${files === 1 ? "" : "s"} writable${tok ? ` · ≈${fmtTok(tok)} tokens of source` : ""}` : "tick at least one folder or file"}</span>
        <span style={{ flex: 1 }} />
        <button disabled={!scope.length} onClick={() => onStart(scope)} title={scope.length ? "provision the worktree, bake the context pack, boot the CLI" : "a scope is required"}
          style={{ background: scope.length ? C.brand : "transparent", border: `1px solid ${scope.length ? C.brand : C.border}`, color: scope.length ? C.bg : C.muted, borderRadius: 6, padding: "4px 14px", cursor: scope.length ? "pointer" : "not-allowed", fontFamily: mono, fontSize: 10.5, fontWeight: 700 }}>▶ start with this scope</button>
      </div>
    </div>
  );
}

function EnsuredCliPane({ kind, sessionId, paneId, chatSessionId, sessionBrief, attach, initialScope, ask, initialPack, recipe, chatEpisodes, chatSwitch }: { recipe?: PaneRecipe; chatSwitch?: ChatSwitch; /** a chat's episodes (chats-tab.tsx) — the `!` menu */ chatEpisodes?: import("@/loki/cockpit/agent-chat-pane").EpisodeRef[];
  kind: string; sessionId: number; paneId: number; chatSessionId?: number | null; sessionBrief?: string | null;
  // attach: render an ALREADY-provisioned pane (e.g. the shared-diff merge resolver) — no ensure.
  attach?: { csId: number; paneId: number } | null;
  // THE AGENT CARD (2026-09-16): a scope chosen on the card skips the gate; the ask becomes the
  // brief's mission and is typed into the CLI once it is up (once — remembered per pane).
  initialScope?: string[]; ask?: string;
  initialPack?: ContextPack; // the agent card's antiIDE chips — applied (and baked) once the box exists
}) {
  const [pane, setPane] = React.useState<Pane | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);
  // THE ⚙ WIZARD (operator 2026-09-19): one window for every tool the toolbar used to spray as icons
  const [wizard, setWizard] = React.useState<WizardTab | null>(null);
  const [packBake, setPackBake] = React.useState<PackBake | null>(null); // the last bake result — the 📦 chip
  const [reads, setReads] = React.useState<PackReads | null>(null); // the hook's measurement — the 📖 chip
  const [usage, setUsage] = React.useState<PackUsage | null>(null); // the engine's own numbers — the ⌁ chip, always on
  // THE QUOTA HANDOFF (2026-09-20): the PTY's own limit line + the plan windows → a banner that warns at
  // 80 % and, at the limit, hands the box to another installed engine in place (same files, same scope)
  const [ptyQuota, setPtyQuota] = React.useState<PtyQuota>(null);
  const [engines, setEngines] = React.useState<{ key: string; installed?: boolean }[]>([]);
  const [quotaDismissed, setQuotaDismissed] = React.useState<string>(""); // "warn" | "limit" — dismissed for this level
  const [handing, setHanding] = React.useState<string | null>(null);
  React.useEffect(() => { apiGet("/api/v1/cockpit/engines").then((d: any) => { const list = (unwrap(d)?.engines ?? d?.engines ?? []) as any[]; setEngines(list.map((e) => ({ key: String(e.key), installed: !!e.installed }))); }).catch(() => {}); }, []);
  const quota = quotaState(usage, ptyQuota);
  // "just now" · "8 min ago" · "3 h ago" — how old the engine's own window reading is. Pure.
  const meterAge = (iso: string | null | undefined): string => {
    const t = Date.parse(String(iso ?? ""));
    if (!Number.isFinite(t)) return "";
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 90) return "just now";
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86_400)} d ago`;
  };
  const handoffTo = async (to: string) => {
    if (!pane?.id || handing) return;
    setHanding(to);
    try {
      const from = String(pane.pane_kind ?? kind);
      const h = await writeHandoff(pane.id, to, quota.why || "the operator handed off");
      if (!h?.ok || !h.file) { setHanding(null); return; }
      // the engine switches IN PLACE: same box, same scope, same worktree — only the CLI changes
      const r = unwrap(await apiPost("/api/v1/cockpit/pane/update", { pane_id: pane.id, pane_kind: to }, { timeoutMs: 30_000 }));
      if (r?.pane) setPane(r.pane as Pane);
      try { await apiPost("/api/v1/cockpit/pty/kill", { pane_id: pane.id }, { timeoutMs: 10_000 }); } catch { /* already gone */ }
      await apiPost("/api/v1/cockpit/pty/start", { pane_id: pane.id, agent: to, cols: 110, rows: 32 }, { timeoutMs: 60_000 });
      // the first message once the new CLI's composer is painted
      for (let i = 0; i < 60; i++) {
        await new Promise((res) => setTimeout(res, 2_000));
        let ready = false;
        try { const st: any = await apiGet(`/api/v1/cockpit/pty/status?pane_id=${pane.id}`); ready = !!(st?.result ?? st)?.ready; } catch { /* not yet */ }
        if (ready) { await new Promise((res) => setTimeout(res, 800)); await sayToAgent(pane.id, handoffAsk(from, h.file)); break; }
      }
      setPtyQuota(null); setQuotaDismissed("limit");
    } finally { setHanding(null); }
  };
  const [dismissedBlock, setDismissedBlock] = React.useState<string | null>(null); // the newest blocked write the operator waved away
  const [expanding, setExpanding] = React.useState(false);
  // TEMPORARY SUBAGENTS (2026-09-17): the pane polls its jobs, publishes them for the Threads list,
  // and types every finished report into the agent's terminal once.
  const setSubWin = (on: boolean) => setWizard(on ? "subagents" : null);
  const [subJobs, setSubJobs] = React.useState<SubagentJob[]>([]);
  const [goalRuns, setGoalRuns] = React.useState<GoalRun[]>([]);
  const subKey = subagentKey(sessionId, paneId);
  const refreshSubs = React.useCallback(async () => {
    const [j, r] = await Promise.all([listSubagents(subKey), listGoalRuns(subKey)]);
    setSubJobs(j); publishSubagents(subKey, j); setGoalRuns(r); publishGoalRuns(subKey, r);
    return j;
  }, [subKey]);
  React.useEffect(() => {
    if (!pane?.id) return;
    let stop = false;
    const tick = async () => {
      const j = await refreshSubs();
      if (stop) return;
      const undelivered = j.filter((job) => job.status === "done" && !job.delivered && job.result);
      const joins = goalRunsRef.current.filter((r) => (r.status === "done" || r.status === "failed") && !r.delivered && r.report && !r.qa_pending); // QA has the last word before a run is announced
      // an inline route decided since this pane mounted (from the rail or the first ask) is typed in by itself
      const inlines = goalRunsRef.current.filter((r) => r.status === "inline" && !r.delivered && r.created > mountedAt.current);
      if (!undelivered.length && !joins.length && !inlines.length) return;
      // only into a LIVE terminal — a report typed into a dead PTY is lost; it waits for the restart
      let live = chatModeRef.current;
      if (!live) try { const s: any = await apiGet(`/api/v1/cockpit/pty/status?pane_id=${pane.id}`); live = !!(s?.result ?? s)?.running; } catch { live = false; }
      if (!live || stop) return;
      for (const job of undelivered) { const ok = await sayToAgent(pane.id, deliveryMessage(job)); if (ok) await markDelivered(job.id); }
      for (const r of joins) { const c = await goalOp("delivered", { id: r.id, claim: true }); if (c && c.won === false) continue; await sayToAgent(pane.id, goalDelivery(r)); }
      for (const r of inlines) await deliverInline(r);
    };
    void tick();
    const t = setInterval(tick, activeJobs(subJobs).length || activeRuns(goalRuns).length ? 3_000 : 12_000);
    return () => { stop = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane?.id, subKey, activeJobs(subJobs).length > 0, activeRuns(goalRuns).length > 0]);
  const goalRunsRef = React.useRef(goalRuns); goalRunsRef.current = goalRuns;
  const [opening, setOpening] = React.useState<string | null>(null); // the plan being turned into an artefact
  const [closingOther, setClosingOther] = React.useState<number | null>(null); // a leftover pane blocking this scope
  const [needsScope, setNeedsScope] = React.useState(false); // the gate: no scoped pane yet
  const [gateScope, setGateScope] = React.useState<string[] | null>(null); // the scope the operator clicked (or the pane's own)
  const [, setTick] = React.useState(0); // re-render as provisioning steps land
  const key = `chat-${sessionId}-${paneId}`.slice(0, 80); // stable per widget instance (persisted payload)
  React.useEffect(() => {
    const p = progOf(key);
    const f = () => setTick((t) => t + 1);
    p.listeners.add(f);
    return () => { p.listeners.delete(f); };
  }, [key]);
  React.useEffect(() => {
    let live = true;
    setErr(null);
    if (attach) {
      // ATTACH mode: the pane already exists (spawned elsewhere) — just fetch and render it.
      void (async () => {
        try {
          const got = unwrap(await apiPost(`/api/v1/cockpit/session/get`, { id: attach.csId }, { timeoutMs: 15_000 }));
          const p = (Array.isArray(got?.panes) ? got.panes : []).find((x: any) => x?.id === attach.paneId);
          if (live) { if (p) setPane(p); else setErr(`pane #${attach.paneId} not found`); }
        } catch (e: any) { if (live) setErr(String(e?.message ?? "attach failed")); }
      })();
      return () => { live = false; };
    }
    const name = `antichat#${chatSessionId ?? "solo"}`;
    // SCOPE GATE: an existing scoped pane reattaches at once; anything else (no pane yet, or a legacy
    // row with an empty scope) waits for the operator to click a scope — then `startWithScope` runs.
    if (!gateScope) {
      void findExistingPane(key, name)
        .then((found) => {
          if (!live) return;
          if (found?.pane && paneScopeOf(found.pane).length) setGateScope(paneScopeOf(found.pane));
          else if (initialScope?.length) setGateScope(initialScope); // the agent card already chose it
          else setNeedsScope(true);
        })
        .catch((e: any) => { if (live) setErr(String(e?.message ?? "cockpit unreachable")); });
      return () => { live = false; };
    }
    const brief = ask ? `MISSION: ${ask}${sessionBrief ? `\n\n${sessionBrief}` : ""}` : sessionBrief;
    void ensurePane(kind, key, name, brief, gateScope, recipe)
      .then(async (p) => {
        // the card's custom pack: applied once — a pane that already carries a pack keeps it
        if (p?.id && initialPack && parsePack(p.settings_json).preset === "scope") {
          try { const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: p.id, settings: withPack((() => { try { return JSON.parse(p.settings_json ?? "{}") ?? {}; } catch { return {}; } })(), initialPack) }, { timeoutMs: 60_000 })); if (r?.pane) { p = r.pane; if (r.context_pack) p.__pack = r.context_pack; } } catch { /* the default pack stands */ }
        }
        if (live) { setPane(p); if (p?.__pack) setPackBake(p.__pack); }
      })
      .catch((e: any) => { if (live) setErr(String(e?.message ?? "provisioning failed")); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, sessionId, paneId, chatSessionId, retry, attach?.paneId, gateScope]);
  // RUNTIME SCOPE SENTRY + live pane telemetry — hooks MUST live above the early returns (fixed
  // 2026-07-25: hook-count crash). One 5s poll powers: violations banner, changed-files, fuel chip.
  const [sentry, setSentry] = React.useState<{ violations: string[]; changed: string[]; cost: number; calls: number }>({ violations: [], changed: [], cost: 0, calls: 0 });
  // SCREEN MANIFEST: this pane tells the chat what it looks like right now (deterministic, one line)
  React.useEffect(() => {
    const uid = `agent-${paneId ?? kind}`;
    reportScreenState(uid, `${paneDisplay(kind).glyph} ${paneDisplay(kind).name} agent pane${pane?.branch ? ` · ${pane.branch}` : ""} — ${pane ? "attached" : "provisioning"} · ${sentry.changed.length} file${sentry.changed.length === 1 ? "" : "s"} changed · ${sentry.violations.length ? `⚠ ${sentry.violations.length} scope violation${sentry.violations.length === 1 ? "" : "s"}` : "scope clean"} · $${sentry.cost.toFixed(2)} spent`);
    return () => clearScreenState(uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane?.id, sentry.violations.length, sentry.changed.length, sentry.cost]);
  // THE FIRST PROMPT (agent card): once the CLI is live, the ask is typed in — once per pane
  const heimdallOnRef = React.useRef(false); const askHeimdallRef = React.useRef<(g: string) => Promise<void>>(async () => {}); const chatModeRef = React.useRef(false);
  React.useEffect(() => {
    const pid = pane?.id;
    if (!pid || !ask) return;
    const mark = `antiloki:ask-sent:${pid}`;
    try { if (localStorage.getItem(mark)) return; } catch { /* fine */ }
    let stop = false;
    let tries = 0;
    const t: any = setTimeout(async function tick() {
      if (stop) return;
      let running = false; let ready: boolean | undefined;
      if (chatModeRef.current) { running = true; ready = true; } // the chat session starts on the first send — nothing to wait for
      else try { const s: any = await apiGet(`/api/v1/cockpit/pty/status?pane_id=${pid}`); const st = s?.result ?? s; running = !!st?.running; ready = typeof st?.ready === "boolean" ? st.ready : undefined; } catch { /* not yet */ }
      // the serve says when the CLI's composer is painted (keystrokes before that are eaten by the
      // TUI's boot — OpenCode swallowed a first ask, 2026-09-19); an older serve gets the 5s beat
      const beat = firstAskBeat(running, ready, tries);
      if (beat != null) {
        setTimeout(async () => {
          if (stop) return;
          // with Heimdall on, the ask is routed first (the terminal gets the model + the verdict, or the plan)
          const routed = heimdallOnRef.current;
          const ok = routed ? (await askHeimdallRef.current(ask), true) : await sayToAgent(pid, ask);
          if (ok) { try { localStorage.setItem(mark, new Date().toISOString()); } catch { /* fine */ } }
        }, beat);
        return;
      }
      if (++tries < 60) setTimeout(tick, 2_000);
    }, 1_500);
    return () => { stop = true; clearTimeout(t); };
  }, [pane?.id, ask]);
  const [undoing, setUndoing] = React.useState(false);
  const [blast, setBlast] = React.useState<{ file: string; n: number } | null>(null);
  const blastFor = React.useRef<string | null>(null);
  const [cps, setCps] = React.useState<{ n?: number; rev?: string; sha?: string; short?: string; subject: string; when: string }[] | null>(null);
  const [cpRedo, setCpRedo] = React.useState(false);
  const paneId2 = pane?.id ?? null;
  React.useEffect(() => {
    if (paneId2 == null) return;
    let stop = false;
    let t: any = setTimeout(async function tick() {
      // a folder that is not a git repository has nothing to watch (QA report BUG-009): the serve says so softly, and the desk asks every 30 s instead of 5 (the answer still carries the pane's cost and calls)
      let everyMs = 5_000;
      try {
        const r = unwrap(await apiPost(`/api/v1/pane/sentry`, { pane_id: paneId2, op: "check" }, { timeoutMs: 12_000 }));
        if (r?.note === "not a git repository") everyMs = 30_000;
        if (!stop && r?.ok) setSentry({ violations: r.violations ?? [], changed: r.changed ?? [], cost: Number(r.cost_usd) || 0, calls: Number(r.calls) || 0 });
      } catch { /* */ }
      if (!stop) t = setTimeout(tick, everyMs);
    }, 3_000);
    return () => { stop = true; clearTimeout(t); };
  }, [paneId2]);
  // READS MEASUREMENT (2026-09-15): the Claude hook logs every Read/Grep/tool call into the box;
  // poll it on the sentry's cadence so the chip shows pack-vs-source instead of trusting the nudge.
  React.useEffect(() => {
    if (paneId2 == null) return;
    let stop = false;
    // reads every 5 s (cheap: one small file); usage every 15 s (Codex's reader walks its session
    // logs, OpenCode's opens its db) — the numbers move per turn, not per second
    let n = 0;
    let t: any = setTimeout(async function tick() {
      const [r, u, q] = await Promise.all([fetchReads(paneId2), n % 3 === 0 ? fetchUsage(paneId2) : Promise.resolve(null), fetchPtyQuota(paneId2)]);
      n += 1;
      if (!stop && r) setReads(r);
      if (!stop && u) setUsage(u);
      if (!stop) setPtyQuota(q ?? null);
      if (!stop) t = setTimeout(tick, 5_000);
    }, 4_000);
    return () => { stop = true; clearTimeout(t); };
  }, [paneId2]);
  // PLANS AS ARTEFACTS (2026-09-16): a plan the agent wrote (Claude plan file · Codex update_plan ·
  // OpenCode todo) becomes an artefact pane with accept / reject; the chip turns amber while pending.
  const plans: PackPlan[] = ((reads as any)?.plans ?? []) as PackPlan[];
  const [planView, setPlanView] = React.useState<any | null>(null); // the artefact, opened right here
  const openPlan = async (p: PackPlan) => {
    if (paneId2 == null || opening) return;
    setOpening(p.file);
    try {
      const [full] = await fetchPlans(paneId2, p.file);
      const item = { title: p.title, body_md: full?.body_md ?? "", plan: { pane_id: paneId2, file: p.file, engine: kind, title: p.title } };
      setPlanView(item);
      // and, when this chat has a session, persist it as an artefact pane of the chat too
      if (chatSessionId) { try { await saveTurnWidget({ session_id: chatSessionId, type: "artifact", kind: "artifact", payload: { item } }); } catch { /* the modal already shows it */ } }
    } finally { setOpening(null); }
  };
  // EXPAND SCOPE (2026-09-16): the hook/plugin refused a write outside the whitelist; the operator
  // widens the scope with one click (pane/update re-bakes the manifest, so the agent's retry passes).
  const dismissedPersisted: string[] = React.useMemo(() => { try { const d = JSON.parse((pane as any)?.settings_json ?? "{}")?.blocked_dismissed; return Array.isArray(d) ? d.map(String) : []; } catch { return []; } }, [pane]);
  const paneScopeNow: string[] = Array.isArray(pane?.scope) ? (pane!.scope as any[]).map(String) : [];
  const blocked = (reads?.blocked ?? [])
    .filter((b) => `${b.path}@${b.t ?? ""}` !== dismissedBlock && !dismissedPersisted.includes(`${b.path}@${b.t ?? ""}`))
    .filter((b) => !covered(paneScopeNow, b.path, false))[0] ?? null; // already expanded → nothing to show
  const dismissBlock = async () => {
    if (!pane || !blocked) return;
    const tag = `${blocked.path}@${blocked.t ?? ""}`;
    setDismissedBlock(tag);
    try {
      const settings = (() => { try { return JSON.parse((pane as any).settings_json ?? "{}") ?? {}; } catch { return {}; } })();
      const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, settings: { ...settings, blocked_dismissed: [...dismissedPersisted, tag].slice(-20) }, context_bake: false }, { timeoutMs: 15_000 }));
      if (r?.pane) { setPane(r.pane); ensureInflight.set(key, Promise.resolve(r.pane)); }
    } catch { /* the in-memory dismissal already hides it */ }
    say("[antiloki] operator declined to expand your scope — stay within it.");
  };
  // ⊕ A FILE ON THE ASK (operator 2026-09-21: "on add a file to a prompt we link the path and add it to the scope,
  // so we can add any file this way"): the path joins the edit scope (and the pack is rebaked) — the pane puts
  // the @file chip on the ask itself
  const addToScope = async (path: string) => {
    if (!pane) return;
    const cur = Array.isArray(pane.scope) ? (pane.scope as any[]).map(String) : [];
    if (cur.includes(path)) return;
    const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, scope: [...cur, path] }, { timeoutMs: 60_000 }));
    if (r?.pane) { setPane(r.pane); ensureInflight.set(key, Promise.resolve(r.pane)); if (r.context_pack?.ok) setPackBake(r.context_pack); else void bakeContextPack(r.pane.id).then((bk) => bk && setPackBake(bk)).catch(() => {}); }
  };
  const expandScope = async (glob: string) => {
    if (!pane || !blocked) return;
    setExpanding(true);
    try {
      const cur = Array.isArray(pane.scope) ? (pane.scope as any[]).map(String) : [];
      const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, scope: [...cur.filter((g) => g !== glob), glob] }, { timeoutMs: 60_000 }));
      if (r?.pane) { setPane(r.pane); ensureInflight.set(key, Promise.resolve(r.pane)); if (r.context_pack?.ok) setPackBake(r.context_pack); }
      setDismissedBlock(`${blocked.path}@${blocked.t ?? ""}`);
      say(`[antiloki] operator expanded your edit scope: ${glob} is now writable — retry the edit.`);
    } finally { setExpanding(false); }
  };
  // BLAST-RADIUS chip: when the newest changed file changes, measure its dependents (atlas, lazy).
  React.useEffect(() => {
    const f = sentry.changed[0];
    if (!f || f === blastFor.current) return;
    blastFor.current = f;
    void (async () => {
      try {
        const r: any = unwrap(await apiPost(`/api/v1/codebase/blast`, { node_ids: [f] }, { timeoutMs: 15_000 }));
        const n = Array.isArray(r?.nodes) ? r.nodes.length : Array.isArray(r?.impacted) ? r.impacted.length : Array.isArray(r) ? r.length : 0;
        setBlast({ file: f, n });
      } catch { setBlast(null); }
    })();
  }, [sentry.changed]); // eslint-disable-line react-hooks/exhaustive-deps
  const undoViolations = async () => {
    if (paneId2 == null) return;
    setUndoing(true);
    try { const r = unwrap(await apiPost(`/api/v1/pane/sentry`, { pane_id: paneId2, op: "undo" }, { timeoutMs: 30_000 })); if (r?.ok) setSentry((s) => ({ ...s, violations: [] })); } finally { setUndoing(false); }
  };
  const say = (text: string) => { if (paneId2 != null) void sayToAgent(paneId2, text); };
  // THE FRONT DOOR (operator 2026-09-20: "heimdall and plan is active but the terminal didn't show the
  // selection of the model or if a plan was needed or subagents … not even screening was asked"): with
  // the router on, the pane's prompt goes through Heimdall FIRST — routed (tier, delegate or not, how
  // sure), screened (blocking questions), planned (approval) — and only then reaches the CLI: an inline
  // route types the model switch and the routed prompt into the terminal; a delegation runs the plan.
  const settingsOf = (p: any) => { try { return JSON.parse(p?.settings_json ?? "{}") ?? {}; } catch { return {}; } };
  // A CHAT (chats-tab.tsx, 2026-09-21): read-only, no box — the rail, the chips and the agent-only footer
  // (preview · QA · heimdall · sub-agents · the dial) stay away; antiChat's chrome
  const isChat = !!settingsOf(pane).chat;
  // AN AGENT KEEPS ITS CHROME EVEN WHEN ITS TRANSCRIPT IS CHAT-SHAPED (operator 2026-09-27: "the settings button on
  // the agent disappeared, the header of the agent wich had some info disappeared").
  //
  // `chat: true` was set on the MAIN agent back when main meant "read-only, ask it anything, it changes nothing" —
  // and a read-only chat has no scope to edit, no merge to configure and no cost of its own, so the status row was
  // rightly hidden. Main is now the one master agent and it WRITES: the screenshot that prompted this shows it
  // editing src/products.ts. An agent that edits needs its ⚙ — scope, guidance, context, subagents, audit,
  // checkpoints — and its numbers, whatever shape its transcript takes.
  //
  // The distinction is the pane's own name: `agent-*` is an agent, `chat-*` is antiChat. That is what the roster
  // keys on too, so the two cannot disagree.
  const isAgentPane = String((pane as any)?.subagent_name ?? "").startsWith("agent-");
  const chatOnly = isChat && !isAgentPane;
  // READ-ONLY IS ITS OWN FLAG (serve: chat_pane::is_readonly): explicit when set, else a plain chat is read-only
  const paneReadonly: boolean = settingsOf(pane).readonly ?? isChat;
  // THE MAIN AGENT WRITES NOTHING (operator 2026-09-24, from a Windows install: "the first agent Main, wich
  // should be readonly has on heimdall options like QA and build that should only be available in other
  // agents"). Main is the one agent deliberately hired for no job: the whole workspace, read-only, nothing to
  // configure. QA judges an acceptance claim and the three gates run the project's build after a turn changed
  // files — on an agent that never changes one, both are controls for something that cannot happen. They are
  // not disabled here, they are absent: a switch that does nothing is worse than no switch.
  const readOnly = settingsOf(pane)?.recipe === "main";
  const heimdallOn = !!pane && readPolicy(settingsOf(pane)).router;
  const heimdallMode = pane ? readHeimdall(settingsOf(pane)) : "auto";
  const paneMerge = pane ? pairLabel(readPair(settingsOf(pane))) : "solo";
  /** the menu's three states: one write, and `enabled` is kept in step for everything still reading the boolean */
  const setHeimdall = async (m: "auto" | "on" | "off") => {
    if (!pane?.id) return;
    try {
      const cur = settingsOf(pane);
      const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, settings: { ...cur, router: { ...(cur.router ?? {}), mode: m, enabled: m !== "off" } } }, { timeoutMs: 30_000 }));
      if (r?.pane) setPane(r.pane as Pane);
    } catch { /* the menu keeps the state it had */ }
  };
  const [rail, setRail] = React.useState<"heimdall" | "screen" | "plan" | "qa" | "quota" | "side" | "diff" | "commits" | "queue" | null>(null);
  const { q: queueSnap, refresh: refreshQueue } = useQueue(pane?.id ?? null); // THE AGENT'S QUEUE: what was asked, done / doing / next (queue-view.tsx) // the side panel inside the pane — one view per rail icon
  // SIDE QUESTIONS (operator 2026-09-24): ✂ ⤢ ≡ ⁇ under a reply run HERE, beside the conversation, never in it
  const side = useSideQuestions(String(pane?.pane_kind ?? ""));
  // the last reply a side question was asked about — the rail's own ask box reuses it, so "and why?" typed there
  // means the same thing it would have meant under the reply
  const lastCtx = React.useRef("");
  const askSide = React.useCallback((kind: SideKind, context: string, question = "") => { if (context) lastCtx.current = context; side.ask(kind, context, question); setRail("side"); }, [side]);
  // ONLY A DECISION OPENS A VIEW (operator 2026-09-20: "instead of opening, blink heimdall while it works;
  // only the screening should open when it needs a user decision"): the ⚡ icon blinks while a route is
  // in flight; a run parked in awaiting-answers opens ? by itself and closes it again once answered.
  const askingRun = goalRuns.find((r) => r.status === "awaiting-answers")?.id ?? null;
  const autoOpened = React.useRef<number | null>(null);
  React.useEffect(() => {
    // THE QUESTION IS IN THE CHAT NOW (operator 2026-09-28: "it opened the screening pane, but the screening question
    // already appears on the chat, so it shouldn't open the screening pane"): only a pane with no chat chrome — a
    // terminal — still has the rail as the one place to answer.
    const inThread = !!pane && (ENGINE_KEYS as readonly string[]).includes(String(pane.pane_kind ?? kind));
    if (askingRun != null && autoOpened.current !== askingRun) { autoOpened.current = askingRun; if (!inThread) setRail("screen"); }
    else if (askingRun == null && autoOpened.current != null) { autoOpened.current = null; setRail((r) => (r === "screen" ? null : r)); }
  }, [askingRun]);
  // THE CHAT AGENT (2026-09-20): a Claude pane is a conversation by default; `settings.ui = "terminal"` keeps the PTY
  // the chat session: Claude Code and OpenCode (2026-09-20) — Codex stays a terminal until app-server lands
  const chatMode = !!pane && (ENGINE_KEYS as readonly string[]).includes(String(pane.pane_kind ?? kind)); // a saved `ui: "terminal"` from before is ignored
  React.useEffect(() => { if (pane?.id) markChatPane(pane.id, chatMode); return () => { if (pane?.id) markChatPane(pane.id, false); }; }, [pane?.id, chatMode]);
  // MAX (operator 2026-09-20: "this agent can do anything to any file — all in scope, antiloki's intel and
  // the raw files, all permissions, all specialists, the max of sub-agents"): one click widens the scope
  // to **, lifts every allowlist, opens the whole pack live, sets 8 sub-agents auto-approved and lets the
  // CLI run without permission prompts; the previous scope and lists are kept so the same click restores them.
  const maxOn = !!pane && settingsOf(pane)?.max === true;
  // MIN (operator 2026-09-21: "the opposite of MAX — reads just antiloki's intel, never the files"): the pane
  // navigates with the pack and the live tools; the hook refuses exploration; reads only what it edits, in scope.
  // Only exploration changes: sub-agents run in the same box (the hook puts them under MIN too) and the
  // specialists' briefs are intel; the pack is forced LIVE — the tools are the pane's eyes.
  const minOn = !!pane && settingsOf(pane)?.min === true;
  // QA (operator 2026-09-21: "one button QA, on and off, on the top header, and a QA pane on the sidebar"): the
  // pane's `settings.qa.enabled` — read by the plan op at plan time; no session restart needed
  const qaOn = !!pane && settingsOf(pane)?.qa?.enabled === true;
  const [flippingQa, setFlippingQa] = React.useState(false);
  const toggleQa = async () => {
    if (!pane?.id || flippingQa) return; setFlippingQa(true);
    try {
      const cur = settingsOf(pane);
      const next = { ...cur, qa: { ...(cur.qa ?? {}), enabled: !qaOn } };
      const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, settings: next }, { timeoutMs: 30_000 }));
      if (r?.pane) { setPane(r.pane as Pane); ensureInflight.set(key, Promise.resolve(r.pane)); }
    } finally { setFlippingQa(false); }
  };
  // ROLES — the baton (operator 2026-09-26: "add a flag roles like qa on the heimdall menu").
  //
  // DEFAULT ON, which is why the read is `!== false` rather than `=== true` like QA's above: a pane that has never
  // heard of the setting routes roles. QA costs a judge's call on every run and has to be asked for; this only
  // decides WHICH measured winner a job was already going to route to.
  const rolesOn = !pane || settingsOf(pane)?.roles?.enabled !== false;
  // THE ROLE, FETCHED AND PICKABLE (2026-09-26). RoleSwitcher shipped in no build: it was imported by nothing but its
  // own test, so the chameleon's core control existed only as a passing test — and the landing copy described a
  // dropdown no user could open. `fetchRoles` was already here for the wizard; the header just never asked.
  const [roleList, setRoleList] = React.useState<RoleWithMerges[]>([]);
  React.useEffect(() => { void fetchRoles().then((r) => setRoleList(r.roles ?? [])).catch(() => setRoleList([])); }, [pane?.worktree_path]);
  /** the role the operator PINNED, or the one Heimdall named on the newest routed run — pinned wins, because picking
   *  one is the act of turning routing off and the header must not then show a different answer. */
  const pinnedRoleKey: string | null = settingsOf(pane)?.roles?.role ?? null;
  const routedRole = React.useMemo(() => routedRoleOf(goalRuns), [goalRuns]);
  const currentRole = React.useMemo(() => {
    const key = currentRoleKeyOf(rolesOn, pinnedRoleKey, routedRole);
    return key ? (roleList.find((x) => x.key === key) ?? null) : null;
  }, [roleList, pinnedRoleKey, routedRole, rolesOn]);
  const roleWhy = React.useMemo(() => roleWhyOf(goalRuns), [goalRuns]);
  /** PICKING IS THE ACT OF TURNING ROUTING OFF (operator 2026-09-26: "if the user chooses a role heimdall get off,
   *  until the user turns it on again"). One write: the role, and `enabled: false` in the same gesture, so the ⚡ pill
   *  and the chip can never disagree about who is in charge. */
  const pickRole = async (roleKey: string, takeover: boolean) => {
    if (!pane?.id) return;
    const cur = settingsOf(pane);
    const next = { ...cur, roles: { ...(cur.roles ?? {}), role: roleKey, enabled: takeover ? false : (cur.roles?.enabled !== false) } };
    const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, settings: next }, { timeoutMs: 30_000 }));
    if (r?.pane) { setPane(r.pane as Pane); ensureInflight.set(key, Promise.resolve(r.pane)); }
  };
  const [flippingRoles, setFlippingRoles] = React.useState(false);
  const toggleRoles = async () => {
    if (!pane?.id || flippingRoles) return; setFlippingRoles(true);
    try {
      const cur = settingsOf(pane);
      const next = { ...cur, roles: { ...(cur.roles ?? {}), enabled: !rolesOn } };
      const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, settings: next }, { timeoutMs: 30_000 }));
      if (r?.pane) { setPane(r.pane as Pane); ensureInflight.set(key, Promise.resolve(r.pane)); }
    } finally { setFlippingRoles(false); }
  };
  // PREVIEW (operator 2026-09-21: "a preview button on the agent which opens at the side a terminal widget in
  // preview mode of that agent's worktree, both linked; on the header, on and off"): the thread adds a `run`
  // cell pinned to THIS pane (its dev server boots by itself) and removes it when the button goes off
  const previewOn = !!pane && settingsOf(pane)?.preview?.enabled === true;
  const [flippingPreview, setFlippingPreview] = React.useState(false);
  const togglePreview = async () => {
    if (!pane?.id || flippingPreview) return; setFlippingPreview(true);
    try {
      const cur = settingsOf(pane); const on = !previewOn;
      const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, settings: { ...cur, preview: { ...(cur.preview ?? {}), enabled: on } } }, { timeoutMs: 30_000 }));
      if (r?.pane) { setPane(r.pane as Pane); ensureInflight.set(key, Promise.resolve(r.pane)); }
      window.dispatchEvent(new CustomEvent("antiloki:ui", { detail: { verb: "preview", pane: pane.id, on, title: `preview · ${pane.subagent_name ?? kind}` } }));
    } finally { setFlippingPreview(false); }
  };
  // A STUDIO PICK OR A CLICK ON THE FOLDED EPISODES RAIL YIELDS THE PREVIEW (operator 2026-09-28): the split slot is one, so
  // whoever takes it switches this agent's preview OFF — the setting and the button — instead of leaving it lit over a
  // panel that is no longer showing it.
  React.useEffect(() => {
    const h = (e: any) => { if (e?.detail?.verb === "preview-yield" && previewOn && pane?.id) void togglePreview(); };
    window.addEventListener("antiloki:ui", h as any);
    return () => window.removeEventListener("antiloki:ui", h as any);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  // THE PANE ON SCREEN SAYS WHAT ITS PREVIEW IS (operator 2026-09-28): announced on mount, so switching agents shows
  // that agent's own preview — booted — or takes another agent's off the screen. See `preview-sync` in chat-thread.
  React.useEffect(() => {
    if (!pane?.id) return;
    window.dispatchEvent(new CustomEvent("antiloki:ui", { detail: { verb: "preview-sync", pane: pane.id, on: previewOn, title: `preview · ${pane.subagent_name ?? kind}` } }));
  }, [pane?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const qaJudging = goalRuns.some((r) => r.qa_review_wanted && !r.qa_review && (r.status === "done" || r.status === "failed"));
  const qaFailed = (() => { const judged = goalRuns.filter((r) => r.qa_review).sort((a, b) => b.created - a.created); return !!judged[0] && !judged[0].qa_review!.passed; })();
  // THE ✓ ICON CARRIES THE QA (operator 2026-10-08: the QA left the chat for the rail): the newest run's own verdict colours it, and it pulses while the judge works - never opens by itself
  const qaRun = useQaRailState(goalRuns);
  const [flippingMin, setFlippingMin] = React.useState(false);
  // MIN · SCOPE · MAX are one dial (operator 2026-09-21: "MIN and MAX are opposites — a switcher"): turning
  // one end on turns the other off FIRST, and the second save builds on the pane the first one returned
  // (the closure's `pane` is stale after an await — building on it would put the other end back).
  const toggleMin = async (base?: Pane): Promise<Pane | null> => {
    if (!pane?.id || flippingMin) return null; setFlippingMin(true);
    try {
      let p0: Pane = base ?? pane;
      if (!minOn && settingsOf(p0)?.max === true) p0 = (await toggleMax(p0)) ?? p0;
      const cur = settingsOf(p0);
      let next: Record<string, any>;
      if (cur.min !== true) {
        next = { ...cur, min: true, min_prev: { context_pack: cur.context_pack ?? null } };
        next.context_pack = { ...(cur.context_pack ?? { preset: "scope", items: [] }), live: true };
      } else {
        const prev = cur.min_prev ?? {};
        next = { ...cur }; delete next.min; delete next.min_prev;
        if (prev.context_pack) next.context_pack = prev.context_pack; else delete next.context_pack;
      }
      const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, settings: next }, { timeoutMs: 60_000 }));
      if (r?.pane) { setPane(r.pane as Pane); ensureInflight.set(key, Promise.resolve(r.pane)); void bakeContextPack(r.pane.id).then((bk) => bk && setPackBake(bk)).catch(() => {}); }
      // the session's boot prompt and hook rules change: stop it, the next send resumes under the new mode
      if (chatMode) { try { await apiPost(`/api/v1/cockpit/agent/stop`, { pane_id: pane.id }, { timeoutMs: 10_000 }); } catch { /* the next send starts it */ } }
      return (r?.pane as Pane) ?? null;
    } finally { setFlippingMin(false); }
  };
  const [flippingMax, setFlippingMax] = React.useState(false);
  const toggleMax = async (base?: Pane): Promise<Pane | null> => {
    if (!pane?.id || flippingMax) return null; setFlippingMax(true);
    try {
      let p0: Pane = base ?? pane;
      if (!maxOn && settingsOf(p0)?.min === true) p0 = (await toggleMin(p0)) ?? p0;
      const cur = settingsOf(p0);
      const scopeNow = paneScopeOf(p0);
      let next: Record<string, any>; let scope: string[];
      if (cur.max !== true) {
        next = { ...cur, max: true, max_prev: { scope: scopeNow, specialists: cur.specialists ?? null, skills: cur.skills ?? null, delegate: cur.delegate ?? null, router: cur.router ?? null, shell: cur.shell ?? null, context_pack: cur.context_pack ?? null } };
        delete next.specialists; delete next.skills;
        next.delegate = { ...(cur.delegate ?? {}), enabled: true, max: 8, approve: "auto" };
        next.router = { ...(cur.router ?? {}), enabled: true };
        next.shell = "allow";
        next.context_pack = { preset: "scope", items: [], live: true, budget_chars: 1_000_000 };
        scope = ["**"];
      } else {
        const prev = cur.max_prev ?? {};
        next = { ...cur }; delete next.max; delete next.max_prev;
        if (prev.specialists) next.specialists = prev.specialists; else delete next.specialists;
        if (prev.skills) next.skills = prev.skills; else delete next.skills;
        if (prev.delegate) next.delegate = prev.delegate; else delete next.delegate;
        if (prev.router) next.router = prev.router; else delete next.router;
        if (prev.shell) next.shell = prev.shell; else delete next.shell;
        if (prev.context_pack) next.context_pack = prev.context_pack; else delete next.context_pack;
        scope = Array.isArray(prev.scope) && prev.scope.length ? prev.scope : scopeNow;
      }
      const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, settings: next, scope }, { timeoutMs: 60_000 }));
      if (r?.pane) { setPane(r.pane as Pane); ensureInflight.set(key, Promise.resolve(r.pane)); void bakeContextPack(r.pane.id).then((bk) => bk && setPackBake(bk)).catch(() => {}); }
      // the running session keeps its permission mode until it restarts: stop it, the next send resumes under the new mode
      if (chatMode) { try { await apiPost(`/api/v1/cockpit/agent/stop`, { pane_id: pane.id }, { timeoutMs: 10_000 }); } catch { /* the next send starts it */ } }
      return (r?.pane as Pane) ?? null;
    } finally { setFlippingMax(false); }
  };
  /** the dial: MIN · SCOPE (the normal mode — the scope is the boundary) · MAX */
  // THE SPEED DIAL (2026-09-22): cheaper · balanced · faster, kept on the pane (`settings.speed`); the serve records it
  // on every run and nothing acts on it yet — the bench decides what each setting means before it is wired
  const speed = ((settingsOf(pane ?? undefined)?.speed as "cheaper" | "balanced" | "faster" | undefined) ?? "balanced");
  const setSpeed = async (s: "cheaper" | "balanced" | "faster") => {
    if (!pane?.id) return;
    try { const cur = settingsOf(pane); const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, settings: { ...cur, speed: s } }, { timeoutMs: 30_000 })); if (r?.pane) setPane(r.pane as Pane); } catch { /* keeps the old value */ }
  };
  // THE BARS (2026-09-22): `settings.dial` = {position, context, cost}. The context axis drives the pane's real
  // MIN/MAX — 0 MIN (intel alone decides which files are touched) · 1 BALANCED (the scoped files in full + the intel
  // over them) · 2 MAX (scope `**`, the whole intel at a 1M budget, exploration and shell on). The cost axis rides
  // to serve on the pane and walks each role one rung of the operator's ladder (cli::role_binding_at).
  const dial = (() => {
    const d = settingsOf(pane ?? undefined)?.dial as { position?: number | null; context?: number; cost?: number } | undefined;
    if (d && typeof d.context === "number") return { position: (d.position ?? null) as any, context: d.context as any, cost: (d.cost ?? 1) as any };
    return { position: (minOn ? 0 : maxOn ? 2 : 1) as any, context: (minOn ? 0 : maxOn ? 2 : 1) as any, cost: 1 as any };
  })();
  const setBars = async (d: { position: any; context: any; cost: any }) => {
    if (!pane?.id) return;
    const wantMin = d.context === 0, wantMax = d.context === 2;
    // the dial is written FIRST, and the pane that comes back is what the min/max flip then edits — the flip
    // rebuilds the settings from the pane it is given, so handing it the stale one would drop `dial` again
    let after: Pane | null = null;
    try {
      const cur = settingsOf(pane);
      const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, settings: { ...cur, dial: d } }, { timeoutMs: 30_000 }));
      if (r?.pane) { after = r.pane as Pane; setPane(after); }
    } catch { /* the bar keeps its old place */ }
    // MIN and MAX are exclusive and each flip drops the other, so ASK FOR THE STOP, never "toggle whatever differs"
    // (2026-09-22: moving the bar MIN → MAX used to turn MIN off and land on SCOPE, which is not what the bar said)
    const base = after ?? pane;
    if (wantMin) { if (!minOn) await toggleMin(base); }
    else if (wantMax) { if (!maxOn) await toggleMax(base); }
    else if (minOn) await toggleMin(base);
    else if (maxOn) await toggleMax(base);
  };
  const setDial = async (mode: "min" | "scope" | "max") => {
    if (mode === "min") { if (!minOn) await toggleMin(); }
    else if (mode === "max") { if (!maxOn) await toggleMax(); }
    else { if (minOn) await toggleMin(); else if (maxOn) await toggleMax(); }
  };
  // the router and the sub-agents, flipped from the pane's footer (they used to sit on the strip)
  // THE THREE GATES on the pane's settings (operator 2026-09-24). Off unless switched on: a pane that has never
  // been configured must not start a build by itself.
  const gates = React.useMemo(() => { const g = settingsOf(pane)?.gates ?? {}; return { test: !!g.test, build: !!g.build, lint: !!g.lint, laws: !!g.laws }; }, [pane]);
  const flipGate = async (g: "test" | "build" | "lint" | "laws") => {
    if (!pane?.id) return;
    try {
      const cur = settingsOf(pane);
      const next = { ...cur, gates: { ...(cur.gates ?? {}), [g]: !gates[g] } };
      const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, settings: next }, { timeoutMs: 30_000 }));
      if (r?.pane) setPane(r.pane as Pane);
    } catch { /* the toggle keeps the old state */ }
  };
  const flipPolicy = async (key: "router" | "delegate", on: boolean) => {
    if (!pane?.id) return;
    try {
      const cur = settingsOf(pane);
      const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, settings: { ...cur, [key]: { ...(cur[key] ?? {}), enabled: on } } }, { timeoutMs: 30_000 }));
      if (r?.pane) setPane(r.pane as Pane);
    } catch { /* the toggle keeps the old state */ }
  };
  const subagentsOn = !!pane && readPolicy(settingsOf(pane)).subagents;
  const routerSaved = routerSavings(goalRuns);
  const [heimdallBusy, setHeimdallBusy] = React.useState<string | null>(null);
  // THE HAND-OFF (operator's queue): this agent's conversation, continued on another engine. The endpoint is the one
  // the chats have used since September — generalised to agents on the serve today — so nothing new carries the
  // conversation; the chip was simply never offered here. A chat passes its own switch in and keeps it.
  const [handingOver, setHandingOver] = React.useState(false);
  const seats = useSeats();
  const handOff: ChatSwitch = React.useMemo(() => ({
    // the seats that can run today (installed, signed in, switched on) - and the one this pane is on, so the picker can still show it
    engines: offered(seats, String(pane?.pane_kind ?? kind)),
    busy: handingOver,
    pick: (engine: string) => {
      if (handingOver) return;
      setHandingOver(true);
      void apiPost("/api/v1/cockpit/chat/switch", { pane_id: paneId, engine }, { timeoutMs: 60_000 })
        .finally(() => setHandingOver(false));
    },
  }), [handingOver, paneId, seats, pane?.pane_kind, kind]);
  const mountedAt = React.useRef(Date.now());
  const askHeimdall = async (goal: string) => {
    const g = goal.trim(); if (!g || !pane?.id || !pane.worktree_path) return;
    setHeimdallBusy(g);
    try {
      const max = Number(settingsOf(pane)?.delegate?.max) || 4;
      // THROUGH THE AGENT'S QUEUE (operator 2026-09-29): the serve consolidates the ask, decides who will do it, and starts it now if the agent is idle - else it waits its turn.
      const added = await queueAdd({ parent: subKey, goal: g, engine: String(pane.pane_kind ?? kind), cwd: pane.worktree_path, write: true, n: max, pane_id: pane.id });
      const run = added.item ? (added.run ?? (added.queued || added.duplicate ? ({} as GoalRun) : null)) : null;
      refreshQueue();
      // A PLAN THAT CAME BACK EMPTY IS A REFUSAL TOO. `planGoalRun` now rethrows a 400, but an older serve, a
      // 404 or a shapeless answer still lands here as `null`, and the ask must not die of it.
      if (!run) throw new Error("the router did not answer");
      await refreshSubs();
    } catch (e: any) {
      // NO MESSAGE GOES TO THE VACUUM (operator 2026-09-27: "my message go to vacuo, didnt even answered me").
      // The router's refusal — a 400 such as "delegation is off for this pane" — used to end here unseen: the
      // bubble was already on the stage and nothing ever followed it. Now the line goes to the agent as it was
      // typed, and the thread says why Heimdall did not take it.
      const why = String(e?.message ?? e).replace(/^POST [^ ]+ → \d{3}:?\s*/, "").replace(/^\d{3}\s*/, "").slice(0, 200);
      try { await apiPost("/api/v1/cockpit/agent/note", { pane_id: pane.id, text: `⚡ Heimdall did not route this one — ${why}. Sent to the agent as is.`, tone: "warn" }); } catch { /* an older serve has no note route; the send below still happens */ }
      await sayToAgent(pane.id, g);
    } finally { setHeimdallBusy(null); }
  };
  // an INLINE route from the ask bar lands in the terminal by itself: the model the tier calls for
  // (Claude's /model), then the goal with the router's verdict — the operator sees the decision happen
  // A RUN THAT IS WAITING ON YOU SAYS SO WHERE YOU ARE LOOKING (found 2026-09-28 driving a fresh fork: "say
  // exactly: ready" was screened, parked in `awaiting-answers` with one blocking question, and the THREAD showed
  // nothing at all — the question lived only on the rail, which is closed by default. That is "i send a message
  // and nothing happens" for the third time tonight, by a third cause.)
  const announced = React.useRef<Set<number>>(new Set());
  React.useEffect(() => { /* a note already posted for this run stays posted across remounts */
    for (const r of goalRuns) { try { if (localStorage.getItem(`antiloki:announced:${r.id}`)) announced.current.add(r.id); } catch { /* fine */ } }
  }, [goalRuns]);
  React.useEffect(() => {
    if (!pane?.id) return;
    for (const r of goalRuns) {
      if (r.status !== "awaiting-answers" || announced.current.has(r.id)) continue;
      const qs = (r.questions ?? []).filter((q: any) => !q.answer);
      // MARKED ONLY ONCE THERE IS SOMETHING TO SAY (audit 2026-09-28). This marked the run announced BEFORE the
      // empty check, so a run polled into `awaiting-answers` one tick before its questions arrived was silenced
      // for ever — the exact bug the effect exists to prevent.
      if (!qs.length) continue;
      announced.current.add(r.id);
      // …AND IT SURVIVES A REMOUNT. The note is PERSISTED by serve, and this component remounts on every pane or
      // tab switch, so a ref alone appended another copy each time until the operator answered.
      try { localStorage.setItem(`antiloki:announced:${r.id}`, "1"); } catch { /* fine */ }
      const lines = qs.map((q: any) => `• ${q.text}${q.default ? `\n   (if you say nothing: ${q.default})` : ""}`).join("\n");
      void apiPost("/api/v1/cockpit/agent/note", { pane_id: pane.id, tone: "warn",
        // QA's own question comes AFTER the work ran; "before planning" is wrong for it (found in the browser journey C, 2026-09-30)
        text: `${qs.some((q: any) => q.kind === "qa-direction") ? "⚡ QA asks how to go on:" : "⚡ Heimdall asks before planning this:"}\n${lines}` }).catch(() => {});
    }
  }, [goalRuns, pane?.id]);
  heimdallOnRef.current = heimdallOn; askHeimdallRef.current = askHeimdall; chatModeRef.current = chatMode;
  const delivering = React.useRef<Set<number>>(new Set());
  const deliverInline = async (r: GoalRun) => {
    if (!pane?.id || delivering.current.has(r.id)) return;
    delivering.current.add(r.id);
    try {
      // CLAIM FIRST (2026-09-20: two tabs typed the same route — "/model sonnet/model sonnet"): the serve
      // flips `delivered` atomically; only the winner types. An older serve answers without `won` → type.
      const c = await goalOp("delivered", { id: r.id, claim: true });
      if (c && c.won === false) return;
      // THE CONVERSATION KEEPS ITS OWN MODEL (operator 2026-09-29: "it looks like independent calls, not a continuous CLI conversation ... the conversation should be the main provider
      // on a mid tier model; only the plan and the work choose the best merge"). This used to type `/model haiku` (or `/tier low`) into the chat before every inline route, so
      // the model talking to the operator changed with each message's tier. The route's tier now rides in the prompt as advice; the chat model is the one the operator chose.
      const ok = await sayToAgent(pane.id, routedPrompt(r), { liftMin: !!r.route?.no_intel?.length, display: askOf(r.goal) }); // a no-intel route runs with exploration on; the bubble shows the ask, not the pinned context
      // a refused send gives the claim back (2026-09-20: a route was marked delivered while the agent never got it)
      if (!ok) { await goalOp("delivered", { id: r.id, undo: true }); }
    } finally { delivering.current.delete(r.id); }
  };
  // ── GHOST SUGGESTIONS (operator 2026-07-25): translucent next-prompt chips derived from the pane's
  // DETERMINISTIC state (the sentry poll — changed files, violations, blast, cost). No transcript
  // parsing, no model, $0 (LESS_COGNITION_MORE_DETERMINISTIC). Click = types into the field (Use
  // semantics — you complete/send); action chips (⚑ / revert) run directly.
  const lastCpAt = React.useRef(0);
  const suggestions = React.useMemo(() => {
    const out: { t: string; run: () => void; tone?: string }[] = [];
    if (paneId2 == null) return out;
    if (sentry.violations.length) out.push({ t: "↩ revert out-of-scope edits", tone: C.bad, run: () => void undoViolations() });
    // FRESH BOX (operator 2026-07-25: starter chips when the pane just starts) — nothing changed yet:
    // the four right first moves. They retire on their own the moment work begins (changed > 0).
    if (!sentry.changed.length && !sentry.violations.length) {
      out.push(
        ...(packBake?.ok && packBake.items?.some((i) => i.written) ? [{ t: "read your context pack", run: () => say("Read .antiloki/context/INDEX.md and the file reviews it lists, then tell me in 5 bullets which files need work, which laws they break, and what you'd do first. ") }] : []),
        { t: "brief yourself", run: () => say("Read AGENTS.md (your brief, scope, operator context, skills index) and summarize your understanding in 5 bullets. ") },
        { t: "propose a plan", run: () => say("Propose a step-by-step plan for the mission before touching any file. ") },
        { t: "what's risky here", run: () => say("Use the antiloki x-ray skill (curl in .agents/skills/antiloki-xray-first) and tell me the 3 riskiest areas for this mission. ") },
        { t: "list your skills", run: () => say("List the skills installed in .agents/skills and say when you'd use each, one line apiece. ") },
      );
      return out.slice(0, 4);
    }
    if (sentry.changed.length >= 3 && Date.now() - lastCpAt.current > 10 * 60_000)
      out.push({ t: "⚑ checkpoint before continuing", tone: C.ok, run: () => { lastCpAt.current = Date.now(); void checkpoint("save", { label: "suggested" }); } });
    if (sentry.changed.length) {
      out.push({ t: "show me your diff so far", run: () => say("Show me your diff so far (git diff --stat), then summarize what's left. ") });
      out.push({ t: "run the tests", run: () => say("Run the relevant tests now and report pass/fail counts. ") });
    }
    if (blast && blast.n > 5) out.push({ t: `keep ${blast.file.split("/").pop()}'s surface stable`, tone: C.warn, run: () => say(`Careful: ${blast.file} has ${blast.n} dependents (atlas blast radius) — keep its exported surface stable. `) });
    if (sentry.cost > 1) out.push({ t: "summarize progress", run: () => say("Summarize your progress so far in 5 bullets before continuing. ") });
    return out.slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId2, sentry, blast, packBake]);
  // ── BLOCK DROP (operator 2026-07-25: "mount the agent by dragging widget blocks over it") ──
  // dragging a widget block over the terminal dims it and offers two zones: ⊕ ADD (standing context —
  // file in the box + a chip on the header, persisted on pane settings) and ➤ USE (one-shot: injected
  // for the next answer only, chip clears, nothing saved).
  const [dropZone, setDropZone] = React.useState<null | "add" | "use">(null);
  const dragDepth = React.useRef(0);
  const [oneShots, setOneShots] = React.useState<{ label: string; at: number }[]>([]);
  const ctxChips: { uid: string; label: string; source: string }[] = React.useMemo(() => {
    try { return JSON.parse((pane as any)?.settings_json ?? "{}")?.context_chips ?? []; } catch { return []; }
  }, [pane]);
  const onBlockDrop = async (zone: "add" | "use", e: React.DragEvent) => {
    e.preventDefault();
    setDropZone(null); dragDepth.current = 0;
    const b = readBlockDrag(e);
    if (!b || paneId2 == null || !pane) return;
    if (zone === "add") {
      // ADD = IMPLICIT: file + AGENTS.md operator-context index deliver it through the agent's own
      // context channel on its next message — NOTHING is typed into the terminal.
      const path = await feedAgent(paneId2, b.uid, `# ${b.label}\n\n(from ${b.source} — standing operator context; applies until removed)\n\n${b.content}`, null);
      if (!path) return;
      const chips = [...ctxChips.filter((c) => c.uid !== b.uid), { uid: b.uid, label: b.label, source: b.source }];
      const settings = (() => { try { return JSON.parse((pane as any).settings_json ?? "{}") ?? {}; } catch { return {}; } })();
      const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: paneId2, settings: { ...settings, context_chips: chips } }, { timeoutMs: 15_000 }));
      if (r?.pane) { setPane(r.pane); ensureInflight.set(key, Promise.resolve(r.pane)); }
    } else {
      // USE = INTO THE TEXT FIELD NOW (not submitted — you complete/send it): small blocks type inline;
      // big blocks land as a file and the read-line is typed into the field.
      if (b.content.length <= 700) void typeToAgent(paneId2, `[from ${b.source}] ${b.content} `);
      else {
        const p = await feedAgent(paneId2, `oneshot-${Date.now().toString(36)}`, b.content, null);
        if (p) void typeToAgent(paneId2, `Read ${p} (one-shot from ${b.source}), then: `);
      }
      setOneShots((o) => [...o.slice(-3), { label: b.label, at: Date.now() }]);
      setTimeout(() => setOneShots((o) => o.filter((x) => Date.now() - x.at < 19_000)), 20_000);
    }
  };
  const removeChip = async (uid: string) => {
    if (paneId2 == null || !pane) return;
    // silent retire: delete the file + refresh the AGENTS.md index; no terminal text.
    try { await apiPost(`/api/v1/pane/feed`, { pane_id: paneId2, name: uid, op: "remove" }, { timeoutMs: 15_000 }); } catch { /* index best-effort */ }
    const settings = (() => { try { return JSON.parse((pane as any).settings_json ?? "{}") ?? {}; } catch { return {}; } })();
    const chips = ctxChips.filter((c) => c.uid !== uid);
    const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: paneId2, settings: { ...settings, context_chips: chips } }, { timeoutMs: 15_000 }));
    if (r?.pane) { setPane(r.pane); ensureInflight.set(key, Promise.resolve(r.pane)); }
  };
  const checkpoint = async (op: string, extra?: any) => {
    if (paneId2 == null) return;
    const r = unwrap(await apiPost(`/api/v1/cockpit/checkpoints/${op}`, { pane_id: paneId2, ...extra }, { timeoutMs: 30_000 }));
    // A LIST THAT FAILS IS AN EMPTY LIST, NOT AN ENDLESS "reading the branch…" (Grokbot QA 2026-10-12, item 40: a folder with no git repo, or a repo with no commits, answers with an error body and no `checkpoints`)
    if (op === "list") {
      setCps(Array.isArray(r?.checkpoints) ? r.checkpoints : []);
      setCpRedo(!!r?.redo);
    }
    if (op !== "list") setCps(null);
    return r;
  };
  if (err) {
    // SCOPE OVERLAP (operator 2026-09-16): another pane still owns part of this scope — usually a
    // pane whose widget was closed before the close dialog existed. Offer to close THAT pane here
    // (inspect → merge / discard / keep) and retry, instead of a dead end.
    const clash = /overlaps pane (\d+)/.exec(err);
    return (
      <div style={{ padding: 14, fontFamily: mono, fontSize: 10.5, color: C.warn, lineHeight: 1.6 }}>
        ⚠ couldn't provision the pane's box — {err}
        <button onClick={() => { setErr(null); setGateScope(null); setNeedsScope(true); }} style={{ marginLeft: 8, background: "transparent", border: `1px solid ${C.border}`, color: C.brand, borderRadius: 5, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✎ change scope</button>
        <button onClick={() => setRetry((n) => n + 1)} style={{ marginLeft: 8, background: "transparent", border: `1px solid ${C.border}`, color: C.brand, borderRadius: 5, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>↻ retry</button>
        {clash && (
          <div style={{ marginTop: 8, color: C.fg }}>
            pane #{clash[1]} still owns that scope — it is an agent whose box was left behind.
            <button onClick={() => setClosingOther(Number(clash[1]))} style={{ marginLeft: 8, background: "transparent", border: `1px solid ${C.ok}`, color: C.ok, borderRadius: 5, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>close pane #{clash[1]} (merge / discard)</button>
          </div>
        )}
        {closingOther != null && <AgentCloseDialog kind={kind} paneId={closingOther} chatSessionId={chatSessionId} onDone={() => { setClosingOther(null); setErr(null); setRetry((n) => n + 1); }} onCancel={() => setClosingOther(null)} />}
      </div>
    );
  }
  if (!pane && needsScope && !gateScope) return <ScopeGate kind={kind} onStart={(scope) => { setNeedsScope(false); setGateScope(scope); }} />;
  if (!pane) {
    const steps = progOf(key).steps;
    return (
      <div style={{ padding: "12px 16px", fontFamily: mono, fontSize: 10, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim, marginBottom: 3 }}>provisioning {paneDisplay(kind).name}'s box</div>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, color: s.done ? C.dim : C.fg, animation: "lokiZoneFade .2s ease" }}>
            {s.done
              ? <span style={{ color: C.ok, width: 12, textAlign: "center", flexShrink: 0 }}>✓</span>
              : <span style={{ width: 12, textAlign: "center", flexShrink: 0, display: "inline-block", animation: "lokiPaneSpin 1s linear infinite", color: C.brand }}>◠</span>}
            <span style={{ lineHeight: 1.5 }}>{s.t}</span>
          </div>
        ))}
        {!steps.length && <div style={{ color: C.muted }}>starting…</div>}
      </div>
    );
  }
  if (!pane.worktree_path) return (
    <div style={{ padding: 14, fontFamily: mono, fontSize: 10.5, color: C.warn, lineHeight: 1.6 }}>
      ⚠ the pane exists but its worktree is pending — `git worktree add` did not complete for this workspace.
      <button onClick={() => { ensureInflight.delete(key); setPane(null); setRetry((n) => n + 1); }} style={{ marginLeft: 8, background: "transparent", border: `1px solid ${C.border}`, color: C.brand, borderRadius: 5, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>↻ provision again</button>
    </div>
  );
  const chip: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, borderRadius: 5, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 9 };
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}
      onDragEnter={(e) => { if (hasBlockDrag(e)) { e.preventDefault(); dragDepth.current++; if (!dropZone) setDropZone("add"); } }}
      onDragOver={(e) => { if (hasBlockDrag(e)) e.preventDefault(); }}
      onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDropZone(null); }}
      onDrop={(e) => { if (hasBlockDrag(e)) void onBlockDrop(dropZone ?? "use", e); }}>
      {/* the BLOCK DROP overlay — the terminal unfocuses; two stacked zones: ⊕ Add · ➤ Use */}
      {dropZone && (
        <div style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", gap: 8, padding: 10, background: `color-mix(in oklab, ${C.bg} 55%, transparent)`, backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}>
          {(["add", "use"] as const).map((z) => (
            <div key={z}
              onDragOver={(e) => { e.preventDefault(); if (dropZone !== z) setDropZone(z); }}
              onDrop={(e) => { e.stopPropagation(); void onBlockDrop(z, e); }}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 10, border: `2px dashed ${dropZone === z ? C.brand : C.border}`, background: dropZone === z ? `color-mix(in oklab, ${C.brand} 12%, transparent)` : "transparent", transition: "all .12s ease" }}>
              <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: dropZone === z ? C.brand : C.dim }}>{z === "add" ? "⊕ Add" : "➤ Use"}</span>
              <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{z === "add" ? "standing context — a chip on this agent, until removed" : "one-shot — next answer only, nothing saved"}</span>
            </div>
          ))}
        </div>
      )}
      {/* THE STATUS ROW (operator 2026-09-19: "just the settings icon and some quick stats — tokens, context,
          cost, time — very discrete with simple icons"): ⚙ opens the wizard (every tool lives there); the
          rest is the engine's own numbers, each an icon + a value, the sentence as a tooltip. What's HOT
          (a plan to approve, a refused write, a live fan-out) shows as one small badge → its wizard tab. */}
      {!chatOnly && <div data-testid="pane-status-row" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 9, padding: "3px 8px", borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 9, color: C.dim, overflow: "hidden" }}>
        <button data-testid="pane-config" onClick={() => setWizard("overview")} title="the agent — overview · scope & guidance · context · subagents · audit · plans · checkpoints"
          style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "0 7px", cursor: "pointer", fontFamily: mono, fontSize: 11, lineHeight: "17px", flexShrink: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.brand; (e.currentTarget as HTMLElement).style.borderColor = C.brand; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.muted; (e.currentTarget as HTMLElement).style.borderColor = C.border; }}>⚙</button>
        {quickStats(usage, { metered: sentry.calls > 0 ? { cost: sentry.cost, calls: sentry.calls } : undefined }).map((st, i) => (
          <span key={i} data-testid="quick-stat" title={st.title} style={{ display: "inline-flex", alignItems: "baseline", gap: 3, color: st.tone === "bad" ? C.bad : st.tone === "warn" ? C.warn : C.muted, whiteSpace: "nowrap", cursor: "default" }}>
            <span style={{ color: st.tone ? undefined : C.dim, fontSize: 9 }}>{st.icon}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{st.value}</span>
          </span>
        ))}
        {!quickStats(usage).length && <span style={{ color: C.dim }} title={usageChipTitle(usage)}>⌁ —</span>}
        {/* HEIMDALL'S ROUTER + SUB-AGENTS moved to the pane's footer (operator 2026-09-21), beside ▶ preview;
            PTY panes (no chat footer) keep them here */}
        {pane && !chatMode && <PolicyToggles pane={pane} goalRuns={goalRuns} onSaved={(np) => setPane(np as Pane)} />}
        <span style={{ flex: 1 }} />
        {plans.some((p) => p.status === "pending") && <button onClick={() => setWizard("plans")} title="a saga is waiting for your accept / reject" style={{ ...chip, color: C.warn, borderColor: C.warn }}>📋 saga</button>}
        {(() => { const live = activeJobs(subJobs).length + activeRuns(goalRuns).reduce((s2, r) => s2 + r.tasks.filter((x) => x.status === "running" || x.status === "verifying").length, 0); const waiting = goalRuns.some((r) => r.status === "awaiting-approval" || r.status === "awaiting-answers"); return (waiting || (live && devOnly())) ? (
          <button onClick={() => setWizard("subagents")} title="subagents — goal runs and the quick fan-out" style={{ ...chip, color: live ? C.warn : C.brand, borderColor: live ? C.warn : C.brand }}>⋔ {live ? `${live}` : "approve"}</button>
        ) : null; })()}
        {sentry.violations.length > 0 && <button onClick={() => setWizard("audit")} title={`${sentry.violations.length} out-of-scope change(s):\n${sentry.violations.join("\n")}`} style={{ ...chip, color: C.bad, borderColor: C.bad }}>⛔ {sentry.violations.length}</button>}
        {blast && blast.n > 5 && <span title={`${blast.file} — ${blast.n} dependent file(s) per the atlas; changes ripple`} style={{ color: C.warn, cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => say(`Careful: ${blast.file} has ${blast.n} dependent files (atlas blast radius). Keep its public surface intact.`)}>◎ {blast.n}</span>}
      </div>}
      {/* ⏱ THE QUOTA BANNER — approaching the plan window (amber) or at the limit (red): hand the box to another engine */}
      {pane && quota.level !== "ok" && quotaDismissed !== quota.level && (() => { const targets = handoffTargets(String(pane.pane_kind ?? kind), engines); const tone = quota.level === "limit" ? C.bad : C.warn; return (
        <div data-testid="quota-banner" data-level={quota.level} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "4px 10px", background: `color-mix(in oklab, ${tone} 12%, ${C.bg})`, borderBottom: `1px solid ${tone}`, fontFamily: mono, fontSize: 9.5 }}>
          <span style={{ color: tone, fontWeight: 700 }}>{quota.level === "limit" ? "■ usage limit" : "⏱ near the limit"}</span>
          <span style={{ color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={quota.why}>{quota.why}{quota.level === "limit" ? " — hand the box to another engine; the conversation and touched files travel with it" : " — hand off now, or keep going"}</span>
          {/* WHEN THE NUMBER WAS TAKEN (operator 2026-09-24: "the weekly window is at 96% … but now is 99% and
              didnt update"). These windows move only when a CLI rewrites its status file, which happens when an
              agent speaks — between turns the figure is genuinely old, and showing it as current is the lie.
              Saying its age costs one span and makes a stale number honest instead of wrong. */}
          {(() => { const a = meterAge((usage as any)?.measured_at); return a ? <span data-testid="quota-age" title="these windows only move when an agent speaks — this is when the engine last wrote them" style={{ color: C.dim, whiteSpace: "nowrap", flexShrink: 0 }}>measured {a}</span> : null; })()}
          <span style={{ flex: 1 }} />
          {targets.map((t) => <button key={t} data-testid={`handoff-${t}`} disabled={!!handing} onClick={() => void handoffTo(t)} title={`export this chat to .antiloki/handoff/ and switch this pane to ${t} in place`} style={{ background: "transparent", border: `1px solid ${C.ok}`, color: C.ok, borderRadius: 5, padding: "1px 9px", cursor: "pointer", fontFamily: mono, fontSize: 9, whiteSpace: "nowrap", flexShrink: 0, opacity: handing && handing !== t ? 0.5 : 1 }}>{handing === t ? "handing off…" : `→ ${paneDisplay(t).name}`}</button>)}
          {!targets.length && <span style={{ color: C.dim }} title="no other CLI is installed on this machine">no other engine installed</span>}
          <button onClick={() => setQuotaDismissed(quota.level)} title="hide until the next level" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "1px 9px", cursor: "pointer", fontFamily: mono, fontSize: 9, whiteSpace: "nowrap", flexShrink: 0 }}>later</button>
        </div>
      ); })()}
      {/* ⛔ EXPAND SCOPE — the hook refused a write outside the whitelist; widen it in one click or wave it away */}
      {blocked && (() => { const opt = expandOptions(blocked.path); return (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "4px 10px", background: `color-mix(in oklab, ${C.warn} 12%, ${C.bg})`, borderBottom: `1px solid ${C.warn}`, fontFamily: mono, fontSize: 9.5 }}>
          <span style={{ color: C.warn, fontWeight: 700 }}>⛔ outside scope</span>
          <span style={{ color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${blocked.tool ?? "write"} on ${blocked.path} was refused — the agent was told to ask you`}>
            the agent tried to {String(blocked.tool ?? "edit").toLowerCase()} <b>{blocked.path}</b> — expand its scope or say no
          </span>
          <span style={{ flex: 1 }} />
          <button disabled={expanding} onClick={() => void expandScope(opt.file)} title={`allow writes to ${opt.file}`} style={{ background: "transparent", border: `1px solid ${C.ok}`, color: C.ok, borderRadius: 5, padding: "1px 9px", cursor: "pointer", fontFamily: mono, fontSize: 9, whiteSpace: "nowrap", flexShrink: 0 }}>+ this file</button>
          {opt.folder && <button disabled={expanding} onClick={() => void expandScope(opt.folder!)} title={`allow writes under ${opt.folder}`} style={{ background: "transparent", border: `1px solid ${C.ok}`, color: C.ok, borderRadius: 5, padding: "1px 9px", cursor: "pointer", fontFamily: mono, fontSize: 9, whiteSpace: "nowrap", flexShrink: 0 }}>+ its folder</button>}
          <button onClick={() => void dismissBlock()} title="keep the scope as is; the agent is told" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "1px 9px", cursor: "pointer", fontFamily: mono, fontSize: 9, whiteSpace: "nowrap", flexShrink: 0 }}>keep scope</button>
        </div>
      ); })()}
      {/* ⛔ the sentry banner — what went out of scope + the optional undo (reverts ONLY those files) */}
      {sentry.violations.length > 0 && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "4px 10px", background: `color-mix(in oklab, ${C.bad} 12%, ${C.bg})`, borderBottom: `1px solid ${C.bad}`, fontFamily: mono, fontSize: 9.5 }}>
          <span style={{ color: C.bad, fontWeight: 700 }}>⛔ scope sentry</span>
          <span style={{ color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={sentry.violations.join("\n")}>
            {sentry.violations.length} out-of-scope change{sentry.violations.length === 1 ? "" : "s"}: {sentry.violations.slice(0, 3).join(", ")}{sentry.violations.length > 3 ? "…" : ""}
          </span>
          <span style={{ flex: 1 }} />
          <button onClick={() => void undoViolations()} disabled={undoing} title={`revert ONLY these files (in-scope work untouched):\n${sentry.violations.join("\n")}`}
            style={{ background: "transparent", border: `1px solid ${C.bad}`, color: C.bad, borderRadius: 5, padding: "1px 9px", cursor: "pointer", fontFamily: mono, fontSize: 9 }}>{undoing ? "undoing…" : "↩ undo out-of-scope"}</button>
        </div>
      )}
      {/* THE ORCHESTRATION STRIP — the agent's delegated run, animated, one line (goal-strip.tsx) */}
      {!chatOnly && goalRuns.length > 0 && <GoalStrip runs={goalRuns} onOpen={() => setSubWin(true)} />}
      {/* dropped-block chips: ⊕ standing context (persisted, ✕ retires) · ➤ one-shots (fade on their own) */}
      {(ctxChips.length > 0 || oneShots.length > 0) && (
        <div style={{ flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", padding: "3px 10px", borderBottom: `1px solid ${C.border}` }}>
          {ctxChips.map((c) => (
            <span key={c.uid} title={`standing context from ${c.source} — .agents/context/${c.uid}.md (✕ retires it)`}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, border: `1px solid ${C.ok}`, borderRadius: 10, padding: "0 4px 0 7px", fontFamily: mono, fontSize: 8.5, background: `color-mix(in oklab, ${C.ok} 10%, ${C.bg})` }}>
              <span style={{ color: C.ok }}>⊕</span><span style={{ color: C.fg, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
              <button onClick={() => void removeChip(c.uid)} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 9, padding: 0 }}>✕</button>
            </span>
          ))}
          {oneShots.map((o, i) => (
            <span key={i} title="one-shot — used for the next answer only" style={{ display: "inline-flex", alignItems: "center", gap: 4, border: `1px dashed ${C.brand}`, borderRadius: 10, padding: "0 7px", fontFamily: mono, fontSize: 8.5, color: C.brand, opacity: 0.85 }}>➤ {o.label}</span>
          ))}
        </div>
      )}
      {/* HAND-OFF AS A VERB ON AGENT PANES (operator's queue: "move this session to Codex/OpenCode carrying the
          conversation"). The serve has done this for chats since September and `episode` was generalised to agents on
          2026-09-24; `switch` is generalised now, so the same ✦ chip appears on an agent's composer and the same
          endpoint carries the conversation across. A chat brings its own switch from the chats tab; this is for
          everything else. */
      }
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row", position: "relative" }}>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {/* THE CHAT IS THE AGENT (operator 2026-09-23: "heimdall menu on the chat should be the complete heimdall
              menu that was on the agents threads" — and "the settings for the agents on the chat too"). The menu was
              trimmed on 2026-09-22 on the reasoning that a chat only reads; that reasoning died with threads, because
              this conversation IS the agent now and dispatches its own work. So the chat mount passes the whole set:
              sub-agents, QA, preview, the dial and the scope hook. The two mounts differ only in `chat`, which is the
              chrome antiChat adds — episodes and the provider switch — never the powers. */}
          {chatMode
            ? isChat
              ? <AgentChatPane p={pane} chat readonly={paneReadonly} routes={goalRuns} onRoutesChanged={() => void refreshSubs()} episodes={chatEpisodes} chatSwitch={chatSwitch ?? handOff} heimdallOn={heimdallMode !== "off"} heimdallMode={heimdallMode} onHeimdallMode={(m) => void setHeimdall(m)} pairLabel={paneMerge} onToggleHeimdall={() => void flipPolicy("router", !heimdallOn)} heimdallSaved={routerSaved.runs ? routerSaved.saved : 0} subagentsOn={subagentsOn} onToggleSubagents={() => void flipPolicy("delegate", !subagentsOn)} maxOn={maxOn} minOn={minOn} onDial={(m) => void setDial(m)} dial={dial} onDialChange={(d) => void setBars(d as any)} qaOn={qaOn} onToggleQa={readOnly ? undefined : () => void toggleQa()} rolesOn={rolesOn} roles={roleList} currentRole={currentRole} roleWhy={roleWhy} onPickRole={readOnly ? undefined : pickRole} onToggleRoles={readOnly ? undefined : () => void toggleRoles()} gates={gates} onGate={readOnly ? undefined : (g) => void flipGate(g)} mainAgent={readOnly} previewOn={previewOn} onTogglePreview={() => void togglePreview()} onSide={askSide} onAddToScope={addToScope} busyHint={heimdallBusy ? `⚡ routing “${heimdallBusy.slice(0, 60)}”…` : null} onSubmit={heimdallOn ? (line, full, force) => { if (!force && !worthRouting(line)) return false; void askHeimdall(full ?? line); return true; } : undefined} />
              : <AgentChatPane p={pane} chatSwitch={handOff} routes={goalRuns} heimdallOn={heimdallMode !== "off"} heimdallMode={heimdallMode} onHeimdallMode={(m) => void setHeimdall(m)} pairLabel={paneMerge} onToggleHeimdall={() => void flipPolicy("router", !heimdallOn)} heimdallSaved={routerSaved.runs ? routerSaved.saved : 0} subagentsOn={subagentsOn} onToggleSubagents={() => void flipPolicy("delegate", !subagentsOn)} maxOn={maxOn} minOn={minOn} onDial={(m) => void setDial(m)} dial={dial} onDialChange={(d) => void setBars(d as any)} qaOn={qaOn} onToggleQa={readOnly ? undefined : () => void toggleQa()} rolesOn={rolesOn} roles={roleList} currentRole={currentRole} roleWhy={roleWhy} onPickRole={readOnly ? undefined : pickRole} onToggleRoles={readOnly ? undefined : () => void toggleRoles()} gates={gates} onGate={readOnly ? undefined : (g) => void flipGate(g)} mainAgent={readOnly} previewOn={previewOn} onTogglePreview={() => void togglePreview()} onSide={askSide} onAddToScope={addToScope} busyHint={heimdallBusy ? `⚡ routing “${heimdallBusy.slice(0, 60)}”…` : null} onSubmit={heimdallOn ? (line, full, force) => { if (heimdallBusy) return false; if (!force && !worthRouting(line)) return false; void askHeimdall(full ?? line); return true; } : undefined} />
            : <OpencodePane p={pane} auto intercept={heimdallOn ? (line) => { if (heimdallBusy) return false; void askHeimdall(line); return true; } : undefined} />}
        </div>
        {/* THE RAIL (operator 2026-09-20: "heimdall, planning, screening … in a sidebar right inside the terminal,
            with small discrete icons"): what Heimdall is doing with this pane's asks, and where it needs you */}
        {rail && pane && (
          <div data-testid="pane-side" style={{ position: "absolute", top: 0, bottom: 0, right: 30, width: "min(420px, 60%)", zIndex: 6, display: "flex", flexDirection: "column", borderLeft: `1px solid ${C.border}`, background: `color-mix(in oklab, ${C.bg} 96%, transparent)`, backdropFilter: "blur(2px)", boxShadow: "-8px 0 24px rgba(0,0,0,.35)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, fontWeight: 700 }}>{rail === "heimdall" ? "⚡ heimdall" : rail === "screen" ? "? screening" : rail === "plan" ? "⋔ plans" : rail === "qa" ? "✓ QA" : rail === "side" ? "⁇ side questions" : rail === "diff" ? "± this pane's diff" : rail === "commits" ? "⎇ this pane's commits" : rail === "queue" ? "☰ queue" : "⏱ usage"}</span>
              <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{rail === "heimdall" ? "the routing log · what it saved vs raw Claude" : rail === "screen" ? "what heimdall asks before planning" : rail === "plan" ? "the current plan · earlier plans" : rail === "qa" ? "an isolated judge over every finished plan" : rail === "side" ? "a little agent beside the conversation — the agent's turn is not spent" : rail === "diff" ? "what it changed in its worktree, not yet committed" : rail === "commits" ? "what it has already committed on its branch" : usageChipTitle(usage).split("\n")[0]}</span>
              <span style={{ flex: 1 }} />
              <button onClick={() => setRail(null)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "0 7px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✕</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
              {rail === "heimdall" && <RouteView runs={goalRuns} engine={String(pane.pane_kind ?? kind)} busy={heimdallBusy} onOpenAsk={() => setWizard("subagents")} />}
              {rail === "screen" && <ScreenView runs={goalRuns} onRefresh={() => void refreshSubs()} />}
              {rail === "plan" && <PlanView runs={goalRuns} onRefresh={() => void refreshSubs()} />}
              {rail === "qa" && <QaView runs={goalRuns} on={qaOn} />}
              {rail === "queue" && <QueueView q={queueSnap} refresh={refreshQueue} />}
              {rail === "diff" && <PaneDiffView paneId={pane.id} />}
              {rail === "commits" && <PaneCommitsView paneId={pane.id} />}
              {rail === "side" && <SideQuestionsRail items={side.items} onAsk={(q) => side.ask("ask", lastCtx.current, q)} onRetry={side.retry} onDismiss={side.dismiss} />}
              {rail === "quota" && (
                <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{usageChipTitle(usage)}{quota.level !== "ok" ? `\n\n${quota.why}` : ""}</div>
              )}
            </div>
          </div>
        )}
        {pane && (() => {
          const latest = [...goalRuns].sort((a, b) => b.created - a.created)[0];
          const asking = latest?.status === "awaiting-answers" ? (latest.questions?.length ?? 0) : 0;
          const approving = latest?.status === "awaiting-approval";
          const live = activeRuns(goalRuns).length;
          const railBtn = (on: boolean, tone?: string): React.CSSProperties => ({ position: "relative", width: 24, height: 24, display: "grid", placeItems: "center", background: on ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${on ? C.brand : "transparent"}`, color: tone ?? (on ? C.brand : C.dim), borderRadius: 6, cursor: "pointer", fontFamily: mono, fontSize: 12 });
          const badge = (n: number | string, tone: string) => <span style={{ position: "absolute", top: -4, right: -4, minWidth: 12, height: 12, padding: "0 3px", borderRadius: 6, background: tone, color: C.bg, fontSize: 8, fontWeight: 700, lineHeight: "12px", textAlign: "center" }}>{n}</span>;
          return (
            <div data-testid="pane-rail" style={{ width: 30, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "6px 0", borderLeft: `1px solid ${C.border}`, background: C.bg }}>
              {/* THIS PANE'S OWN WORK (operator 2026-09-25: "on the sidebar right of the agent pane should have
                  the icon to see the diff done on that pane, and another to see the commits done on that pane.
                  Only on that pane"). Scoped to the worktree behind this agent — the repository-wide views
                  already exist elsewhere, and showing them here would answer a different question. */}
              <button data-testid="rail-diff" onClick={() => setRail(rail === "diff" ? null : "diff")} style={railBtn(rail === "diff")}
                title="the diff this agent has made in its own box — changed and not yet committed">±</button>
              <button data-testid="rail-commits" onClick={() => setRail(rail === "commits" ? null : "commits")} style={railBtn(rail === "commits")}
                title="the commits this agent has made on its own branch">⎇</button>
              <button data-testid="rail-heimdall" onClick={() => setRail(rail === "heimdall" ? null : "heimdall")} style={{ ...railBtn(rail === "heimdall", heimdallBusy ? C.brand : heimdallOn ? undefined : C.dim), animation: heimdallBusy ? "lokiRailBlink .9s ease-in-out infinite" : live ? "lokiRailBlink 2s ease-in-out infinite" : undefined }}
                title={heimdallOn ? `Heimdall — the router: ${latest?.route ? `last route: tier ${latest.route.tier}${latest.route.confidence ? ` · ${latest.route.confidence} confidence` : ""} · ${latest.route.delegate ? `${latest.tasks.length} sub-agents` : "one job"}` : "nothing routed yet"} · click to ask through it` : "Heimdall is off for this pane (⚙ › router)"}>
                ⚡{live ? badge(live, C.warn) : null}
              </button>
              <button data-testid="rail-screen" onClick={() => setRail(rail === "screen" ? null : "screen")} style={railBtn(rail === "screen", asking ? C.warn : undefined)} title={asking ? `${asking} question${asking === 1 ? "" : "s"} before planning — click to answer` : "screening: no open questions"}>?{asking ? badge(asking, C.warn) : null}</button>
              <button data-testid="rail-plan" onClick={() => setRail(rail === "plan" ? null : "plan")} style={railBtn(rail === "plan", approving ? C.brand : undefined)} title={approving ? `a plan of ${latest.tasks.length} tasks waits for your approval — click to review` : latest?.status === "running" ? `${latest.tasks.length} sub-agents running` : "plan: nothing waiting"}>⋔{approving ? badge("!", C.brand) : null}</button>
              <button data-testid="rail-queue" onClick={() => setRail(rail === "queue" ? null : "queue")} style={railBtn(rail === "queue", activeCount(queueSnap) ? C.brand : undefined)}
                title={activeCount(queueSnap) ? `${activeCount(queueSnap)} in this agent's queue — what is being done and what is next` : "this agent's queue: what was asked, done / doing / next"}>☰{activeCount(queueSnap) ? badge(activeCount(queueSnap), C.brand) : null}</button>
              <button data-testid="rail-side" onClick={() => setRail(rail === "side" ? null : "side")} style={railBtn(rail === "side", side.running ? C.warn : undefined)}
                title={side.running ? `${side.running} side question${side.running === 1 ? "" : "s"} running — asked beside the conversation, not in it` : "side questions: ✂ ⤢ ≡ ⁇ under any reply land here"}>⁇{side.running ? badge(side.running, C.warn) : null}</button>
              <button data-testid="rail-qa" data-qa={qaRun ?? (qaFailed ? "unmet" : qaJudging ? "judging" : "")} onClick={() => setRail(rail === "qa" ? null : "qa")}
                style={{ ...railBtn(rail === "qa", qaRun === "unmet" || qaFailed ? C.bad : qaRun === "judging" ? C.brand : qaJudging ? C.warn : qaRun === "met" ? C.ok : undefined), animation: qaRun === "judging" ? "lokiRailBlink .9s ease-in-out infinite" : undefined }}
                title={!qaOn && !qaRun ? "QA is off — the ✓ QA button in the header turns it on" : qaRun === "judging" ? "QA is judging the latest run — click for the live view" : qaRun === "unmet" ? "QA: the latest run is NOT MET — click for what failed and why" : qaRun === "met" ? "QA passed the latest run — click for the verdict, the film and the pictures" : qaJudging ? "the judge is reviewing a finished plan" : qaFailed ? "the last judged plan FAILED QA — click for the findings" : "QA: the verdicts, the live browser and the pictures of every run"}>✓{qaRun === "unmet" || qaFailed ? badge("!", C.bad) : null}</button>
              <span style={{ flex: 1 }} />
              
              <button data-testid="rail-quota" onClick={() => setRail(rail === "quota" ? null : "quota")} style={railBtn(rail === "quota", quota.level === "limit" ? C.bad : quota.level === "warn" ? C.warn : undefined)} title={quota.level === "ok" ? usageChipTitle(usage) : quota.why}>⏱</button>
            </div>
          );
        })()}
      </div>
      {/* THE CHIPS ROW — BELOW the terminal (operator 2026-09-19: "chips like standup, plan, test should be
          below the chat; commit, rewind also; tell other agent we can discard"): the quick asks, the
          checkpoint, the rewind, then the ghost suggestions from the pane's live state (2026-07-25). */}
      {!dropZone && !isChat && (
        <div data-testid="pane-chips" className="antiloki-chips" style={{ flexShrink: 0, display: "flex", gap: 4, flexWrap: "nowrap", alignItems: "center", padding: "3px 10px", borderTop: `1px solid ${C.border}`, overflowX: "auto", overflowY: "hidden", whiteSpace: "nowrap", scrollbarWidth: "none" }}>
          <button onClick={() => say("Give a 3-line standup: done / now / blocked.")} style={chip} title="ask for a standup">standup</button>
          <button onClick={() => say("Explain your current plan in 5 bullets before continuing.")} style={chip} title="ask for its plan">plan</button>
          <button onClick={() => say("Run the relevant tests now and report pass/fail counts.")} style={chip} title="ask it to run tests">tests</button>
          <button onClick={() => { void checkpoint("save", { label: "manual" }); say("(checkpoint saved by the operator)"); }} style={{ ...chip, color: C.ok }} title="⚑ commit a checkpoint in this worktree">⚑ commit</button>
          <button onClick={() => setWizard("checkpoints")} style={chip} title="checkpoints — rewind is branch-local, your main branch is never touched">⏪ rewind</button>
          {suggestions.length > 0 && <span style={{ width: 1, height: 12, background: C.border, margin: "0 3px" }} />}
          {suggestions.map((s, i) => (
            <button key={i} onClick={s.run} title="deterministic suggestion from this pane's live state — click to use"
              style={{ background: "transparent", border: `1px solid color-mix(in oklab, ${s.tone ?? C.brand} 45%, transparent)`, color: s.tone ?? C.dim, borderRadius: 10, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 8.5, opacity: 0.6, transition: "opacity .15s ease" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.6")}>{s.t}</button>
          ))}
        </div>
      )}
      {wizard && <AgentWizard tab={wizard} onTab={setWizard} onClose={() => setWizard(null)} pane={pane} kind={kind} chatSessionId={chatSessionId}
        packBake={packBake} usage={usage} reads={reads} blast={blast} sentry={sentry} plans={plans} opening={opening} onOpenPlan={(p) => void openPlan(p)}
        cps={cps} cpRedo={cpRedo} onCheckpoint={checkpoint} subKey={subKey} subJobs={subJobs} goalRuns={goalRuns} onRefreshSubs={() => void refreshSubs()} say={say}
        onSaved={(p, b) => { setPane(p); ensureInflight.set(key, Promise.resolve(p)); if (b) setPackBake(b); else void bakeContextPack(p.id).then((bk) => bk && setPackBake(bk)).catch(() => {}); setWizard(null); }} />}
      {planView && (
        <div onClick={() => setPlanView(null)} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(860px, 94vw)", maxHeight: "90vh", overflowY: "auto", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "6px 14px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>plan artefact · {chatSessionId ? "also saved as a pane of this chat" : "this chat has no session yet — shown here"}</span>
              <span style={{ flex: 1 }} />
              <button onClick={() => setPlanView(null)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✕</button>
            </div>
            <ArtifactWidget payload={{ item: planView }} ctx={{ chatSessionId } as any} />
          </div>
        </div>
      )}
    </div>
  );
}

// a minimal but valid Pane so the components get the fields they read (id, session, settings, worktree).
function synthPane(kind: string, sessionId: number, paneId: number, settings?: Record<string, unknown>): Pane {
  return {
    id: paneId, idx: 0, session_id: sessionId, subagent_name: kind, scope: [], grants: [],
    status: "idle", worktree_path: null, branch: null, tier: "mid", pane_kind: kind, settings_json: JSON.stringify(settings ?? {}),
    synthetic: true, // no cockpit_panes row behind it — tool panes must not pane/update it
  } as Pane;
}

// THE REAL PANES of the cockpit session (operator 2026-09-16: "fuel is showing but is not wired with
// the claude/codex/opencode panes"): the inline tool panes used to see only their own synthetic row, so
// the shell/run/scripts target lists, fuel and standup had no agent to point at. Polled every 10 s.
function useSessionPanes(sessionId: number | null | undefined): Pane[] {
  const [panes, setPanes] = React.useState<Pane[]>([]);
  React.useEffect(() => {
    if (sessionId == null) return;
    let stop = false;
    const tick = async () => {
      try {
        const got = unwrap(await apiPost(`/api/v1/cockpit/session/get`, { id: sessionId }, { timeoutMs: 15_000 }));
        if (!stop && Array.isArray(got?.panes)) setPanes(got.panes);
      } catch { /* the synthetic pane still renders */ }
    };
    void tick();
    const t = setInterval(tick, 10_000);
    return () => { stop = true; clearInterval(t); };
  }, [sessionId]);
  return panes;
}

const TAB_KINDS: Record<string, string> = { shell: "terminal", run: "terminal", script: "terminal", intent: "intent", shape: "intent", judgment: "intent" };
const TABS: Record<string, { key: string; label: string; glyph: string }[]> = {
  terminal: [{ key: "shell", label: "shell", glyph: "❯" }, { key: "run", label: "run preview", glyph: "▶" }, { key: "script", label: "scripts", glyph: "⚙" }],
  intent: [{ key: "intent", label: "brainstorm", glyph: "🧠" }, { key: "shape", label: "RFC drawer", glyph: "🧩" }, { key: "judgment", label: "judgment", glyph: "⚖" }],
};

/** ONE pane, several tools as tabs (operator 2026-09-16): terminal = shell · run · scripts; intent = intent · RFC · judgment. */
function TabbedPane({ group, initial, render }: { group: string; initial: string; render: (tab: string) => React.ReactNode }) {
  const [tab, setTab] = React.useState(initial);
  const tabs = TABS[group] ?? [];
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 4, padding: "4px 8px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {tabs.map((tb) => (
          <button key={tb.key} onClick={() => setTab(tb.key)} style={{ background: tab === tb.key ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${tab === tb.key ? C.brand : C.border}`, color: tab === tb.key ? C.brand : C.dim, borderRadius: 6, padding: "1px 9px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 }}>{tb.glyph} {tb.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{render(tab)}</div>
    </div>
  );
}

/** scripts tab: the registry's build / test / dev / install, run in a chosen agent's worktree. */
function ScriptsTab({ p, panes }: { p: Pane; panes: Pane[] }) {
  const [script, setScript] = React.useState<string>("build");
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "4px 10px", fontFamily: mono, fontSize: 9.5, color: C.dim }}>
        script
        {["build", "test", "dev", "install"].map((k) => (
          <button key={k} onClick={() => setScript(k)} style={{ background: script === k ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${script === k ? C.brand : C.border}`, color: script === k ? C.brand : C.dim, borderRadius: 6, padding: "0 8px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 }}>{k}</button>
        ))}
        <span style={{ color: C.muted }}>— from the scripts registry (Code screen); picks an agent's worktree below</span>
      </div>
      <ScriptPane key={script} p={{ ...p, script_kind: script } as any} panes={panes} onChanged={() => {}} />
    </div>
  );
}

export function CockpitPaneBody({ kind, sessionId, paneId, chatSessionId, sessionBrief, attach, bbSessionId, initialScope, ask, initialPack, recipe, initialSettings, chatEpisodes, chatSwitch }: { recipe?: PaneRecipe; /** a chat's provider picker (chats-tab.tsx) — the ✦ chip in the composer */ chatSwitch?: ChatSwitch; chatEpisodes?: import("@/loki/cockpit/agent-chat-pane").EpisodeRef[]; /** a tool pane's settings from its widget payload (the linked preview: target_pane · autoboot) */ initialSettings?: Record<string, unknown>; kind: string; sessionId: number; paneId: number; chatSessionId?: number | null; sessionBrief?: string | null; attach?: { csId: number; paneId: number } | null; bbSessionId?: number | null; initialScope?: string[]; ask?: string; initialPack?: ContextPack }) {
  // tool panes persist via the blackboard → use the REAL cockpit session when provided (reads validate
  // the session row); the minted sessionId stays for the CLI ensure key + synth identity.
  const sessionIdForTools = bbSessionId ?? sessionId;
  const p = synthPane(kind, sessionIdForTools, paneId, initialSettings);
  const real = useSessionPanes(CLI_KINDS.has(kind) ? null : sessionIdForTools);
  const panes = [p, ...real.filter((x) => x.id !== p.id)];
  const noop = () => { /* inline — no cockpit session to reload */ };
  const group = TAB_KINDS[kind] ?? (kind === "terminal" ? "terminal" : null);
  if (group) {
    const initial = TAB_KINDS[kind] ? kind : TABS[group][0].key;
    return (
      <TabbedPane group={group} initial={initial} render={(tab) => {
        switch (tab) {
          case "shell": return <ShellPane p={p} panes={panes} />;
          case "run": return <RunPane p={p} panes={panes} onChanged={noop} />;
          case "script": return <ScriptsTab p={p} panes={panes} />;
          case "intent": return <BrainstormPane p={p} panes={panes} sessionId={sessionIdForTools} onChanged={noop} />;
          case "shape": return <ShapeTreePane p={p} panes={panes} sessionId={sessionIdForTools} onChanged={noop}
            onRfc={(title, body_md) => { void saveTurnWidget({ session_id: chatSessionId ?? undefined, type: "artifact", kind: "artifact", payload: { item: { title, body_md } } }); }} />;
          case "judgment": return <JudgmentPane p={p} panes={panes} sessionId={sessionIdForTools} />;
          default: return null;
        }
      }} />
    );
  }
  switch (kind) {
    // the CLI agents — provisioned FOR REAL (cockpit session + pane row + scoped worktree + the chat
    // session's context), then a real PTY exactly like the cockpit terminal.
    // EVERY ENGINE SEAT, not four of them (operator 2026-09-30: "“cursor” runs in the cockpit — it needs a worktree/agent session, so open it there. The agent just disappeared on Main"): a Cursor,
    // Gemini or Grok agent restored after a restart fell through to the placeholder below and vanished from its own thread.
    case "opencode": case "opencode-direct": case "claude-code": case "codex": case "gemini": case "grok": case "cursor":
      return <EnsuredCliPane kind={kind} sessionId={sessionId} paneId={paneId} chatSessionId={chatSessionId} sessionBrief={sessionBrief} attach={attach} initialScope={initialScope} ask={ask} initialPack={initialPack} recipe={recipe} chatEpisodes={chatEpisodes} chatSwitch={chatSwitch} />;
    case "design": return <DesignPane p={p} panes={panes} sessionId={sessionIdForTools} />;
    case "fuel": return <FuelPane p={p} panes={panes} sessionId={sessionIdForTools} />;
    case "context": return <ContextPane sessionId={sessionIdForTools} mission="" onChanged={noop} />;
    case "standup": return <StandupPane p={p} panes={panes} />;
    case "diff": case "review": return <ReviewPane panes={panes} onChanged={noop} />;
    case "state": return <StatePane sessionId={sessionIdForTools} panes={panes} />;
    case "gate": return <GatePane p={p} panes={panes} />;
    case "timeline": return <SessionTimelinePane sessionId={sessionIdForTools} p={p} />;
    default: return <div style={{ padding: 14, fontFamily: mono, fontSize: 10.5, color: C.muted, lineHeight: 1.6 }}>“{kind}” runs in the cockpit — it needs a worktree/agent session, so open it there.</div>;
  }
}
