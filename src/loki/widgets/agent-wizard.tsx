// THE AGENT WIZARD (operator 2026-09-19: "the top of the agent's terminal became a mess of icons — a
// single config icon should have a window wizard with all info and tools"). One ⚙ opens this: a rail
// of tabs on the left, the tool on the right — overview · scope & guidance · context · subagents ·
// audit · plans · checkpoints. The windows that used to be their own modals render here embedded.
// CONTEXT merges the old "prompts" and "answers" windows into one conversation ("merge prompts and
// answers into one window (Context)"): what antiloki delivered to the CLI, then every prompt and
// every answer, interleaved by time.
import React from "react";
import { createPortal } from "react-dom";
import { C, mono } from "@/loki/theme";
import { apiPost, unwrapResult as unwrap } from "@/loki/api/client";
import type { Pane } from "@/loki/api/types";
import { ENGINE_KEYS, type EngineKey } from "@/loki/api/engine";
import { useSeats, offered } from "@/loki/api/seats";
import { CopyButton } from "./view-widgets";
import { PaneEditModal, AuditWindow } from "./cockpit-pane-body";
import { GoalRunPanel } from "./goal-run-panel";
import { AgentNode } from "@/loki/codebase/constitution-agents";
import { paneDisplay } from "./types";
import { fmtTok as fmtTokPack } from "./scope-picker";
import { useMachine, readiness, modelsOf, machineLine, mergeOptions, mergeNote, sideOf } from "./engines";
import { useTourUnlock } from "@/loki/shell/mini-tour";
import { fetchAnswers, fetchUsage, packChipLabel, packChipTitle, parsePack, readsChipLabel, readsChipTitle, usageChipLabel, usageChipTitle, usageTone, type PackBake, type PackReads, type PackUsage, type PackPlan, type PackAnswer } from "./context-pack";
import type { SubagentJob, GoalRun } from "./subagents";
import { activeJobs, activeRuns } from "./subagents";
import { Check } from "@/loki/codebase/checkbox-tree";
import { devOnly } from "@/loki/dev-only";

export type WizardTab = "overview" | "role" | "scope" | "context" | "subagents" | "audit" | "plans" | "checkpoints";
export const WIZARD_TABS: { key: WizardTab; glyph: string; label: string; hint: string }[] = [
  { key: "overview", glyph: "◎", label: "overview", hint: "who this agent is — engine, box, scope, usage, cost" },
  { key: "role", glyph: "☺", label: "role", hint: "what this agent is made as — its name, its theme, its brief, the specialists and skills it knows (operator 2026-09-23: the config lives here, not in the chat)" },
  { key: "scope", glyph: "✎", label: "scope & guidance", hint: "the files it may write · the extra prompt · the context pack · the skills" },
  { key: "context", glyph: "▤", label: "context", hint: "what antiloki delivered to the CLI, then every prompt and every answer" },
  { key: "subagents", glyph: "⋔", label: "merge & subagents", hint: "the pair this agent runs as (brain × hands), the delegation policy, goal runs (plan → waves → verify → join)" },
  { key: "audit", glyph: "🔍", label: "audit", hint: "every read / write / refused write / shell command, cross-checked against git" },
  // A PLAN IS A SAGA (operator 2026-10-11): the word the user reads. The key stays `plans` so no test id or stored state moves.
  { key: "plans", glyph: "📋", label: "sagas", hint: "the sagas the agent wrote — accept or reject. Accepted ones live on the Sagas screen" },
  { key: "checkpoints", glyph: "⚑", label: "checkpoints", hint: "commits on this pane's branch — rewind is branch-local" },
];

/** The tabs the rail shows: "merge & subagents" only in the developer build, or while it is the open tab (a run that needs an answer or an approval opens it). Pure - tested. */
export function visibleWizardTabs(open: WizardTab, dev: boolean): typeof WIZARD_TABS {
  return WIZARD_TABS.filter((t) => t.key !== "subagents" || dev || open === "subagents");
}

/** the badge a tab shows in the rail — a number, a word, or nothing. Pure. */
export function tabBadge(tab: WizardTab, s: { plans: PackPlan[]; subJobs: SubagentJob[]; goalRuns: GoalRun[]; reads: PackReads | null; cps: { sha?: string }[] | null }): { text: string; tone: "warn" | "brand" | "dim" } | null {
  if (tab === "plans") { const pending = s.plans.filter((p) => p.status === "pending").length; return pending ? { text: `${pending} pending`, tone: "warn" } : s.plans.length ? { text: String(s.plans.length), tone: "dim" } : null; }
  if (tab === "subagents") {
    const live = activeJobs(s.subJobs).length + activeRuns(s.goalRuns).reduce((n, r) => n + r.tasks.filter((t) => t.status === "running" || t.status === "verifying").length, 0);
    if (live) return { text: `${live} running`, tone: "warn" };
    if (s.goalRuns.some((r) => r.status === "awaiting-answers")) return { text: "questions", tone: "warn" };
    if (s.goalRuns.some((r) => r.status === "awaiting-approval")) return { text: "plan to approve", tone: "brand" };
    return s.goalRuns.length + s.subJobs.length ? { text: String(s.goalRuns.length + s.subJobs.length), tone: "dim" } : null;
  }
  if (tab === "audit") { const r = s.reads; return r && r.total ? { text: `${r.total} reads`, tone: r.source > r.pack * 3 && r.total > 6 ? "warn" : "dim" } : null; }
  if (tab === "checkpoints") return s.cps && s.cps.length ? { text: String(s.cps.length), tone: "dim" } : null;
  return null;
}

export type AgentWizardProps = {
  tab: WizardTab; onTab: (t: WizardTab) => void; onClose: () => void;
  pane: Pane; kind: string; chatSessionId?: number | null;
  packBake: PackBake | null; usage: PackUsage | null; reads: PackReads | null; blast: { file: string; n: number } | null;
  sentry: { violations: string[]; changed: string[]; cost: number; calls: number };
  plans: PackPlan[]; opening: string | null; onOpenPlan: (p: PackPlan) => void;
  cps: { n?: number; rev?: string; sha?: string; short?: string; subject: string; when: string }[] | null; cpRedo?: boolean; onCheckpoint: (op: string, extra?: any) => Promise<any>;
  subKey: string; subJobs: SubagentJob[]; goalRuns: GoalRun[]; onRefreshSubs: () => void; say: (text: string) => void;
  onSaved: (p: any, bake?: PackBake | null) => void;
};

