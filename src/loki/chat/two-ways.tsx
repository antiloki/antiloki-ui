// THE TWO WAYS TO DO THIS ASK, PRICED BEFORE YOU PICK (HyperAgent's perform()/ai() split, improved — serve/src/two_ways.rs).
//
// antiloki decides silently today: the classifier picks a job, the jobs table picks a winner, and you learn the price
// afterwards. HyperAgent's idea worth stealing is that the choice is VISIBLE. What we can do that they cannot is
// RECOMMEND from measurement — the record holds what each way actually cost and scored on work like this one.
//
// The rule this file will not break: a way nobody has measured shows NO price. "We have not done it this way here" is
// a useful answer; "≈ $0.40" invented from nothing is how a measured product becomes a confident one.
import React from "react";
import { C, mono } from "@/loki/theme";
import { apiGet } from "@/loki/api/client";

export type Way = { key: "thin" | "deep"; label: string; usd: number | null; s: number | null; n: number; quality: number | null };
export type Ways = { job: string; size: string; thin: Way; deep: Way; recommended: "thin" | "deep"; why: string };

/** the price of one way, in the operator's units — or the honest absence of one. Pure. */
export function priceOf(w: Way | null | undefined): string {
  if (!w) return "";
  if (w.usd == null) return "not measured here";
  const secs = w.s == null ? "" : w.s >= 90 ? ` · ${Math.round(w.s / 60)}m` : ` · ${Math.round(w.s)}s`;
  return `≈ $${w.usd < 1 ? w.usd.toFixed(3) : w.usd.toFixed(2)}${secs}`;
}

/** how much evidence is behind a way's numbers, said plainly. A single run is named as a single run. Pure. */
export function evidenceOf(w: Way | null | undefined): string {
  if (!w || w.n <= 0) return "no runs here yet";
  return `${w.n} run${w.n === 1 ? "" : "s"}${w.quality == null ? "" : ` · scores ${w.quality.toFixed(2)}`}`;
}

/** THE NAME OF EACH WAY as a person would say it, never as the code spells it. Pure. */
export const WAY_NAME: Record<"thin" | "deep", string> = { thin: "run it thin", deep: "run it deep" };

export function TwoWays({ ask, onPick }: { ask: string; onPick?: (way: "thin" | "deep") => void }) {
  const [ways, setWays] = React.useState<Ways | null>(null);
  React.useEffect(() => {
    let dead = false;
    if (!ask.trim()) { setWays(null); return; }
    const t = setTimeout(async () => {
      try {
        const r: any = await apiGet(`/api/v1/settings/two-ways?ask=${encodeURIComponent(ask.slice(0, 2000))}`);
        const x = r?.result ?? r;
        if (!dead && x?.thin && x?.deep) setWays(x);
      } catch { /* an older serve has no such route: the strip simply does not appear */ }
    }, 400);   // the ask is being typed; one request per pause, not per keystroke
    return () => { dead = true; clearTimeout(t); };
  }, [ask]);
  if (!ways) return null;
  const pill = (w: Way) => {
    const picked = ways.recommended === w.key;
    return (
      <button key={w.key} data-testid={`two-ways-${w.key}`} data-recommended={picked ? "1" : "0"}
        onClick={() => onPick?.(w.key)} title={`${w.label} — ${evidenceOf(w)}`}
        style={{ display: "inline-flex", gap: 6, alignItems: "baseline", fontFamily: mono, fontSize: 9,
          padding: "2px 8px", borderRadius: 999, cursor: onPick ? "pointer" : "default",
          border: `1px solid ${picked ? C.brand : C.border}`, color: picked ? C.brand : C.dim,
          background: picked ? `color-mix(in oklab, ${C.brand} 12%, transparent)` : "transparent" }}>
        <span style={{ letterSpacing: .5 }}>{WAY_NAME[w.key]}</span>
        <span style={{ color: w.usd == null ? C.muted : C.warn }}>{priceOf(w)}</span>
      </button>
    );
  };
  return (
    <div data-testid="two-ways" style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
      {pill(ways.thin)}
      {pill(ways.deep)}
      <span data-testid="two-ways-why" style={{ fontFamily: mono, fontSize: 9, color: C.muted, minWidth: 0 }}>{ways.why}</span>
    </div>
  );
}
