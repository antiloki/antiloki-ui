// DOES "SURE" MEAN "RIGHT"? (operator 2026-09-25, after JEV: "the router already says how sure it is — count how
// often the sure ones actually worked, so the word stops being decoration"). serve/src/calibration.rs holds the curve.
//
// The panel's whole job is to let a claim fail in public. It shows what each grade scored and what the record makes of
// that — including the two answers nobody wants to print: "the grade is decoration" and "the grade is backwards". A
// version that only rendered a pretty bar chart would let a broken grade look measured.
import React from "react";
import { C, mono } from "@/loki/theme";
import { apiGet } from "@/loki/api/client";

export type Bucket = { confidence: string; n: number; quality: number; measured: boolean };
export type Curve = { buckets: Bucket[]; total: number; verdict: string };

/** the tone the verdict deserves: a backwards grade is a finding, decoration is a warning, separation is good news.
 *  Reading the serve's own words rather than re-deciding them here — one source for the judgement. Pure. */
export function verdictTone(verdict: string): "bad" | "warn" | "ok" | "dim" {
  const v = (verdict || "").toLowerCase();
  if (v.includes("backwards")) return "bad";
  if (v.includes("decoration")) return "warn";
  if (v.includes("separates")) return "ok";
  return "dim";
}

/** one bucket in words: "high · 12 runs · 0.86". A grade nobody has used says so instead of showing 0.00, which would
 *  read as "the sure ones always fail". Pure. */
export function bucketLine(b: Bucket): string {
  if (!b.measured || b.n <= 0) return `${b.confidence} · not used yet`;
  return `${b.confidence} · ${b.n} run${b.n === 1 ? "" : "s"} · ${b.quality.toFixed(2)}`;
}

/** the bar width for a bucket, 0..1 of the panel. An unmeasured bucket draws nothing rather than a zero-length bar
 *  that looks like a measured zero. Pure. */
export function barOf(b: Bucket): number {
  return !b.measured || b.n <= 0 ? 0 : Math.max(0.02, Math.min(1, b.quality));
}

export function Calibration() {
  const [curve, setCurve] = React.useState<Curve | null>(null);
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r: any = await apiGet("/api/v1/settings/calibration");
        const x = r?.result ?? r;
        if (dead) return;
        if (!Array.isArray(x?.buckets)) { setErr(x?.error ?? "the serve did not answer with a curve — restart it on the current build"); return; }
        setCurve(x); setErr("");
      } catch (e: any) { if (!dead) setErr(e?.message || "could not read the calibration"); }
    })();
    return () => { dead = true; };
  }, []);
  const tone = verdictTone(curve?.verdict ?? "");
  const color = tone === "bad" ? C.bad : tone === "warn" ? C.warn : tone === "ok" ? C.ok : C.dim;
  return (
    <div data-testid="calibration" style={{ margin: "4px 0 18px", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: mono, fontSize: 10.5, color: C.brand, letterSpacing: 1 }}>DOES “SURE” MEAN “RIGHT”</span>
        {curve && <span data-testid="calibration-verdict" style={{ fontFamily: mono, fontSize: 10, color }}>{curve.verdict}</span>}
      </div>
      <p style={{ fontSize: 11, color: C.dim, lineHeight: 1.65, margin: "7px 0 9px" }}>
        The router grades its own route <b>high · medium · low</b> before the work starts. This is the only place that
        grade is checked against what the run actually did — measured, never acted on: what to do about a grade that
        does not predict anything is your call, and it needs the curve first.
      </p>
      {err && <div style={{ fontFamily: mono, fontSize: 11, color: C.bad }}>{err}</div>}
      {!curve && !err && <div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>reading…</div>}
      {curve && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {curve.buckets.map((b) => (
            <div key={b.confidence} data-testid={`calibration-${b.confidence}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: mono, fontSize: 10, color: b.measured ? C.fg : C.muted, width: 180 }}>{bucketLine(b)}</span>
              <span style={{ flex: 1, height: 6, background: `color-mix(in oklab, ${C.border} 60%, transparent)`, borderRadius: 3, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${barOf(b) * 100}%`, background: b.measured ? C.brand : "transparent" }} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