export function AgentWizard(p: AgentWizardProps) {
  const { tab, onTab, onClose, kind } = p;
  // THE FRESH ROW (2026-09-19): the pane the body holds may predate a settings save made elsewhere (the
  // API, another window) — the wizard re-reads its row on open so the policy and the availability it
  // shows are the ones in force
  const [fresh, setFresh] = React.useState<Pane | null>(null);
  React.useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const r = unwrap(await apiPost(`/api/v1/cockpit/session/get`, { id: (p.pane as any).session_id }, { timeoutMs: 15_000 }));
        const row = (r?.panes ?? []).find((x: any) => x?.id === p.pane.id);
        if (live && row) setFresh({ ...p.pane, ...row });
      } catch { /* the body's row will do */ }
    })();
    return () => { live = false; };
  }, [p.pane.id, (p.pane as any).session_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const pane = fresh ?? p.pane;
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  React.useEffect(() => { if (tab === "checkpoints" && p.cps === null) void p.onCheckpoint("list"); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const engine = kind === "opencode-direct" ? "opencode" : kind;
  const title = `#${(pane.idx ?? 0) + 1} ${pane.subagent_name ?? engine}`;
  // ON THE PAGE BODY, NOT INSIDE THE PANE (operator 2026-10-11: "the window is below the Studio sidebar and should be above on opening"). A `position: fixed` element belongs to the stacking context of the
  // nearest ancestor that makes one - the agent pane's own container - so no z-index could lift it over the sidebar, which sits outside it. A portal puts it at the root, where 320 is above everything it should cover.
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 320, background: "rgba(0,0,0,.6)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} data-testid="agent-wizard" style={{ width: "min(1120px, 96vw)", height: "min(90vh, 780px)", background: C.bg, border: `1px solid color-mix(in oklab, ${C.brand} 22%, ${C.border})`, borderRadius: 14, display: "flex", overflow: "hidden", boxShadow: "0 24px 70px -12px rgba(0,0,0,.7)" }}>
        {/* the rail */}
        <div style={{ width: 178, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: C.panel, display: "flex", flexDirection: "column", padding: "12px 8px", gap: 2 }}>
          <div style={{ padding: "2px 8px 10px", fontFamily: mono }}>
            <div style={{ fontSize: 12, color: C.fg, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={title}>⚙ {title}</div>
            <div style={{ fontSize: 9, color: C.dim }}>{engine} · {pane.status ?? "idle"}</div>
          </div>
          {/* MERGE & SUB-AGENTS ARE AUTOMATIC (operator 2026-10-11: "none of that is for the use of the user"): the tab is for the dev build, and for the one moment a run needs an answer or an
              approval (opened from the pane's chip, so `tab` is already it). The behaviour is unchanged; only the screen is hidden. */}
          {visibleWizardTabs(tab, devOnly()).map((t) => {
            const b = tabBadge(t.key, { plans: p.plans, subJobs: p.subJobs, goalRuns: p.goalRuns, reads: p.reads, cps: p.cps });
            const on = tab === t.key;
            return (
              <button key={t.key} data-testid={`wizard-tab-${t.key}`} onClick={() => onTab(t.key)} title={t.hint}
                style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left", background: on ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${on ? `color-mix(in oklab, ${C.brand} 45%, ${C.border})` : "transparent"}`, color: on ? C.brand : C.muted, borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontFamily: mono, fontSize: 10.5 }}>
                <span style={{ width: 14, textAlign: "center", color: on ? C.brand : C.dim }}>{t.glyph}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
                {b && <span style={{ fontSize: 8.5, color: b.tone === "warn" ? C.warn : b.tone === "brand" ? C.brand : C.dim, border: `1px solid ${b.tone === "warn" ? C.warn : b.tone === "brand" ? C.brand : C.border}`, borderRadius: 8, padding: "0 5px", whiteSpace: "nowrap" }}>{b.text}</span>}
              </button>
            );
          })}
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✕ esc</button>
        </div>
        {/* the tool */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {tab === "overview" && <Overview {...p} engine={engine} />}
          {tab === "role" && <RoleTab pane={pane} engine={engine} />}
          {tab === "scope" && <PaneEditModal key={pane.id} pane={pane} bake={p.packBake} embedded onClose={onClose} onSaved={(np, b) => { setFresh(np); p.onSaved(np, b); }} />}
          {tab === "context" && <ContextWindow paneId={pane.id} engine={engine} />}
          {tab === "subagents" && (
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
              {/* CONFIG, NOT A LAUNCHER (operator 2026-09-19: "sub-agents are spawned automatically by the parent agent,
                  not on a click — just config: on/off, how many, which AI and tier; skills; the specialists") */}
              <MergeConfig key={`m${(pane as any).settings_json?.length ?? 0}`} pane={pane} onSaved={(np) => { setFresh(np); p.onSaved(np); }} />
              <DelegationConfig key={`d${(pane as any).settings_json?.length ?? 0}`} pane={pane} engine={engine} onSaved={(np) => { setFresh(np); p.onSaved(np); }} />
              {(engine === "opencode" || engine === "opencode-direct") && <ShellPolicy key={`s${(pane as any).settings_json?.length ?? 0}`} pane={pane} onSaved={(np) => { setFresh(np); p.onSaved(np); }} />}
              <AvailableToAgent key={`a${(pane as any).settings_json?.length ?? 0}`} pane={pane} onSaved={(np) => { setFresh(np); p.onSaved(np); }} startOpen={p.goalRuns.length === 0} />
              {/* THE PLAN WATCHER — the agent's delegated runs, live: the route, the waves, the verdicts, the log */}
              <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontFamily: mono, fontSize: 11.5, color: C.fg, fontWeight: 700 }}>⋔ the plan watcher</span>
                <GoalRunPanel watchOnly parentKey={p.subKey} engine={engine} worktree={String(pane.worktree_path ?? "")} runs={p.goalRuns} onRefresh={p.onRefreshSubs} onSay={p.say} />
              </div>
            </div>
          )}
          {tab === "audit" && <AuditWindow embedded paneId={pane.id} engine={kind} onClose={onClose} />}
          {tab === "plans" && <PlansTab plans={p.plans} opening={p.opening} onOpen={p.onOpenPlan} runs={p.goalRuns} onWatch={() => onTab("subagents")} />}
          {tab === "checkpoints" && <CheckpointsTab cps={p.cps} cpRedo={p.cpRedo} onCheckpoint={p.onCheckpoint} say={p.say} />}
        </div>
      </div>
    </div>
    , document.body);
}

const lab: React.CSSProperties = { fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1 };
const val: React.CSSProperties = { fontFamily: mono, fontSize: 10.5, color: C.fg, lineHeight: 1.5, wordBreak: "break-word" };
function Fact({ k, v, tone }: { k: string; v: React.ReactNode; tone?: string }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}><span style={lab}>{k}</span><span style={{ ...val, color: tone ?? C.fg }}>{v}</span></div>;
}

function Overview(p: AgentWizardProps & { engine: string }) {
  const { pane } = p;
  const scope: string[] = Array.isArray(pane.scope) ? (pane.scope as any[]).map(String) : [];
  const injected = String((pane as any).extra_prompt_md ?? "").trim();
  const settings = React.useMemo(() => { try { return JSON.parse((pane as any).settings_json ?? "{}") ?? {}; } catch { return {}; } }, [pane]);
  const skills: string[] | null = Array.isArray(settings.skills) ? settings.skills.map(String) : null;
  const pk = parsePack((pane as any).settings_json);
  const uTone = usageTone(p.usage);
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px 18px" }}>
        <Fact k="engine" v={`${p.engine}${(pane as any).model_id ? ` · ${String((pane as any).model_id).split("/").pop()}` : pane.tier ? ` · tier ${pane.tier}` : ""}`} />
        <Fact k="status" v={pane.status ?? "idle"} tone={pane.status === "running" ? C.ok : undefined} />
        <Fact k="branch" v={pane.branch ?? "—"} />
        <Fact k="worktree" v={pane.worktree_path ? <span title={String(pane.worktree_path)}>{String(pane.worktree_path).split(/[\\/]/).slice(-2).join("/")}</span> : "pending"} />
        <Fact k="usage" v={usageChipLabel(p.usage) ?? "—"} tone={uTone === "bad" ? C.bad : uTone === "warn" ? C.warn : undefined} />
        <Fact k="metered spend" v={p.sentry.calls ? `$${p.sentry.cost.toFixed(4)} · ${p.sentry.calls} call${p.sentry.calls === 1 ? "" : "s"}` : "$0 · the subscription"} />
        <Fact k="context pack" v={<span title={packChipTitle(pk, p.packBake)}>{packChipLabel(pk, p.packBake)}</span>} tone={p.packBake?.ok && pk.preset !== "none" ? C.ok : undefined} />
        <Fact k="reads" v={<span title={readsChipTitle(p.reads)}>{readsChipLabel(p.reads) ?? "nothing yet"}</span>} />
        {p.blast && p.blast.n > 0 && <Fact k="blast radius" v={`${p.blast.file.split("/").pop()} → ${p.blast.n} dependent file${p.blast.n === 1 ? "" : "s"}`} tone={p.blast.n > 5 ? C.warn : undefined} />}
      </div>
      {p.usage && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{usageChipTitle(p.usage)}</div>}
      <div>
        <div style={lab}>scope — the files it may write ({scope.length || "none — unrestricted, gated at merge"})</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
          {scope.map((g) => <span key={g} style={{ fontFamily: mono, fontSize: 9.5, border: `1px solid ${C.ok}`, color: C.ok, borderRadius: 10, padding: "1px 8px" }}>{g.endsWith("/**") ? "📁 " : "📐 "}{g.replace(/\/\*\*$/, "")}</span>)}
          <button onClick={() => p.onTab("scope")} style={{ background: "transparent", border: `1px dashed ${C.border}`, color: C.brand, borderRadius: 10, padding: "1px 9px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 }}>✎ edit scope</button>
        </div>
      </div>
      <div>
        <div style={lab}>guidance — the extra prompt in its AGENTS.md brief</div>
        <div style={{ ...val, color: injected ? C.fg : C.dim, marginTop: 5, maxHeight: 140, overflowY: "auto", whiteSpace: "pre-wrap", fontStyle: injected ? undefined : "italic" }}>{injected || "none — ✎ scope & guidance to add"}</div>
      </div>
      <div>
        <div style={lab}>skills carried</div>
        <div style={{ ...val, color: C.muted, marginTop: 5 }}>{skills ? (skills.length ? skills.join(" · ") : "none") : "all enabled library skills"}</div>
      </div>
      {p.sentry.violations.length > 0 && (
        <div style={{ border: `1px solid ${C.bad}`, borderRadius: 8, padding: "6px 10px", fontFamily: mono, fontSize: 9.5, color: C.bad }}>⛔ scope sentry: {p.sentry.violations.length} out-of-scope change{p.sentry.violations.length === 1 ? "" : "s"} — {p.sentry.violations.slice(0, 4).join(", ")}</div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={() => void apiPost(`/api/v1/cockpit/git-graph`, { op: "open_worktree", pane_id: pane.id }, { timeoutMs: 15_000 })} style={btn}>📂 open the worktree folder</button>
        <button onClick={() => p.onTab("context")} style={btn}>▤ the context</button>
        <button onClick={() => p.onTab("audit")} style={btn}>🔍 the audit</button>
      </div>
    </div>
  );
}
const btn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: mono, fontSize: 10 };

// ── CONTEXT: the delivery + the conversation ─────────────────────────────────────────────────────
export type ContextTurn = { t: string; who: "you" | "agent" | "antiloki"; text: string; tokens: number };
/** prompts (the hook's log) and answers (the Stop hook / OpenCode db), one list by time. Pure. */
export function mergeTurns(prompts: { t?: string | null; prompt?: string; tokens?: number }[], answers: PackAnswer[]): ContextTurn[] {
  const ps: ContextTurn[] = prompts.map((p) => ({ t: String(p.t ?? ""), who: String(p.prompt ?? "").startsWith("[antiloki]") ? "antiloki" : "you", text: String(p.prompt ?? ""), tokens: Number(p.tokens || 0) || Math.ceil(String(p.prompt ?? "").length / 4) }));
  const as: ContextTurn[] = answers.map((a) => ({ t: String(a.t ?? ""), who: "agent", text: a.text, tokens: Math.ceil(a.text.length / 4) }));
  return [...ps, ...as].sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.who === "agent" ? 1 : -1));
}

export type ContextStat = { label: string; value: string; sub?: string; hint: string; tone?: "warn" | "bad" };
/** The context tab's numbers: the live window, the session's tokens, the cost, what the pack delivered, what the
 *  conversation weighs — an ESTIMATE where the engine reports none (chars/4). Pure — tested. */
export function contextStats(u: PackUsage | null | undefined, delivered: number, turns: { tokens: number; who: string }[]): ContextStat[] {
  const out: ContextStat[] = [];
  const pct = u?.context?.used_pct; const size = u?.context?.size;
  if (pct != null) out.push({ label: "context window", value: `${Math.round(Number(pct))}%`, sub: size ? `of ${fmtTokPack(Number(size))} tok` : undefined, hint: "how full the model's window is right now (from the engine's own usage)", tone: Number(pct) >= 90 ? "bad" : Number(pct) >= 70 ? "warn" : undefined });
  else if (u?.context?.input_tokens != null) out.push({ label: "context now", value: `${fmtTokPack(Number(u.context.input_tokens))} tok`, hint: "the last turn's input (the window's size is not known yet)" });
  const tok = u?.session?.tokens_total;
  if (tok != null) out.push({ label: "session", value: `${fmtTokPack(Number(tok))} tok`, sub: u?.session?.messages != null ? `${u.session.messages} message${u.session.messages === 1 ? "" : "s"}` : undefined, hint: "every token in and out since the session started" });
  if (u?.cost_usd != null) out.push({ label: "cost", value: `$${Number(u.cost_usd).toFixed(2)}`, sub: u.engine === "codex" ? "reasoning effort tiers" : "API-equivalent", hint: "the engine's own figure — on a subscription this is what the same tokens would cost at list price, not a bill" });
  if (delivered > 0) out.push({ label: "pack delivered", value: `≈${fmtTokPack(delivered)} tok`, hint: "what antiloki baked and handed to the CLI at boot (the brief, the reviews, the laws, the graph)" });
  const convo = turns.reduce((n, t) => n + (t.tokens || 0), 0);
  if (convo > 0) out.push({ label: "conversation", value: `≈${fmtTokPack(convo)} tok`, sub: `${turns.filter((t) => t.who === "you").length} asks · ${turns.filter((t) => t.who === "agent").length} answers`, hint: "the prompts and answers exchanged through this pane, estimated at 4 chars per token" });
  if (delivered > 0 && size) out.push({ label: "pack share", value: `${Math.round((delivered / Number(size)) * 100)}%`, hint: "how much of the model's window the pack takes on its own — the rest is the conversation and what the agent reads", tone: delivered / Number(size) > 0.5 ? "warn" : undefined });
  if (!out.length) out.push({ label: "context", value: "—", hint: "no usage yet — the numbers arrive with the first answer" });
  return out;
}
export function ContextWindow({ paneId, engine }: { paneId: number; engine: string }) {
  const [brief, setBrief] = React.useState<any | null>(null);
  const [answers, setAnswers] = React.useState<PackAnswer[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [show, setShow] = React.useState<"conversation" | "delivery">("conversation");
  React.useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const d = unwrap(await apiPost("/api/v1/cockpit/pane/brief", { pane_id: paneId }, { timeoutMs: 60_000 }));
        if (!live) return;
        if (d?.ok === false) setErr(d?.error ?? "brief failed"); else setBrief(d);
      } catch (e: any) { if (live) setErr(String(e?.message ?? "brief unreachable")); }
    })();
    void fetchAnswers(paneId, 60).then((a) => { if (live) setAnswers(a); });
    return () => { live = false; };
  }, [paneId]);
  const turns = React.useMemo(() => mergeTurns(brief?.prompts ?? [], answers ?? []), [brief, answers]);
  const total = (brief?.totals?.tokens ?? 0) as number;
  // THE STATS (operator 2026-09-21: "the context tab should also have some stats of context, cost, estimation"):
  // the session's live window (usage.json), what the pack delivered, what the conversation weighs, the cost
  const [usage, setUsage] = React.useState<PackUsage | null>(null);
  React.useEffect(() => { let live = true; void fetchUsage(paneId).then((u) => { if (live) setUsage(u); }); const t = setInterval(() => void fetchUsage(paneId).then((u) => { if (live) setUsage(u); }), 5000); return () => { live = false; clearInterval(t); }; }, [paneId]);
  const stats = contextStats(usage, total, turns);
  const seg = (k: "conversation" | "delivery", label: string) => (
    <button onClick={() => setShow(k)} style={{ background: show === k ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${show === k ? C.brand : C.border}`, color: show === k ? C.brand : C.muted, borderRadius: 6, padding: "2px 10px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>{label}</button>
  );
  return (
    <div data-testid="context-window" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <span style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 700 }}>▤ context</span>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{engine} · pane #{paneId}</span>
        <span style={{ flex: 1 }} />
        {seg("conversation", `conversation · ${turns.length}`)}
        {seg("delivery", `delivered to the CLI${total ? ` · ≈${fmtTokPack(total)} tok` : ""}`)}
        {turns.length > 0 && <CopyButton label="copy all" text={turns.map((t) => `── ${t.who} · ${t.t.slice(0, 19).replace("T", " ")} ──\n${t.text}`).join("\n\n")} />}
      </div>
      <div data-testid="context-stats" style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${C.border}` }}>
        {stats.map((s) => (
          <div key={s.label} title={s.hint} style={{ minWidth: 96, padding: "5px 9px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim }}>{s.label}</span>
            <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: s.tone === "bad" ? C.bad : s.tone === "warn" ? C.warn : C.fg }}>{s.value}</span>
            {s.sub && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{s.sub}</span>}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {err && <span style={{ fontFamily: mono, fontSize: 10, color: C.warn }}>{err}</span>}
        {show === "conversation" && (<>
          {brief === null && answers === null && !err && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>reading…</span>}
          {turns.length === 0 && (brief || answers) && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>nothing exchanged through this pane yet — the prompts you submit and the answers the CLI gives land here</span>}
          {turns.map((t, i) => (
            <div key={i} data-testid={`turn-${t.who}`} style={{ border: `1px solid ${t.who === "agent" ? C.border : `color-mix(in oklab, ${C.brand} 40%, ${C.border})`}`, borderRadius: 8, background: t.who === "agent" ? C.panel : `color-mix(in oklab, ${C.brand} 4%, ${C.bg})`, opacity: t.who === "antiloki" ? 0.75 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: mono, fontSize: 9, color: t.who === "agent" ? C.ok : t.who === "you" ? C.brand : C.dim, fontWeight: 700 }}>{t.who === "agent" ? `● ${engine}` : t.who === "you" ? "▸ you" : "▸ antiloki"}</span>
                <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{t.t.slice(0, 19).replace("T", " ")}</span>
                <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>≈{fmtTokPack(t.tokens)} tok</span>
                <span style={{ flex: 1 }} />
                <CopyButton text={t.text} />
              </div>
              <pre style={{ margin: 0, padding: "7px 10px", fontFamily: mono, fontSize: 10, lineHeight: 1.5, color: C.fg, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 320, overflowY: "auto" }}>{t.text}</pre>
            </div>
          ))}
        </>)}
        {show === "delivery" && (<>
          {!brief && !err && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>assembling the exact slice…</span>}
          {brief?.note && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, lineHeight: 1.5 }}>{brief.note}</div>}
          {(brief?.docs ?? []).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
              <span style={lab}>docs in the slice</span>
              {(brief.docs as any[]).map((d) => <span key={d.id} style={{ fontFamily: mono, fontSize: 9, padding: "1px 7px", borderRadius: 10, border: `1px solid ${d.excluded ? C.border : C.ok}`, color: d.excluded ? C.dim : C.ok, textDecoration: d.excluded ? "line-through" : "none" }} title={d.excluded ? "excluded for this pane" : `≈${fmtTokPack(d.tokens)} tok`}>{d.source ? "🔌 " : ""}{String(d.label ?? "#" + d.id).slice(0, 22)}</span>)}
            </div>
          )}
          {(brief?.sections ?? []).map((s: any) => (
            <div key={s.key} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel }}>
              <div onClick={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer" }}>
                <span style={{ fontFamily: mono, fontSize: 10, color: C.fg, fontWeight: 600 }}>{open[s.key] ? "▾" : "▸"} {s.label}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>≈{fmtTokPack(s.tokens)} tok</span>
              </div>
              {open[s.key] && <pre style={{ margin: 0, padding: "8px 10px", borderTop: `1px solid ${C.border}`, fontFamily: mono, fontSize: 9.5, lineHeight: 1.5, color: C.muted, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 360, overflowY: "auto" }}>{s.body}</pre>}
            </div>
          ))}
          {brief && <div style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>everything antiloki delivered to this CLI — launch flags · brief block · pack files · skills · tools · hooks. Tokens ≈ chars/4.</div>}
        </>)}
      </div>
    </div>
  );
}

