// WHERE A BENCHMARK NUMBER CAME FROM (operator's plan II.7: "in the benchmark screen on settings will display the type
// of technologies that were tested", and the plan's own rule that a suggestion must print "not measured here" when
// that is the truth). A weight of 0.81 is not a fact until you know it was measured on work like yours.
//
// TWO AXES, KEPT APART ON PURPOSE. They read alike and mean different things:
//   · domain — the kind of WORK a row was measured on, from the paths the runs touched: frontend · backend · tests ·
//     infra · design · mixed · any. It is a property of the MEASUREMENT.
//   · stack  — what THIS repo is BUILT in, from its manifests: rust · web · node · go · python · dotnet · jvm · mixed.
//     It is a property of the PROJECT.
// "rust" and "backend" are not a mismatch, and "web" and "frontend" are not a match — a comparison between the two
// vocabularies would be an invented answer. So nothing here compares them. Each is printed as itself: the domain says
// what was measured, the stack says what you are pointing it at, and the operator draws the conclusion. Pure — tested.

/** the kinds of work the record can name, in the order a person scans them */
export const DOMAIN_ORDER = ["frontend", "backend", "tests", "infra", "design", "mixed"] as const;

/** `any` and an absent domain are the same thing: the pool an unlabelled row lives in (merges.rs `any_domain`). */
export function domainOf(r: { domain?: string }): string {
  const d = (r.domain ?? "").trim().toLowerCase();
  return d === "" || d === "unknown" ? "any" : d;
}

/** THE KIND OF WORK BEHIND ONE NUMBER, in words. `any` is not dressed up as a domain — a pooled row says it is pooled,
 *  because the plan's whole point is that thin evidence must announce itself rather than borrow confidence. Pure. */
export function measuredOn(r: { domain?: string; n?: number }): string {
  const d = domainOf(r); const n = r.n ?? 0;
  if (n <= 0) return "not measured";
  if (d === "any") return `pooled across kinds of work · ${n} ${n === 1 ? "sample" : "samples"}`;
  if (d === "mixed") return `mixed work · ${n} ${n === 1 ? "sample" : "samples"}`;
  return `${d} work · ${n} ${n === 1 ? "sample" : "samples"}`;
}

/** short form for a tile, where there is room for three words and no more. Pure. */
export function domainWord(r: { domain?: string; n?: number }): string {
  const d = domainOf(r);
  return (r.n ?? 0) <= 0 ? "unmeasured" : d === "any" ? "pooled" : d;
}

/** WHAT THE BENCH ACTUALLY COVERS, counted from the rows themselves — the benchmark screen's own line. Sorted by
 *  samples, so the kind of work with the most evidence leads. `any` is reported as `pooled`, never as coverage of
 *  something. Pure. */
export function domainsTested(rows: { domain?: string; n?: number }[]): { domain: string; rows: number; samples: number }[] {
  const by = new Map<string, { domain: string; rows: number; samples: number }>();
  for (const r of rows) {
    const d = domainOf(r) === "any" ? "pooled" : domainOf(r);
    const e = by.get(d) ?? { domain: d, rows: 0, samples: 0 };
    e.rows += 1; e.samples += r.n ?? 0; by.set(d, e);
  }
  return [...by.values()].sort((a, b) => b.samples - a.samples || a.domain.localeCompare(b.domain));
}

/** the coverage line for the benchmark screen: "tested on backend (132) · frontend (32) · pooled (280)". Empty string
 *  when there is nothing measured, so a caller can omit the line rather than print a lie. Pure. */
export function coverageLine(rows: { domain?: string; n?: number }[]): string {
  const t = domainsTested(rows).filter((d) => d.samples > 0);
  return t.length === 0 ? "" : `tested on ${t.map((d) => `${d.domain} (${d.samples})`).join(" · ")}`;
}

/** WHAT THIS REPO IS BUILT IN — the other axis, straight from the serve's `stack` (gates::stack_at). Printed beside the
 *  coverage, never compared to it. "" when the serve could not tell, which is its own honest answer. Pure. */
export function stackLine(stack: string | undefined): string {
  const s = (stack ?? "").trim();
  return s === "" || s === "any" ? "" : `this repo is ${s}`;
}

/** the controlled/observed split as merges::integrity() reports it. Every field optional: an older serve does not send
 *  it, and a record that cannot be read sends null — both mean "unknown", never "zero". */
export type Evidence = { controlled?: { rows?: number; runs?: number }; observed?: { rows?: number; runs?: number }; quarantined?: { source: string; rows: number; runs: number }[] } | null | undefined;

/** WHAT KIND OF EVIDENCE these numbers are — the third thing the benchmark screen owes the operator beside the work and
 *  the stack. `controlled` = a bench, the same task run on purpose; `observed` = your own runs, whatever they happened
 *  to be. They are not interchangeable and the weight already ranks them apart (merges::quality), so the line counts
 *  them apart too. A quarantined row — a source this build does not recognise, scored zero — is NAMED, because being
 *  silently excluded and not existing are different facts. "" when the serve said nothing, so the caller can omit the
 *  line instead of printing a zero it did not measure. Pure. */
export function evidenceLine(e: Evidence): string {
  if (!e) return "";
  const c = e.controlled?.runs ?? 0, o = e.observed?.runs ?? 0, q = e.quarantined?.length ?? 0;
  if (c === 0 && o === 0 && q === 0) return "";
  const parts: string[] = [];
  if (c > 0) parts.push(`${c} controlled (bench)`);
  if (o > 0) parts.push(`${o} observed (your runs)`);
  if (q > 0) parts.push(`${q} quarantined, scored zero`);
  return `from ${parts.join(" · ")}`;
}

