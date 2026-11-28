// PLAN AND ACTUAL, PER STEP (the operator 2026-11-14: "plan versus actual, store the estimate and the actual"): what each step usually takes and costs, from the team's own records (the median of its earlier runs), beside what this run took and cost, with the difference.
// Nothing here is guessed: a step with fewer than two runs on record says so and shows no estimate. A human step's waiting is not work and has none.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { nodeBench } from "./api";
import { Icon } from "./icons";
import { money, planVsActual, spanWords, waterfallOf } from "./model";
import type { NodeBench, Run } from "./types";

/** A difference as words and a tone: more than a quarter over is amber, more than a quarter under is green, the rest is the same. Pure. */
export function diffWords(d: number | null): { text: string; tone: "warn" | "ok" | "same" | "none" } {
  if (d === null) return { text: "no usual yet", tone: "none" }; if (d > 0.25) return { text: `+${Math.round(d * 100)}%`, tone: "warn" }; if (d < -0.25) return { text: `−${Math.round(-d * 100)}%`, tone: "ok" }; return { text: "as usual", tone: "same" };
}
const TONE = { warn: "#f5b942", ok: "#34d399", same: "var(--c-dim)", none: "var(--c-dim)" } as const;
export function PlanActual({ team, run }: { team: string; run: Run }) {
  const [bench, setBench] = React.useState<NodeBench[] | null>(null);
  React.useEffect(() => { let stop = false; void nodeBench(team).then((b) => { if (!stop) setBench(b); }); return () => { stop = true; }; }, [team, run.id]);
  const water = React.useMemo(() => waterfallOf(run as any), [run]); const p = React.useMemo(() => planVsActual(water, bench ?? []), [water, bench]);
  if (bench === null) return <div style={{ padding: 16, color: C.muted, fontFamily: nav, fontSize: 13 }}>reading the team's records…</div>;
  const cell = (usual: string | null, actual: string, d: number | null, icon: string) => { const w = diffWords(d); return <span style={{ display: "grid", gap: 2, justifyItems: "end", fontFamily: mono, fontSize: 12 }}><span style={{ display: "inline-flex", gap: 5, alignItems: "center", color: C.fg }}><Icon name={icon} size={11} />{actual}</span><span style={{ color: C.dim, fontSize: 11 }}>{usual === null ? "—" : `usual ${usual}`}</span><span style={{ color: TONE[w.tone], fontSize: 11 }}>{w.text}</span></span>; };
  return (
    <div data-testid="plan-actual" style={{ fontFamily: nav, fontSize: 13, color: C.fg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 16px", borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: 12.5, flexWrap: "wrap" }}>
        <Icon name="gauge" size={14} />
        <span data-testid="plan-total">{p.known ? `${p.known} of ${p.rows.length} steps have a usual: this run took ${spanWords(p.ms)} and ${money(p.cost)} where they usually take ${p.usual_ms > 0 ? spanWords(p.usual_ms) : "no measured time"} and ${money(p.usual_cost)}.` : "No step has two runs on record yet, so there is no usual to compare with. After one more run it appears here."}</span>
      </div>
      {p.rows.map((r) => <div key={r.id} data-testid={`plan-row-${r.id}`} style={{ display: "grid", gridTemplateColumns: "24px minmax(80px, 1fr) 110px 110px", gap: 12, alignItems: "center", padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ color: C.muted, display: "inline-flex" }}><Icon name={r.icon} size={15} /></span>
        <span style={{ minWidth: 0 }}><span style={{ display: "block", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</span><span style={{ display: "block", color: C.dim, fontSize: 11.5 }}>{r.n ? `${r.n} run${r.n === 1 ? "" : "s"} on record` : "not on record"}</span></span>
        {cell(r.usual_ms === null ? null : spanWords(r.usual_ms), spanWords(r.ms), r.d_ms, "clock")}{cell(r.usual_cost === null ? null : money(r.usual_cost), money(r.cost), r.d_cost, "coin")}
      </div>)}
    </div>
  );
}
