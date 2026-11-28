// The rebuild wizard: kicks off a background re-index of the active workspace
// (POST .../onboard/start) and watches its phases. Lives apart from atlas-view
// because the chat composer's trail renders it on EVERY route — importing it
// from atlas-view dragged the whole antiIDE (22k lines, 17 panels) into the
// entry bundle that blocks first paint.
import * as React from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { C, mono } from "@/loki/theme";
import { sectionLabel, chip, btn } from "./atlas-style";
import { useWorkspaces } from "@/loki/api/hooks";
import { useEditedPaths, clearEditedBefore } from "./code-edits";
import {
  onboardStart,
  onboardStatus,
  onboardPause,
  onboardLatest,
  ONBOARD_PHASES,
  type OnboardJob,
  type OnboardStep,
  type OnboardSubStep,
  type OnboardPhase,
  type OnboardProfile,
} from "@/loki/api/codebase";

// ── onboard panel: kick off a background analysis + watch its phases ──────────
const LS_ONBOARD_JOB = "atlas.onboard.job"; // persist the active job so navigation never loses it
const PHASE_LABEL: Record<OnboardPhase, string> = {
  queued: "queued", scope: "scope", ingest: "parse → atlas", metrics: "metrics",
  testmap: "test map", entrypoints: "entry points", constitution: "the constitution's verdict", agents: "gathering the specialists", digest: "digest", memory: "memory", report: "x-ray", rag: "semantic index", register: "register", done: "done",
};