/** THE LANGUAGE A ROW WAS MEASURED ON (II.2) — the record's third axis, and the one a polyglot benchmark fills. Same
 *  rule as the domain: `any`/absent is the POOL, said as a pool, because "measured on nothing in particular" and
 *  "measured on Rust" are different facts and only one of them is about your repo. Pure. */
export function stackOf(r: { stack?: string }): string {
  const s = (r.stack ?? "").trim().toLowerCase();
  return s === "" || s === "unknown" ? "any" : s;
}
/** the short form for a cell: the language, or `pooled`. Pure. */
export function stackWord(r: { stack?: string; n?: number }): string {
  const s = stackOf(r);
  return (r.n ?? 0) <= 0 ? "unmeasured" : s === "any" ? "pooled" : s;
}
/** WHAT LANGUAGES THE BENCH ACTUALLY COVERS — counted from the rows, most evidence first, `any` reported as `pooled`.
 *  "" when nothing is measured, so the caller omits the line rather than printing a lie. Pure. */
export function languagesTested(rows: { stack?: string; n?: number }[]): string {
  const by = new Map<string, number>();
  for (const r of rows) {
    const k = stackOf(r) === "any" ? "pooled" : stackOf(r);
    by.set(k, (by.get(k) ?? 0) + (r.n ?? 0));
  }
  const t = [...by.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return t.length === 0 ? "" : `languages: ${t.map(([k, n]) => `${k} (${n})`).join(" · ")}`;
}

/** DOES THE RECORD SAY ANYTHING AT ALL about a job's winner? A card with no samples must not show a weight as though it
 *  were earned. Pure. */
export function thin(r: { n?: number } | null | undefined, min = 3): boolean { return !r || (r.n ?? 0) < min; }

// ── WHICH BENCHMARK (the fourth axis, 2026-09-26) ──────────────────────────────────────────────────────────────────
// The operator: "keep each bench separated on memory so we can compare". A ministore audit and a SWE-bench grade are
// answers to different questions, and their average answers neither — so `suite` joins the key in the record
// (serve/src/merges.rs) and gets a column and a view here.
//
// ITS EMPTY CASE IS NOT THE OTHERS'. `domain: ""` and `stack: ""` mean POOLED — measured across many, said as a pool.
// `suite: ""` means something else entirely: the row was measured on exactly ONE bench and nobody wrote down which,
// because it predates the column. Calling that `pooled` would invent breadth it never had. It says `unnamed`.

/** the bench a row was measured on; `unnamed` for a row written before the record kept the label. Pure. */
export function suiteOf(r: { suite?: string }): string {
  const s = (r.suite ?? "").trim().toLowerCase();
  return s === "" || s === "unknown" ? "unnamed" : s;
}

/** the short form for a cell. Pure. */
export function suiteWord(r: { suite?: string; n?: number }): string {
  return (r.n ?? 0) <= 0 ? "unmeasured" : suiteOf(r);
}

/** THE CONTROL SUITES — measurement we keep to compare against, which never moves the router. Mirrors
 *  `merges::suite_routes` in the serve; a test holds the two lists in step, because a control suite that quietly
 *  started routing would be the one drift nobody sees. */
export const CONTROL_SUITES = ["swebench", "swe", "control"];

/** does this bench's evidence get a vote in who wins a job? Pure. */
export function suiteRoutes(suite: string): boolean { return !CONTROL_SUITES.includes((suite ?? "").trim().toLowerCase()); }

/** what each bench IS, in one line — including the honest sentence for the rows whose label was never recorded. */
export const SUITE_ABOUT: Record<string, string> = {
  ministore: "the merge bench — one real module through the whole pipeline, audited by 37 behavioural checks",
  polyglot: "Aider polyglot — fixed exercises across six languages, pass/fail on the repo's own tests",
  swtbench: "SWT-bench Verified — 433 real GitHub issues; the test-writer job, graded fail→pass: the generated test must fail on the bug and pass on the fix",
  swebench: "SWE-bench Verified — real GitHub issues; kept as control, audited as a poor fit for this pipeline, and it does not route",
  unnamed: "measured on one bench before the record kept which — kept as it is, never guessed at",
};

/** benches counted from the rows themselves, most evidence first. Pure. */
export function benchesTested(rows: { suite?: string; n?: number }[]): { suite: string; rows: number; samples: number }[] {
  const by = new Map<string, { suite: string; rows: number; samples: number }>();
  for (const r of rows) {
    const k = suiteOf(r); const e = by.get(k) ?? { suite: k, rows: 0, samples: 0 };
    e.rows += 1; e.samples += r.n ?? 0; by.set(k, e);
  }
  return [...by.values()].sort((a, b) => b.samples - a.samples || a.suite.localeCompare(b.suite));
}

/** the benches line for the screen: "benches: ministore (120) · polyglot (30) · swebench (12, control)". A control
 *  suite is MARKED there, so a reader never takes a number that cannot route for one that did. "" when there is
 *  nothing measured. Pure. */
export function benchesLine(rows: { suite?: string; n?: number }[]): string {
  const t = benchesTested(rows).filter((s) => s.samples > 0);
  return t.length === 0 ? "" : `benches: ${t.map((s) => `${s.suite} (${s.samples}${suiteRoutes(s.suite) ? "" : ", control"})`).join(" · ")}`;
}
