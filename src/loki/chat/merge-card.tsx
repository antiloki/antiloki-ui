// THE MODEL CARD of a merged agent (2026-09-23: "a merged model, compiled — not trained"): a merge is a model, so it
// gets what a model gets — a name, its composition (which side answers which job), the adapter it reads, the score it
// was measured at, and a version that moves when the benchmark re-ranks it. The card is the winner tile's preview in
// the Studio and the header of a winner on the Agents tab. Pure data + one component; the numbers are the table's.
import React from "react";
import { C, mono, nav } from "@/loki/theme";
import { ChibiFace } from "./chibi-face";
import { faceColor } from "@/loki/cockpit/agent-themes";
import { JOB_ORDER, jobCode, jobRole, mergeName, mergeWord, brandOf, sideName, modelName, PROVIDER_NAME, type JobName } from "./jobs";
import { sideFromKey, sizeWord, type MergeRowLite } from "./agents-tab";
import { measuredOn, domainWord, thin } from "./provenance";

/** which jobs each side of a merge answers — the brain reasons, the hands write (cli::Pair::side). Pure. */
export const BRAIN_JOBS: JobName[] = ["planner", "screening", "verifier", "qa-gate", "lookup", "synthesis"];
export const HANDS_JOBS: JobName[] = ["editor-s", "editor-l", "test-writer", "report"];
/** the deterministic adapter every merged pane boots with — X-ray's own intel, not the model's memory */
export const ADAPTER_PACKS: { key: string; what: string }[] = [
  { key: "laws", what: "the rules the codebase lives by, checked at the line" },
  { key: "reviews", what: "every file scored — and why not 100, axis by axis" },
  { key: "graph", what: "imports as a map: hubs, orphans, cycles" },
  { key: "tests", what: "what the tests never reach, by file" },
  { key: "blast", what: "what a change to this file would touch" },
];

export type MergeCard = {
  name: string; job: JobName | string; role: string; word: string;
  brain: { engine: string; model: string; label: string } | null;
  hands: { engine: string; model: string; label: string } | null;
  qa: { engine: string; model: string; label: string } | null;
  size: string; audit: number | null; s: number; usd: number; weight: number; n: number; source: string;
  version: string; measured: boolean;
  /** THE KIND OF WORK BEHIND THE NUMBERS (plan II.7) — "backend work · 31 samples", or "pooled across kinds of work"
   *  when the row is unlabelled, or "not measured". A weight is not a fact until the card says what it measured. */
  work: string; workWord: string; thin: boolean;
};
const sideOf = (k: string) => { const s = sideFromKey(k); return s ? { engine: s.engine, model: s.model ?? "", label: label(k) } : null; };
/** a side as a person reads it: the provider and the model, always both (jobs.ts). */
export const label = sideName;
/** THE VERSION: a merge's card moves when the benchmark learns something about it — one per sample, so v3 is a
 *  winner that has been measured three times. A card with no samples is a draft. Pure. */
export function versionOf(r: { n: number } | null): string { return r && r.n > 0 ? `v${r.n}` : "draft"; }

/** The card of a job's winner, or of the job itself when nothing has won it yet. Pure — tested. */
export function cardOf(job: string, r: MergeRowLite | null): MergeCard {
  const brain = r ? sideOf(r.planner) : null; const hands = r ? sideOf(r.worker) : null;
  return {
    name: r ? mergeName(job, r.planner, r.worker) : `${jobRole(job)} — unmeasured`,
    job, role: jobRole(job), word: r ? mergeWord(r.planner, r.worker) : "—",
    brain, hands, qa: r && r.qa ? sideOf(r.qa) : null,
    size: r ? sizeWord(r.size) : "—", audit: r?.audit ?? null, s: r?.s ?? 0, usd: r?.usd ?? 0,
    weight: r?.weight ?? 0, n: r?.n ?? 0, source: r?.source ?? "—",
    version: versionOf(r), measured: !!r,
    work: r ? measuredOn(r) : "not measured", workWord: r ? domainWord(r) : "unmeasured", thin: thin(r),
  };
}
/** where a row's numbers came from, in words. Pure. */
export function sourceWord(s: string): string {
  if (s.startsWith("bench") && s.includes("run")) return "our bench, then your runs";
  if (s.startsWith("bench")) return "our bench — the shipped base";
  if (s === "use") return "audited calls on this box";
  if (s.includes("audit")) return "your runs, with the behavioural audit";
  return s === "run" ? "your runs" : s;
}

const dt: React.CSSProperties = { fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim };
const dd: React.CSSProperties = { fontFamily: mono, fontSize: 11, color: C.fg };