// The phase rail: scope → … → done, the reached ones ✓, the current one ●, the rest dim.
function PhaseRail({ phase, status }: { phase: OnboardPhase; status: "running" | "done" | "error" }) {
  const idx = ONBOARD_PHASES.indexOf(phase);
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
      {ONBOARD_PHASES.map((p, i) => {
        const reached = idx >= 0 && i < idx;
        const current = p === phase && status === "running";
        const errored = status === "error" && p === phase;
        const done = status === "done" || reached;
        const color = errored ? C.bad : current ? C.brand : done ? C.ok : C.dim;
        return (
          <React.Fragment key={p}>
            {i > 0 && <span style={{ color: C.border, fontSize: 10 }}>→</span>}
            <span style={{
              fontFamily: mono, fontSize: 10, color, border: `1px solid ${color}`, borderRadius: 4,
              padding: "1px 6px", opacity: done || current || errored ? 1 : 0.5, fontWeight: current ? 700 : 400,
            }}>
              {current ? "● " : done ? "✓ " : ""}{PHASE_LABEL[p]}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function RankList({ label, items, hue, why }: { label: string; items: { path: string; fan_in: number }[]; hue: string; why?: string }) {
  return (
    <div>
      <div style={sectionLabel}>{label}</div>
      {why && <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, marginBottom: 4, lineHeight: 1.4 }}>{why}</div>}
      {items.length === 0 ? <div style={{ color: C.dim, fontSize: 10.5, fontFamily: mono }}>—</div> : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {items.map((it) => (
            <li key={it.path} title={`${it.path} — ${it.fan_in} file${it.fan_in === 1 ? "" : "s"} import it`} style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "1px 0" }}>
              <span style={{ ...chip, color: hue }}>{it.fan_in}</span>
              <code style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{it.path}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The card shown when a rebuild finishes — updated for what the rebuild BUILDS now
// (operator 2026-07-18): the constitution's verdict + the specialists on call lead;
// the classic atlas numbers follow.
function ProfileCard({ profile }: { profile: OnboardProfile }) {
  const langs = Object.entries(profile.languages ?? {}).sort((a, b) => b[1] - a[1]);
  const con = profile.constitution ?? null;
  const ag = profile.agents ?? null;
  const healthTone = (v: number) => (v >= 85 ? C.ok : v >= 60 ? C.warn : C.bad);
  return (
    <div style={{ marginTop: 10, fontFamily: mono, fontSize: 11 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ color: C.ok, fontWeight: 600 }}>✓ rebuilt</span>
        <span style={{ color: C.dim }}>
          {profile.files} files · {profile.nodes} nodes · {profile.edges} edges
          {profile.parse_errors > 0 ? ` · ${profile.parse_errors} parse errors` : ""}
        </span>
      </div>
      {/* ── the CONSTITUTION's verdict — every file judged against the house laws, $0 ── */}
      {con && con.health != null && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ ...chip, color: healthTone(con.health) }}>§ constitution</span>
          <b style={{ fontSize: 16, color: healthTone(con.health), fontVariantNumeric: "tabular-nums" }}>{con.health}</b>
          <span style={{ color: C.dim }}>
            engineering health · {con.violations ?? 0} violation{(con.violations ?? 0) === 1 ? "" : "s"} · {con.judged ?? 0} judged{con.carried ? `, ${con.carried} replayed from cache` : ""}
          </span>
          <span style={{ color: C.dim, fontSize: 9 }}>open a file → § for its review · 🕸 for the neighborhood</span>
        </div>
      )}
      {con?.error && <div style={{ color: C.warn, fontSize: 10, marginBottom: 6 }}>constitution pass skipped: {con.error}</div>}
      {/* ── the SPECIALISTS gathered — derived from this census, never a catalog ── */}
      {ag && ag.count > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline", marginBottom: 8 }}>
          <span style={{ ...chip, color: C.brand }}>⚉ {ag.count} specialists on call</span>
          {Object.entries(ag.by_category ?? {}).map(([k, v]) => <span key={k} style={{ color: C.dim }}>{k} <b style={{ color: C.muted }}>{v}</b></span>)}
          <span style={{ color: C.dim, fontSize: 9 }}>from {(ag.languages ?? []).join(", ") || "—"}{(ag.frameworks ?? []).length ? ` · ${ag.frameworks.join(", ")}` : ""} — run one from the ⚉ rail, scoped</span>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {langs.map(([k, v]) => <span key={k} style={chip}>{k} {v}</span>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <RankList label="most depended-on" items={profile.top_central} hue={C.brand}
          why="number = fan-in (files importing it). These are the load-bearing walls — change them with care." />
        <RankList label="risky — depended-on, untested" items={profile.top_risky} hue={C.warn}
          why="heavily imported + no test → a break spreads silently. Add a test around each one's main export." />
      </div>
      <div style={{ marginTop: 8, color: C.dim }}>
        coverage: <span style={{ color: C.ok }}>{profile.coverage.covered}</span> tested ·{" "}
        <span style={{ color: C.warn }}>{profile.coverage.uncovered}</span> untested · {profile.coverage.tests} test files
      </div>
      {profile.top_churn && profile.top_churn.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={sectionLabel}>changed most (git churn)</div>
          <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, marginBottom: 4, lineHeight: 1.4 }}>number = commits touching it — where the work happens; churn + complexity + no tests = the next bug's address.</div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {profile.top_churn.map((it) => (
              <li key={it.path} style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "1px 0" }}>
                <span style={{ ...chip, color: C.warn }}>{it.churn}×</span>
                <code style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{it.path}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {profile.top_complex && profile.top_complex.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={sectionLabel}>most complex (cyclomatic)</div>
          <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, marginBottom: 4, lineHeight: 1.4 }}>number = decision paths (branches) — the more, the harder to reason about. The gravity map (▩ in the reader) decomposes WHY each is heavy.</div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {profile.top_complex.map((it) => (
              <li key={it.path} style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "1px 0" }}>
                <span style={{ ...chip, color: C.bad }}>{it.complexity}</span>
                <code style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{it.path}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// The single rebuild affordance: re-index + analyze the ACTIVE WORKSPACE's codebase (no path to
// type — the workspace IS the codebase). Runs the full background onboard pipeline (scope → ingest
// → metrics → coverage → digest → insights) with live per-phase progress. The root is resolved
// server-side from workspaces.root_path; here we only show it for transparency.
// the REBUILD WIZARD — a full modal above the screen: 0–100% bar + phase rail, the live current
// step (family / folder / file, stitch stage), the families strip (done/current/pending, resumed-
// from-checkpoint badge), a rolling activity log, per-phase durations, and job control (pause at a
// family boundary; resume an interrupted run from its checkpoints instead of starting over).
const STITCH_LABEL: Record<string, string> = { imports: "resolving imports", symbols: "building the symbol table", calls: "resolving calls", flow: "resolving state-flow seams", write: "writing the edge graph" };

// What each pipeline stage DOES — shown under the stage name (the wizard is a teaching surface,
// not just a progress bar). Static: descriptions describe the mechanism, the live data shows state.
const PHASE_DESC: Record<string, string> = {
  scope: "Discovers which files are in scope — the folders + extensions the atlas will index.",
  ingest: "Parses every file into the atlas, one folder-family at a time (bounded memory), then stitches all families into one graph.",
  metrics: "The code METRICS dashboard (deterministic, no AI): per-file fan-in (how depended-on) · fan-out (how many it depends on) · LOC · cyclomatic complexity · symbol density · test-coverage — computed over the stitched graph. Git churn (recent-commit count) is one added signal, not the whole thing.",
  testmap: "Maps test files to the source files they cover.",
  entrypoints: "Scans the external surface: HTTP routes, UI handlers, database touchpoints.",
  constitution: "Judges every file against the ratified house laws (seeded starter library + your additions) — detectors over the AST + graph, deterministic, zero AI. Law-selection transparency (which laws apply here and WHY) is coming as its own trace.",
  agents: "Derives the specialist registry from the fresh census.",
  digest: "AI architecture narrative — opt-in only, the rebuild stays deterministic.",
  memory: "LAST step by design: snapshots the finished rebuild (counts, hotspots, coverage, verdicts) as one durable memory — runs only when every other piece is in.",
  report: "The X-RAY: grades the codebase (health/risk score + structural smells, deterministic) and refreshes docs, descriptions and the design-system tables.",
  register: "THE ONLY LIVE WRITE: one atomic transaction swaps the finished staging atlas into the live DB. Until this instant the app serves the complete OLD atlas — never a half-built one.",
  rag: "The SEMANTIC INDEX (graph-RAG): embeds the fresh atlas + workspace rows locally (bge-base, offline) into memory.rag_chunks and builds the recall graph — so the agents can semantically retrieve the right code from the first card. Skipped if the embed model is not cached yet.",
};

// Total counters — a ticking elapsed clock + the REGRESSIVE token countdown (the codebase has a known
// total token size; ingest consumes it family by family, so "tokens remaining" falls to 0). After the
// build it freezes on the finals. Nodes/edges are the graph size as it fills.
function CounterBar({ job, detail, startedAt, terminal }: { job: OnboardJob | null; detail: OnboardJob["detail"]; startedAt: number | null; terminal: boolean }) {
  const [, force] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => { if (terminal || !startedAt) return; const t = setInterval(force, 1000); return () => clearInterval(t); }, [terminal, startedAt]);
  const elapsed = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
  const tok = detail?.tokens ?? null;
  const remaining = tok ? Math.max(0, tok.total - tok.done) : null;
  const pct = tok && tok.total > 0 ? Math.round((tok.done / tok.total) * 100) : null;
  const cur = job?.detail?.current;
  const nodes = cur && "stage" in cur ? cur.nodes : (job?.profile?.nodes ?? null);
  const cell = (label: string, value: React.ReactNode, accent?: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 66 }}>
      <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      <span style={{ fontFamily: mono, fontSize: 13, color: accent ?? C.fg, fontWeight: 600 }}>{value}</span>
    </div>
  );
  const fmtK = (n: number) => (n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "k" : String(n));
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-end", marginTop: 10, padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.bg, flexWrap: "wrap" }}>
      {cell("elapsed", `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`)}
      {tok && cell("tokens left", terminal ? "0" : fmtK(remaining ?? 0), remaining && remaining > 0 ? C.warn : C.ok)}
      {tok && (
        <div style={{ flex: 1, minWidth: 120, display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>{fmtK(tok.done)} / {fmtK(tok.total)} tokens processed{pct != null ? ` · ${terminal ? 100 : pct}%` : ""}</span>
          <div style={{ height: 5, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${terminal ? 100 : (pct ?? 0)}%`, height: "100%", background: C.brand, transition: "width 0.5s ease" }} />
          </div>
        </div>
      )}
      {nodes != null && cell("nodes", fmtK(nodes), C.brand)}
      {detail?.signals?.total != null && cell("signals", String(detail.signals.total), detail.signals.counts.high > 0 ? C.bad : C.dim)}
    </div>
  );
}

// ── the PIPELINE — the harness-style stage list: every phase a stage node on a vertical rail,
//    ✓/✗/●/○ status, description, duration; expand (▸/▾) for sub-steps with live progress bars,
//    info lines, inline errors, and (under ingest) the per-family table. Current + failed stages
//    auto-expand; anything is clickable. This IS the window's main content — no separate rail/strip.
function Pipeline({ job, detail, runStatus, failed, liveStep, famTotal }: {
  job: OnboardJob | null; detail: OnboardJob["detail"]; runStatus: string; failed: boolean;
  liveStep: OnboardStep | null; famTotal: number;
}) {
  // FAMILY-FIRST presentation (operator 2026-07-23): the pipeline reads the way the build actually
  // runs — each folder-family goes E2E (parse · surface · design) one after another, and only the
  // whole-graph work (stitch + metrics + testmap + constitution + …) is a single GLOBAL section at
  // the end. Phases are an implementation detail of the global half, not the top-level story.
  // GLOBAL section = only whole-graph work. entrypoints is dropped here: its detection is PER-FAMILY
  // (shown in each family's decomposed steps below) and its finalize is a trivial snapshot write.
  const phases = ONBOARD_PHASES.filter((p) => p !== "done" && p !== "ingest" && p !== "scope" && p !== "entrypoints");
  const [openFam, setOpenFam] = React.useState<Set<number>>(new Set());
  const toggleFam = (ix: number) => setOpenFam((o) => { const n = new Set(o); if (n.has(ix)) n.delete(ix); else n.add(ix); return n; });
  const jobPhase = (job?.phase ?? "scope") as OnboardPhase;
  const inIngest = jobPhase === "ingest" || jobPhase === "scope";
  const ingestDone = ONBOARD_PHASES.indexOf(jobPhase) > ONBOARD_PHASES.indexOf("ingest") || runStatus === "done";
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const [touched, setTouched] = React.useState<Set<string>>(new Set());
  const toggle = (ph: string) => { setTouched((t) => new Set(t).add(ph)); setOpen((o) => { const n = new Set(o); if (n.has(ph)) n.delete(ph); else n.add(ph); return n; }); };
  React.useEffect(() => {
    setOpen((o) => {
      const n = new Set(o);
      if (!touched.has(jobPhase) && runStatus !== "done") n.add(jobPhase);
      for (const ph of phases) if (!touched.has(ph) && (detail?.steps?.[ph] ?? []).some((s) => s.status === "fail")) n.add(ph);
      return n;
    });
  }, [jobPhase, runStatus, detail?.steps, phases, touched]);

  // stuck-timer: how long since the live step last MOVED — "slow" is visibly alive-and-costed
  const stuckRef = React.useRef<{ key: string; t: number }>({ key: "", t: Date.now() });
  const liveKey = liveStep ? `${liveStep.files_done}|${liveStep.file ?? ""}` : "";
  if (liveKey !== stuckRef.current.key) stuckRef.current = { key: liveKey, t: Date.now() };
  const stuckSec = Math.round((Date.now() - stuckRef.current.t) / 1000);

  const fmtMs = (ms: number) => (ms >= 1000 ? (ms / 1000).toFixed(1) + "s" : ms + "ms");
  const subIcon2 = (s: string) => (s === "ok" ? "✓" : s === "fail" ? "✗" : s === "run" ? "●" : "○");
  const subCol2 = (s: string) => (s === "ok" ? C.ok : s === "fail" ? C.bad : s === "run" ? C.warn : C.muted);
  const fams = detail?.family_list ?? [];
  const stitchSteps = (detail?.steps?.ingest ?? []).filter((s) => s.name.startsWith("stitch"));
  const parseStep = (detail?.steps?.ingest ?? []).find((s) => !s.name.startsWith("stitch"));

  // one global stage row (the stitch pseudo-stage + every real phase render through this)
  const stageRow = (key: string, label: string, desc: string, status: string, ms: number | null | undefined, subs: OnboardSubStep[]) => {
    const isOpen = open.has(key) && subs.length > 0;
    const ICON: Record<string, string> = { ok: "✓", fail: "✗", run: "●", pending: "○", warn: "⚠" };
    const COL: Record<string, string> = { ok: C.ok, fail: C.bad, run: C.warn, pending: C.muted, warn: C.warn };
    return (
      <div key={key} style={{ position: "relative", paddingLeft: 22, paddingBottom: 7 }}>
        <span style={{ position: "absolute", left: 2, top: 1, width: 13, textAlign: "center", fontFamily: mono, fontSize: 11, color: COL[status], background: C.panel, animation: status === "run" ? "wizPulse 1.2s ease-in-out infinite" : undefined }}>{ICON[status]}</span>
        <div onClick={() => subs.length > 0 && toggle(key)} style={{ cursor: subs.length > 0 ? "pointer" : "default" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
            <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: status === "pending" ? C.muted : status === "fail" ? C.bad : C.fg }}>{label}</span>
            {subs.length > 0 && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{isOpen ? "▾" : "▸"}</span>}
            <span style={{ flex: 1 }} />
            {ms != null && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{(ms / 1000).toFixed(1)}s</span>}
          </div>
          <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, lineHeight: 1.45, maxWidth: 520 }}>{desc}</div>
        </div>
        {isOpen && (
          <div style={{ marginTop: 4, borderLeft: `1px solid ${C.border}`, paddingLeft: 10 }}>
            {subs.map((sst, i) => (
              <div key={i} style={{ padding: "1.5px 0" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                  <span style={{ fontFamily: mono, fontSize: 10, color: subCol2(sst.status), animation: sst.status === "run" ? "wizPulse 1.2s ease-in-out infinite" : undefined }}>{subIcon2(sst.status)}</span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: sst.status === "fail" ? C.bad : C.dim, flex: 1 }}>{sst.name}</span>
                  {sst.ms != null && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{fmtMs(sst.ms)}</span>}
                </div>
                {sst.status === "run" && sst.progress && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 16, marginTop: 2 }}>
                    {sst.progress.total ? (
                      <>
                        <div style={{ flex: 1, maxWidth: 220, height: 4, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, Math.round((sst.progress.done / sst.progress.total) * 100))}%`, height: "100%", background: C.warn }} />
                        </div>
                        <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{sst.progress.done.toLocaleString()}/{sst.progress.total.toLocaleString()}</span>
                      </>
                    ) : (
                      <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{sst.progress.done.toLocaleString()} processed…</span>
                    )}
                  </div>
                )}
                {sst.info && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, paddingLeft: 16, wordBreak: "break-all", lineHeight: 1.5 }}>{sst.info}</div>}
                {sst.error && <div style={{ fontFamily: mono, fontSize: 9.5, color: sst.status === "fail" ? C.bad : C.muted, paddingLeft: 16, wordBreak: "break-all", lineHeight: 1.5 }}>{sst.error}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const phaseStatus = (ph: string): "ok" | "fail" | "run" | "pending" | "warn" => {
    const subs = detail?.steps?.[ph] ?? [];
    const phIx = ONBOARD_PHASES.indexOf(ph as OnboardPhase);
    const curIx = ONBOARD_PHASES.indexOf(jobPhase);
    if (failed && ph === jobPhase) return "fail";
    if (ph === jobPhase && (runStatus === "running" || runStatus === "pause_requested")) return "run";
    if (phIx < curIx || runStatus === "done") return subs.some((s) => s.status === "fail") ? "warn" : "ok";
    return "pending";
  };

  return (
    <div>
      {/* ── SECTION 1: THE FAMILIES — each one E2E: parse · surface · design ── */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>families — e2e per family</span>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>
          {famTotal > 0 ? `${detail?.families?.done ?? 0}/${famTotal}` : "…"}{(detail?.families?.reused ?? 0) > 0 ? ` · ${detail!.families!.reused} ↻` : ""}
        </span>
        {parseStep?.ms != null && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{(parseStep.ms / 1000).toFixed(1)}s</span>}
      </div>
      <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, lineHeight: 1.45, margin: "2px 0 6px" }}>
        Each folder-family runs end-to-end while its source is in hand: parse → atlas nodes (f·n) · detect the external surface (e) · extract the design system (t·c). Checkpointed — a crash or pause resumes here, not from scratch.
      </div>
      <div style={{ maxHeight: 240, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", background: C.bg }}>
        {fams.length === 0 && (inIngest || runStatus === "running") && !liveStep && <div style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>waiting for the first family…</div>}
        {fams.map((f) => {
          const isOpen = openFam.has(f.ix);
          // the E2E steps THIS family ran, each with its output — the per-family decomposition
          const famSteps: Array<{ label: string; out: string; on: boolean }> = [
            { label: "parse → atlas", out: `${f.files} files → ${f.nodes} nodes`, on: true },
            { label: "surface detect", out: (f.entries ?? 0) > 0 ? `${f.entries} entry points` : "none", on: (f.entries ?? 0) > 0 },
            { label: "design extract", out: (f.tokens ?? 0) + (f.comps ?? 0) > 0 ? `${f.tokens ?? 0} tokens · ${f.comps ?? 0} components` : "none", on: (f.tokens ?? 0) + (f.comps ?? 0) > 0 },
            { label: "signal scan", out: (f.signals ?? 0) > 0 ? `${f.signals} signals` : "clean", on: (f.signals ?? 0) > 0 },
          ];
          return (
            <div key={f.ix}>
              <div onClick={() => toggleFam(f.ix)} style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "1px 0", cursor: "pointer" }}>
                <span style={{ fontFamily: mono, fontSize: 9.5, color: f.errors ? C.warn : C.ok }}>✓</span>
                <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{isOpen ? "▾" : "▸"}</span>
                <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, minWidth: 20, textAlign: "right" }}>{f.ix}.</span>
                <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.folder}>{f.folder}</span>
                {f.reused && <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }} title="reloaded from checkpoint — not reparsed">↻</span>}
                {f.errors > 0 && <span style={{ fontFamily: mono, fontSize: 9, color: C.bad }}>{f.errors} err</span>}
                <span style={{ fontFamily: mono, fontSize: 9, color: C.ok }} title="parsed (files · nodes)">{f.files}f·{f.nodes}n</span>
                <span style={{ fontFamily: mono, fontSize: 9, color: (f.entries ?? 0) > 0 ? C.brand : C.muted }} title="entry points">{f.entries ?? 0}e</span>
                <span style={{ fontFamily: mono, fontSize: 9, color: (f.tokens ?? 0) + (f.comps ?? 0) > 0 ? C.brand : C.muted }} title="design tokens · components">{f.tokens ?? 0}t·{f.comps ?? 0}c</span>
                <span style={{ fontFamily: mono, fontSize: 9, color: (f.signals ?? 0) > 0 ? C.warn : C.muted }} title="signals (safety · debt · i18n)">{f.signals ?? 0}s</span>
                <span style={{ fontFamily: mono, fontSize: 9, color: C.muted, minWidth: 38, textAlign: "right" }}>{fmtMs(f.ms)}</span>
              </div>
              {isOpen && (
                <div style={{ marginLeft: 26, borderLeft: `1px solid ${C.border}`, paddingLeft: 8, marginBottom: 3 }}>
                  {famSteps.map((st, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "0.5px 0" }}>
                      <span style={{ fontFamily: mono, fontSize: 9, color: st.on ? C.ok : C.muted }}>{st.on ? "✓" : "○"}</span>
                      <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, minWidth: 90 }}>{st.label}</span>
                      <span style={{ fontFamily: mono, fontSize: 9, color: st.on ? C.fg : C.muted }}>{st.out}</span>
                    </div>
                  ))}
                  {f.slowest && f.slowest.ms > 1500 && (
                    <div style={{ fontFamily: mono, fontSize: 9, color: C.warn, wordBreak: "break-all" }}>⚠ slowest file: {f.slowest.file} · {fmtMs(f.slowest.ms)}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {runStatus === "running" && liveStep?.stage === "map" && (
          <div style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "1px 0" }}>
            <span style={{ fontFamily: mono, fontSize: 9.5, color: C.warn, animation: "wizPulse 1.2s ease-in-out infinite" }}>●</span>
            <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, minWidth: 24, textAlign: "right" }}>{liveStep.family_index}.</span>
            <span style={{ fontFamily: mono, fontSize: 9.5, color: C.fg, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={liveStep.folder ?? "."}>{liveStep.folder ?? "."} — parse + surface + design…</span>
            {stuckSec > 10 && <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }} title={liveStep.file ? `still on ${liveStep.file}` : "no movement"}>{stuckSec}s on {liveStep.file ? liveStep.file.split("/").pop() : "this step"}</span>}
            <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{liveStep.files_done.toLocaleString()}/{liveStep.files_total.toLocaleString()}f</span>
          </div>
        )}
        {famTotal > (fams.length + (runStatus === "running" && liveStep?.stage === "map" ? 1 : 0)) && (
          <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, paddingLeft: 30 }}>○ … {famTotal - fams.length - (runStatus === "running" && liveStep?.stage === "map" ? 1 : 0)} families pending</div>
        )}
      </div>

      {/* ── SECTION 2: GLOBAL — the whole-graph work that can only run once every family is in ── */}
      <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: 1, margin: "14px 0 2px" }}>global — whole-graph (after all families)</div>
      <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, lineHeight: 1.45, marginBottom: 6 }}>
        Cross-family properties (imports, calls, fan-in, coverage, laws, score) only exist on the stitched graph — they run once, over everything.
      </div>
      <div style={{ position: "relative", paddingLeft: 2 }}>
        <div style={{ position: "absolute", left: 8, top: 10, bottom: 10, width: 1, background: C.border }} />
        {stageRow("stitch", "stitch the families", "Binds all family graphs into one: resolve imports → symbol table → calls → state-flow → write the edge graph.",
          inIngest && liveStep?.stage === "stitch" ? "run" : ingestDone ? "ok" : "pending",
          stitchSteps.reduce((a, s) => a + (s.ms ?? 0), 0) || null, stitchSteps)}
        {phases.map((ph) => (
          <React.Fragment key={ph}>
            {stageRow(ph, PHASE_LABEL[ph] ?? ph, PHASE_DESC[ph] ?? "", phaseStatus(ph), detail?.phase_ms?.[ph], detail?.steps?.[ph] ?? [])}
            {/* THE DOCKET — the court case, rendered under the constitution stage when open: the
                detected frameworks are the evidence; each law shows its verdict + WHY it applies */}
            {/* METRICS decomposed — the ONE pass, its 6 signals shown as outputs (not separate skills) */}
            {ph === "metrics" && open.has("metrics") && detail?.metrics_signals && (
              <div style={{ marginLeft: 22, marginBottom: 8, border: `1px solid ${C.border}`, borderRadius: 6, background: C.bg, padding: "6px 10px" }}>
                <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, marginBottom: 3 }}>one deterministic pass · these signals share the file loop (not separate skills)</div>
                {Object.entries(detail.metrics_signals).map(([sig, v]) => (
                  <div key={sig} style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "0.5px 0" }}>
                    <span style={{ fontFamily: mono, fontSize: 9.5, color: C.ok }}>✓</span>
                    <span style={{ fontFamily: mono, fontSize: 9.5, color: C.fg, minWidth: 72 }}>{sig}</span>
                    <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.top}>{v.top}</span>
                    <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>{v.unit}</span>
                  </div>
                ))}
              </div>
            )}
            {/* SPECIALISTS — the derived reviewer roster, appearing as circles (the chosen ones) */}
            {ph === "agents" && open.has("agents") && (detail?.specialists?.length ?? 0) > 0 && (
              <div style={{ marginLeft: 22, marginBottom: 8, border: `1px solid ${C.border}`, borderRadius: 6, background: C.bg, padding: "8px 10px" }}>
                <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, marginBottom: 6 }}>the specialists this codebase calls onto the bench — derived, deterministic</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {detail!.specialists!.map((sp, i) => {
                    const cat = sp.category;
                    const col = cat === "specialist" ? C.brand : cat === "language" ? C.ok : cat === "framework" ? C.warn : cat === "axis" ? "#a78bfa" : C.dim;
                    const initials = sp.title.replace(/\s*Reviewer$/, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                    return (
                      <div key={i} title={`${sp.title} · ${cat}`}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%",
                          border: `1.5px solid ${col}`, background: `color-mix(in oklab, ${col} 16%, transparent)`, color: col,
                          fontFamily: mono, fontSize: 9, fontWeight: 700, animation: `wizPop .35s ease-out ${Math.min(i * 45, 1400)}ms both` }}>
                        {initials}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* SIGNALS (waves B/C/D) — the deterministic findings roll up under the report/x-ray stage */}
            {ph === "report" && open.has("report") && detail?.signals && detail.signals.total > 0 && (
              <div style={{ marginLeft: 22, marginBottom: 8, border: `1px solid ${C.border}`, borderRadius: 6, background: C.bg, padding: "6px 10px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>signals</span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{detail.signals.total} total</span>
                  {detail.signals.counts.high > 0 && <span style={{ fontFamily: mono, fontSize: 10, color: C.bad }}>{detail.signals.counts.high} high</span>}
                  {detail.signals.counts.medium > 0 && <span style={{ fontFamily: mono, fontSize: 10, color: C.warn }}>{detail.signals.counts.medium} med</span>}
                  <span style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>{detail.signals.counts.low} low</span>
                </div>
                {Object.entries(detail.signals.by_category).map(([cat, kinds]) => (
                  <div key={cat} style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "1px 0", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: mono, fontSize: 9.5, color: C.fg, minWidth: 54, textTransform: "capitalize" }}>{cat}</span>
                    {Object.entries(kinds).map(([kind, sevs]) => {
                      const n = Object.values(sevs).reduce((a, b) => a + b, 0);
                      const worst = sevs.high ? C.bad : sevs.medium ? C.warn : C.dim;
                      return <span key={kind} style={{ fontFamily: mono, fontSize: 9, color: worst, border: `1px solid ${C.border}`, borderRadius: 3, padding: "0 5px" }} title={`${kind}: ${n}`}>{kind} {n}</span>;
                    })}
                  </div>
                ))}
              </div>
            )}
            {ph === "constitution" && open.has("constitution") && detail?.docket && (
              <div style={{ marginLeft: 22, marginBottom: 8, border: `1px solid ${C.border}`, borderRadius: 6, background: C.bg, padding: "6px 10px" }}>
                <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>the docket — which laws govern, and why</div>
                <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, margin: "3px 0 5px" }}>
                  evidence: frameworks <span style={{ color: C.brand }}>{detail.docket.frameworks.join(", ")}</span> · {detail.docket.laws.filter((l) => l.active).length}/{detail.docket.laws_scoring} laws apply{detail.docket.exceptions ? ` · ${detail.docket.exceptions} exception(s) honored` : ""}
                </div>
                <div style={{ maxHeight: 160, overflowY: "auto" }}>
                  {detail.docket.laws.map((l) => (
                    <div key={l.key} style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "0.5px 0" }} title={l.title}>
                      <span style={{ fontFamily: mono, fontSize: 9.5, color: l.active ? C.ok : C.muted }}>{l.active ? "✓" : "−"}</span>
                      <span style={{ fontFamily: mono, fontSize: 9.5, color: l.active ? C.fg : C.muted, minWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.key}</span>
                      <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.why}</span>
                      <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>w{l.weight}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
function RebuildOverlay({ job, starting, err, pausing, onClose, onPause, onResume }: { job: OnboardJob | null; starting: boolean; err: string | null; pausing: boolean; onClose: () => void; onPause: () => void; onResume: () => void }) {
  const phase = job?.phase ?? "scope";
  const idx = ONBOARD_PHASES.indexOf(phase);
  const detail = job?.detail ?? null;
  const cur = detail?.current ?? null;
  const step = cur && "stage" in cur ? cur : null; // the live ingest map/stitch step (null on other phases)
  const steps = ONBOARD_PHASES.length - 1;
  const status = job?.status ?? "running";
  const failed = status === "error" || status === "failed";
  const paused = status === "paused" || status === "pause_requested";
  // Base % from the phase rail; during the (long) ingest phase, blend the per-folder-family
  // map-reduce sub-progress so the bar advances smoothly instead of parking on the ingest tick.
  let pct = status === "done" ? 100 : starting || !job ? 6 : idx >= 0 ? Math.max(6, Math.round((idx / steps) * 100)) : 6;
  if (!failed && phase === "ingest" && step && step.files_total > 0) {
    const base = (idx / steps) * 100;
    const span = 100 / steps;
    const frac = step.stage === "stitch" ? 0.95 : Math.min(0.95, step.files_done / step.files_total);
    pct = Math.max(pct, Math.round(base + span * frac));
  }
  const terminal = status === "done" || failed;
  // elapsed clock anchor: the job's created_at (falls back to first-seen). Frozen once terminal.
  const startedAt = React.useMemo(() => (job?.created_at ? new Date(job.created_at + "Z").getTime() : Date.now()), [job?.created_at]);
  const barColor = failed ? C.bad : paused ? C.warn : C.brand;
  const title = status === "done" ? "Rebuild complete" : failed ? "Rebuild failed" : status === "pause_requested" ? "Pausing…" : status === "paused" ? "Rebuild paused" : "Rebuilding the codebase";

  // families strip: done ✓ · current ● · pending · (compact cells; capped so a 200-family repo stays sane)
  const famTotal = detail?.families?.total ?? step?.families_total ?? 0;

  // rolling log (auto-scroll pinned to the bottom)
  const logRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [detail?.log?.length, detail?.log?.[detail.log.length - 1]?.line]);

  const currentLine = err ? null
    : step?.stage === "paused" ? "stopping at the family boundary — completed families stay checkpointed…"
    : step?.stage === "stitch" ? `stitch · ${STITCH_LABEL[step.step ?? ""] ?? "binding families"} · ${famTotal.toLocaleString()} families · ${step.nodes.toLocaleString()} nodes`
    : step?.stage === "map" ? `family ${step.family_index.toLocaleString()}/${step.families_total.toLocaleString()} · ${step.folder ?? "."} · ${step.files_done.toLocaleString()}/${step.files_total.toLocaleString()} files · ${step.nodes.toLocaleString()} nodes${step.file ? ` · ${step.file}` : ""}`
    : `${PHASE_LABEL[phase] ?? phase}…`;

  // sub-steps, grouped in pipeline order — the "which piece broke" panel
  const stepPhases = ONBOARD_PHASES.filter((ph) => (detail?.steps?.[ph] ?? []).length > 0);
  const subIcon = (s: string) => s === "ok" ? "✓" : s === "fail" ? "✗" : s === "run" ? "●" : "○";
  const subColor = (s: string) => s === "ok" ? C.ok : s === "fail" ? C.bad : s === "run" ? C.warn : C.muted;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`@keyframes wizPulse{0%,100%{opacity:1}50%{opacity:.35}}@keyframes wizPop{0%{opacity:0;transform:scale(.3)}70%{transform:scale(1.12)}100%{opacity:1;transform:scale(1)}}`}</style>
      <div style={{ width: 980, maxWidth: "96vw", maxHeight: "90vh", overflowY: "auto", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 24px", boxShadow: "0 14px 44px rgba(0,0,0,0.45)" }}>
        {/* header: title · root · controls · % — full width */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
          <span style={{ fontFamily: mono, fontSize: 14, color: C.fg, fontWeight: 700 }}>{title}</span>
          {job?.root && <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }} title={job.root}>{job.root}</span>}
          {detail?.resumed && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.warn, border: `1px solid ${C.border}`, borderRadius: 4, padding: "0 5px" }} title="this run resumed from family checkpoints — completed families were not reparsed">↻ resumed</span>}
          <span style={{ flex: 1 }} />
          {status === "running" && !starting && (
            <button onClick={onPause} disabled={pausing} style={{ ...btn(), padding: "3px 10px", fontSize: 10.5 }} title="stop at the next family boundary — completed families stay checkpointed, resume continues from there">
              {pausing ? "pausing…" : "⏸ pause"}
            </button>
          )}
          {(status === "paused" || failed) && (
            <button onClick={onResume} style={{ ...btn(true), padding: "3px 10px", fontSize: 10.5 }} title="continue from the last completed family checkpoint — no full restart">
              ▶ resume from checkpoint
            </button>
          )}
          <button onClick={onClose} style={{ ...btn(), padding: "3px 10px", fontSize: 10.5 }} title="keep rebuilding in the background — the app stays fully usable; reopen from the ◉ button">− background</button>
          <span style={{ fontFamily: mono, fontSize: 18, color: barColor, fontWeight: 700 }}>{pct}%</span>
        </div>
        <div style={{ height: 9, background: C.bg, borderRadius: 5, overflow: "hidden", border: `1px solid ${C.border}` }}>
          <div style={{ width: `${pct}%`, height: "100%", background: barColor, transition: "width 0.4s ease" }} />
        </div>

        {/* the live current step — full width */}
        <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, marginTop: 10, wordBreak: "break-all", minHeight: 16 }}>
          {err ? <span style={{ color: C.bad }}>{err}</span> : failed ? <span style={{ color: C.bad }}>{job?.error}</span> : currentLine}
        </div>

        {/* ── TOTAL COUNTERS: elapsed (up) · tokens REMAINING (regressive countdown, consumed family by
            family during ingest) · nodes · edges — the one-glance "how far, how much left" ── */}
        <CounterBar job={job} detail={detail} startedAt={startedAt} terminal={terminal} />


        {/* ── TWO COLUMNS: everything on the LEFT · the activity log on the RIGHT (full height) ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18, marginTop: 12, alignItems: "stretch" }}>
          <div style={{ minWidth: 0 }}>
            <Pipeline job={job} detail={detail} runStatus={status} failed={failed} liveStep={step} famTotal={famTotal} />
            {job?.status === "done" && job.profile ? <ProfileCard profile={job.profile} /> : null}
          </div>

          {/* RIGHT column: the rolling activity feed — every phase, family, stitch step and error,
              full column height, categorized + color-coded (phase dividers · families · stitch ·
              checkpoints · errors) so the stream reads as a story, not a wall of gray. */}
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", alignSelf: "stretch" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>activity</span>
              <span style={{ flex: 1 }} />
              {detail?.families && <span style={{ fontFamily: mono, fontSize: 9, color: C.brand }}>{detail.families.done}/{detail.families.total} fam</span>}
              {(detail?.log ?? []).some((l) => l.line.startsWith("ERROR")) && (
                <span style={{ fontFamily: mono, fontSize: 9, color: C.bad }}>{(detail?.log ?? []).filter((l) => l.line.startsWith("ERROR")).length} err</span>
              )}
            </div>
            <div ref={logRef} style={{ flex: 1, minHeight: 480, maxHeight: "66vh", overflowY: "auto", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 9px" }}>
              {(detail?.log ?? []).length === 0 && <div style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>waiting for the first event…</div>}
              {(detail?.log ?? []).map((l, i) => {
                const ln = l.line;
                // categorize by prefix → icon + color, so each event class is scannable at a glance
                const cat = ln.startsWith("ERROR") ? { icon: "✗", color: C.bad, bold: false }
                  : ln.startsWith("phase:") ? { icon: "▸", color: C.brand, bold: true, divider: true }
                  : /^family .* done/.test(ln) ? { icon: "✓", color: ln.includes("error(s)") ? C.warn : C.ok }
                  : ln.startsWith("family ") ? { icon: "◇", color: C.dim }
                  : ln.startsWith("stitch:") ? { icon: "⧗", color: C.brand }
                  : ln.startsWith("ingest done") ? { icon: "✓", color: C.ok, bold: true }
                  : ln.startsWith("done ·") ? { icon: "★", color: C.ok, bold: true }
                  : ln.startsWith("pause") || ln.startsWith("paused") ? { icon: "⏸", color: C.warn, bold: true }
                  : ln.startsWith("slow file:") ? { icon: "⚠", color: C.warn }
                  : ln.includes("checkpoint") ? { icon: "↻", color: C.warn }
                  : { icon: "·", color: C.dim };
                return (
                  <div key={i} style={{ fontFamily: mono, fontSize: 10, lineHeight: 1.75, wordBreak: "break-all", ...(cat.divider ? { borderTop: `1px solid ${C.border}`, marginTop: 3, paddingTop: 3 } : {}) }}>
                    <span style={{ color: C.muted }}>{l.t}</span>{" "}
                    <span style={{ color: cat.color }}>{cat.icon}</span>{" "}
                    <span style={{ color: cat.color, fontWeight: cat.bold ? 600 : 400 }}>{ln}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {(terminal || paused) ? (
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={onClose} style={btn(job?.status === "done")}>{job?.status === "done" ? "done" : "close"}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}


/** THE FULL REBUILD WINDOW BELONGS TO X-RAY (operator 2026-09-29: "onclick rebuild in the dropdown menu is showing the window of rebuilding - that window only should appear on x-ray; other screens get the floating mini preview at the bottom right"). Pure - tested. */
export const wizardAllowedHere = (pathname: string): boolean => pathname === "/operations/atlas" || pathname.startsWith("/operations/atlas/");

const phaseWord = (job: OnboardJob | null): string => {
  const cur = job?.detail?.current;
  if (cur && "stage" in cur && cur.stage === "map") return `family ${cur.family_index}/${cur.families_total}`;
  if (cur && "stage" in cur && cur.stage === "stitch") return "stitching";
  return PHASE_LABEL[job?.phase ?? "scope"] ?? job?.phase ?? "…";
};
const miniPct = (job: OnboardJob | null): number => {
  const cur = job?.detail?.current;
  const frac = cur && "stage" in cur && cur.files_total > 0 ? cur.files_done / cur.files_total : null;
  const idx = ONBOARD_PHASES.indexOf(job?.phase ?? "scope");
  return Math.min(97, frac != null && job?.phase === "ingest" ? Math.round((idx + frac) / (ONBOARD_PHASES.length - 1) * 100) : Math.max(4, Math.round(idx / (ONBOARD_PHASES.length - 1) * 100)));
};
/** the floating mini preview: live phase + a thin bar, bottom right, over any screen */
export function RebuildMiniBar({ job, onClick, title }: { job: OnboardJob | null; onClick: () => void; title?: string }) {
  return (
    <div data-testid="rebuild-mini" onClick={onClick} title={title ?? "rebuild running in the background - click to open the wizard"}
      style={{ position: "fixed", right: 16, bottom: 16, zIndex: 55, cursor: "pointer", minWidth: 240, maxWidth: 340,
        background: `color-mix(in oklab, ${C.panel} 78%, transparent)`, backdropFilter: "blur(6px)",
        border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.warn, animation: "wizPulse 1.2s ease-in-out infinite" }}>◉</span>
        <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, fontWeight: 600 }}>rebuilding</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{phaseWord(job)}</span>
      </div>
      <div style={{ height: 4, background: C.bg, borderRadius: 2, overflow: "hidden", border: `1px solid ${C.border}`, marginTop: 6 }}>
        <div style={{ width: `${miniPct(job)}%`, height: "100%", background: C.brand }} />
      </div>
    </div>
  );
}
/** MOUNTED ONCE, IN THE SHELL: the rebuild's mini preview on every screen except X-ray (where the wizard is), whoever started the rebuild and whether or not the dropdown that started it is still open. */
export function RebuildMini() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [job, setJob] = React.useState<OnboardJob | null>(null);
  const away = !wizardAllowedHere(pathname);
  React.useEffect(() => {
    if (!away) { setJob(null); return; }
    let alive = true;
    const tick = async () => {
      try {
        const latest = await onboardLatest();
        if (!alive) return;
        if (!latest?.job_id || !(latest.status === "running" || latest.status === "pause_requested")) { setJob(null); return; }
        const st = await onboardStatus({ job_id: latest.job_id });
        if (alive) setJob(st && st !== "gone" ? st : null);
      } catch { if (alive) setJob(null); }
    };
    void tick();
    const t = setInterval(() => void tick(), 3000);
    return () => { alive = false; clearInterval(t); };
  }, [away]);
  if (!away || !job) return null;
  return <RebuildMiniBar job={job} onClick={() => void navigate({ to: "/operations/atlas" })} title="rebuild running in the background - click to open it in X-ray" />;
}

/** a job's start as epoch ms; the serve writes `created_at` as an ISO time or as SQLite's UTC `YYYY-MM-DD HH:MM:SS`; unreadable = now (so nothing newer than the finished rebuild is ever cleared). Pure - tested. */
export function jobStartMs(createdAt?: string | null): number {
  if (!createdAt) return Date.now();
  const iso = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(createdAt) ? createdAt.replace(" ", "T") + "Z" : createdAt;
  const t = Date.parse(iso); return Number.isFinite(t) ? t : Date.now();
}
export function RebuildPanel({ onDone, wizard = true, onOpenWizard }: { onDone: () => void; /** false = never draw the full window here (every screen but X-ray); the shell's mini preview shows the rebuild instead */ wizard?: boolean; onOpenWizard?: () => void }) {
  const { data: wsList } = useWorkspaces();
  const root = wsList?.active?.root_path ?? null;
  // THE FILES EDITED IN THE CODE TAB SINCE THE LAST REBUILD (operator 2026-10-11): the analysis was derived from the code before them, so the button says it is out of date until a rebuild that started after them finishes
  const edited = useEditedPaths(root);
  const rootRef = React.useRef<string | null>(root); rootRef.current = root;
  const startedRef = React.useRef<number | null>(null);
  const [jobId, setJobId] = React.useState<string | null>(() => {
    try { return localStorage.getItem(LS_ONBOARD_JOB); } catch { return null; }
  });
  const [job, setJob] = React.useState<OnboardJob | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [pausing, setPausing] = React.useState(false);
  const [pollNonce, setPollNonce] = React.useState(0); // bumped on pause/resume so the poll effect restarts on the same job id
  const lastFamRef = React.useRef({ done: 0, t: 0 }); // progressive-viewer throttle (families seen · last refetch)

  // JOB ADOPTION: rebuilds also start WITHOUT this panel (auto-onboard on workspace activate, a
  // resumed child process). Watching only the locally-persisted id meant those ran invisibly while
  // the panel showed a stale job ("not progressive" — INCIDENT 2026-07-23). Ask for the LATEST job
  // and adopt it whenever it's live and different.
  React.useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const latest = await onboardLatest();
        if (!alive || !latest?.job_id) return;
        const live = latest.status === "running" || latest.status === "pause_requested";
        if (live && latest.job_id !== jobId) {
          try { localStorage.setItem(LS_ONBOARD_JOB, latest.job_id); } catch { /* ignore */ }
          setJob(null); setDismissed(false); setJobId(latest.job_id);
        }
      } catch { /* BE unreachable — the poll effect handles that */ }
    };
    void check();
    const t = setInterval(() => void check(), 10000);
    return () => { alive = false; clearInterval(t); };
  }, [jobId]);

  // Poll while the job runs. Survives navigation: the job id is persisted, so returning to this
  // screen resumes the poll. The heavy work is entirely server-side — nothing blocks here.
  React.useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let misses = 0;
    const poll = async () => {
      const st = await onboardStatus({ job_id: jobId });
      if (cancelled) return;
      if (st === "gone") {
        // TERMINAL: the engine does not have this job. Retrying cannot change that, and the id is
        // persisted, so a poller that treats this as transient reloads into the same loop forever.
        // Drop the remembered id and offer a fresh rebuild instead of watching a job that is not
        // there. (Seen for real after code_onboard_jobs changed schemas; also reachable by removing
        // a workspace or clearing the table.)
        try { localStorage.removeItem(LS_ONBOARD_JOB); } catch { /* ignore */ }
        setJobId(null);
        setJob(null);
        setErr("that rebuild job no longer exists on the engine — start a new rebuild");
        return;
      }
      if (!st) {
        // a transient miss (the BE is busy onboarding → the status poll can time out). Keep polling; only
        // surface a note after several CONSECUTIVE misses — and NEVER stop polling: the job runs
        // server-side regardless, and abandoning the poll here loses a rebuild that is still alive
        // (a heavy phase can hold the BE's event loop long enough to miss several polls in a row).
        misses += 1;
        if (misses >= 5) setErr("the BE is busy on a heavy rebuild phase — still watching, this can take a few minutes…");
        timer = setTimeout(() => { void poll(); }, misses >= 5 ? 5000 : 2000);
        return;
      }
      misses = 0; setErr(null); setJob(st);
      // PROGRESSIVE VIEWER (operator 2026-07-23): each finished family already wrote its nodes to the
      // atlas — refetch as families land (throttled to ~4s), so files/folders APPEAR family by family
      // in the code viewer during the build instead of all at once at the end.
      const famDone = st.detail?.families?.done ?? 0;
      if (famDone > lastFamRef.current.done) {
        lastFamRef.current.done = famDone;
        if (Date.now() - lastFamRef.current.t > 4000) { lastFamRef.current.t = Date.now(); onDone(); }
      }
      if (st.status === "running" || st.status === "pause_requested") {
        timer = setTimeout(() => { void poll(); }, 1500);
      } else if (st.status === "done") {
        try { localStorage.removeItem(LS_ONBOARD_JOB); } catch { /* ignore */ }
        if (rootRef.current) clearEditedBefore(rootRef.current, startedRef.current ?? jobStartMs(st.created_at));   // what was edited before this rebuild began is now analysed
        onDone(); // refresh the atlas canvas below
      }
      // paused / failed: STOP polling but KEEP the job id persisted — the wizard offers
      // "resume from checkpoint" (even after a page reload) instead of a from-scratch rebuild.
    };
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [jobId, onDone, pollNonce]);

  async function rebuild() {
    startedRef.current = Date.now();
    setStarting(true); setErr(null); setJob(null); setDismissed(false);
    const res = await onboardStart({}); // no root → BE defaults to the active workspace's root_path
    setStarting(false);
    if (!res) { setErr("rebuild failed to start (BE unreachable or not wired)"); return; }
    try { localStorage.setItem(LS_ONBOARD_JOB, res.job_id); } catch { /* ignore */ }
    setJobId(res.job_id);
  }

  // WIZARD job control: pause stops at the next family boundary (checkpointed); resume re-fires
  // the SAME job with resume:true — completed families reload, only the rest reparse.
  async function pause() {
    if (!jobId) return;
    setPausing(true);
    try { await onboardPause(jobId); } finally { setPausing(false); }
    setPollNonce((n) => n + 1); // pick up the pause_requested → paused transition promptly
  }
  async function resume() {
    if (!jobId) return;
    setErr(null); setDismissed(false);
    const r = await onboardStart({ resume_job_id: jobId });
    if (!r) { setErr("resume failed to start (BE unreachable or not wired)"); return; }
    setJob(null);
    setPollNonce((n) => n + 1); // same job id → restart the poll effect explicitly
  }

  const running = starting || job?.status === "running" || job?.status === "pause_requested" || (!!jobId && !job);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <button style={btn(true)} data-testid="rebuild-button" onClick={() => (running ? (wizard ? setDismissed(false) : onOpenWizard?.()) : void rebuild())}
        title={running ? "rebuild running in the background — click to open the wizard" : "re-index + analyze this workspace's codebase (background)"}>
        {running ? "◉ rebuilding — view" : job?.status === "paused" ? "⏸ paused — open" : "↻ rebuild"}
      </button>
      {edited.length > 0 && (
        <div data-testid="rebuild-stale" title={`edited in the Code tab since the last rebuild:\n${edited.slice(0, 15).join("\n")}${edited.length > 15 ? `\n… and ${edited.length - 15} more` : ""}`}
          style={{ fontFamily: mono, fontSize: 10, color: C.warn, lineHeight: 1.35 }}>
          ✎ {edited.length} file{edited.length === 1 ? "" : "s"} edited here: the analysis is out of date, rebuild to refresh it
        </div>
      )}
      {wizard && job?.status === "paused" && dismissed && (
        <button style={{ ...btn(), fontSize: 10.5 }} onClick={() => setDismissed(false)}>show the paused rebuild…</button>
      )}
      {/* transparent MINI-BAR while the wizard is dismissed — the rebuild stays visible without
          owning the screen: live family/phase + a thin progress bar; click to reopen the wizard */}
      {wizard && dismissed && (running || job?.status === "pause_requested") && (
        <RebuildMiniBar job={job} onClick={() => setDismissed(false)} />
      )}
      {wizard && !dismissed && (running || job) && (
        <RebuildOverlay job={job} starting={starting || (!!jobId && !job)} err={err} pausing={pausing}
          onClose={() => setDismissed(true)} onPause={() => void pause()} onResume={() => void resume()} />
      )}
    </div>
  );
}

// ── scope: which folders + extensions the atlas indexes (persisted per workspace; applied on rebuild) ──