// ── PLANS ────────────────────────────────────────────────────────────────────────────────────────
/** one line per delegated run — the history (operator 2026-09-19: "the plans tab is not showing the history of plans"). Pure. */
export function runHistoryLine(r: GoalRun): string {
  const passed = r.tasks.filter((t) => t.status === "done").length;
  const when = new Date(r.created).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const dur = r.ended ? ` · ${Math.round((r.ended - r.created) / 1000)}s` : "";
  const route = r.route ? ` · tier ${r.route.tier}${r.route.delegate ? "" : " · no delegation"}` : "";
  return `${when} · ${r.status}${route} · ${passed}/${r.tasks.length} passed${dur} · ${r.engine}${r.write ? " · write" : " · read-only"}${r.compare ? " · compared" : ""}`;
}
function PlansTab({ plans, opening, onOpen, runs, onWatch }: { plans: PackPlan[]; opening: string | null; onOpen: (p: PackPlan) => void; runs: GoalRun[]; onWatch: () => void }) {
  const [openRun, setOpenRun] = React.useState<number | null>(null);
  const statusTone = (st: string) => (st === "done" ? C.ok : st === "failed" || st === "cancelled" ? C.bad : st === "inline" ? C.muted : C.warn);
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 700 }}>📋 sagas</span>
      {/* THE HISTORY — every delegated run this pane made, newest first; click for its plan and report */}
      <span style={lab}>delegated runs · {runs.length}</span>
      {!runs.length && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>none yet — the agent plans and runs sub-agents itself (antiloki_delegate); every run lands here, and stays across restarts</span>}
      {runs.slice().reverse().map((r) => (
        <div key={r.id} data-testid={`run-history-${r.id}`} style={{ border: `1px solid ${openRun === r.id ? C.brand : C.border}`, borderRadius: 8, background: C.panel }}>
          <div onClick={() => setOpenRun(openRun === r.id ? null : r.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", cursor: "pointer" }}>
            <span style={{ fontFamily: mono, fontSize: 11, color: statusTone(r.status) }}>{r.status === "done" ? "✓" : r.status === "failed" || r.status === "cancelled" ? "✕" : r.status === "inline" ? "·" : "●"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>#{r.id} {r.goal}</div>
              <div style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{runHistoryLine(r)}</div>
            </div>
            {(r.status === "running" || r.status === "planning" || r.status === "awaiting-answers" || r.status === "awaiting-approval" || r.status === "joining") && <button onClick={(e) => { e.stopPropagation(); onWatch(); }} style={btn}>watch</button>}
          </div>
          {openRun === r.id && (
            <div style={{ borderTop: `1px solid ${C.border}`, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
              {r.route?.why && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}>router: {r.route.why}</div>}
              {r.tasks.map((t) => (
                <div key={t.id} style={{ fontFamily: mono, fontSize: 9.5, color: C.fg }}>
                  <span style={{ color: t.status === "done" ? C.ok : t.status === "failed" ? C.bad : C.dim }}>{t.status === "done" ? "✓" : t.status === "failed" ? "✕" : "·"}</span> <span style={{ color: C.brand }}>{t.id}</span> <span style={{ color: C.dim }}>[{t.tier ?? "mid"}]</span> {t.title}
                  <span style={{ color: C.dim }}> · owns {t.owns.join(", ") || "—"}{t.specialists?.length ? ` · ⚉ ${t.specialists.join(", ")}` : ""}</span>
                  {t.error && <div style={{ color: C.bad, marginLeft: 14 }}>✕ {t.error}</div>}
                </div>
              ))}
              {r.error && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.bad }}>✕ {r.error}</div>}
              {r.report && <pre style={{ margin: 0, fontFamily: mono, fontSize: 9.5, lineHeight: 1.5, color: C.muted, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220, overflowY: "auto" }}>{r.report}</pre>}
            </div>
          )}
        </div>
      ))}
      <span style={{ ...lab, marginTop: 6 }}>the agent's own plan files · {plans.length}</span>
      {!plans.length && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>none — the "plan" chip under the terminal asks for one; a plan file the agent writes lands here to accept or reject</span>}
      {plans.map((p) => (
        <div key={p.file} style={{ border: `1px solid ${p.status === "pending" ? C.warn : C.border}`, borderRadius: 8, padding: "7px 10px", display: "flex", alignItems: "center", gap: 10, background: C.panel }}>
          <span style={{ fontFamily: mono, fontSize: 11, color: p.status === "pending" ? C.warn : p.status === "accepted" ? C.ok : C.dim }}>{p.status === "pending" ? "⏳" : p.status === "accepted" ? "✓" : "✕"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
            <div style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{p.status}{p.t ? ` · ${String(p.t).slice(0, 16).replace("T", " ")}` : ""} · ≈{fmtTokPack(Math.ceil(p.chars / 4))} tok{p.reason ? ` · ${p.reason}` : ""}</div>
          </div>
          <button disabled={!!opening} onClick={() => onOpen(p)} style={btn}>{opening === p.file ? "opening…" : "open"}</button>
        </div>
      ))}
    </div>
  );
}

// ── CHECKPOINTS ──────────────────────────────────────────────────────────────────────────────────
export function CheckpointsTab({ cps, cpRedo, onCheckpoint, say }: { cps: { n?: number; rev?: string; sha?: string; short?: string; subject: string; when: string }[] | null; cpRedo?: boolean; onCheckpoint: (op: string, extra?: any) => Promise<any>; say: (t: string) => void }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [confirmN, setConfirmN] = React.useState<number | null>(null);
  const [redoReady, setRedoReady] = React.useState(!!cpRedo);
  React.useEffect(() => { setRedoReady(!!cpRedo); }, [cpRedo]);
  // SAVING A CHECKPOINT IS A COMMIT, NOT A MESSAGE (Grokbot QA round 2, bug 7: it "posts a fake user message and starts an AI turn, even with no changes"). The tab used to tell the agent
  // "(checkpoint saved by the operator)" through the chat, which the agent answered. It now says what happened on this page: saved, or nothing to save.
  const save = async () => {
    setBusy("save"); setNote(null);
    const before = cps?.[0]?.rev ?? cps?.[0]?.sha ?? null;
    const r: any = await onCheckpoint("save", { label: "manual" });
    const after: string | null = typeof r?.rev === "string" ? r.rev : typeof r?.sha === "string" ? r.sha : null;
    setNote(before && after && (after.startsWith(before) || before.startsWith(after)) ? `nothing to checkpoint: no changes since ${before}` : r?.ok === false ? `could not save a checkpoint${r?.error ? `: ${r.error}` : ""}` : "checkpoint saved");
    const listed: any = await onCheckpoint("list"); setRedoReady(!!listed?.redo); setBusy(null);
  };
  const rewind = async (c: { n?: number; rev?: string; sha?: string; subject: string }) => {
    const n = c.n ?? 0;
    if (confirmN !== n) { setConfirmN(n); return; }
    setConfirmN(null);
    const key = c.rev ?? c.sha ?? String(n);
    setBusy(key);
    await onCheckpoint("rewind", { n, rev: c.rev ?? c.sha });
    const listed: any = await onCheckpoint("list");
    setRedoReady(!!listed?.redo);
    setBusy(null);
  };
  const redo = async () => { setBusy("redo"); await onCheckpoint("redo"); setRedoReady(false); await onCheckpoint("list"); setBusy(null); };
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 700 }}>⚑ checkpoints</span>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>checkpoints on this pane's worktree — rewind does not move HEAD</span>
        <span style={{ flex: 1 }} />
        <button disabled={!!busy} onClick={() => void save()} style={{ ...btn, color: C.ok, borderColor: C.ok }}>{busy === "save" ? "saving…" : "⚑ save a checkpoint now"}</button>
        <button disabled={!!busy || !redoReady} title={redoReady ? "restore what rewind remembered" : "nothing to redo — rewind first"} onClick={() => void redo()} style={{ ...btn, color: C.warn }}>↪ redo</button>
        <button title="reload the list" onClick={() => void onCheckpoint("list").then((r: any) => setRedoReady(!!r?.redo))} style={btn}>↻</button>
      </div>
      {note && <span data-testid="checkpoint-note" role="status" style={{ fontFamily: mono, fontSize: 10, color: note.startsWith("could not") ? C.bad : C.muted }}>{note}</span>}
      {cps === null && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>reading the branch…</span>}
      {cps && cps.length === 0 && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>no checkpoints yet</span>}
      {(cps ?? []).map((c) => {
        const key = c.rev ?? c.sha ?? String(c.n ?? c.subject);
        const label = c.short ?? (c.sha ?? "").slice(0, 7);
        const n = c.n ?? 0;
        return (
        <div key={key} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", display: "flex", alignItems: "center", gap: 10, background: C.panel, flexWrap: "wrap" }}>
          <span style={{ fontFamily: mono, fontSize: 10, color: C.brand }}>{label || `#${n}`}</span>
          <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subject}</span>
          <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{c.when}</span>
          {confirmN === n ? (
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontFamily: mono, fontSize: 10, color: C.warn }}>Rewind to checkpoint {n}?</span>
              <button disabled={!!busy} onClick={() => void rewind(c)} style={{ ...btn, color: C.warn }}>yes</button>
              <button onClick={() => setConfirmN(null)} style={btn}>keep</button>
            </span>
          ) : (
            <button disabled={!!busy} onClick={() => void rewind(c)} style={{ ...btn, color: C.warn }}>{busy === key ? "rewinding…" : "⏪ rewind here"}</button>
          )}
        </div>
      );})}
    </div>
  );
}