function Side({ title, who, jobs, tint }: { title: string; who: MergeCard["brain"]; jobs: JobName[]; tint?: string }) {
  return (
    <div style={{ flex: "1 1 200px", minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ ...dt, color: tint ?? C.dim }}>{title}</span>
      <span style={{ fontFamily: nav, fontSize: 13, color: C.fg, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{who?.label ?? "—"}</span>
      <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={who ? `${who.engine}${who.model ? ` · ${who.model}` : ""}` : undefined}>{who ? `${PROVIDER_NAME[who.engine] ?? who.engine} · ${modelName(who.model) || "the job's model"}` : "not bound"}</span>
      <span style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 2 }}>
        {jobs.map((j) => <span key={j} title={jobRole(j)} style={{ fontFamily: mono, fontSize: 8, letterSpacing: .4, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 4px" }}>{j}</span>)}
      </span>
    </div>
  );
}

export function MergeCardView({ card, compact = false }: { card: MergeCard; compact?: boolean }) {
  const tint = card.brain ? faceColor(null, card.brain.engine, card.brain.model) : undefined;
  const pct = card.audit != null ? `${Math.round(card.audit * 100)}%` : "—";
  const money = card.usd > 0 ? `$${card.usd.toFixed(card.usd < 0.1 ? 3 : 2)}` : "—";
  const stat = (k: string, v: string, title?: string) => (
    <span key={k} title={title} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 62 }}>
      <span style={dt}>{k}</span><span style={{ fontFamily: mono, fontSize: 13, color: C.fg, fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </span>
  );
  return (
    <div data-testid="merge-card" data-job={card.job} data-version={card.version} style={{ display: "flex", flexDirection: "column", gap: 12, padding: compact ? "10px 12px" : "16px 18px", fontFamily: mono }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span aria-hidden style={{ width: 38, height: 38, flex: "0 0 38px" }}>
          <ChibiFace slug={`winner-${card.job}`} mood={card.measured ? "live" : "idle"} size={38} color={tint} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span style={{ fontFamily: nav, fontSize: 15.5, color: C.fg, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.name}</span>
            <span title={String(card.job)} style={{ fontFamily: mono, fontSize: 9, letterSpacing: .6, textTransform: "uppercase", color: C.muted }}>{jobCode(card.job)}</span>
            <span data-testid="merge-card-version" style={{ fontFamily: mono, fontSize: 9.5, color: C.brand, border: `1px solid ${C.brand}`, borderRadius: 4, padding: "0 4px" }}>{card.version}</span>
          </span>
          <span style={{ display: "block", fontFamily: mono, fontSize: 9.5, color: C.dim, marginTop: 1 }}>
            {card.measured ? `first place · ${card.job} · ${card.size} · ${card.work}, ${sourceWord(card.source)}` : `${card.job} — nothing has won this job yet`}
          </span>
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Side title="brain — reasons" who={card.brain} jobs={BRAIN_JOBS} tint={tint} />
        <Side title="hands — writes" who={card.hands} jobs={HANDS_JOBS} />
      </div>
      {card.qa && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}>⚖ the gate that judged it: <b style={{ color: C.fg, fontWeight: 600 }}>{card.qa.label}</b></div>}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "10px 0" }}>
        {stat("audit", pct, "the behavioural checks that passed")}
        {stat("time", card.s ? `${card.s} s` : "—")}
        {stat("cost", money, "deterministic — model × tokens")}
        {stat("weight", card.measured ? card.weight.toFixed(2) : "—", "quality 0.15 · cost 0.75 · time 0.10, inside 80% of the best")}
        {stat("samples", card.measured ? String(card.n) : "0")}
        {stat("work", card.workWord, card.work)}
      </div>
      {/* THIN EVIDENCE ANNOUNCES ITSELF (the plan's rule: print "not measured here" when that is the truth). A card
          with fewer than three samples still shows its numbers — hiding them would be its own distortion — but it
          says out loud that they are not yet a ranking. */}
      {card.measured && card.thin && (
        <div data-testid="merge-card-thin" style={{ fontFamily: mono, fontSize: 9.5, color: "#e0a04a", lineHeight: 1.5 }}>
          ⚠ thin — {card.work}. Not enough to rank it; run this job again, or run it raw side by side, before trusting the weight.
        </div>
      )}

      {!compact && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={dt}>the adapter — what it reads before it explores (X-ray, deterministic, recomputed each commit)</span>
          {ADAPTER_PACKS.map((p) => (
            <span key={p.key} style={{ ...dd, fontSize: 10, color: C.muted }}>
              <b style={{ color: C.fg, fontWeight: 600 }}>{p.key}</b> — {p.what}
            </span>
          ))}
        </div>
      )}
      <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, lineHeight: 1.5 }}>
        Compiled, not trained: no weights change — the merge binds a measured model to every job and the adapter supplies the codebase. The version moves when the benchmark re-ranks it.
      </span>
    </div>
  );
}

/** the winner card of each job, in the router's order — the Studio's Merged Winners, as cards. Pure. */
export function cardsOf(rows: MergeRowLite[], winnerOf: (job: string) => MergeRowLite | null): MergeCard[] {
  return JOB_ORDER.map((j) => cardOf(j, winnerOf(j)));
}
