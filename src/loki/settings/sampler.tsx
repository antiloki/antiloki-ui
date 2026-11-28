// WHAT TO MEASURE NEXT (PLAN-THE-LEAN-YEARS II.3, the bandit over cells — serve/src/sampler.rs).
//
// The benchmark screen says what has been measured. This says what is worth measuring, and — the part that saves the
// money — what the plan refuses to buy: a cell nobody routes to, and a cell whose winner is already clear. The numbers
// are the serve's; this file's only job is to say them in words an operator can act on, and never to round a
// probability into a promise.
import React from "react";
import { C, mono } from "@/loki/theme";
import { apiGet } from "@/loki/api/client";

export type Arm = { planner: string; worker: string; qa: string; n: number; q: number; usd: number; s: number; controlled: boolean; label: string };
export type Step = { job: string; size: string; domain: string; traffic: number; need: string; p_flip: number; runs: number; usd: number; priced: boolean; value: number; why: string; leader: Arm | null; challenger: Arm | null };
export type Summary = { cells: number; queued: number; projected_usd: number; projected_priced?: boolean; pooled?: number; untrafficked_benched?: number; budget: number | null; decided: number; untrafficked: number; needs_challenger: number; needs_confirming: number; skipped_usd: number };

/** each need as a chip: a colour and a verb, not a score. `separate` is the interesting one — two pairings a few runs
 *  apart — so it gets the brand colour; the refusals are dim on purpose. Pure. */
export const NEED: Record<string, { word: string; color: string; title: string }> = {
  separate: { word: "separate", color: "#7aa2f7", title: "two pairings close enough that a few runs could swap them" },
  challenger: { word: "challenger", color: "#e0a04a", title: "one arm measured — it cannot be a winner until something runs against it" },
  confirm: { word: "confirm", color: "#c39ac9", title: "the leader is real-use evidence only; a bench makes it comparable" },
  decided: { word: "decided", color: "#6a7", title: "the advantage is bigger than this cell's evidence can overturn — stop paying" },
  untrafficked: { word: "no traffic", color: "#666", title: "nobody routes here; never measured, on purpose" },
  pooled: { word: "pool answers", color: "#666", title: "nothing here was benched, so the benched pool answers this cell — runs here would change no route" },
};

/** the plan's headline, in one sentence of the operator's own units. Says the REFUSALS out loud, because the whole
 *  point of a sampler is what it does not buy — a version of this line that only bragged about the queue would be
 *  advertising. "" when the record is empty, so the caller omits the line. Pure. */
export function headline(s: Summary | null): string {
  if (!s || s.cells <= 0) return "";
  // A PROJECTION THAT HAD TO GUESS SAYS "about" (2026-09-28). The flat seats print tokens but no price, so cells made
  // only of their rows had no cost at all and this line read "$0.00 to settle them" — the operator's whole basis for
  // deciding whether to spend. The serve now stands the record's typical run in and flags it; the word carries that.
  const about = s.projected_priced === false ? "about " : "";
  const money = s.projected_usd > 0 ? `${about}$${s.projected_usd.toFixed(2)} to settle them` : "nothing priced yet to settle them";
  const parts = [`${s.queued} of ${s.cells} cells would change a decision`, money];
  // "NOBODY ROUTES HERE" IS NOT "NOTHING WAS MEASURED HERE" (2026-09-28). This said "not measured", and on the
  // record 12 of 17 such cells held five or six BENCHED arms apiece — the work was done, it simply answers a
  // question this codebase has not asked yet. Writing that off as unmeasured throws away a real asset on a wording.
  if (s.untrafficked > 0) {
    const m = s.untrafficked_benched ?? 0;
    parts.push(`${s.untrafficked} nobody routes to${m > 0 ? ` (${m} measured anyway)` : " — never measured"}`);
  }
  // A CELL THE ROUTER NEVER READS IS NOT AN UNPAID BILL (2026-09-28). Nothing in it was benched and a benched pool
  // answers it, so runs bought there change no route. Counting it among the refusals is the honest place for it.
  if (s.pooled) parts.push(`${s.pooled} the pool already answers`);
  if (s.decided > 0) parts.push(`${s.decided} already decided`);
  return parts.join(" · ");
}

/** WHAT ONE STEP COSTS, in words a budget is argued with: "8 runs · $0.74". A step with no price yet says so rather
 *  than printing $0.00, which would read as free. Pure. */
export function costWord(st: Step): string {
  const runs = `${st.runs} run${st.runs === 1 ? "" : "s"}`;
  if (st.usd <= 0) return `${runs} · price unknown`;
  return `${runs} · ${st.priced === false ? "about " : ""}$${st.usd.toFixed(st.usd < 1 ? 3 : 2)}`;
}

/** HOW CLOSE THE CALL IS, as a percentage of being wrong about the leader — never "proven". The serve's `p_flip` is the
 *  probability the runner-up is actually better; over 40% is a coin and the word says so. Pure. */
export function closeness(st: Step): string {
  if (st.need === "challenger") return "nothing to compare yet";
  const p = Math.round(st.p_flip * 100);
  if (p >= 40) return `a coin — ${p}% chance the runner-up is better`;
  if (p >= 15) return `${p}% chance the runner-up is better`;
  return `${p}% — close to settled`;
}

