// CONFIDENCE, AND WHERE IT CAME FROM (operator 2026-09-25: "every answer of AI should show confidence %").
//
// A percentage is easy to print and easy to fake, and this codebase has spent the day fixing numbers that were
// confidently wrong — 0 files written, 0 tokens used, a weight averaged over incomparable evidence. So this
// refuses to produce one it cannot source, and always says which of two very different things it means:
//
//   MEASURED  — how much evidence stands behind the routing choice: the sample size of the merge the router
//               picked for this job. It is a statement about the RECORD, and it is deterministic.
//   STATED    — the model's own word for how sure it was ("high" · "medium" · "low"). It is a statement about
//               a model's self-assessment, which is worth showing and worth labelling as such.
//
// Nothing here scores whether the answer was correct. No one can, at the moment the answer arrives, and a
// number implying otherwise would be the most expensive lie on the screen.

export type Confidence = { pct: number; kind: "measured" | "stated"; why: string };

/** The model's own word, banded. Deliberately coarse: three words cannot carry two significant figures. */
const STATED: Record<string, number> = { high: 85, medium: 60, low: 35 };

/**
 * How confident the RECORD is in this routing choice: `n` runs behind the pairing that was picked.
 *
 * The curve is the same shrink the router itself uses to weight a row — n/(n+1) — so the two agree about what
 * a thin sample is worth. One run is 50%, three is 75%, nine is 90%, and it approaches but never reaches
 * certainty, because a benchmark is not a proof. Pure.
 */
export function measuredPct(runs: number): number {
  if (!Number.isFinite(runs) || runs <= 0) return 0;
  return Math.round((runs / (runs + 1)) * 100);
}

/**
 * The confidence to show beside an answer, or `null` when there is nothing honest to show.
 *
 * Measured evidence wins over a model's self-report, because one is a count and the other is an opinion.
 * Pure — tested.
 */
export function confidenceOf(
  route: { confidence?: string | null } | null | undefined,
  evidence?: { runs?: number } | null,
): Confidence | null {
  const runs = Number(evidence?.runs) || 0;
  if (runs > 0) {
    const pct = measuredPct(runs);
    return { pct, kind: "measured", why: `${runs} recorded run${runs === 1 ? "" : "s"} behind this routing choice — how well measured it is, not whether the answer is right` };
  }
  const word = String(route?.confidence ?? "").trim().toLowerCase();
  const pct = STATED[word];
  if (pct === undefined) return null;   // no evidence and no word: say nothing rather than invent a number
  return { pct, kind: "stated", why: `the router said its confidence was "${word}" — the model's own word, not a measurement` };
}

/** `72% measured` · `60% stated`. Pure. */
export function confidenceLabel(c: Confidence): string { return `${c.pct}% ${c.kind}`; }