// ── AVAILABLE TO THIS AGENT (operator 2026-09-19: "the settings at subagents can be better: all
// specialists and skills, so we can choose what is available to the agent") ─────────────────────
// The registry's specialists, by category — the agent reaches them through the live MCP tools
// antiloki_specialists / antiloki_specialist {specialist, path} (one isolated review on the
// subscription) — and the library skills materialised into its worktree. Absent list = everything.
type Specialist = { id: string; title: string; category: string; description: string; ready: boolean; readiness: string; axes?: string[] };
const CAT_ORDER = ["axis", "core", "specialist", "language", "framework", "book"];
const CAT_LABEL: Record<string, string> = { axis: "axis", core: "core", specialist: "specialist", language: "language", framework: "framework", book: "book faculty" };
/** the settings object after a choice: null = "all" is stored as the key's absence. Pure. */
export function withAvailability(settings: Record<string, any>, specialists: string[] | null, skills: string[] | null): Record<string, any> {
  const out = { ...settings };
  if (specialists) out.specialists = specialists; else delete out.specialists;
  if (skills) out.skills = skills; else delete out.skills;
  return out;
}
export function AvailableToAgent({ pane, onSaved, startOpen = true }: { pane: Pane; onSaved: (p: any) => void; startOpen?: boolean }) {
  const settings = React.useMemo(() => { try { return JSON.parse((pane as any).settings_json ?? "{}") ?? {}; } catch { return {}; } }, [pane]);
  const [reg, setReg] = React.useState<Specialist[] | null>(null);
  const [lib, setLib] = React.useState<{ slug: string; name: string; description: string; enabled: number }[]>([]);
  const [spec, setSpec] = React.useState<Set<string> | null>(Array.isArray(settings.specialists) ? new Set(settings.specialists.map(String)) : null);
  const [skills, setSkills] = React.useState<Set<string> | null>(Array.isArray(settings.skills) ? new Set(settings.skills.map(String)) : null);
  const [open, setOpen] = React.useState(startOpen); // collapsed when a run is on — the plan watcher leads
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    let live = true;
    void apiPost(`/api/v1/dispatch`, { action_name: "system.constitution.agents", input: {} }).then((r: any) => { const d = r?.result?.result ?? r?.result ?? r; if (live) setReg(Array.isArray(d?.agents) ? d.agents : []); }).catch(() => { if (live) setReg([]); });
    void (async () => { try { const r = unwrap(await apiPost(`/api/v1/skilllib/manage`, { op: "list" }, { timeoutMs: 15_000 })); if (live && Array.isArray(r?.skills)) setLib(r.skills); } catch { /* optional */ } })();
    return () => { live = false; };
  }, []);
  const ready = (reg ?? []).filter((a) => a.ready);
  const specOn = (id: string) => (spec ? spec.has(id) : true);
  const toggleSpec = (id: string) => setSpec((s2) => { const base = s2 ?? new Set(ready.map((a) => a.id)); const n = new Set(base); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setCat = (ids: string[], on: boolean) => setSpec((s2) => { const base = s2 ?? new Set(ready.map((a) => a.id)); const n = new Set(base); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; });
  const skillOn = (slug: string, enabled: number) => (skills ? skills.has(slug) : !!enabled);
  const toggleSkill = (slug: string) => setSkills((s2) => { const base = s2 ?? new Set(lib.filter((x) => x.enabled).map((x) => x.slug)); const n = new Set(base); if (n.has(slug)) n.delete(slug); else n.add(slug); return n; });
  const nSpec = spec ? [...spec].filter((id) => ready.some((a) => a.id === id)).length : ready.length;
  const nSkills = skills ? skills.size : lib.filter((x) => x.enabled).length;
  const dirty = JSON.stringify(withAvailability(settings, spec ? [...spec] : null, skills ? [...skills] : null)) !== JSON.stringify(settings);
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const next = withAvailability(settings, spec ? [...spec] : null, skills ? [...skills] : null);
      const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, settings: next }, { timeoutMs: 60_000 }));
      if (!r?.pane) throw new Error(r?.error ?? "update returned nothing");
      try { await apiPost(`/api/v1/skilllib/materialize`, { pane_id: pane.id, ...(skills ? { slugs: [...skills] } : {}) }, { timeoutMs: 30_000 }); } catch { /* best-effort */ }
      onSaved(r.pane);
      setMsg(`✓ saved — ${nSpec} specialist${nSpec === 1 ? "" : "s"} · ${nSkills} skill${nSkills === 1 ? "" : "s"} available; the agent sees them through antiloki_specialists and its skills folder`);
    } catch (e: any) { setMsg(`✗ ${String(e?.message ?? "save failed").slice(0, 120)}`); }
    setBusy(false);
  };
  const ql = q.trim().toLowerCase();
  const groups = CAT_ORDER.map((c) => ({ c, members: (reg ?? []).filter((a) => (a.category ?? "specialist") === c && (!ql || `${a.title} ${a.description}`.toLowerCase().includes(ql))) })).filter((g) => g.members.length);
  const chipBtn = (on: boolean): React.CSSProperties => ({ background: on ? `color-mix(in oklab, ${C.brand} 12%, transparent)` : "transparent", border: `1px solid ${on ? C.brand : C.border}`, color: on ? C.brand : C.muted, borderRadius: 6, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 });
  return (
    <div data-testid="available-to-agent" style={{ flexShrink: 0, borderBottom: `1px solid ${C.border}`, maxHeight: open ? "55%" : undefined, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontFamily: mono, fontSize: 11.5, color: C.fg, fontWeight: 700 }}>available to this agent</span>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}>{reg === null ? "reading the registry…" : `${nSpec}/${ready.length} specialists · ${nSkills}/${lib.length || "?"} skills`}</span>
        <span style={{ flex: 1 }} />
        {msg && <span style={{ fontFamily: mono, fontSize: 9, color: msg.startsWith("✗") ? C.bad : C.ok }}>{msg}</span>}
        {dirty && <button disabled={busy} onClick={(e) => { e.stopPropagation(); void save(); }} data-testid="availability-save" style={{ background: C.brand, border: "none", color: C.bg, borderRadius: 6, padding: "2px 12px", cursor: "pointer", fontFamily: mono, fontSize: 10, fontWeight: 700 }}>{busy ? "saving…" : "save"}</button>}
      </div>
      {open && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 14px 10px", display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={lab}>⚉ specialists — antiloki_specialist {"{specialist, path}"} gives a second opinion on the subscription</span>
              <span style={{ flex: 1 }} />
              <button onClick={() => setSpec(null)} style={chipBtn(spec === null)} title="every ready specialist">all</button>
              <button onClick={() => setSpec(new Set())} style={chipBtn(spec !== null && spec.size === 0)} title="none — the tool answers that nothing is available">none</button>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="find…" style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, color: C.fg, fontFamily: mono, fontSize: 9.5, padding: "1px 6px", width: 110 }} />
            </div>
            {reg === null && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>reading the registry…</span>}
            {groups.map((g) => { const ids = g.members.filter((a) => a.ready).map((a) => a.id); const allOn = ids.length > 0 && ids.every(specOn); return (
              <div key={g.c} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{CAT_LABEL[g.c] ?? g.c} · {g.members.length}</span>
                  {ids.length > 0 && <button onClick={() => setCat(ids, !allOn)} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 8.5, padding: 0 }}>{allOn ? "none" : "all"}</button>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1px 10px" }}>
                  {g.members.map((a) => (
                    <div key={a.id} data-testid={`spec-${a.id}`} onClick={() => { if (a.ready) toggleSpec(a.id); }} title={`${a.description}${a.ready ? "" : `\n(not ready: ${a.readiness})`}`}
                      style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 19, cursor: a.ready ? "pointer" : "not-allowed", borderRadius: 4, padding: "1px 3px", opacity: a.ready ? 1 : 0.5 }}>
                      <Check on={a.ready && specOn(a.id)} disabled={!a.ready} />
                      <AgentNode id={a.id} title={a.title} category={a.category} size={18} />
                      <span style={{ fontFamily: mono, fontSize: 10, color: a.ready && specOn(a.id) ? C.fg : C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            ); })}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={lab}>⚒ skills — the library craft in its worktree</span>
              <span style={{ flex: 1 }} />
              <button onClick={() => setSkills(null)} style={chipBtn(skills === null)} title="every enabled library skill">all enabled</button>
              <button onClick={() => setSkills(new Set())} style={chipBtn(skills !== null && skills.size === 0)}>none</button>
            </div>
            {!lib.length && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>no skill library yet — open Skills from the + menu</span>}
            {lib.map((sk) => (
              <div key={sk.slug} data-testid={`skill-${sk.slug}`} onClick={() => toggleSkill(sk.slug)} title={sk.description} style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 19, cursor: "pointer", borderRadius: 4, padding: "1px 3px" }}>
                <Check on={skillOn(sk.slug, sk.enabled)} />
                <span style={{ fontFamily: mono, fontSize: 10, color: skillOn(sk.slug, sk.enabled) ? C.fg : C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sk.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── DELEGATION — the policy, not a launcher ──────────────────────────────────────────────────────
// Saved on the pane's settings_json.delegate; the serve reads it when the agent calls antiloki_delegate
// (off = refused, max caps the tasks, engine/tier override the planner) and when it writes the brief.
export type Delegation = { enabled: boolean; max: number; engine: "routed" | EngineKey; tier: "auto" | "low" | "mid" | "high"; approve: "auto" | "ask" };
export const DELEGATION_DEFAULT: Delegation = { enabled: true, max: 4, engine: "routed", tier: "auto", approve: "auto" };
export function readDelegation(settings: Record<string, any>): Delegation {
  const d = settings?.delegate ?? {};
  const eng = d.engine === "routed" || (ENGINE_KEYS as readonly string[]).includes(d.engine) ? d.engine : "routed";
  const tier = ["auto", "low", "mid", "high"].includes(d.tier) ? d.tier : "auto";
  return { enabled: d.enabled !== false, max: Math.min(8, Math.max(1, Number(d.max) || 4)), engine: eng, tier, approve: d.approve === "ask" ? "ask" : "auto" };
}
// ── THE MERGE (operator 2026-09-22: "merge models into specialized coding agents … the agents merge inside Studio ›
// agents"). A pair is two engines making one agent: the BRAIN does the jobs that decide (plans, verifies, judges, writes
// the tests, explains), the HANDS do the jobs that produce (edits, looks up, reports). Saved as `settings.pair`; the
// serve resolves every job under it (cli::job_binding_paired). "solo" = no merge — the global jobs rule.
export type PairSide = { engine: EngineKey; model?: string };
export type Pair = { name: string; brain: PairSide; hands: PairSide };
export const PAIR_BUILTINS: { name: string; label: string; brain: PairSide; hands: PairSide; note: string }[] = [
  { name: "claude-deepseek", label: "Claude × DeepSeek", brain: { engine: "claude-code" }, hands: { engine: "opencode" }, note: "measured 2026-09-22: 8 modules 249 s · $0.25 · 37/37 against raw Opus 303 s · $1.28 · 37/37" },
  { name: "kimi-deepseek", label: "Kimi × DeepSeek", brain: { engine: "opencode", model: "opencode/kimi-k2.7-code" }, hands: { engine: "opencode", model: "opencode/deepseek-v4-flash" }, note: "measured 2026-09-23: Kimi plans, Flash writes — 8 modules 163 s · $0.04 · 37/37. Kimi as the HANDS failed every arm (the gateway 404s on its code model), so the merge puts it where it works." },
  { name: "claude-qwen", label: "Claude × Qwen", brain: { engine: "claude-code" }, hands: { engine: "opencode", model: "opencode/qwen3.6-plus" }, note: "being measured — Qwen 3.6 Plus does the hands jobs" },
  { name: "claude-glm", label: "Claude × GLM", brain: { engine: "claude-code" }, hands: { engine: "opencode", model: "opencode/glm-5.3" }, note: "being measured — GLM 5.3 does the hands jobs" },
  { name: "codex-deepseek", label: "Codex × DeepSeek", brain: { engine: "codex" }, hands: { engine: "opencode" }, note: "ready but unmeasured: this box's Codex account is on the ChatGPT Go plan and its allowance is spent until Oct 9th 2026 18:39 — bench/merges/jobs7-codex.sh runs every Codex arm the moment it reopens. Codex has no model per tier; the reasoning effort is the tier." },
  { name: "deepseek-deepseek", label: "DeepSeek × DeepSeek", brain: { engine: "opencode", model: "opencode/deepseek-v4-pro" }, hands: { engine: "opencode", model: "opencode/deepseek-v4-flash" }, note: "all-OpenCode: measured 37/37 at $0.30 a run, but its judge missed a bug Opus caught" },
];
// OPENCODE IS NOT DEEPSEEK (operator 2026-09-24: "it asked about what to use to planner and worker and didnt
// show many AIs was just claude and deepseek. We have already codex, kimi, qwen etc on our benchmarks"). Naming
// the engine after one of its models is what made the picker look like it held two. DeepSeek, Kimi, Qwen and GLM
// all arrive through OpenCode; which of them this machine has is the probe's answer, not a constant's.
export const ENGINE_NAMES: Record<string, string> = { "claude-code": "Claude", codex: "Codex", gemini: "Antigravity", grok: "Grok", cursor: "Cursor", opencode: "OpenCode — DeepSeek · Kimi · Qwen · GLM" };
/** the pane's pair — a built-in name, a full shape, or nothing (solo). Pure. */
export function readPair(settings: Record<string, any>): Pair | null {
  const p = settings?.pair;
  if (!p || p === "solo") return null;
  if (typeof p === "string") { const b = PAIR_BUILTINS.find((x) => x.name === p); return b ? { name: b.name, brain: b.brain, hands: b.hands } : null; }
  if (p.name === "solo") return null;
  const engines: readonly string[] = ENGINE_KEYS;   // all five seats and the gateway (a Cursor or Gemini side used to read as no pair at all)
  // A PAIR IS WRITTEN IN TWO SHAPES (2026-09-24), and this only ever read one of them. The serve writes it FLAT —
  // `{brain: "opencode", brain_model: "opencode/kimi-k2.7"}` — while the wizard writes it NESTED. Given a flat
  // pair this fell through to `PAIR_BUILTINS.find(name)`, so an agent whose pair is called "winner" matched
  // nothing and its settings page said solo, and one called "claude-deepseek" showed the BUILT-IN of that name
  // rather than the models it actually runs. The same fault `Pair::of_settings` had on the serve side.
  const side = (k: "brain" | "hands"): PairSide | null => {
    const v = p[k];
    if (typeof v === "string") return engines.includes(v) ? { engine: v as PairSide["engine"], model: p[`${k}_model`] || undefined } : null;
    return v && engines.includes(v.engine) ? { engine: v.engine, model: v.model || undefined } : null;
  };
  const [brain, hands] = [side("brain"), side("hands")];
  if (brain && hands) return { name: String(p.name || `${brain.engine}-${hands.engine}`), brain, hands };
  const b = PAIR_BUILTINS.find((x) => x.name === p.name); return b ? { name: b.name, brain: b.brain, hands: b.hands } : null;
}
/** "Claude × Kimi" — the side's family by its model, the engine's name otherwise. Pure. */
export function pairLabel(p: Pair | null): string {
  if (!p) return "solo";
  const side = (s: PairSide) => s.engine === "opencode" ? (s.model?.includes("kimi") ? "Kimi" : s.model?.includes("glm") ? "GLM" : s.model?.includes("qwen") ? "Qwen" : s.model?.includes("minimax") ? "MiniMax" : "DeepSeek") : ({ codex: "Codex", gemini: "Antigravity", grok: "Grok", cursor: "Cursor", "claude-code": "Claude" } as Record<string, string>)[s.engine] ?? (s.engine ? String(s.engine).charAt(0).toUpperCase() + String(s.engine).slice(1) : "—");
  return `${side(p.brain)} × ${side(p.hands)}`;
}
/** WHAT THIS AGENT WAS HIRED AS (operator 2026-09-24: "is also outdated, on agent creation it has skills
 *  specialists chosen, providers AI and etc. That is what it should show on the merge tab").
 *
 *  Everything below was decided when the agent was made and has been sitting in its settings unread: the role,
 *  the objective the merge was picked for, the two engines and their actual models, the skills materialised into
 *  its box and the specialist lenses it may consult. The tab offered a choice of pairs without ever saying what
 *  the agent already IS — which is why it read as outdated. It comes from this pane's own settings, so it cannot
 *  disagree with the agent. */
export function Hired({ settings, pair }: { settings: Record<string, any>; pair: Pair | null }) {
  const arr = (k: string): string[] => (Array.isArray(settings?.[k]) ? settings[k].filter((x: any) => typeof x === "string") : []);
  const recipe = settings?.recipe && typeof settings.recipe === "object" ? settings.recipe : {};
  const role = String(settings?.role || recipe.role || "");
  const objective = String(settings?.objective || recipe.objective || "");
  const [skills, specialists, scope] = [arr("skills"), arr("specialists"), arr("scope")];
  const side = (s: PairSide | undefined, what: string) => s && (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
      <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: .6, textTransform: "uppercase", color: C.dim }}>{what}</span>
      <b style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, fontWeight: 600 }}>{ENGINE_NAMES[s.engine] ?? s.engine}</b>
      <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}>{s.model ? s.model.split("/").pop() : "the job's measured model"}</span>
    </span>
  );
  const chips = (label: string, xs: string[], tone: string) => !!xs.length && (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: .6, textTransform: "uppercase", color: C.dim, minWidth: 66 }}>{label}</span>
      {xs.map((x) => <span key={x} style={{ fontFamily: mono, fontSize: 9.5, color: tone, border: `1px solid ${C.border}`, borderRadius: 5, padding: "0 6px" }}>{x}</span>)}
    </div>
  );
  const empty = !role && !objective && !pair && !skills.length && !specialists.length && !scope.length;
  if (empty) return null;
  return (
    <div data-testid="merge-hired" style={{ display: "flex", flexDirection: "column", gap: 5, padding: "8px 10px", margin: "0 0 10px", border: `1px solid ${C.border}`, borderRadius: 9, background: `color-mix(in oklab, ${C.panel} 50%, transparent)`, maxWidth: 620 }}>
      <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.muted }}>what this agent is, right now</span>
      {(role || objective) && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          {role && <span data-testid="hired-role" style={{ fontFamily: mono, fontSize: 10.5, color: C.brand }}>{role.replace(/[-_]+/g, " ")}</span>}
          {objective && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>merge chosen for <b style={{ color: C.muted }}>{objective}</b></span>}
        </div>
      )}
      {pair ? (
        <div data-testid="hired-pair" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>{side(pair.brain, "decides")}{side(pair.hands, "writes")}</div>
      ) : (
        <span data-testid="hired-pair" style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>solo — one model takes every job</span>
      )}
      {chips("skills", skills, C.muted)}
      {chips("lenses", specialists, C.brand)}
      {chips("may write", scope, C.muted)}
    </div>
  );
}