/** the cell as a person names it: "editor-l · L · backend work". `any` is the pool, said as a pool. Pure. */
export function cellName(st: Step): string {
  const work = !st.domain || st.domain === "any" ? "pooled" : `${st.domain} work`;
  return `${st.job} · ${st.size.toUpperCase()} · ${work}`;
}

export function Sampler() {
  const [steps, setSteps] = React.useState<Step[] | null>(null);
  const [settled, setSettled] = React.useState<Step[]>([]);
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [err, setErr] = React.useState("");
  // A BUDGET IS THE OPERATOR'S, NOT A DEFAULT WE INVENT: blank means "show me everything worth doing", and the serve
  // trims greedily by value when a ceiling is given.
  const [budget, setBudget] = React.useState("");
  const load = React.useCallback(async (b: string) => {
    try {
      const q = b.trim() && Number(b) > 0 ? `?budget=${encodeURIComponent(Number(b))}` : "";
      const r: any = await apiGet(`/api/v1/settings/sampler${q}`);
      const x = r?.result ?? r;
      if (!Array.isArray(x?.steps)) { setSteps([]); setErr(x?.error ?? "the serve did not answer with a plan — restart it on the current build"); return; }
      setSteps(x.steps); setSettled(Array.isArray(x?.settled) ? x.settled : []); setSummary(x.summary ?? null); setErr("");
    } catch (e: any) { setErr(e?.message || "could not read the sampler"); }
  }, []);
  React.useEffect(() => { void load(""); }, [load]);
  const line = headline(summary);
  return (
    <div data-testid="sampler" style={{ margin: "4px 0 18px", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: mono, fontSize: 10.5, color: C.brand, letterSpacing: 1 }}>WHAT TO MEASURE NEXT</span>
        {line && <span data-testid="sampler-headline" style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{line}</span>}
        <span style={{ flex: 1 }} />
        <label style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, display: "flex", alignItems: "center", gap: 5 }}>
          budget $
          <input data-testid="sampler-budget" value={budget} onChange={(e) => setBudget(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void load(budget); }} onBlur={() => void load(budget)}
            placeholder="all" inputMode="decimal" style={{ width: 54, fontFamily: mono, fontSize: 10, padding: "2px 5px", background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 4 }} />
        </label>
      </div>
      <p style={{ fontSize: 11, color: C.dim, lineHeight: 1.65, margin: "7px 0 9px" }}>
        A run is only worth its price where it could <b>change a decision</b>: the cells are ranked by how much of one a
        dollar buys, counting how often real work routes there. Cells nobody routes to are never measured, and a cell
        whose leader is far enough ahead leaves the queue — that is the saving, not the spending.
      </p>
      {err && <div style={{ fontFamily: mono, fontSize: 11, color: C.bad }}>{err}</div>}
      {steps === null && !err && <div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>reading…</div>}
      {steps !== null && steps.length === 0 && !err && (
        <div data-testid="sampler-empty" style={{ fontFamily: mono, fontSize: 10.5, color: C.muted }}>
          nothing is worth buying right now — every cell with traffic is either decided or outside the budget.
        </div>
      )}
      {/* A DECISION THE OPERATOR CANNOT SEE IS NOT A DECISION (2026-09-28). A settled cell used to reach this screen
          as a number in the headline and nothing else — not which cell, not which pairing won, not why. That became
          a real gap the moment a cell could be settled by a TIE broken on price: "these two are indistinguishable,
          so the cheaper one takes it" is the sentence the operator needs, and this is the only place it exists.
          Listed apart from the queue because these are not things to buy. */}
      {settled.length > 0 && (
        <div data-testid="sampler-settled" style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: .6, color: C.dim, textTransform: "uppercase" }}>
            settled — nothing more to buy here
          </div>
          {settled.map((st, i) => (
            <div key={`s|${st.job}|${st.size}|${st.domain}`} data-testid={`sampler-settled-${i}`}
                 style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", marginTop: 5 }}>
              <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{cellName(st)}</span>
              <span style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>{st.why}</span>
            </div>
          ))}
        </div>
      )}
      {steps !== null && steps.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {steps.map((st, i) => {
            const need = NEED[st.need] ?? { word: st.need, color: C.dim, title: "" };
            return (
              <div key={`${st.job}|${st.size}|${st.domain}`} data-testid={`sampler-step-${i}`} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, paddingTop: i === 0 ? 0 : 6 }}>
                <span title={need.title} style={{ fontFamily: mono, fontSize: 9, letterSpacing: .6, color: need.color, border: `1px solid ${need.color}`, borderRadius: 999, padding: "0 6px" }}>{need.word}</span>
                <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{cellName(st)}</span>
                <span data-testid={`sampler-cost-${i}`} style={{ fontFamily: mono, fontSize: 10, color: C.warn }}>{costWord(st)}</span>
                <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}>routed to {st.traffic}×</span>
                <span data-testid={`sampler-close-${i}`} style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{closeness(st)}</span>
                <span style={{ flexBasis: "100%", fontFamily: mono, fontSize: 9.5, color: C.dim, lineHeight: 1.5 }}>{st.why}</span>
              </div>
            );
          })}
          {summary && summary.skipped_usd > 0 && (
            <div data-testid="sampler-skipped" style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
              ${summary.skipped_usd.toFixed(2)} more would be worth measuring but does not fit the budget — raise it to see those cells.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
