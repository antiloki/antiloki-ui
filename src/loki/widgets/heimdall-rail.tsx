// THE RAIL'S THREE VIEWS (operator 2026-09-20: "the 3 panes have almost the same info and it's a little
// confusing — make 3 focused panes very simple to understand"). One question each, nothing else:
//   ⚡ RouteView  — the routing log: each ask's verdict (one job or a plan · tier/model · how sure), the events, an estimate vs raw Claude
//   ? ScreenView — what Heimdall asks before planning (and what it assumed on its own)
//   ⋔ PlanView   — the current plan (tasks by wave · approve · how they are doing · the report) and the earlier plans
import React from "react";
import { useTourUnlock } from "@/loki/shell/mini-tour";
import { C, mono } from "@/loki/theme";
import { goalOp, taskGlyph, claudeModelForTier, qaLine, type GoalRun, type GoalTask, type Tier } from "./subagents";
import { fetchStory, QaVerdict, type Story } from "@/loki/chat/work-story";
import { QaLive, runIsMoving } from "@/loki/chat/qa-live";
import { EvidenceStrip } from "@/loki/chat/qa-evidence";

const TIER_TONE: Record<Tier, string> = { low: C.dim, mid: C.muted, high: C.warn };
const label: React.CSSProperties = { fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim };
const card: React.CSSProperties = { border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6, background: C.bg };
const chip = (on: boolean, color?: string): React.CSSProperties => ({ background: on ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${on ? C.brand : color ?? C.border}`, color: on ? C.brand : color ?? C.muted, borderRadius: 6, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 });
const primary: React.CSSProperties = { background: C.brand, border: `1px solid ${C.brand}`, color: C.bg, borderRadius: 6, padding: "3px 12px", cursor: "pointer", fontFamily: mono, fontSize: 10, fontWeight: 700 };
const quiet = (text: string) => <span style={{ fontFamily: mono, fontSize: 10, color: C.dim, lineHeight: 1.5 }}>{text}</span>;

/** newest first */
export const byNewest = (runs: GoalRun[]) => [...runs].sort((a, b) => b.created - a.created);

/** One line that says what Heimdall decided. Pure — tested. */
export function verdictLine(r: GoalRun, engine: string): string {
  if (r.status === "planning") return "routing… the router reads the code first";
  if (r.status === "failed") return `failed — ${r.error ?? "the router returned nothing"}`;
  if (r.status === "awaiting-answers") return `asking ${r.questions?.length ?? 0} question${(r.questions?.length ?? 0) === 1 ? "" : "s"} first`;
  const t = r.route?.tier ?? "mid";
  const model = engine === "claude-code" ? ` · ${claudeModelForTier(t)}` : "";
  if (r.status === "inline" || (r.route && !r.route.delegate)) return `one job — this terminal · tier ${t}${model}`;
  const n = r.tasks.length; const waves = r.tasks.length ? Math.max(...r.tasks.map((x) => x.wave)) + 1 : 0;
  return `${n} sub-agent${n === 1 ? "" : "s"} in ${waves} wave${waves === 1 ? "" : "s"} · tier ${t}`;
}
export function verdictState(r: GoalRun): { text: string; tone: string } {
  switch (r.status) {
    case "inline": return r.delivered ? { text: "typed into the terminal", tone: C.ok } : { text: "typing into the terminal…", tone: C.warn };
    case "awaiting-answers": return { text: "waiting for your answers — see ?", tone: C.warn };
    case "awaiting-approval": return { text: "plan waits for your approval — see ⋔", tone: C.brand };
    case "running": case "joining": return { text: "sub-agents running — see ⋔", tone: C.warn };
    case "done": return { text: "done — report in ⋔", tone: C.ok };
    case "failed": return { text: "failed", tone: C.bad };
    case "cancelled": return { text: "cancelled", tone: C.dim };
    default: return { text: r.status, tone: C.dim };
  }
}

// ── ⚡ HEIMDALL — the routing log, and what it saved vs raw Claude (an estimate from the tiers it chose) ──
/** Public list prices ($ per Mtok in/out) the estimate is measured with — the same yardstick the serve's
 *  savings use. Raw Claude = opus on everything. Pure. */
const PRICE: Record<Tier, [number, number]> = { low: [3, 15], mid: [3, 15], high: [15, 75] };
/** "~5× cheaper than raw Claude (sonnet instead of opus)" for an inline route, a blended factor for a plan.
 *  Real numbers (the run's `savings`) win when the run has them. Pure — tested. */
export function estimateLine(r: GoalRun): string | null {
  if (r.savings) return `saved ~$${r.savings.saved_usd.toFixed(2)} (${Math.round(r.savings.saved_pct)}%) vs raw Claude — $${r.savings.actual_usd.toFixed(2)} instead of $${r.savings.baseline_usd.toFixed(2)} at ${r.savings.baseline}`;
  if (r.engine !== "claude-code" || !r.route) return null;
  const tiers: Tier[] = r.route.delegate && r.tasks.length ? r.tasks.map((t) => t.tier ?? "mid") : [r.route.tier];
  const cost = tiers.reduce((n, t) => n + PRICE[t][0] + PRICE[t][1], 0); const raw = tiers.length * (PRICE.high[0] + PRICE.high[1]);
  const factor = raw / Math.max(cost, 1);
  if (factor <= 1.05) return "no saving — this needs opus, the same model raw Claude would use";
  const what = tiers.length === 1 ? "sonnet instead of opus" : `${tiers.filter((t) => t !== "high").length} of ${tiers.length} tasks on sonnet`;
  return `estimate: ~${factor.toFixed(factor >= 3 ? 0 : 1)}× cheaper than raw Claude (${what}) — list prices, not a bill`;
}
/** An event's unique id as a small dim suffix — rendered ONLY when the event has one (older runs have none). */
export function EventId({ id }: { id?: string }) {
  if (!id) return null;
  return <span data-testid="event-id" title="id — quote this to refer to this exact warning" style={{ fontFamily: mono, fontSize: 8, color: C.dim, opacity: 0.7, marginLeft: 6, flexShrink: 0 }}>{id}</span>;
}

const ROUTING_KINDS = new Set(["plan", "route", "heimdall", "screen", "assume", "answer", "ratify", "inline", "approve", "error", "plan-fix"]);
const KIND_TONE: Record<string, string> = { route: C.brand, heimdall: C.warn, screen: C.warn, answer: C.ok, assume: C.muted, ratify: C.muted, inline: C.ok, approve: C.ok, error: C.bad, "plan-fix": C.warn, plan: C.dim };
/** The verdict in plain words — one line a person reads at a glance. Pure — tested. */
export function plainVerdict(r: GoalRun, engine: string): { headline: string; sub: string; tone: string } {
  const t = r.route?.tier ?? "mid";
  const model = engine === "claude-code" ? (t === "high" ? "opus" : "sonnet") : t;
  if (r.status === "planning") return { headline: "Deciding…", sub: "reading the code first", tone: C.warn };
  if (r.status === "awaiting-answers") { const n = r.questions?.length ?? 0; return { headline: `Needs ${n} answer${n === 1 ? "" : "s"} first`, sub: "open ? to answer", tone: C.warn }; }
  if (r.status === "failed") {
    // THE ROUTER DECIDED; THE RUN FAILED (operator 2026-09-30: a run routed "high sure" died on a seat's quota and the rail said "Couldn't decide · the router returned nothing"). "Couldn't decide" is only
    // for a run that never got a route or a plan; once it had one, the failure is the run's, and the reason is the last thing that failed.
    const decided = !!r.route || r.tasks.length > 0;
    if (!decided) return { headline: "Couldn't decide", sub: r.error ?? "the router returned nothing", tone: C.bad };
    const why = r.error ?? [...(r.events ?? [])].reverse().find((e) => e.kind === "fail")?.text ?? r.tasks.find((x) => x.status === "failed")?.error ?? "";
    const d = r.tasks.filter((x) => x.status === "done").length;
    return { headline: `Decided, then the run failed · ${d}/${r.tasks.length} done`, sub: String(why).slice(0, 160), tone: C.bad };
  }
  if (r.status === "cancelled") return { headline: "Cancelled", sub: "", tone: C.dim };
  if (r.status === "inline" || (r.route && !r.route.delegate)) return { headline: `Do it here · ${model}`, sub: r.delivered ? "sent to the agent" : "sending to the agent…", tone: C.ok };
  const n = r.tasks.length;
  if (r.status === "awaiting-approval") return { headline: `Split into ${n} sub-agents`, sub: "waiting for your ✓ in ⋔", tone: C.brand };
  if (r.status === "running" || r.status === "joining") { const d = r.tasks.filter((x) => x.status === "done").length; return { headline: `Split into ${n} sub-agents`, sub: `${d}/${n} done · see ⋔`, tone: C.warn }; }
  if (r.status === "done") { const d = r.tasks.filter((x) => x.status === "done").length; return { headline: `Split into ${n} sub-agents`, sub: `done · ${d}/${n} passed`, tone: C.ok }; }
  return { headline: r.status, sub: "", tone: C.dim };
}
/** "~5× cheaper than opus" / "saved $1.80" — one short line, or nothing. Pure. */
export function plainSaving(r: GoalRun): string | null {
  if (r.savings) return `saved $${r.savings.saved_usd.toFixed(2)} (${Math.round(r.savings.saved_pct)}%)`;
  if (r.engine !== "claude-code" || !r.route) return null;
  const tiers: Tier[] = r.route.delegate && r.tasks.length ? r.tasks.map((t) => t.tier ?? "mid") : [r.route.tier];
  const cost = tiers.reduce((n, t) => n + PRICE[t][0] + PRICE[t][1], 0); const raw = tiers.length * (PRICE.high[0] + PRICE.high[1]);
  const f = raw / Math.max(cost, 1);
  return f <= 1.05 ? null : `~${f.toFixed(f >= 3 ? 0 : 1)}× cheaper than opus`;
}
const SURE: Record<string, { dot: string; tone: string }> = { high: { dot: "●", tone: C.ok }, medium: { dot: "◐", tone: C.warn }, low: { dot: "○", tone: C.bad } };

/** EVERY CHOICE HEIMDALL MAKES, THE MOMENT IT MAKES IT (operator 2026-09-27: "heimdall now chooses a lot of stuff,
 *  role, planner and worker (if L or higher), or worker, and QA. Many choices, all those should be displayed in real
 *  time on the sidepane of heimdall"). One row per decision; a row reads "deciding…" until the run carries the value,
 *  and the run is polled while it is alive, so the rows fill in as the router works. Pure over the run — tested. */
export function decisionsOf(r: GoalRun): { key: string; label: string; value: string | null; tone?: "ok" | "warn" | "dim" }[] {
  const seat = (e?: string | null, m?: string | null) => (e ? `${e}${m ? ` · ${m}` : ""}` : null);
  const role = r.role ?? null;
  const roleText = role ? `${role.name ?? role.role ?? "?"}${role.domain ? ` · ${role.domain}` : ""}${role.measured === false ? " · unmeasured" : ""}` : null;
  const tier = r.route ? `${r.route.tier}${r.route.confidence ? ` · ${r.route.confidence} sure` : ""}${r.route.verify_tier && r.route.verify_tier !== r.route.tier ? ` · verify ${r.route.verify_tier}` : ""}` : null;
  const brain = r.pair ? seat(r.pair.brain, r.pair.brain_model) : r.plan_binding ? r.plan_binding : r.status === "planning" ? null : seat(r.engine);
  const hands = r.pair ? seat(r.pair.hands, r.pair.hands_model) : r.workers ? seat(r.workers) : r.route && !r.route.delegate ? "the brain itself · one job" : null;
  const qa = r.qa ? (r.qa.passed ? "gate passed" : `gate failed (${r.qa.exit})`) : r.qa_review ? "judged" : r.qa_review_wanted === true ? "judge on · after the join" : r.qa_review_wanted === false ? "off" : null;
  const stages = r.stages?.length ? r.stages.map((s) => `${s.name}${s.ok ? " ✓" : " ✗"} ${s.engine}/${s.tier}`).join(" → ") : null;
  const out = [
    { key: "role", label: "role", value: roleText, tone: role?.bent ? "warn" as const : undefined },
    { key: "tier", label: "tier", value: tier },
    { key: "brain", label: "brain", value: brain },
    { key: "hands", label: "hands", value: hands },
    { key: "qa", label: "QA", value: qa },
  ];
  if (role?.bent) out.push({ key: "bent", label: "bent", value: role.bent, tone: "warn" });
  if (stages) out.push({ key: "stages", label: "stages", value: stages });
  return out;
}
function Decisions({ r }: { r: GoalRun }) {
  const alive = r.status === "planning" || r.status === "running" || r.status === "joining" || r.status === "awaiting-answers" || r.status === "awaiting-approval";
  const rows = decisionsOf(r);
  return (
    <div data-testid={`route-decisions-${r.id}`} style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: "1px 8px", fontFamily: mono, fontSize: 9.5, lineHeight: 1.5, padding: "3px 0" }}>
      {rows.map((d) => (
        <React.Fragment key={d.key}>
          <span style={{ color: C.dim }}>{d.label}</span>
          <span data-testid={`decision-${d.key}`} data-decided={d.value ? "1" : "0"}
            style={{ color: d.value ? (d.tone === "warn" ? C.warn : d.tone === "dim" ? C.dim : C.fg) : C.dim, fontStyle: d.value ? "normal" : "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={d.value ?? undefined}>
            {d.value ?? (alive ? "deciding…" : "—")}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
export function RouteView({ runs, engine, busy, onOpenAsk }: { runs: GoalRun[]; engine: string; busy: string | null; onOpenAsk: () => void }) {
  useTourUnlock("heimdall"); // the progressive tour: the first of the rail's three views the user opens
  const list = byNewest(runs);
  const [open, setOpen] = React.useState<number | null>(null);
  return (
    <>
      {busy && <span style={{ fontFamily: mono, fontSize: 10, color: C.warn }}>⚡ deciding what to do with “{busy.slice(0, 60)}”…</span>}
      {!list.length && !busy && quiet("nothing routed yet — the first ask of a thread and what you type in the pane come through here.")}
      {list.slice(0, 10).map((r) => { const v = plainVerdict(r, engine); const sure = r.route?.confidence ? SURE[r.route.confidence] : null; const save = plainSaving(r); const on = open === r.id; return (
        <div key={r.id} data-testid={`route-run-${r.id}`} style={{ ...card, gap: 3 }}>
          <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.goal}>“{r.goal}”</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span data-testid="route-headline" style={{ fontFamily: mono, fontSize: 13, color: v.tone, fontWeight: 700 }}>{v.headline}</span>
            {sure && <span style={{ fontFamily: mono, fontSize: 10, color: sure.tone }} title={`the router is ${r.route!.confidence} sure`}>{sure.dot} {r.route!.confidence} sure</span>}
          </div>
          <Decisions r={r} />
          {v.sub && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{v.sub}{save ? ` · ${save}` : ""}</span>}
          {!v.sub && save && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{save}</span>}
          {r.route?.why && <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.45 }}>{r.route.why}</span>}
          <button onClick={() => setOpen(on ? null : r.id)} style={{ alignSelf: "flex-start", background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 9.5, padding: 0 }}>{on ? "▾ details" : "▸ details"}</button>
          {on && (
            <div data-testid="route-log" style={{ display: "flex", flexDirection: "column", gap: 1, borderTop: `1px solid ${C.border}`, paddingTop: 4 }}>
              {r.route?.bias?.length ? <span style={{ fontFamily: mono, fontSize: 9.5, color: C.warn }}>learned: {r.route.bias.join("; ")}</span> : null}
              {r.events.filter((e) => ROUTING_KINDS.has(e.kind)).slice(-24).map((e, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 6, fontFamily: mono, fontSize: 9, lineHeight: 1.45 }}>
                  <span style={{ color: KIND_TONE[e.kind] ?? C.dim }}>{e.kind}</span><span style={{ color: C.muted, wordBreak: "break-word" }}>{e.text}<EventId id={e.id} /></span>
                </div>
              ))}
            </div>
          )}
        </div>
      ); })}
      <button data-testid="route-open-ask" onClick={onOpenAsk} style={{ ...chip(false), alignSelf: "flex-start" }} title="route an ask by hand (the goal form)">＋ route an ask</button>
    </>
  );
}

// ── ? SCREEN ─────────────────────────────────────────────────────────────────────────────────────
export function ScreenView({ runs, onRefresh }: { runs: GoalRun[]; onRefresh: () => void }) {
  useTourUnlock("heimdall");
  const list = byNewest(runs);
  const asking = list.find((r) => r.status === "awaiting-answers" && (r.questions?.length ?? 0) > 0) ?? null;
  const latest = list[0] ?? null;
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  /** which questions the operator chose to answer in their own words — the input is behind the last chip */
  const [typing, setTyping] = React.useState<Record<string, boolean>>({});
  // …and they belong to the run that is asking: if `asking` rolls to another run (cancelled, superseded) the
  // previous answers were left pre-selected under the same question ids, which are commonly `d1`/`d2`.
  React.useEffect(() => { setAnswers({}); setTyping({}); }, [asking?.id]);
  const [busy, setBusy] = React.useState(false);
  const answer = async (defaults: boolean) => {
    if (!asking) return;
    setBusy(true);
    // AN EMPTY BOX IS NOT AN ANSWER (audit 2026-09-28). Picking a chip, opening "write it yourself" and clearing
    // the field left `{ d1: "" }`, which is not the `{}` that means "take the defaults" — the run was answered
    // with nothing. Blanks are dropped, so an untouched or emptied question falls to its default like any other.
    const given = defaults ? {} : Object.fromEntries(Object.entries(answers).filter(([, v]) => String(v ?? "").trim()));
    await goalOp("answer", { id: asking.id, answers: given });
    setBusy(false); setTyping({}); setAnswers({}); onRefresh();
  };
  if (asking) return (
    <div data-testid="screen-asking" style={card}>
      <span style={label}>before planning “{asking.goal.slice(0, 50)}”, heimdall asks</span>
      {asking.questions!.map((q) => (
        <div key={q.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, lineHeight: 1.5 }}>{q.text}</span>
          {/* CHIPS, AND THE BOX ONLY IF YOU ASK FOR IT (operator 2026-09-28: "is chips selection response with a
              last chip of write yourself. Not an input field just"). An empty field asks the operator to compose
              a specification for a machine; a chip asks them to make a choice, which is what they actually have
              in their head. The last chip opens the field for the answer nobody listed. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {q.options.map((o, i) => (
              <button key={o} data-testid={`screen-chip-${q.id}-${i}`} data-chip={q.id} onClick={() => { setAnswers((a) => ({ ...a, [q.id]: o })); setTyping((s) => ({ ...s, [q.id]: false })); }}
                style={chip(answers[q.id] === o && !typing[q.id])}>{o}</button>
            ))}
            <button data-testid={`screen-write-${q.id}`} onClick={() => setTyping((s) => ({ ...s, [q.id]: !s[q.id] }))}
              title="say it in your own words" style={chip(!!typing[q.id])}>✎ write it yourself</button>
          </div>
          {typing[q.id] && (
            <input data-testid={`screen-answer-${q.id}`} autoFocus value={answers[q.id] ?? ""}
              placeholder={q.default ? `default: ${q.default}` : "your answer"}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              style={{ background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 6px", fontFamily: mono, fontSize: 9.5 }} />
          )}
        </div>
      ))}
      <div style={{ display: "flex", gap: 6 }}>
        <button data-testid="screen-answer" disabled={busy} onClick={() => void answer(false)} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>{busy ? "planning…" : "→ answer & plan"}</button>
        <button data-testid="screen-defaults" disabled={busy} onClick={() => void answer(true)} style={chip(false)}>take the defaults</button>
      </div>
    </div>
  );
  const answered = list.find((r) => r.questions?.some((q) => q.answer)) ?? null;
  return (
    <>
      <div style={card}>
        <span style={label}>open questions</span>
        {quiet(latest ? `none — heimdall was sure enough of “${latest.goal.slice(0, 60)}” to go ahead.` : "none — nothing routed yet.")}
      </div>
      {latest?.assumptions?.length ? (
        <div data-testid="screen-assumed" style={card}>
          <span style={label}>what it assumed on its own</span>
          {latest.assumptions.map((a, i) => <span key={i} style={{ fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>· {a}</span>)}
        </div>
      ) : null}
      {answered && (
        <div style={card}>
          <span style={label}>answered earlier · #{answered.id}</span>
          {answered.questions!.map((q) => <span key={q.id} style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, lineHeight: 1.5 }}>{q.text.slice(0, 70)} → <b style={{ color: C.muted }}>{q.answer}</b></span>)}
        </div>
      )}
    </>
  );
}

// ── ⋔ PLAN ───────────────────────────────────────────────────────────────────────────────────────
function TaskRow({ t, live }: { t: GoalTask; live: boolean }) {
  const g = taskGlyph(t);
  const tone = g.tone === "ok" ? C.ok : g.tone === "warn" ? C.warn : g.tone === "bad" ? C.bad : g.tone === "fg" ? C.fg : C.dim;
  return (
    <div data-testid={`plan-task-${t.id}`} style={{ display: "grid", gridTemplateColumns: "16px 30px 1fr", gap: 6, alignItems: "start", fontFamily: mono, fontSize: 10 }} title={`${t.prompt}\n\nacceptance:\n${t.acceptance.join("\n")}`}>
      <span style={{ color: live ? tone : C.dim }}>{live ? g.glyph : "·"}</span>
      <span style={{ color: TIER_TONE[t.tier ?? "mid"] }}>{t.tier ?? "mid"}</span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ color: C.fg }}>{t.title}</span>
        <span style={{ color: C.dim, fontSize: 9 }}>owns {t.owns.join(", ") || "—"}{live ? ` · ${g.state}` : ""}{t.verdict && !t.verdict.passed ? ` · ${t.verdict.reasons[0] ?? ""}` : ""}</span>
      </span>
    </div>
  );
}
/** ✓ QA (operator 2026-09-21: "an isolated QA sub-agent judges the work based on the criteria after each plan
 *  finishes"): every run the judge reviewed — verdict, score, the findings by task; the ones still being judged. */
/** A RUN'S STORY, READ FOR ITS QA (operator 2026-10-08: the QA's verdict, live browser and pictures left the chat for this rail). The story is fetched
 *  once and re-read every few seconds while the run moves OR the QA is still judging - the QA follows the work, so a settled run can still be about to change. */
export function useQaStory(run: number, status: string): Story | null { return useQaStoryOf(run, status, false); }
/** The QA of one run, as the rail shows it: the verdict (who judged, what was unmet and why, the send-backs), the live/replayed browser or terminal, and the pictures it took.
 *  `bare` sits inside a run's card; otherwise it is a card of its own and renders nothing for a run the QA never looked at. */
export function QaRunStory({ run, status, goal, bare = false }: { run: number; status: string; goal?: string; bare?: boolean }) {
  const story = useQaStory(run, status);
  const qa = story?.qa;
  const has = !!qa && (qa.state !== "none" || qa.timeline.length > 0);
  if (!bare && !has) return null;
  const body = <>
    <QaVerdict qa={qa} run={run} settled={story?.status === "done"} />
    <QaLive run={run} status={story?.status ?? status} />
    <EvidenceStrip run={run} />
  </>;
  if (bare) return <div data-testid={`qa-story-${run}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>{body}</div>;
  return (
    <div data-testid={`qa-story-${run}`} style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={label}>run #{run}</span>
        <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{goal}</span>
      </div>
      {body}
    </div>
  );
}
/** THE ✓ ICON'S STATE, from the newest run's story: `judging` (pulses) · `unmet` · `met`, else null. Polled only while something can still change. */
export function useQaRailState(runs: GoalRun[]): "judging" | "unmet" | "met" | null {
  const newest = byNewest(runs)[0];
  const id = newest?.id ?? null;
  const story = useQaStoryOf(id, newest?.status ?? "", !!newest?.qa_pending);
  const s = story?.qa?.state;
  if (id == null) return null;
  if (s === "judging" || newest?.qa_pending) return "judging";
  return s === "unmet" ? "unmet" : s === "met" ? "met" : null;
}
/** HOW THE ✓ ICON LOOKS (operator 2026-10-08: the QA moved from the chat to this rail, "an icon on the side pane for those QA trials"): the newest run's own verdict
 *  wins - judging pulses in the brand ember, NOT MET is red with a "!", passed is green - and the older plan review (`qa_review`) still colours it when the story says nothing. Pure — tested. */
export function qaRailLook(o: { qaOn: boolean; story: "judging" | "unmet" | "met" | null; reviewFailed: boolean; reviewJudging: boolean }): { tone: "bad" | "brand" | "warn" | "ok" | null; pulse: boolean; badge: boolean; state: "judging" | "unmet" | "met" | ""; title: string } {
  if (o.story === "unmet" || (!o.story && o.reviewFailed)) return { tone: "bad", pulse: false, badge: true, state: "unmet", title: "QA: the latest run is NOT MET — click for what failed and why" };
  if (o.story === "judging") return { tone: "brand", pulse: true, badge: false, state: "judging", title: "QA is judging the latest run — click for the live view" };
  if (!o.story && o.reviewJudging) return { tone: "warn", pulse: false, badge: false, state: "judging", title: "the judge is reviewing a finished plan" };
  if (o.story === "met") return { tone: "ok", pulse: false, badge: false, state: "met", title: "QA passed the latest run — click for the verdict, the film and the pictures" };
  return { tone: null, pulse: false, badge: false, state: "", title: o.qaOn ? "QA: the verdicts, the live browser and the pictures of every run" : "QA is off — the ✓ QA button in the header turns it on" };
}
function useQaStoryOf(run: number | null, status: string, pending: boolean): Story | null {
  const [story, setStory] = React.useState<{ run: number; story: Story } | null>(null);
  React.useEffect(() => {
    if (run == null) return;
    let stop = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const s = await fetchStory(run);
      if (stop) return;
      if (s) setStory({ run, story: s });
      if (!s ? runIsMoving(status) || pending : runIsMoving(s.status) || pending || !!s.qa?.pending || s.qa?.state === "judging") timer = setTimeout(() => void tick(), 5000);
    };
    void tick();
    return () => { stop = true; if (timer) clearTimeout(timer); };
  }, [run, status, pending]);
  return story && story.run === run ? story.story : null;   // another run's verdict is not this one's
}
export function QaView({ runs, on }: { runs: GoalRun[]; on: boolean }) {
  const list = byNewest(runs).filter((r) => r.qa_review_wanted && r.tasks.length > 0);
  // the other recent runs - an inline turn's QA has no plan behind it, but it has a verdict, a film and pictures all the same
  const others = byNewest(runs).filter((r) => !list.some((l) => l.id === r.id)).slice(0, 8);
  const tone = (k: string) => k === "ok" ? C.ok : k === "risk" ? C.warn : k === "drift" || k === "claim" || k === "unmet" ? C.bad : C.muted;
  return (
    <>
      {!on && <div style={card}>{quiet("QA is off — turn it on in the header (✓ QA): after each plan finishes, an isolated judge reviews the whole run against the plan's criteria — unmet criteria, drift, false claims, risks.")}</div>}
      {on && list.length === 0 && <div style={card}>{quiet("QA is on — the next finished plan is judged here.")}</div>}
      {list.map((r) => {
        const q = r.qa_review;
        return (
          <div key={r.id} data-testid={`qa-run-${r.id}`} style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={label}>run #{r.id}</span>
              <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.goal}</span>
              <span data-testid={`qa-verdict-${r.id}`} style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: !q ? C.dim : q.error ? C.warn : q.passed ? C.ok : C.bad }}>{qaLine(r)}</span>
            </div>
            {q?.summary && <div style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, lineHeight: 1.5 }}>{q.summary}</div>}
            {q?.error && <div style={{ fontFamily: mono, fontSize: 10, color: C.warn, whiteSpace: "pre-wrap" }}>{q.error}</div>}
            {q && q.findings.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {q.findings.map((f, i) => <div key={i} style={{ display: "flex", gap: 6, alignItems: "baseline", fontFamily: mono, fontSize: 10 }}><span style={{ color: tone(f.kind), fontWeight: 700, minWidth: 40 }}>{f.kind}</span>{f.task && <span style={{ color: C.dim }}>{f.task}</span>}<span style={{ color: C.fg }}>{f.text}</span></div>)}
            </div>}
            <QaRunStory run={r.id} status={r.status} bare />
          </div>
        );
      })}
      {others.map((r) => <QaRunStory key={r.id} run={r.id} status={r.status} goal={r.goal} />)}
    </>
  );
}
export function PlanView({ runs, onRefresh }: { runs: GoalRun[]; onRefresh: () => void }) {
  useTourUnlock("heimdall");
  const list = byNewest(runs).filter((r) => r.tasks.length > 0);
  const [sel, setSel] = React.useState<number | null>(null);
  const run = list.find((r) => r.id === sel) ?? list[0] ?? null;
  const [busy, setBusy] = React.useState(false);
  const op = async (o: "approve" | "cancel") => { if (!run) return; setBusy(true); await goalOp(o, { id: run.id }); setBusy(false); onRefresh(); };
  if (!run) return <div style={card}><span style={label}>plans</span>{quiet("no plan yet — a plan appears when Heimdall splits an ask into sub-agents (one-job routes go straight to the terminal).")}</div>;
  const waves = Math.max(...run.tasks.map((t) => t.wave)) + 1;
  const approving = run.status === "awaiting-approval";
  const live = !approving;
  const done = run.tasks.filter((t) => t.status === "done").length;
  const others = list.filter((r) => r.id !== run.id);
  return (
    <>
      <div data-testid="plan-run" style={{ ...card, borderColor: approving ? C.brand : C.border }}>
        <span style={label}>{run.id === list[0]?.id ? "current plan" : "plan"} · #{run.id} · {run.tasks.length} task{run.tasks.length === 1 ? "" : "s"} · {waves} wave{waves === 1 ? "" : "s"}{live ? ` · ${done}/${run.tasks.length} passed` : " · awaiting your approval"}</span>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={run.goal}>“{run.goal}”</span>
        {Array.from({ length: waves }, (_, w) => (
          <div key={w} style={{ display: "flex", flexDirection: "column", gap: 4, borderTop: `1px solid ${C.border}`, paddingTop: 4 }}>
            <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>wave {w + 1}</span>
            {run.tasks.filter((t) => t.wave === w).map((t) => <TaskRow key={t.id} t={t} live={live} />)}
          </div>
        ))}
        {approving && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", paddingTop: 4 }}>
            <button data-testid="plan-approve" disabled={busy} onClick={() => void op("approve")} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>✓ approve & run</button>
            <button disabled={busy} onClick={() => void op("cancel")} style={chip(false, C.bad)}>cancel</button>
          </div>
        )}
        {(run.status === "running" || run.status === "joining") && <span style={{ fontFamily: mono, fontSize: 10, color: C.warn }}>{run.status === "joining" ? "joining the results…" : "sub-agents working…"}</span>}
        {run.qa && <span style={{ fontFamily: mono, fontSize: 10, color: run.qa.passed ? C.ok : run.qa.pre_existing ? C.warn : C.bad }}>QA gate: related tests {run.qa.passed ? "passed" : run.qa.pre_existing ? "failed, but were already red before the change" : "FAILED"}</span>}
        {(run.status === "done" || run.status === "failed" || run.status === "cancelled") && <span style={{ fontFamily: mono, fontSize: 10, color: run.status === "done" ? C.ok : run.status === "failed" ? C.bad : C.dim }}>{run.status === "done" ? "done — the report was typed into the terminal" : run.status === "failed" ? `failed${run.error ? ` — ${run.error}` : ""}` : "cancelled"}</span>}
        {run.report && <details><summary style={{ ...label, cursor: "pointer" }}>report</summary><pre style={{ margin: 0, fontFamily: mono, fontSize: 9.5, color: C.muted, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{run.report}</pre></details>}
      </div>
      {others.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={label}>earlier plans</span>
          {others.slice(0, 10).map((r) => { const d = r.tasks.filter((t) => t.status === "done").length; return (
            <span key={r.id} data-testid={`plan-earlier-${r.id}`} onClick={() => setSel(r.id)} style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.goal}>#{r.id} · {r.tasks.length} tasks · {r.status}{r.status === "done" || r.status === "failed" ? ` · ${d}/${r.tasks.length} passed` : ""} — {r.goal}</span>
          ); })}
          {sel != null && sel !== list[0]?.id && <span onClick={() => setSel(null)} style={{ fontFamily: mono, fontSize: 9, color: C.brand, cursor: "pointer" }}>↑ back to the current plan</span>}
        </div>
      )}
    </>
  );
}