export function MergeConfig({ pane, onSaved }: { pane: Pane; onSaved: (p: any) => void }) {
  const settings = React.useMemo(() => { try { return JSON.parse((pane as any).settings_json ?? "{}") ?? {}; } catch { return {}; } }, [pane]);
  const cur = readPair(settings);
  // THE CUSTOM MERGE OPENS ON THE SEAT THE SERVE PLANS ON for both halves (review 2026-10-01: it opened on Claude × OpenCode - a switched-off seat and the Zen gateway)
  const seats = useSeats();
  const [customRaw, setCustom] = React.useState<Pair | null>(() => cur && !PAIR_BUILTINS.some((b) => b.name === cur.name) ? cur : null);
  // (nothing is offered until the seats are read: the editor opens empty rather than on a seat nobody checked)
  const dflt: PairSide = { engine: (seats?.defaultKey ?? offered(seats)[0] ?? "") as PairSide["engine"] };
  const custom: Pair = customRaw ?? { name: "custom", brain: dflt, hands: dflt };
  const [showCustom, setShowCustom] = React.useState(() => !!cur && !PAIR_BUILTINS.some((b) => b.name === cur.name));
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const save = async (pair: Pair | "solo") => {
    setBusy(true); setMsg(null);
    try {
      const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, settings: { ...settings, pair: pair === "solo" ? "solo" : pair } }, { timeoutMs: 60_000 }));
      if (!r?.pane) throw new Error(r?.error ?? "update returned nothing");
      onSaved(r.pane); setMsg(pair === "solo" ? "✓ solo — the global jobs rule" : `✓ ${pairLabel(pair)} — every job of this agent now resolves under it`);
    } catch (e: any) { setMsg(`✗ ${String(e?.message ?? "save failed").slice(0, 120)}`); }
    setBusy(false);
  };
  const machine = useMachine();
  const served = mergeOptions(machine);
  const [showLocked, setShowLocked] = React.useState(false);
  const lockedCount = served.filter((x) => !x.ready && cur?.name !== `${x.planner}|${x.worker}`).length;
  useTourUnlock("hire"); // the progressive tour: the first time the operator configures an agent's merge
  const chip = (on: boolean, locked = false): React.CSSProperties => ({ textAlign: "left", background: on ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${on ? C.brand : C.border}`, borderRadius: 9, padding: "7px 9px", cursor: locked ? "not-allowed" : busy ? "wait" : "pointer", color: on ? C.brand : locked ? C.dim : C.fg, maxWidth: 230, opacity: locked ? .55 : 1 });
  const sideSel = (k: "brain" | "hands") => (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {/* THE ENGINE, and only the ones this machine can run — an option that cannot start is not an option. */}
      <select data-testid={`merge-${k}-engine`} value={custom[k].engine}
        onChange={(e) => setCustom({ ...custom, [k]: { engine: e.target.value as PairSide["engine"], model: undefined } })}
        style={{ fontFamily: mono, fontSize: 10.5, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 4px" }}>
        {Object.entries(ENGINE_NAMES)
          .filter(([v]) => !machine.engines.length || machine.engines.some((e) => e.key === v && e.installed))
          .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {/* A DROPDOWN, NOT A TYPED STRING (operator 2026-09-25: "on cusom the name of the model is a string
          instead of a dropdown fix it"). The list is this machine's own — OpenCode's `opencode models`, the
          tier ladder for the subscription CLIs — so every option in it can actually be run here. Codex is the
          exception and says so: it has no model per tier, its reasoning effort IS the tier.
          A machine whose listing could not be read falls back to a text field rather than an empty menu: an
          engine antiloki cannot enumerate is not an engine with no models. */}
      {(() => {
        const models = modelsOf(machine.engines, custom[k].engine);
        const codex = custom[k].engine === "codex";
        const opts = codex ? ["low", "medium", "high"] : models;
        if (!opts.length) return (
          <input data-testid={`merge-${k}-model`} value={custom[k].model ?? ""} placeholder="model (blank = the job's measured one)"
            onChange={(e) => setCustom({ ...custom, [k]: { ...custom[k], model: e.target.value || undefined } })}
            style={{ fontFamily: mono, fontSize: 10.5, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 5px", width: 200 }} />
        );
        return (
          <select data-testid={`merge-${k}-model`} value={custom[k].model ?? ""}
            onChange={(e) => setCustom({ ...custom, [k]: { ...custom[k], model: e.target.value || undefined } })}
            style={{ fontFamily: mono, fontSize: 10.5, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 4px", maxWidth: 230 }}>
            <option value="">{codex ? "effort — the job's measured one" : "model — the job's measured one"}</option>
            {opts.map((m) => <option key={m} value={m}>{m.replace(/^opencode\//, "")}</option>)}
          </select>
        );
      })()}
    </span>
  );
  return (
    <div data-testid="merge-config" style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 11.5, color: C.fg, fontWeight: 700 }}>⚭ the merge</span>
        <span data-testid="merge-now" style={{ fontFamily: mono, fontSize: 10.5, color: cur ? C.brand : C.dim }}>{pairLabel(cur)}</span>
      </div>
      <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.45, margin: "3px 0 8px", maxWidth: 560 }}>
        Two models, one agent. The <b>brain</b> plans, verifies, judges, writes the tests and explains; the <b>hands</b> edit, look up and report. Heimdall gives every job to the right side — the pair below is what "one agent, two models" means for this agent.
      </div>
      <Hired settings={settings} pair={cur} />
      {/* WHAT IS ON THIS MACHINE, AND THE ARGUMENT FOR WHAT IS NOT (operator 2026-09-24: "suggest expansions
          with goos arguments, defending the merging as positive add for save lots of tokens and save money.
          That should be explicitly with examples"). Every number in `why` is a measured bench row with its
          date, from the serve — not a projection, and not an adjective. */}
      {!!machine.engines.length && (
        <div data-testid="merge-machine" style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, margin: "0 0 8px" }}>{machineLine(machine.engines)}</div>
      )}
      {machine.advice?.unlock?.length ? (
        <div data-testid="merge-unlock" style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: "8px 10px", margin: "0 0 10px", maxWidth: 560, background: `color-mix(in oklab, ${C.brand} 5%, transparent)` }}>
          <div style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{machine.advice.headline}</div>
          {machine.advice.unlock.map((u) => (
            <div key={u.engine} style={{ marginTop: 6 }}>
              <div style={{ fontFamily: mono, fontSize: 10, color: C.brand }}>+ {ENGINE_NAMES[u.engine] ?? u.engine} → unlocks {u.unlocks}</div>
              <div style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.45 }}>{u.why}</div>
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button data-testid="merge-solo" disabled={busy} onClick={() => void save("solo")} style={chip(!cur)}>
          <div style={{ fontFamily: mono, fontSize: 11 }}>{!cur ? "✓ " : ""}solo</div><div style={{ fontSize: 9.5, color: C.muted, marginTop: 2 }}>no merge — each job goes to the global winner, any provider</div>
        </button>
        {/* THE CATALOGUE IS A VIEW OVER THE RECORD (operator 2026-09-25: "you should be able to merge any model
            to any model"). These six were hardcoded and every one of them was a frontier model over a cheap
            one; the evidence table already held Chinese × Chinese and Claude × Claude, and will hold Claude ×
            Codex the moment one is run. PAIR_BUILTINS is now only the fallback for a serve too old to answer,
            so the picker is never empty. */}
        {/* THE LOCKED TILES ARE FOLDED (2026-10-10: "the Claude x ... pair tiles are still listed when Claude is off"): a pair that needs a seat this machine cannot use is hidden behind one count button instead of
            filling the picker; the pair the agent already has stays visible whatever its state */}
        {served.length
          ? (showLocked ? served : served.filter((x) => x.ready || cur?.name === `${x.planner}|${x.worker}`)).map((x) => { const name = `${x.planner}|${x.worker}`; const on = cur?.name === name; return (
              <button key={name} data-testid={`merge-${name}`} disabled={busy || !x.ready}
                onClick={() => void save({ name, brain: sideOf(x.planner), hands: sideOf(x.worker) })}
                style={chip(on, !x.ready)} title={mergeNote(x)}>
                <div style={{ fontFamily: mono, fontSize: 11 }}>{on ? "✓ " : x.ready ? "" : "🔒 "}{x.label}</div>
                <div style={{ fontSize: 9.5, color: x.ready ? C.muted : C.dim, marginTop: 2, lineHeight: 1.35 }}>{mergeNote(x)}</div>
              </button>
            ); })
          : PAIR_BUILTINS.map((b) => { const on = cur?.name === b.name; const r = readiness(b, machine.engines); return (
              <button key={b.name} data-testid={`merge-${b.name}`} disabled={busy || !r.ready} onClick={() => void save({ name: b.name, brain: b.brain, hands: b.hands })} style={chip(on, !r.ready)} title={r.ready ? b.note : r.why}>
                <div style={{ fontFamily: mono, fontSize: 11 }}>{on ? "✓ " : r.ready ? "" : "🔒 "}{b.label}</div>
                <div style={{ fontSize: 9.5, color: r.ready ? C.muted : C.dim, marginTop: 2, lineHeight: 1.35 }}>{r.ready ? b.note : r.why}</div>
              </button>
            ); })}
        {lockedCount > 0 && <button data-testid="merge-locked-toggle" onClick={() => setShowLocked((o) => !o)} style={chip(false, true)} title="pairs that need a seat that is switched off or not signed in on this machine">
          <div style={{ fontFamily: mono, fontSize: 11 }}>{showLocked ? "hide" : `${lockedCount} unavailable`}</div><div style={{ fontSize: 9.5, color: C.dim, marginTop: 2 }}>{showLocked ? "only the pairs you can use" : "need a seat that is off here"}</div>
        </button>}
        <button data-testid="merge-custom" disabled={busy} onClick={() => setShowCustom((o) => !o)} style={chip(showCustom)}>
          <div style={{ fontFamily: mono, fontSize: 11 }}>custom…</div><div style={{ fontSize: 9.5, color: C.muted, marginTop: 2 }}>pick the brain and the hands yourself</div>
        </button>
      </div>
      {showCustom && (
        <div data-testid="merge-custom-form" style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, fontFamily: mono, fontSize: 10.5, color: C.dim }}>
          <div>brain &nbsp;{sideSel("brain")}</div>
          <div>hands {sideSel("hands")}</div>
          <div><button data-testid="merge-custom-save" disabled={busy || !custom.brain.engine || !custom.hands.engine} onClick={() => void save({ ...custom, name: custom.name === "solo" ? "custom" : custom.name })} style={{ ...chip(false), padding: "4px 10px" }}>save {pairLabel(custom)}</button></div>
        </div>
      )}
      {msg && <div style={{ fontFamily: mono, fontSize: 10.5, marginTop: 8, color: msg.startsWith("✓") ? C.ok : C.bad }}>{msg}</div>}
    </div>
  );
}

/** THE SHELL POLICY of an OpenCode pane (operator 2026-09-20: the TUI asked "Allow once / always" for
 *  every command): ask per command, or allow in this box. Written to the pane's opencode.json by the
 *  bake — the next restart picks it up. Claude runs in auto mode and Codex in its sandbox already. */
export function ShellPolicy({ pane, onSaved }: { pane: Pane; onSaved: (p: any) => void }) {
  const settings = React.useMemo(() => { try { return JSON.parse((pane as any).settings_json ?? "{}") ?? {}; } catch { return {}; } }, [pane]);
  const cur: "ask" | "allow" = settings.shell === "allow" ? "allow" : "ask";
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const set = async (v: "ask" | "allow") => {
    if (v === cur) return;
    setBusy(true); setMsg(null);
    try {
      const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, settings: { ...settings, shell: v } }, { timeoutMs: 60_000 }));
      if (!r?.pane) throw new Error(r?.error ?? "update returned nothing");
      onSaved(r.pane); setMsg("✓ saved — the box takes it on the next restart");
    } catch (e: any) { setMsg(`✗ ${String(e?.message ?? "save failed").slice(0, 120)}`); }
    setBusy(false);
  };
  const seg = (v: "ask" | "allow", label: string, title: string) => (
    <button key={v} disabled={busy} onClick={() => void set(v)} title={title} data-testid={`shell-${v}`} style={{ background: cur === v ? `color-mix(in oklab, ${C.brand} 12%, transparent)` : "transparent", border: `1px solid ${cur === v ? C.brand : C.border}`, color: cur === v ? C.fg : C.muted, borderRadius: 6, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 }}>{label}</button>
  );
  return (
    <div data-testid="shell-policy" style={{ borderBottom: `1px solid ${C.border}`, padding: "10px 14px", display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, alignItems: "center" }}>
      <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }} title="OpenCode asks before every shell command unless the box allows it">shell commands</span>
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        {seg("ask", "ask each time", "OpenCode's own prompt — Allow once / Allow always — for every command")}
        {seg("allow", "allow in this box", "commands run without asking — the box is this agent's own worktree; writes outside its scope are still refused")}
        {msg && <span style={{ fontFamily: mono, fontSize: 9, color: msg.startsWith("✗") ? C.bad : C.ok }}>{msg}</span>}
      </div>
    </div>
  );
}

export function DelegationConfig({ pane, engine, onSaved }: { pane: Pane; engine: string; onSaved: (p: any) => void }) {
  const seats = useSeats();
  const settings = React.useMemo(() => { try { return JSON.parse((pane as any).settings_json ?? "{}") ?? {}; } catch { return {}; } }, [pane]);
  const [d, setD] = React.useState<Delegation>(() => readDelegation(settings));
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const dirty = JSON.stringify(d) !== JSON.stringify(readDelegation(settings));
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = unwrap(await apiPost(`/api/v1/cockpit/pane/update`, { pane_id: pane.id, settings: { ...settings, delegate: d } }, { timeoutMs: 60_000 }));
      if (!r?.pane) throw new Error(r?.error ?? "update returned nothing");
      onSaved(r.pane); setMsg("✓ saved — the agent's brief follows on its next restart");
    } catch (e: any) { setMsg(`✗ ${String(e?.message ?? "save failed").slice(0, 120)}`); }
    setBusy(false);
  };
  const seg = <T extends string | number | boolean>(cur: T, v: T, label: string, on: () => void, title?: string) => (
    <button key={String(v)} onClick={on} title={title} style={{ background: cur === v ? `color-mix(in oklab, ${C.brand} 12%, transparent)` : "transparent", border: `1px solid ${cur === v ? C.brand : C.border}`, color: cur === v ? C.brand : C.muted, borderRadius: 6, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 }}>{label}</button>
  );
  const row = (label: string, body: React.ReactNode, hint: string) => (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, alignItems: "center" }}>
      <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }} title={hint}>{label}</span>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", opacity: d.enabled || label === "delegation" ? 1 : 0.45 }}>{body}</div>
    </div>
  );
  return (
    <div data-testid="delegation-config" style={{ borderBottom: `1px solid ${C.border}`, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 11.5, color: C.fg, fontWeight: 700 }}>⋔ sub-agents</span>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}>the agent spawns them itself when the work splits — this is the policy it runs under</span>
        <span style={{ flex: 1 }} />
        {msg && <span style={{ fontFamily: mono, fontSize: 9, color: msg.startsWith("✗") ? C.bad : C.ok }}>{msg}</span>}
        {dirty && <button disabled={busy} onClick={() => void save()} data-testid="delegation-save" style={{ background: C.brand, border: "none", color: C.bg, borderRadius: 6, padding: "2px 12px", cursor: "pointer", fontFamily: mono, fontSize: 10, fontWeight: 700 }}>{busy ? "saving…" : "save"}</button>}
      </div>
      {row("delegation", <>
        {seg(d.enabled, true, "on", () => setD({ ...d, enabled: true }), "the agent may fan work out to sub-agents (antiloki_delegate)")}
        {seg(d.enabled, false, "off", () => setD({ ...d, enabled: false }), "no sub-agents — the agent does everything itself; the tool refuses")}
      </>, "whether this agent may delegate at all")}
      {row("at most", <>{[1, 2, 3, 4, 6, 8].map((k) => seg(d.max, k, String(k), () => setD({ ...d, max: k })))}<span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>sub-agents per run — the planner may use fewer</span></>, "the cap on parallel tasks the planner may create")}
      {row("their AI", <>
        {seg(d.engine, "routed", `same as the agent (${paneDisplay(engine).name})`, () => setD({ ...d, engine: "routed" }))}
        {offered(seats, d.engine).filter((k) => k !== engine).map((k) => seg(d.engine, k, `${paneDisplay(k).glyph} ${paneDisplay(k).name}`, () => setD({ ...d, engine: k })))}
      </>, "which subscription runs the sub-agents")}
      {row("their tier", <>
        {seg(d.tier, "auto", "the planner decides (per task)", () => setD({ ...d, tier: "auto" }), "the high-tier planner assigns each task its own tier")}
        {(["low", "mid", "high"] as const).map((t) => seg(d.tier, t, t, () => setD({ ...d, tier: t }), `every sub-agent pinned to ${t}`))}
      </>, "the model strength: claude sonnet / opus; codex low / default / high reasoning effort")}
      {row("the plan", <>
        {seg(d.approve, "auto", "runs at once", () => setD({ ...d, approve: "auto" }), "the agent orchestrates — the ratified plan runs without asking")}
        {seg(d.approve, "ask", "ask me first", () => setD({ ...d, approve: "ask" }), "THE HUMAN GATE — every plan waits for your approval in the pane (⋔) before a sub-agent starts; the agent is told to wait")}
      </>, "whether a human approves the plan before it runs — antiFlow's human gate, per pane")}
    </div>
  );
}

/** THE ROLE (operator 2026-09-23: "inside them I see on the chat their config — hide it under settings, at role"): the
 *  agent's configuration as one sheet — the recipe it was made from, its merge, its theme, its brief (the extra prompt
 *  the CLI boots with), the specialists and skills it knows. Read-only here; each part is edited where it lives. */
export function RoleTab({ pane, engine }: { pane: any; engine: string }) {
  const st = React.useMemo(() => { try { return JSON.parse(pane?.settings_json ?? "{}") ?? {}; } catch { return {}; } }, [pane?.settings_json]);
  const pair = st.pair && typeof st.pair === "object" ? st.pair : null;
  const side = (x: any) => (x && typeof x === "object" ? `${String(x.engine ?? "")}${x.model ? ` · ${String(x.model).replace("opencode/", "")}` : ""}` : "—");
  const rows: [string, React.ReactNode][] = [
    ["name", String(st.title || pane?.subagent_name || "—")],
    ["engine", engine],
    ["merge", pair ? `${String(pair.name ?? "pair")} — brain ${side(pair.brain)} · hands ${side(pair.hands)}` : "solo — one model does every job"],
    ["theme", String(st.theme || "the engine's own")],
    ["recipe", String(st.recipe || st.agent || "— (a base agent)")],
    ["model preset", String(st.model || "the router's pick")],
    ["specialists", Array.isArray(st.specialists) && st.specialists.length ? st.specialists.map(String).join(", ") : "all"],
    ["skills", Array.isArray(st.skills) && st.skills.length ? st.skills.map(String).join(", ") : "the library's enabled ones"],
  ];
  const brief = String(pane?.extra_prompt_md ?? "").trim();
  return (
    <div data-testid="role-tab" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10, fontFamily: mono, fontSize: 11 }}>
      <span style={{ fontSize: 11.5, color: C.fg, fontWeight: 700 }}>☺ the role — what this agent is made as</span>
      <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "5px 12px" }}>
        {rows.map(([k, v]) => <React.Fragment key={k}><span style={{ color: C.dim, textTransform: "uppercase", fontSize: 8.5, letterSpacing: 1, alignSelf: "baseline" }}>{k}</span><span data-testid={`role-${k.replace(/\s+/g, "-")}`} style={{ color: C.fg, wordBreak: "break-word" }}>{v}</span></React.Fragment>)}
      </div>
      <span style={{ color: C.dim, textTransform: "uppercase", fontSize: 8.5, letterSpacing: 1, marginTop: 4 }}>the brief — the extra prompt the CLI boots with (edit it under scope &amp; guidance)</span>
      <pre data-testid="role-brief" style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", color: brief ? C.muted : C.dim, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontFamily: mono, fontSize: 10.5, lineHeight: 1.5 }}>{brief || "none — the agent runs on the context pack alone"}</pre>
    </div>
  );
}
