// THE ENGINEERING COMMAND CENTER (operator 2026-07-18, ChatGPT's missions-first
// inversion adopted, catalog rejected): users never think about agents — they
// think about MISSIONS. Every mission is DERIVED from the report's evidence
// (never a hardcoded list), assembles its crew deterministically from the
// registry, states its cost before the click, runs sequentially with a live
// ops timeline, and ends in convergence/divergence — the deterministic court.
// The rail split stays a quiet roster; ⌂ opens the command center.
// FONT FLOOR: nothing below the file-tree size (~10.5px).
import * as React from "react";
import { BE_URL, apiGet, apiPost } from "@/loki/api/client";
import { C } from "@/loki/theme";
import type { EngineKey } from "@/loki/api/engine";
import { useSeats, offered } from "@/loki/api/seats";
import { useShell } from "@/loki/shell/slug-context";
import { fileRead } from "@/loki/api/codebase";
import { fetchFileCon } from "./atlas-decorators";
import { CinematicPlayer } from "./class-cinema";
import { TokLine, TokCode, Highlighted } from "./highlight";
import { HeimdallFlag } from "@/loki/components/HeimdallFlag";
import { StudioOverlay } from "@/loki/widgets/studio-overlay";
import { GenCard, STUDIO_CSS } from "@/loki/widgets/studio-kit";
import { MissionRail } from "@/loki/widgets/mission-rail";
import { SOURCE_GROUPS } from "@/loki/widgets/mission-rail";
import { ArtifactView, TimelineSketch } from "@/loki/widgets/artifact-view";

// the toggled context kinds (ast/digest/cards/…) → their human labels, for the ingredients canvas
const SRC_LABEL: Record<string, string> = Object.fromEntries(SOURCE_GROUPS.flatMap((g) => g.items));

const mono = `ui-monospace, "JetBrains Mono", "Cascadia Code", Menlo, monospace`;
const FS = { small: 10, base: 10.5, title: 13 };

type Agent = {
  id: string; title: string; category: string; description: string;
  capabilities: string[]; consumes: string[]; produces: string[];
  languages: string[]; technologies: string[]; required_packs: string[];
  laws: string[]; axes: string[];
  ready: boolean; readiness: string; enabled: boolean;
  est_cost: string; est_runtime_s: number;
};
type Mission = { id: string; title: string; reason: string; crew: string[]; target?: string | null; needsFile?: boolean; mass: number; forked?: boolean };

const CAT_LABEL: Record<string, string> = { axis: "axis", core: "core", specialist: "specialist", language: "language", framework: "framework", book: "book faculty" };
const CAT_AXIS: Record<string, string> = { testing: "tests", structure: "structure", performance: "structure", architecture: "coupling" };
const SWARM_CAP = 9;
const tone = (v: number | null | undefined) => (v == null ? C.dim : v >= 85 ? C.ok : v >= 60 ? C.warn : C.bad);
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function useRegistry() {
  const [reg, setReg] = React.useState<any | null>(null);
  React.useEffect(() => {
    let alive = true;
    void apiPost(`/api/v1/dispatch`, { action_name: "system.constitution.agents", input: {} })
      .then((r: any) => { const d = r?.result?.result ?? r?.result ?? r; if (alive) setReg(d?.ok ? d : { error: d?.error ?? "registry unavailable" }); })
      .catch((e: any) => { if (alive) setReg({ error: String(e?.message ?? "failed").slice(0, 120) }); });
    return () => { alive = false; };
  }, []);
  return reg;
}

async function runAgent(agentId: string, path: string, extra?: Record<string, any>): Promise<any> {
  try {
    // an estimate answers in a second; a real call is one headless CLI run (claude -p / codex exec /
    // opencode run) reading the case — minutes, not seconds
    const r: any = await apiPost(`/api/v1/dispatch`, { action_name: "system.constitution.agent.run", input: { agent_id: agentId, path, ...(extra ?? {}) } }, { timeoutMs: extra?.estimate ? 60_000 : 600_000 } as any);
    const d = r?.result?.result ?? r?.result ?? r;
    return d?.ok ? d : { ok: false, error: d?.error ?? d?.message ?? (r == null ? "no reply from antiloki-serve (timed out or unreachable) — the run log has the steps that did happen" : "the run failed with no detail"), trace: d?.trace };
  } catch (e: any) { return { ok: false, error: String(e?.message ?? "failed").slice(0, 140) }; }
}

// ── the FORMATTER v2 — deterministic, $0: per file, each specialist's VALIDATED
// intelligence review (theory + cards + checked citations) plus every failure,
// carried openly. The validator already coerced enums and dropped uncited claims.
function buildReview(results: any[], files: string[], fcCache: Map<string, any>) {
  const byFile = new Map<string, any>();
  for (const p of files) byFile.set(p, { path: p, fc: fcCache.get(p) ?? null, agents: [] as any[], errors: [] as string[] });
  for (const r of results) {
    const e = byFile.get(r.path);
    if (!e) continue;
    if (r.res?.ok === false) { e.errors.push(`${r.agent}: ${r.res.error ?? "failed"}`); continue; }
    if (r.res?.review) e.agents.push({ agent: r.agent, review: r.res.review, validation: r.res.validation ?? null, ai_call_id: r.res.ai_call_id ?? null, cost_usd: r.res.cost_usd ?? 0, attempts: r.res.attempts ?? 1 });
    else e.errors.push(`${r.agent}: the review did not parse — dropped, never guessed at (paid: $${Number(r.res?.cost_usd ?? 0).toFixed(4)})${r.res?.parse_excerpt ? ` · raw starts: “${String(r.res.parse_excerpt).slice(0, 90)}…”` : ""}`);
  }
  return { files: [...byFile.values()] };
}

const chip = (t: string, tn: string = C.dim) => (
  <span key={t} style={{ fontFamily: mono, fontSize: FS.small, color: tn, border: `1px solid color-mix(in oklab, ${tn} 40%, transparent)`, borderRadius: 8, padding: "0 7px", whiteSpace: "nowrap" }}>{t}</span>
);

// the house checkbox — a quiet rounded square that fills brand and draws its ✓
// (the native control never matched the chrome)
function Check({ on, disabled = false, onToggle, title }: { on: boolean; disabled?: boolean; onToggle: () => void; title?: string }) {
  return (
    <span role="checkbox" aria-checked={on} title={title}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onToggle(); }}
      style={{ width: 13, height: 13, borderRadius: 4, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", cursor: disabled ? "not-allowed" : "pointer", border: `1.4px solid ${on ? C.brand : `color-mix(in oklab, ${C.dim} 55%, transparent)`}`, background: on ? `color-mix(in oklab, ${C.brand} 22%, transparent)` : "transparent", color: C.brand, fontSize: 9.5, lineHeight: 1, fontFamily: mono, userSelect: "none", opacity: disabled ? 0.4 : 1, transition: "border-color .12s ease, background .12s ease" }}>
      {on ? "✓" : ""}
    </span>
  );
}

// the deterministic COURT v2: two+ independent lenses CITING the same evidence id
// = converging grounding; same id under different top severities = divergence —
// and the court is the operator. Citations are already validator-checked.
const SEV_ORD: Record<string, number> = { error: 0, warn: 1, info: 2 };
function courtOf(results: any[], multi = false) {
  const marks = new Map<string, { agents: Set<string>; sevs: Set<string> }>();
  for (const r of results) {
    const rv = r.res?.review;
    if (!rv) continue;
    const top = (rv.cards ?? []).reduce((a: string, c: any) => ((SEV_ORD[c.severity] ?? 2) < (SEV_ORD[a] ?? 2) ? c.severity : a), "info");
    const pre = multi && r.path ? `${String(r.path).split("/").pop()} ` : "";
    for (const ev of (rv.evidence ?? [])) {
      const k = `${pre}${ev.id}`;
      if (!marks.has(k)) marks.set(k, { agents: new Set(), sevs: new Set() });
      marks.get(k)!.agents.add(r.agent);
      marks.get(k)!.sevs.add(top);
    }
  }
  const both = [...marks.entries()].filter(([, m]) => m.agents.size >= 2);
  return {
    convergence: both.filter(([, m]) => m.sevs.size === 1).map(([k, m]) => ({ key: k, agents: [...m.agents] })),
    divergence: both.filter(([, m]) => m.sevs.size > 1).map(([k, m]) => ({ key: k, agents: [...m.agents], sevs: [...m.sevs] })),
  };
}

// ── THE MISSION CODE REVIEW — the same review grammar as the file window
// (👁 review · ✎ plan · ☰ manifest), adapted to a REGION: per file, the
// deterministic verdict leads and the AI's read layers on top; every file has a
// door into its FULL analysis window (tabs, widgets, axes, neighborhood — all of it).
// ── the PAPER synthesis — deterministic, $0: the LEAD theory (highest level, then
// confidence), co-signers by citation overlap, cards/widgets/actions MERGED and
// deduped across the crew (two agents proposing the same refactor become one
// drawing wearing both names). The long form stays one fold away.
function synthesizeFile(f: any) {
  const agents = (f.agents ?? []).filter((ag: any) => ag.review);
  if (!agents.length) return null;
  const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 44);
  const lvlIdx = (l: any) => ["observation", "finding", "insight", "discovery", "revelation"].indexOf(String(l));
  const ranked = [...agents].sort((a, b) => (lvlIdx(b.review.summary?.level) - lvlIdx(a.review.summary?.level)) || ((b.review.theory?.confidence ?? 0) - (a.review.theory?.confidence ?? 0)));
  const lead = ranked[0];
  const leadCites = new Set((lead.review.evidence ?? []).map((e: any) => e.id));
  const cosigners: any[] = [], extras: any[] = [];
  for (const ag of ranked.slice(1)) ((ag.review.evidence ?? []).some((e: any) => leadCites.has(e.id)) ? cosigners : extras).push(ag);
  const cardsM = new Map<string, any>();
  for (const ag of agents) for (const c of (ag.review.cards ?? [])) {
    const k = `${c.type}|${norm(c.title)}`;
    const e = cardsM.get(k) ?? { ...c, agents: [] as string[] };
    if (!e.agents.includes(ag.agent)) e.agents.push(ag.agent);
    cardsM.set(k, e);
  }
  const widgetsM = new Map<string, any>();
  for (const ag of agents) for (const w of (ag.review.widgets ?? [])) {
    const core = w.type === "before-after" ? `${norm(w.payload?.bad)}|${norm(w.payload?.good)}` : w.type === "root-cause-tree" ? norm(w.payload?.root) : w.type === "repair-order" ? norm((Array.isArray(w.payload?.steps) ? w.payload.steps : []).join(" ")) : norm(JSON.stringify(w.payload ?? {}));
    const k = `${w.type}|${core}`;
    const e = widgetsM.get(k) ?? { ...w, agents: [] as string[] };
    if (!e.agents.includes(ag.agent)) e.agents.push(ag.agent);
    widgetsM.set(k, e);
  }
  const actionsM = new Map<string, any>();
  for (const ag of agents) for (const a of (ag.review.actions ?? [])) {
    const k = norm(a.title);
    const e = actionsM.get(k) ?? { ...a, agents: [] as string[] };
    if (!e.agents.includes(ag.agent)) e.agents.push(ag.agent);
    actionsM.set(k, e);
  }
  return {
    lead, cosigners, extras,
    cards: [...cardsM.values()].sort((a, b) => (SEV_ORD[a.severity] ?? 2) - (SEV_ORD[b.severity] ?? 2)).slice(0, 6),
    widgets: mergeWidgetsByType([...widgetsM.values()]).slice(0, 3), // one per TYPE — types are dimensions
    actions: [...actionsM.values()].slice(0, 4),
    pushbacks: agents.filter((ag: any) => ag.review.expected_pushback).map((ag: any) => ({ agent: ag.agent, text: ag.review.expected_pushback })),
  };
}

// ONE SUBJECT, ONE WIDGET (operator 2026-07-19): same-type widgets merge into a
// single widget carrying ALL the data — steps unioned, branches unioned, files
// unioned, the lead's diff standing for the subject. Types = dimensions.
function mergeWidgetsByType(ws: any[]) {
  const byType = new Map<string, any>();
  for (const w of ws) {
    const prev = byType.get(w.type);
    if (!prev) { byType.set(w.type, { ...w, payload: { ...(w.payload ?? {}) }, agents: [...(w.agents ?? [])] }); continue; }
    for (const a of (w.agents ?? [])) if (!prev.agents.includes(a)) prev.agents.push(a);
    const p = prev.payload, q = w.payload ?? {};
    if (w.type === "repair-order") p.steps = [...new Set([...(Array.isArray(p.steps) ? p.steps : []), ...(Array.isArray(q.steps) ? q.steps : [])])].slice(0, 6);
    else if (w.type === "root-cause-tree") p.branches = [...new Set([...(Array.isArray(p.branches) ? p.branches : []), ...(Array.isArray(q.branches) ? q.branches : [])])].slice(0, 5);
    else if (w.type === "graph-focus") { p.files = [...new Set([...(Array.isArray(p.files) ? p.files : []), ...(Array.isArray(q.files) ? q.files : [])])].slice(0, 6); if (!p.note && q.note) p.note = q.note; }
    // before-after: the first (the lead's) diff stands — one subject, one diff
  }
  return [...byType.values()];
}

function MissionReview({ session, onClose }: { session: any; onClose: () => void }) {
  const [tab, setTab] = React.useState<"review" | "plan" | "manifest">("review");
  const [groundOpen, setGroundOpen] = React.useState<Set<string>>(new Set()); // per-file: the deterministic record, unfolded
  // THE EDITOR (operator 2026-07-19): one high-tier call writes the paper's
  // connective narrative from the crew's VALIDATED reviews. Stored on the
  // session object itself so reopening the review keeps the edited paper.
  const [editor, setEditor] = React.useState<any | null>(session.editor ?? null);
  const [edBusy, setEdBusy] = React.useState(false);
  const [edErr, setEdErr] = React.useState<string | null>(null);
  const commissionEditor = async () => {
    if (edBusy) return;
    setEdBusy(true); setEdErr(null);
    try {
      const reviews = (session.review?.files ?? []).flatMap((f: any) => (f.agents ?? []).map((ag: any) => ({ agent: ag.agent, path: f.path, review: ag.review })));
      const actionsFlat = (session.review?.files ?? []).flatMap((f: any) => (f.agents ?? []).flatMap((ag: any) => (ag.review?.actions ?? []).map((a2: any) => ({ title: a2.title, impact: a2.impact, effort: a2.effort, agents: [ag.agent] }))));
      const r: any = await apiPost(`/api/v1/dispatch`, { action_name: "system.constitution.editor", input: { reviews, label: session.label, swarm_id: session.swarm_id ?? undefined, court: { convergence: court.convergence, divergence: court.divergence }, actions: actionsFlat, web_sources: session.web_sources ?? [] } }, { timeoutMs: 180_000 } as any);
      const d = r?.result?.result ?? r?.result ?? r;
      if (d?.ok && d.editor) { session.editor = d; setEditor(d); }
      else setEdErr(d?.dropped ? `the edit did not parse — dropped, never guessed at (paid $${Number(d?.cost_usd ?? 0).toFixed(4)}): «${d?.parse_excerpt ?? ""}»` : (d?.error ?? "the editor call failed"));
    } catch (e: any) { setEdErr(String(e?.message ?? "failed").slice(0, 160)); }
    finally { setEdBusy(false); }
  };
  // S4 — THE RESEARCH BRIDGE: the study files itself as a notebook source ($0);
  // the studio's artifact makers then work on it (each press = ONE AI call,
  // click-is-consent, via the notebooks' own money-guarded actions).
  const [bridge, setBridge] = React.useState<any | null>(session.nb_bridge ?? null);
  const [arts, setArts] = React.useState<any[]>(session.nb_arts ?? []);
  const [nbBusyK, setNbBusyK] = React.useState<string | null>(null);
  const [nbErr, setNbErr] = React.useState<string | null>(null);
  const [studioFor, setStudioFor] = React.useState<string | null>(null); // per-section ◨ studio (the chat window, the paper as context)
  // THE CLASS (operator 2026-07-19): one mid call turns the paper into a slide
  // deck; "presentation" shows the speech, "video class" narrates it (local Kokoro, $0).
  const [classDeck, setClassDeck] = React.useState<any | null>(session.class_deck ?? null);
  const [classMode, setClassMode] = React.useState<"video" | "slides" | null>(null);
  const [classBusy, setClassBusy] = React.useState(false);
  const [classErr, setClassErr] = React.useState<string | null>(null);
  const makeClass = async (mode2: "video" | "slides") => {
    if (classBusy) return;
    session.class_request = null; // the step was taken by hand
    if (classDeck) { setClassMode(mode2); void persistClass(classDeck); return; }
    setClassBusy(true); setClassErr(null);
    try {
      // PAPER-ONLY (operator 2026-07-20): the study auto-saves itself by swarm_id
      // (the paper-history effect below) — the class projects THAT saved paper.
      const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.constitution.class", input: { paper_slug: session.swarm_id ?? undefined, label: session.label } }, { timeoutMs: 180_000 } as any);
      const d = r?.result?.result ?? r?.result ?? r;
      if (d?.ok && d.deck) {
        session.class_deck = d.deck; setClassDeck(d.deck); setClassMode(mode2);
        void persistClass(d.deck);
      }
      else setClassErr(d?.dropped ? `the deck did not parse — dropped (paid $${Number(d?.cost_usd ?? 0).toFixed(4)})` : (d?.error ?? "the class call failed"));
    } catch (e: any) { setClassErr(String(e?.message ?? "failed").slice(0, 140)); }
    finally { setClassBusy(false); }
  };
  // THE SOLILOQUY door (operator 2026-07-20, the artifact wizard): the study as
  // ONE narrated lecture, filed on the origin notebook (its player lives there;
  // without a notebook there is no playback surface, so the door needs one).
  const [solBusy, setSolBusy] = React.useState(false);
  const [solErr, setSolErr] = React.useState<string | null>(null);
  const [solItem, setSolItem] = React.useState<any | null>(session.sol_item ?? null);
  const makeSoliloquy = async () => {
    if (solBusy || !session.origin_nb) return;
    session.class_request = null; // the step was taken by hand
    setSolBusy(true); setSolErr(null);
    try {
      const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.constitution.soliloquy", input: { paper_slug: session.swarm_id ?? undefined, notebook_id: session.origin_nb } }, { timeoutMs: 300_000 } as any);
      const d = r?.result?.result ?? r?.result ?? r;
      if (d?.ok && d.item) { session.sol_item = d.item; setSolItem(d.item); }
      else if (d?.key_missing) setSolErr("the voice engine is unavailable — check the BE console");
      else setSolErr(d?.dropped ? "the narration did not parse — dropped" : (d?.error ?? "the soliloquy failed"));
    } catch (e: any) { setSolErr(String(e?.message ?? "failed").slice(0, 140)); }
    finally { setSolBusy(false); }
  };
  // THE SOURCES sidebar (operator 2026-07-19): every file of the study; click →
  // the house IDE view. Escape closes the viewer first, the window second.
  const [srcOpen, setSrcOpen] = React.useState<string | null>(null);
  const [srcFull, setSrcFull] = React.useState<Record<string, string | null>>({});
  // THE PAPER HISTORY (operator 2026-07-19): every study saves itself — the full
  // session (sections + widget data + ingredients) UPSERTed by swarm_id, $0.
  const paperSaved = React.useRef(false);
  React.useEffect(() => {
    if (!(session.results ?? []).length) return;
    if (paperSaved.current && !editor) return;
    paperSaved.current = true;
    const ed0 = editor?.editor ?? null;
    void (async () => {
      try {
        const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.constitution.paper", input: {
          op: "save", slug: session.swarm_id ?? undefined, swarm_id: session.swarm_id ?? undefined,
          title: ed0?.title ?? `A Study of ${session.label}`, label: session.label, discovery: ed0?.discovery ?? null,
          files: session.files ?? [], agents: [...new Set((session.results ?? []).map((x: any) => x.agent))],
          paper: { label: session.label, multi: session.multi, files: session.files, results: session.results, review: session.review, editor, swarm_id: session.swarm_id ?? null },
          markdown: paperMarkdown(), cost_usd: cost + Number(editor?.cost_usd ?? 0),
        } }, { timeoutMs: 30_000 } as any);
        const d = r?.result?.result ?? r?.result ?? r;
        if (d?.ok) session.paper_id = d.id;
      } catch { /* the shelf can miss one — the session still lives in this window */ }
    })();
  }, [editor]);
  const srcOpenRef = React.useRef<string | null>(null);
  srcOpenRef.current = srcOpen;
  React.useEffect(() => {
    if (!srcOpen || srcFull[srcOpen] !== undefined) return;
    let alive = true;
    void (async () => {
      try { const r: any = await fileRead({ path: srcOpen }); if (alive) setSrcFull((m) => ({ ...m, [srcOpen]: r?.content != null ? String(r.content) : null })); }
      catch { if (alive) setSrcFull((m) => ({ ...m, [srcOpen]: null })); }
    })();
    return () => { alive = false; };
  }, [srcOpen]);
  const unwrapD = (r: any) => r?.result?.result ?? r?.result ?? r;
  // the bridge ENSURES itself (operator 2026-07-19: classes must reach the
  // notebooks even when ⎘ was never pressed) — create-once, reuse after
  const ensureBridge = async (): Promise<{ id: number } | null> => {
    if (session.nb_bridge?.id) return session.nb_bridge;
    try {
      const c: any = unwrapD(await apiPost("/api/v1/dispatch", { action_name: "system.notebook.store", input: { op: "create", title: `Study — ${session.label}`.slice(0, 90), summary: "filed from a constitution mission review" } }, { timeoutMs: 30_000 } as any));
      const id = c?.notebook?.id;
      if (!id) throw new Error(c?.error ?? "notebook create failed");
      const sr: any = unwrapD(await apiPost("/api/v1/dispatch", { action_name: "system.notebook.source", input: { op: "add", notebook_id: id, kind: "text", label: "the study (markdown)", body_md: paperMarkdown() } }, { timeoutMs: 30_000 } as any));
      if (sr?.ok === false) throw new Error(sr?.error ?? "source add failed");
      session.nb_bridge = { id }; setBridge({ id });
      return session.nb_bridge;
    } catch (e: any) { setNbErr(String(e?.message ?? "failed").slice(0, 140)); return null; }
  };
  const fileStudy = async () => { setNbBusyK("file"); setNbErr(null); await ensureBridge(); setNbBusyK(null); };
  // the deck lands on the bridge notebook exactly once per session
  const persistClass = async (deck2: any) => {
    if (session.class_saved || !deck2) return;
    const br = await ensureBridge();
    if (!br?.id) return;
    try {
      const r: any = unwrapD(await apiPost("/api/v1/dispatch", { action_name: "system.notebook.store", input: { op: "add_item", id: br.id, kind: "class", title: deck2.title ?? "Video class", body_md: `Video class — ${(deck2.slides ?? []).length} slides.`, meta: { deck: deck2 } } }, { timeoutMs: 20_000 } as any));
      if (r?.ok !== false) session.class_saved = true;
      if (session.origin_nb) {
        void apiPost("/api/v1/dispatch", { action_name: "system.notebook.store", input: { op: "add_item", id: session.origin_nb, kind: "class", title: deck2.title ?? "Video class", body_md: `Video class — ${(deck2.slides ?? []).length} slides.`, meta: { deck: deck2 } } }, { timeoutMs: 20_000 } as any).catch(() => {});
      }
    } catch { /* the notebook can miss one — the player still plays */ }
  };
  const press = async (kind: string) => {
    if (!bridge || nbBusyK) return;
    setNbBusyK(kind); setNbErr(null);
    try {
      const r: any = unwrapD(await apiPost("/api/v1/dispatch", { action_name: ({ quiz: "system.notebook.quiz", mindmap: "system.notebook.mindmap", diagram: "system.notebook.diagram" } as Record<string, string>)[kind] ?? "system.notebook.generate", input: { id: bridge.id, kind } }, { timeoutMs: 180_000 } as any));
      const item = r?.item;
      if (!item) throw new Error(r?.error ?? "the studio press failed");
      const next = [...arts, item]; session.nb_arts = next; setArts(next);
    } catch (e: any) { setNbErr(String(e?.message ?? "failed").slice(0, 140)); }
    finally { setNbBusyK(null); }
  };
  const [longForm, setLongForm] = React.useState<Set<string>>(new Set()); // per-file: unfold the full specialist reviews
  const [paperEx, setPaperEx] = React.useState<Record<string, boolean>>({}); // manifest: per-section expand
  const { setAiCallId } = useShell(); // ⚙ opens the AI-call window — the exact prompt, envelope and all
  // the SOURCE per file — every AI claim gets anchored to real code (operator 2026-07-19)
  const [srcMap, setSrcMap] = React.useState<Record<string, string[] | null>>({});
  // S2/S3/S5 — the FIELD per file: neighborhood (constellation · provenance) and
  // the measured pattern specimens, fetched once per file, cached on state
  const [nbMap, setNbMap] = React.useState<Record<string, any | null>>({});
  const [patMap, setPatMap] = React.useState<Record<string, any[] | null>>({});
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      for (const f of (session.review?.files ?? [])) {
        if (String(f.path).includes("|")) continue;
        if (nbMap[f.path] === undefined) {
          try { const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.constitution.neighborhood", input: { path: f.path, depth: 1, max_per_ring: 6 } }, { timeoutMs: 60_000 } as any); const d = r?.result?.result ?? r?.result ?? r; if (!alive) return; setNbMap((m) => ({ ...m, [f.path]: d?.ok === false ? null : d })); }
          catch { if (!alive) return; setNbMap((m) => ({ ...m, [f.path]: null })); }
        }
        if (patMap[f.path] === undefined) {
          try { const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.constitution.patterns", input: { path: f.path } }, { timeoutMs: 30_000 } as any); const d = r?.result?.result ?? r?.result ?? r; if (!alive) return; setPatMap((m) => ({ ...m, [f.path]: Array.isArray(d?.patterns) ? d.patterns : null })); }
          catch { if (!alive) return; setPatMap((m) => ({ ...m, [f.path]: null })); }
        }
      }
    })();
    return () => { alive = false; };
  }, [(session.review?.files ?? []).map((f: any) => f.path).join("|")]);
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      for (const f of (session.review?.files ?? [])) {
        if (srcMap[f.path] !== undefined) continue;
        try { const s: any = await fileRead({ path: f.path }); if (!alive) return; setSrcMap((m) => ({ ...m, [f.path]: s?.content ? String(s.content).split("\n") : null })); }
        catch { if (!alive) return; setSrcMap((m) => ({ ...m, [f.path]: null })); }
      }
    })();
    return () => { alive = false; };
  }, [(session.review?.files ?? []).map((f: any) => f.path).join("|")]);
  // THE EVIDENCE BOARD builder — each law the crew CITED that has a recorded sick
  // line becomes a real hunk cut from the source, wearing the best-matching AI
  // card as its margin comment. Statements sit NEXT to their code, always.
  const evidenceFor = (f: any, syn: any) => {
    const src = srcMap[f.path] ?? null;
    const cited = new Set<string>((f.agents ?? []).flatMap((ag: any) => (ag.review?.evidence ?? []).filter((e: any) => e.kind === "law").map((e: any) => String(e.id))));
    const seen = new Set<string>();
    const picks: any[] = [];
    for (const v of (f.fc?.violations ?? [])) {
      if (v.line == null || !cited.has(v.law_key) || seen.has(v.law_key)) continue;
      seen.add(v.law_key);
      picks.push(v);
      if (picks.length === 3) break;
    }
    // deterministic lead violation always shows, cited or not
    const w0 = (f.fc?.worst_list ?? [])[0];
    if (w0?.line != null && !seen.has(w0.law_key) && picks.length < 3) picks.unshift({ law_key: w0.law_key, line: w0.line, severity: w0.severity, evidence: w0.evidence, title: w0.title });
    const cardQueue = [...(syn?.cards ?? [])];
    const matchCard = (lawKey: string) => {
      const norm = lawKey.replace(/-/g, " ");
      const i = cardQueue.findIndex((c: any) => `${c.title} ${c.body}`.toLowerCase().includes(norm) || `${c.title} ${c.body}`.toLowerCase().includes(lawKey));
      const j = i >= 0 ? i : 0;
      return cardQueue.length ? cardQueue.splice(j, 1)[0] : null;
    };
    const blocks = picks.map((v: any) => {
      let rows: any[] | null = null;
      if (src) { const lo = Math.max(1, v.line - 2), hi = Math.min(src.length, v.line + 2); rows = Array.from({ length: hi - lo + 1 }, (_, i) => ({ ln: lo + i, text: (src[lo + i - 1] ?? "").slice(0, 160) })); }
      else if ((f.fc?.worst_list ?? []).find((w: any) => w.law_key === v.law_key)?.snippet) rows = (f.fc.worst_list.find((w: any) => w.law_key === v.law_key).snippet as any[]);
      return { v, rows, card: matchCard(v.law_key) };
    }).filter((b: any) => b.rows?.length);
    return { blocks, leftoverCards: cardQueue };
  };
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") { if (srcOpenRef.current) setSrcOpen(null); else onClose(); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const rv = session.review ?? { files: [] };
  const court = courtOf(session.results ?? [], (session.files ?? []).length > 1);
  const cost = (session.results ?? []).reduce((a: number, r: any) => a + Number(r.res?.cost_usd ?? 0), 0);
  const totalCards = rv.files.reduce((a: number, f: any) => a + (f.agents ?? []).reduce((b: number, ag: any) => b + (ag.review?.cards?.length ?? 0), 0), 0);
  const SEV_C: Record<string, string> = { error: C.bad, warn: C.warn, info: C.dim };
  // the region as one (loc-weighted, like the neighborhood's region score)
  const judged = rv.files.filter((f: any) => f.fc);
  let hs = 0, hw = 0;
  for (const f of judged) if (f.fc.health != null) { const w = Math.max(1, f.fc.signals?.loc ?? 1); hs += f.fc.health * w; hw += w; }
  const regionHealth = hw ? Math.round(hs / hw) : null;
  // ✎ the plan — the crews' ACTIONS grouped across files by title, widest first,
  // each step carrying the DRAWINGS its proposers made (the plan gets widgets)
  const plan = (() => {
    const m = new Map<string, any>();
    for (const f of rv.files) for (const ag of (f.agents ?? [])) for (const a of (ag.review?.actions ?? [])) {
      const k = String(a.title ?? "?").toLowerCase();
      const e = m.get(k) ?? { key: k, title: a.title, strategy: a.strategy ?? null, impact: a.impact, effort: a.effort, sites: [] as any[], agents: new Set<string>(), rawW: [] as any[] };
      e.sites.push({ path: f.path });
      e.agents.add(ag.agent);
      if (!e.strategy && a.strategy) e.strategy = a.strategy;
      for (const w of (ag.review?.widgets ?? [])) e.rawW.push({ ...w, agents: [ag.agent] });
      m.set(k, e);
    }
    return [...m.values()].map((e) => ({ ...e, agents: [...e.agents], widgets: mergeWidgetsByType(e.rawW).slice(0, 2) })).sort((a, b) => b.sites.length - a.sites.length);
  })();
  const paperSyns = rv.files.map((f: any) => ({ f, syn: synthesizeFile(f) })).filter((x: any) => x.syn);

  // ── the study as MARKDOWN — one deterministic rendition for copy / ↓md / ↓pdf ──
  const paperMarkdown = () => {
    const L: string[] = [];
    const authors = [...new Set((session.results ?? []).map((r: any) => r.agent))] as string[];
    L.push(`# A study of ${session.label}`);
    L.push(`Authors: ${authors.map((a2) => a2.replace(" Reviewer", "")).join(", ")} — each a derived lens of this workspace's constitution`);
    L.push(`${rv.files.length} file(s) examined${regionHealth != null ? ` · region health ${regionHealth}` : ""} · recorded cost $${cost.toFixed(4)}`);
    const fieldCount = [...new Set(Object.values(nbMap).flatMap((nb2: any) => (nb2?.nodes ?? []).filter((n2: any) => n2.dir !== "center").map((n2: any) => String(n2.path))))].length;
    L.push(`Case(s): ${rv.files.length} · field: ${fieldCount} neighbor(s) · population: the latest snapshot`);
    const theories = paperSyns.map((x: any) => x.syn.lead.review.theory?.name).filter(Boolean);
    if (theories.length) { L.push(""); L.push(`## Abstract`); L.push(`${authors.length} specialist(s) defend ${theories.length} thesis/theses: ${theories.map((t: string) => `“${t}”`).join("; ")}. ${court.convergence.length} convergence(s) · ${court.divergence.length} open disagreement(s) · ${plan.length} repair move(s).`); }
    const edm = editor?.editor ?? null;
    if (edm?.discovery) { L.push(""); L.push(`> ✦ **${edm.discovery}**`); }
    if (edm?.arc) { L.push(""); L.push(`*${edm.arc.thread ?? ""}${edm.arc.question ? ` — the question this study answers: ${edm.arc.question}` : ""}*`); }
    if (edm?.introduction) { L.push(""); L.push(`## Introduction (the editor)`); L.push(edm.introduction); }
    if (edm?.reading_order?.length) { L.push(""); L.push(`## The journey — read in this order`); edm.reading_order.forEach((ro: any, i: number) => L.push(`${i + 1}. **${String(ro.path).split("/").pop()}**${ro.why ? ` — ${ro.why}` : ""}`)); }
    paperSyns.forEach(({ f, syn }: any, fi: number) => {
      L.push(""); L.push(`## II.${fi + 1} ${String(f.path).split("/").pop()} — health ${f.fc?.health ?? "—"}`);
      const nb2 = nbMap[f.path];
      if (nb2?.nodes?.length > 1) L.push(`The field — ${(nb2.nodes as any[]).filter((n2: any) => n2.dir !== "center").slice(0, 6).map((n2: any) => `${String(n2.path).split("/").pop()} (${n2.dir}${n2.worst_law ? ` · § ${n2.worst_law}` : ""})`).join(" · ")}`);
      if (nb2?.origin_info) L.push(`Provenance — ${nb2.origin_info.first_commit ? `first commit ${String(nb2.origin_info.first_commit).slice(0, 9)}` : "first commit unknown"} · reason ${nb2.origin_info.reason ?? "?"}`);
      if ((patMap[f.path] ?? []).length) L.push(`Specimens — ${(patMap[f.path] as any[]).slice(0, 6).map((p2: any) => p2.name ?? p2.pattern).join(" · ")}`);
      const axesE = Object.entries(f.fc?.axes ?? {}) as [string, any][];
      if (axesE.length) L.push(`The instruments — ${axesE.map(([k, a2]) => `${k} ${a2?.score ?? "—"}`).join(" · ")} · ${(f.fc?.violations ?? []).length} violation(s) recorded (this record seeded every specialist's prompt).`);
      const lt = syn.lead.review.theory;
      L.push(`**Thesis — ${lt?.name ?? syn.lead.review.summary?.title}** (${syn.lead.agent.replace(" Reviewer", "")}${lt?.confidence != null ? `, conf ${Math.round(lt.confidence * 100)}%` : ""}): ${syn.lead.review.summary?.headline ?? ""}`);
      if (lt?.if_nothing_changes) L.push(`If nothing changes — ${lt.if_nothing_changes}`);
      const pfEd = (edm?.per_file ?? []).find((p2: any) => p2.path === f.path);
      if (pfEd) {
        if (pfEd.bridge) L.push(`*${pfEd.bridge}*`);
        L.push(`**The editor** — ${pfEd.narrative}`);
        if (pfEd.simplified) L.push(`*In plain terms — ${pfEd.simplified}*`);
        if (pfEd.example?.code) { L.push(""); L.push(`### Fig. ${fi + 1}.E — the editor's example${pfEd.example.caption ? `: ${pfEd.example.caption}` : ""}`); L.push("```"); L.push(String(pfEd.example.code)); L.push("```"); }
      }
      const ev = evidenceFor(f, syn);
      ev.blocks.forEach((b: any, bi: number) => {
        L.push(""); L.push(`### Listing ${fi + 1}.${bi + 1} — § ${b.v.law_key} (L${b.rows[0].ln}–${b.rows[b.rows.length - 1].ln})`);
        L.push("```"); for (const row of b.rows) L.push(`${row.ln}${row.ln === b.v.line ? " ›" : "  "} ${row.text}`); L.push("```");
        if (b.card) L.push(`> ${b.card.type}/${b.card.severity} — **${b.card.title}**${b.card.body ? `: ${b.card.body}` : ""}`);
      });
      (syn.widgets ?? []).forEach((w: any, i: number) => {
        L.push(""); L.push(`### Fig. ${fi + 1}.${i + 1} — ${w.type}${w.title ? `: ${w.title}` : ""}`);
        if (w.type === "before-after") { L.push("```diff"); for (const ln of String(w.payload?.bad ?? "").split("\n")) L.push(`- ${ln}`); for (const ln of String(w.payload?.good ?? "").split("\n")) L.push(`+ ${ln}`); L.push("```"); }
        if (w.type === "repair-order") (w.payload?.steps ?? []).forEach((s2: any, j: number) => L.push(`${j + 1}. ${s2}`));
        if (w.type === "root-cause-tree") { L.push(`WHY — ${w.payload?.root ?? ""}`); (w.payload?.branches ?? []).forEach((b2: any) => L.push(`- ↳ ${b2}`)); }
        if (w.type === "graph-focus") L.push(`${(w.payload?.files ?? []).join(" · ")}${w.payload?.note ? ` — ${w.payload.note}` : ""}`);
      });
      const seenC = new Set<string>();
      for (const ag of (f.agents ?? [])) { const Ls = ag.review?.lesson; if (Ls?.concept && !seenC.has(Ls.concept)) { seenC.add(Ls.concept); L.push(""); L.push(`### Fig. ${fi + 1}.T — the theory: ${Ls.concept}`); if (Ls.sample) { L.push("```"); L.push(String(Ls.sample)); L.push("```"); } if (Ls.caption) L.push(`*${Ls.caption}* (${String(ag.agent).replace(" Reviewer", "")})`); } }
      if (ev.leftoverCards.length) { L.push(""); L.push(`### The crew's comments`); for (const c2 of ev.leftoverCards) L.push(`- [${c2.type}/${c2.severity}] **${c2.title}**${c2.body ? ` — ${c2.body}` : ""}`); }
      if (syn.actions.length) { L.push(""); L.push(`### The moves`); syn.actions.forEach((a2: any, i: number) => L.push(`${i + 1}. **${a2.title}** (${a2.impact}/${a2.effort})${a2.strategy ? ` — ${a2.strategy}` : ""}`)); }
      if (syn.pushbacks.length || syn.cosigners.length) {
        L.push(""); L.push(`### The defense — threats to validity`);
        if (syn.cosigners.length) L.push(`- independently replicated by ${syn.cosigners.map((cg: any) => cg.agent.replace(" Reviewer", "")).join(", ")}`);
        for (const pb of syn.pushbacks) L.push(`- ${pb.agent.replace(" Reviewer", "")} anticipates: ${pb.text}`);
      }
    });
    if (court.convergence.length || court.divergence.length) {
      L.push(""); L.push(`## III The court`);
      for (const c2 of court.convergence) L.push(`- convergence on ${c2.key} — ${c2.agents.length} independent lenses`);
      for (const d2 of court.divergence) L.push(`- divergence on ${d2.key} — ${d2.agents.join(" vs ")} (${d2.sevs.join(" / ")})`);
    }
    if (plan.length) { L.push(""); L.push(`## The repair program`); plan.forEach((p: any, i: number) => L.push(`${i + 1}. **${p.title}** (${p.impact}/${p.effort} · ${p.sites.length} file(s) · ${p.agents.map((a2: string) => a2.replace(" Reviewer", "")).join(" + ")})${p.strategy ? ` — ${p.strategy}` : ""}`)); }
    const cited = [...new Set<string>(rv.files.flatMap((f: any) => (f.agents ?? []).flatMap((ag: any) => (ag.review?.evidence ?? []).filter((e2: any) => e2.kind === "law").map((e2: any) => String(e2.id)))))];
    if (cited.length) { L.push(""); L.push(`## Glossary`); const titleOf = new Map<string, string>(); for (const f of rv.files) for (const v of (f.fc?.violations ?? [])) if (v.law_key && !titleOf.has(v.law_key)) titleOf.set(v.law_key, v.title ?? ""); for (const k of cited) L.push(`- § ${k}${titleOf.get(k) ? ` — ${titleOf.get(k)}` : ""}`); }
    if (edm?.meta_theory) { const mt = edm.meta_theory; L.push(""); L.push(`## The synthesis — the editor's thesis`); L.push(`**${mt.name ?? ""}** — ${mt.statement ?? ""}`); if (mt.root_cause) L.push(`Root cause — ${mt.root_cause}`); if (mt.anatomy) for (const [k, lbl] of [["starts", "How it starts"], ["grows", "How it grows"], ["recognize", "How to spot it"], ["prevent", "How to prevent it"], ["repair", "How to repair it"]] as const) { if ((mt.anatomy as any)[k]) L.push(`- ${lbl}: ${(mt.anatomy as any)[k]}`); } if (mt.supports?.length) L.push(`Stands on: ${mt.supports.join(" · ")}`); if (mt.counterargument) L.push(`Strongest objection — ${mt.counterargument}`); if (mt.verdict) L.push(`Verdict — ${mt.verdict}`); if (mt.confidence != null) L.push(`Confidence ${Math.round(mt.confidence * 100)}%${mt.unknowns?.length ? ` · unknowns: ${mt.unknowns.join("; ")}` : ""}`); }
    if (edm?.discussion) { L.push(""); L.push(`## Discussion (the editor)`); L.push(edm.discussion); }
    if (edm?.cost) { L.push(""); L.push(`## The cost`); L.push(edm.cost); }
    if (edm?.repair_read) { L.push(""); L.push(`## The repair program, read by the editor`); L.push(edm.repair_read); }
    if (edm?.generalization) { L.push(""); L.push(`## Beyond this repository`); L.push(`*${edm.generalization}*`); }
    if (edm?.teachings?.length) { L.push(""); L.push(`## The seminar — concepts in plain terms`); for (const t2 of edm.teachings) { L.push(`### ${t2.concept}`); if (t2.plain) L.push(t2.plain); if (t2.example?.code) { L.push("```"); L.push(String(t2.example.code)); L.push("```"); if (t2.example.caption) L.push(`*${t2.example.caption}*`); } } }
    if (edm?.conclusion) { L.push(""); L.push(`## Conclusion`); L.push(edm.conclusion); }
    const refI2 = edm?.references?.internal ?? [], refE2 = edm?.references?.external ?? [];
    if (refI2.length || refE2.length) {
      L.push(""); L.push(`## References`);
      refI2.forEach((r2: any, i: number) => L.push(`[${i + 1}] ${r2.ref}${r2.note ? ` — ${r2.note}` : ""}`));
      refE2.forEach((r2: any, i: number) => L.push(`[${refI2.length + i + 1}] ${r2.title}${r2.source ? ` — ${r2.source}` : ""}${r2.url ? ` <${r2.url}>` : ""}${r2.note ? ` · ${r2.note}` : ""}`));
      if (refE2.length) L.push(`*External references came from the editor's live web search — verify before leaning on them.*`);
    }
    if (edm?.further_study?.length) { L.push(""); L.push(`## Further study`); L.push(edm.further_study.join(" · ")); }
    L.push(""); L.push(`## The calls`);
    for (const r2 of (session.results ?? [])) L.push(`- ${r2.agent}${session.multi ? ` · ${String(r2.path).split("/").pop()}` : ""} · $${Number(r2.res?.cost_usd ?? 0).toFixed(4)}${r2.res?.ai_call_id != null ? ` · call #${r2.res.ai_call_id}` : ""}${r2.res?.attempts > 1 ? ` · ${r2.res.attempts} attempts` : ""}`);
    return L.join("\n");
  };
  const slug = String(session.label ?? "mission").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "mission";
  const dl = (name: string, text: string, mime: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.click(); URL.revokeObjectURL(a.href); };
  // ONE beautiful rendition for BOTH ↓ pdf (print window) and ↓ html (standalone file download).
  const buildPaperHtml = () => {
    const md = paperMarkdown();
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const fmt = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>").replace(/`([^`]+)`/g, "<code>$1</code>");
    let inCode = false; const body: string[] = [];
    let h1Done = false;
    for (const ln of md.split("\n")) {
      if (ln.startsWith("```")) { body.push(inCode ? "</pre>" : `<pre>`); inCode = !inCode; continue; }
      if (inCode) { body.push(`${esc(ln)}\n`); continue; }
      if (ln.startsWith("# ")) { body.push(`<h1>${esc(ln.slice(2))}</h1>`); h1Done = true; }
      else if (ln.startsWith("## ")) body.push(`<h2>${esc(ln.slice(3))}</h2>`);
      else if (ln.startsWith("### ")) body.push(`<h3>${esc(ln.slice(4))}</h3>`);
      else if (ln.startsWith("> ")) body.push(`<div class="q">${fmt(ln.slice(2))}</div>`);
      else if (ln.startsWith("- ")) body.push(`<div class="li">${fmt(ln.slice(2))}</div>`);
      else if (/^\d+\. /.test(ln)) body.push(`<div class="li num">${fmt(ln)}</div>`);
      else if (ln.trim() === "") body.push(`<div class="sp"></div>`);
      else if (h1Done && body[body.length - 1]?.startsWith("<h1")) body.push(`<p class="meta">${fmt(ln)}</p>`);
      else body.push(`<p>${fmt(ln)}</p>`);
    }
    // REAL paper typography for print (operator 2026-07-19: "make the pdf beautiful"):
    // serif measure, centered title block, justified paragraphs with indents, quiet
    // captions, listings that never split across pages.
    const html = `<!doctype html><html><head><title>${esc(session.label ?? "study")}</title><style>
      @page { margin: 2.1cm 2.3cm; }
      * { box-sizing: border-box; }
      body { font-family: "Iowan Old Style", Georgia, "Times New Roman", serif; font-size: 11.3pt; line-height: 1.62;
        color: #191919; max-width: 16.4cm; margin: 0 auto; padding: 28px 8px 60px; text-rendering: optimizeLegibility; }
      h1 { font-size: 19.5pt; line-height: 1.28; text-align: center; margin: 6px 0 10px; font-weight: 700; letter-spacing: 0.1px; }
      p.meta { text-align: center; font-size: 10pt; color: #444; margin: 0 0 3px; }
      h2 { font-size: 13.2pt; margin: 26px 0 8px; font-weight: 700; page-break-after: avoid; }
      h2:first-of-type { margin-top: 18px; }
      h3 { font-size: 11.3pt; margin: 16px 0 6px; font-weight: 700; font-style: italic; page-break-after: avoid; }
      p { margin: 0 0 7px; text-align: justify; hyphens: auto; }
      p + p { text-indent: 1.35em; margin-top: -2px; }
      .sp { height: 5px; }
      .li { margin: 1px 0 1px 1.5em; text-indent: -1.1em; padding-left: 1.1em; text-align: justify; }
      .li:not(.num)::before { content: "– "; color: #666; }
      .q { margin: 8px 1.6em 10px; font-style: italic; color: #333; text-align: justify; }
      pre { font-family: "Consolas", "SF Mono", ui-monospace, monospace; font-size: 8.6pt; line-height: 1.5;
        background: #f7f7f4; border: 0.6pt solid #c9c9c2; border-radius: 4px; padding: 8px 11px;
        overflow-x: auto; white-space: pre-wrap; word-break: break-all; page-break-inside: avoid; margin: 8px 0 10px; }
      code { font-family: "Consolas", ui-monospace, monospace; font-size: 9.3pt; background: #f2f2ee; padding: 0 3px; border-radius: 3px; }
      b, strong { color: #000; }
      a { color: #333; }
      .footer { margin-top: 34px; padding-top: 8px; border-top: 0.6pt solid #bbb; font-size: 8.6pt; color: #777;
        text-align: center; font-family: "Consolas", ui-monospace, monospace; }
      @media print { body { padding: 0; } }
    </style></head><body>${body.join("")}<div class="footer">a study under this workspace's constitution · generated by antiloki · ${new Date().toISOString().slice(0, 10)}</div></body></html>`;
    return html;
  };
  const printPdf = () => {
    const w2 = window.open("", "_blank"); if (!w2) return;
    w2.document.write(buildPaperHtml()); w2.document.close(); w2.focus();
    setTimeout(() => { try { w2.print(); } catch { /* the tab stays open — print manually */ } }, 250);
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1150, background: "rgba(0,0,0,.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1240px, 96vw)", maxHeight: "92vh", overflow: "auto", background: C.panel, border: `1px solid color-mix(in oklab, ${C.brand} 22%, ${C.border})`, borderRadius: 15, boxShadow: "0 24px 70px -12px rgba(0,0,0,.7)", padding: "12px 18px", fontFamily: mono }}>
        <div style={{ display: "flex", gap: 9, alignItems: "baseline", flexWrap: "wrap" }}>
          <b style={{ fontSize: FS.title, color: C.fg }}>Mission review — {session.label}</b>
          {regionHealth != null && <b style={{ fontSize: 18, color: tone(regionHealth), fontVariantNumeric: "tabular-nums" }}>{regionHealth}</b>}
          <span style={{ fontSize: FS.small, color: C.dim }}>{rv.files.length} file{rv.files.length === 1 ? "" : "s"} · {totalCards} intelligence card{totalCards === 1 ? "" : "s"} · ${cost.toFixed(4)}</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => { void navigator.clipboard?.writeText(paperMarkdown()); }} title="copy the whole study as markdown"
            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>⧉ copy</button>
          <button onClick={() => dl(`study-${slug}.md`, paperMarkdown(), "text/markdown")} title="download the study as a .md file"
            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>↓ md</button>
          <button onClick={() => dl(`study-${slug}.html`, buildPaperHtml(), "text/html")} title="download the study as a standalone .html file — the same beautiful rendition the PDF prints"
            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>↓ html</button>
          <button onClick={printPdf} title="opens the print dialog on a clean rendition — save as PDF there"
            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>↓ pdf</button>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "2px 10px", cursor: "pointer", fontFamily: mono, fontSize: FS.base }}>✕ esc</button>
        </div>
        {/* the CALLS strip — every AI call one ⚙ away, right at the top */}
        {(session.results ?? []).some((r2: any) => r2.res?.ai_call_id != null) && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5, alignItems: "center" }}>
            <span style={{ fontSize: FS.small, color: C.dim, fontFamily: mono }}>the calls —</span>
            {(session.results ?? []).filter((r2: any) => r2.res?.ai_call_id != null).map((r2: any, i: number) => (
              <button key={i} onClick={() => setAiCallId(r2.res.ai_call_id)} title={`${r2.agent} on ${r2.path} — the exact prompt, envelope and raw output`}
                style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 5, padding: "0 8px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>⚙ {r2.agent.replace(" Reviewer", "")}{session.multi ? `·${String(r2.path).split("/").pop()}` : ""}</button>
            ))}
            {editor?.ai_call_id != null && (
              <button onClick={() => setAiCallId(editor.ai_call_id)} title="the paper specialist's call — one high-tier edit over the whole crew"
                style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 5, padding: "0 8px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>⚙ the editor</button>
            )}
          </div>
        )}
        <div style={{ display: "flex", gap: 16, borderBottom: `1px solid color-mix(in oklab, ${C.border} 60%, transparent)`, marginTop: 6 }}>
          {([["review", "👁 review"], ["plan", "✎ plan"], ["manifest", "☰ manifest"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setTab(v)} style={{ background: "transparent", border: "none", borderBottom: `1px solid ${tab === v ? C.brand : "transparent"}`, marginBottom: -1, color: tab === v ? C.brand : C.dim, padding: "2px 1px 4px", cursor: "pointer", fontFamily: mono, fontSize: FS.base }}>{label}</button>
          ))}
        </div>
        {tab === "review" && (() => {
          /* ── THE PAPER (NL.pdf + Sakana form; operator round 2 2026-07-19): flowing
             prose, EVERY allegation followed by its code evidence, cases as their own
             numbered sections, a spoken discussion, per-section simplify/studio. ── */
          const ed = editor?.editor ?? null;
          let FIGN = 0, LSTN = 0;
          const Fig = ({ children, caption }: { children: React.ReactNode; caption: React.ReactNode }) => {
            FIGN += 1;
            return (
              <figure style={{ margin: "16px 0", padding: 0 }}>
                {children}
                <figcaption style={{ fontSize: FS.small, color: C.dim, marginTop: 5, lineHeight: 1.65, maxWidth: 720 }}><b style={{ color: C.muted }}>Figure {FIGN}.</b> {caption}</figcaption>
              </figure>
            );
          };
          const P = ({ children }: { children: React.ReactNode }) => (
            <p style={{ margin: "0 0 11px", fontSize: FS.base + 0.5, lineHeight: 1.9, color: C.fg, textAlign: "justify" }}>{children}</p>
          );
          const Hs = ({ children }: { children: React.ReactNode }) => (
            <h4 style={{ fontSize: FS.base + 1, color: C.fg, margin: "18px 0 7px", fontWeight: 700 }}>{children}</h4>
          );
          const Remark = ({ by, children }: { by: string; children: React.ReactNode }) => (
            <div style={{ margin: "9px 0 11px 24px", fontSize: FS.base, color: C.muted, fontStyle: "italic", lineHeight: 1.8, textAlign: "justify" }}>
              <b style={{ color: C.fg, fontStyle: "normal" }}>Remark</b> ({by}). {children}
            </div>
          );
          const Listing = ({ rows, sickLine, severity, caption }: { rows: any[]; sickLine?: number | null; severity?: string; caption: React.ReactNode }) => {
            LSTN += 1;
            return (
              <figure style={{ margin: "14px 0", padding: 0 }}>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", maxWidth: 720 }}>
                  {rows.map((row: any) => { const sick = sickLine != null && row.ln === sickLine; const sevT = SEV_C[severity ?? "warn"] ?? C.warn; return (
                    <div key={row.ln} style={{ display: "flex", height: 17, background: sick ? `color-mix(in oklab, ${sevT} 9%, transparent)` : "transparent" }}>
                      <span style={{ width: 34, flexShrink: 0, textAlign: "right", paddingRight: 7, fontSize: FS.small, color: sick ? sevT : C.dim, lineHeight: "17px", userSelect: "none", borderRight: `1px solid ${C.border}`, fontFamily: mono }}>{row.ln}</span>
                      <code style={{ fontSize: FS.base, whiteSpace: "pre", overflowX: "auto", padding: "0 7px", flex: 1, minWidth: 0, lineHeight: "17px", fontFamily: mono, opacity: sick ? 1 : 0.82 }}><TokLine text={row.text} /></code>
                    </div>
                  ); })}
                </div>
                <figcaption style={{ fontSize: FS.small, color: C.dim, marginTop: 4, lineHeight: 1.65, maxWidth: 720 }}><b style={{ color: C.muted }}>Listing {LSTN}.</b> {caption}</figcaption>
              </figure>
            );
          };
          const lensOf = (a2: string) => String(a2).replace(" Reviewer", "");
          const authors = [...new Set((session.results ?? []).map((r: any) => r.agent))] as string[];
          const theories = paperSyns.map((x: any) => x.syn.lead.review.theory?.name).filter(Boolean);
          const fieldCount = [...new Set(Object.values(nbMap).flatMap((nb2: any) => (nb2?.nodes ?? []).filter((n2: any) => n2.dir !== "center").map((n2: any) => String(n2.path))))].length;
          const ordered = (() => {
            const ro = ed?.reading_order ?? [];
            if (!ro.length) return rv.files;
            const pos = new Map<string, number>(ro.map((r2: any, i: number) => [String(r2.path), i]));
            return [...rv.files].sort((a: any, b: any) => (pos.get(a.path) ?? 99) - (pos.get(b.path) ?? 99));
          })();
          // THE SOURCES — every file this study touched: the cases + the field
          const sources = (() => {
            const out: Array<{ path: string; tag: string; health: number | null }> = [];
            const seenP = new Set<string>();
            for (const f of ordered) { if (!seenP.has(f.path) && !String(f.path).includes("|")) { seenP.add(f.path); out.push({ path: f.path, tag: "case", health: f.fc?.health ?? null }); } }
            for (const f of ordered) for (const n2 of (nbMap[f.path]?.nodes ?? [])) {
              if (n2.dir === "center" || seenP.has(n2.path)) continue;
              seenP.add(n2.path);
              out.push({ path: String(n2.path), tag: n2.dir === "up" ? "imports it" : n2.dir === "down" ? "dependency" : "echo", health: n2.health ?? null });
            }
            return out;
          })();
          const web = paperSyns.map(({ f, syn }: any) => ({
            path: f.path, name: String(f.path).split("/").pop(),
            thesis: syn.lead.review.theory?.name ?? syn.lead.review.summary?.title ?? "—",
            axes: [...new Set((f.agents ?? []).flatMap((ag: any) => (ag.review?.evidence ?? []).filter((e2: any) => e2.kind === "axis").map((e2: any) => String(e2.id))))] as string[],
            laws: [...new Set((f.agents ?? []).flatMap((ag: any) => (ag.review?.evidence ?? []).filter((e2: any) => e2.kind === "law").map((e2: any) => String(e2.id))))] as string[],
          }));
          const axesAll = [...new Set(web.flatMap((w: any) => w.axes))] as string[];
          const webPairs: any[] = [];
          for (let i = 0; i < web.length; i += 1) for (let j = i + 1; j < web.length; j += 1) {
            const shared = web[i].laws.filter((k: string) => web[j].laws.includes(k));
            if (shared.length) webPairs.push({ i, j, law: shared[0] });
          }
          const mt = ed?.meta_theory ?? null;
          const refI = ed?.references?.internal ?? [];
          const refE = ed?.references?.external ?? [];
          const shaOf = (fc0: any) => { const c2 = fc0; if (c2 == null) return null; if (typeof c2 === "string") return c2.slice(0, 9); if (typeof c2 === "object") return String(c2.sha ?? c2.hash ?? c2.id ?? c2.commit ?? "").slice(0, 9) || null; return null; };
          // section numbering: 1 intro · 2 field · 3..(2+n) the cases · then the rest
          const caseSec = (i: number) => 3 + i;
          let tail = 3 + ordered.length;
          const synthN = mt ? tail++ : null;
          const discN = tail++;
          const repairN = (ed?.repair_read || plan.length > 0) ? tail++ : null;
          // ── Sec: a numbered section with [simplify | studio] chrome. simplified =
          // paperEx[id] truthy → the one-line `simple` renders instead of children.
          const Sec = ({ id, n, title, simple, children }: { id: string; n: React.ReactNode; title: React.ReactNode; simple: React.ReactNode; children: React.ReactNode }) => (
            <div>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <h3 style={{ fontSize: FS.base + 2.5, color: C.fg, margin: "26px 0 10px", fontWeight: 700, letterSpacing: 0.2 }}>{n}&ensp;{title}</h3>
                <span style={{ flex: 1 }} />
                <button onClick={() => setPaperEx((m) => ({ ...m, [id]: !m[id] }))}
                  style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: FS.small, padding: 0 }}>{paperEx[id] ? "▾ expand" : "▴ simplify"}</button>
                <button onClick={() => setStudioFor(String(title && typeof title === "string" ? title : id))} title="open the Studio on this paper — widgets and artifacts, with the paper as context"
                  style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: FS.small, padding: 0 }}>◨ studio</button>
              </div>
              {paperEx[id] ? <>{simple}</> : children}
            </div>
          );
          // ── the spoken DISCUSSION: a transcript assembled from the crew's real
          // claims, pushbacks and the computed court; the editor joins in turns.
          const dialogue: Array<{ speaker: string; text: string; kind: string }> = [];
          for (const { f, syn } of paperSyns as any[]) {
            const lt2 = syn.lead.review.theory;
            dialogue.push({ speaker: lensOf(syn.lead.agent), text: `${lt2?.name ?? syn.lead.review.summary?.title}${syn.lead.review.summary?.headline ? ` — ${String(syn.lead.review.summary.headline).replace(/\.$/, "")}` : ""}${session.multi ? ` (on ${String(f.path).split("/").pop()})` : ""}.`, kind: "claim" });
            for (const pb of syn.pushbacks.slice(0, 2)) dialogue.push({ speaker: lensOf(pb.agent), text: `Pushing back — ${String(pb.text).replace(/\.$/, "")}.`, kind: "push" });
          }
          for (const c2 of court.convergence) dialogue.push({ speaker: "The court", text: `${c2.agents.length} independent lenses converge on ${c2.key}.`, kind: "court" });
          for (const d2 of court.divergence) dialogue.push({ speaker: "The court", text: `On ${d2.key}, ${d2.agents.map(lensOf).join(" and ")} disagree (${d2.sevs.join(" / ")}) — unresolved.`, kind: "court" });
          if (ed?.discussion) for (const sent of String(ed.discussion).split(/(?<=\.)\s+/).reduce((acc: string[], s2: string) => { const last = acc[acc.length - 1]; if (last && (last.length + s2.length) < 220) acc[acc.length - 1] = `${last} ${s2}`; else acc.push(s2); return acc; }, [])) dialogue.push({ speaker: "The Editor", text: sent, kind: "editor" });
          if (ed?.cost) dialogue.push({ speaker: "The Editor", text: `On cost — ${String(ed.cost).replace(/\.$/, "")}.`, kind: "editor" });
          // population echoes for §2: real code breaking the same laws OUTSIDE the scope
          const echoes: Array<{ nodePath: string; w: any }> = [];
          for (const f of ordered) {
            for (const n2 of (nbMap[f.path]?.nodes ?? []).filter((x: any) => x.dir === "issue")) {
              const w0 = (n2.worst_list ?? [])[0];
              if (w0?.snippet?.length && echoes.length < 2 && !echoes.some((e2) => e2.nodePath === n2.path)) echoes.push({ nodePath: n2.path, w: w0 });
            }
          }
          return (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 224px", gap: 22, alignItems: "start" }}>
            <div style={{ maxWidth: 780, margin: "0 auto", fontFamily: mono, paddingTop: 8, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                {!ed && paperSyns.length > 0 && (
                  <button onClick={() => void commissionEditor()} disabled={edBusy} title="one high-tier call with live web search — the paper specialist writes the study"
                    style={{ background: "transparent", border: `1px solid color-mix(in oklab, ${C.brand} 50%, ${C.border})`, color: C.brand, borderRadius: 6, padding: "1px 11px", cursor: edBusy ? "default" : "pointer", fontFamily: mono, fontSize: FS.small }}>{edBusy ? "✒ the specialist is writing…" : "✒ this study has no editor — write the united paper (1 high-tier call)"}</button>
                )}
                {ed && editor?.ai_call_id != null && <button onClick={() => setAiCallId(editor.ai_call_id)}
                  style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 5, padding: "0 8px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>⚙ the editor's call · ${Number(editor?.cost_usd ?? 0).toFixed(4)}</button>}
              </div>
              {edErr && <div style={{ fontSize: FS.small, color: C.bad }}>✕ {edErr}</div>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", marginTop: 4 }}>
                {session.class_request && <span style={{ fontSize: FS.small, color: C.brand, fontFamily: mono, animation: "loki-hub 1.4s ease-in-out infinite" }}>next step →</span>}
                <button onClick={() => void makeClass("video")} disabled={classBusy} title="the study as a narrated video class — slides fade, the local Kokoro voice teaches each one (1 AI call for the deck; the voice is $0)"
                  style={{ background: "transparent", border: `1px solid color-mix(in oklab, ${C.brand} 45%, ${C.border})`, color: C.brand, borderRadius: 6, padding: "1px 11px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>{classBusy ? "▶ building the class…" : classDeck ? "▶ video class" : "▶ video class (1 call)"}</button>
                <button onClick={() => void makeClass("slides")} disabled={classBusy} title="the same deck as a silent presentation — slide transitions, the speech shown as text"
                  style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "1px 11px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>⧉ presentation</button>
                <button onClick={() => void makeSoliloquy()} disabled={solBusy || !session.origin_nb}
                  title={session.origin_nb ? "the study as ONE narrated lecture (script call + the local Kokoro voice, $0) — files on the origin notebook" : "open this wizard from a notebook (Research → Soliloquy) to voice the study — the player lives there"}
                  style={{ background: "transparent", border: `1px solid ${session.origin_nb ? `color-mix(in oklab, ${C.warn} 45%, ${C.border})` : C.border}`, color: session.origin_nb ? C.warn : C.dim, borderRadius: 6, padding: "1px 11px", cursor: session.origin_nb ? "pointer" : "default", fontFamily: mono, fontSize: FS.small, opacity: session.origin_nb ? 1 : 0.6 }}>{solBusy ? "🎙 voicing…" : solItem ? "🎙 voiced ✓" : "🎙 soliloquy"}</button>
              </div>
              {classErr && <div style={{ fontSize: FS.small, color: C.bad, textAlign: "right" }}>✕ {classErr}</div>}
              {solErr && <div style={{ fontSize: FS.small, color: C.bad, textAlign: "right" }}>✕ {solErr}</div>}
              {solItem && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                  <audio controls preload="metadata" src={`${BE_URL}/api/v1/notebook/audio/${solItem.id}`} style={{ height: 28, maxWidth: 320 }} />
                </div>
              )}

              {/* TITLE · AUTHORS · SCOPE */}
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <div style={{ fontSize: 19, fontWeight: 700, color: C.fg, lineHeight: 1.35, maxWidth: 680, margin: "0 auto" }}>{ed?.title ?? `A Study of ${session.label}`}</div>
                <div style={{ fontSize: FS.base, color: C.muted, marginTop: 8 }}>
                  {authors.map((a2, i) => <span key={a2}>{lensOf(a2)}<sup style={{ color: C.dim }}>{i + 1}</sup>{i < authors.length - 1 ? ", " : ""}</span>)}
                  {ed && <span> and The Editor<sup style={{ color: C.dim }}>†</sup></span>}
                </div>
                <div style={{ fontSize: FS.small, color: C.dim, marginTop: 3 }}>derived lenses of this workspace's constitution{ed ? " · † one high-tier synthesis call" : ""}</div>
                <div style={{ fontSize: FS.small, color: C.dim, marginTop: 2 }}>
                  case{rv.files.length === 1 ? "" : "s"}: {rv.files.length} · field: {fieldCount} neighbor{fieldCount === 1 ? "" : "s"} · population: the latest snapshot · recorded cost ${cost.toFixed(4)}
                </div>
              </div>

              {/* ABSTRACT */}
              <div style={{ margin: "18px 34px 0" }}>
                <div style={{ textAlign: "center", fontSize: FS.base, color: C.fg, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>ABSTRACT</div>
                <p style={{ fontSize: FS.base, lineHeight: 1.85, color: C.fg, textAlign: "justify", margin: 0 }}>
                  {ed?.discovery ? `${ed.discovery} ` : ""}
                  {ed?.introduction ? `${ed.introduction} ` : `We examine ${rv.files.length === 1 ? "one file" : `${rv.files.length} files`}${regionHealth != null ? ` (region health ${regionHealth})` : ""} under the ratified constitution. `}
                  {theories.length ? `${authors.length} specialist${authors.length === 1 ? "" : "s"} defend${authors.length === 1 ? "s" : ""} ${theories.length === 1 ? "one thesis" : `${theories.length} theses`}` : "The crew recorded no validated theory"}
                  {court.convergence.length ? `; ${court.convergence.length} independent convergence${court.convergence.length === 1 ? "" : "s"} emerged` : ""}
                  {court.divergence.length ? `; ${court.divergence.length} disagreement${court.divergence.length === 1 ? " remains" : "s remain"} open` : ""}
                  {plan.length ? `. The study contributes ${plan.length} repair move${plan.length === 1 ? "" : "s"}.` : "."}
                </p>
              </div>

              {/* 1 · INTRODUCTION */}
              <Sec id="p-intro" n="1" title="Introduction" simple={<>
                <P>{ed?.arc?.question ? <>In one sentence, the claim: <i>{ed.arc.question}</i></> : <>We looked at {session.label} and checked it against this workspace's own rules.</>}</P>
                <P>{rv.files.length} file{rv.files.length === 1 ? "" : "s"} examined, {fieldCount} neighbor{fieldCount === 1 ? "" : "s"} pulled in for context, {plan.length} fix{plan.length === 1 ? "" : "es"} proposed. Expand for the full framing and the overview figure.</P>
              </>}>
                {ed && <P>{ed.arc?.question ? <>This study asks: <i>{ed.arc.question}</i> </> : null}{ed.discovery ? <>Its answer, defended in the sections that follow: <b>{String(ed.discovery).replace(/\.$/, "")}</b>. </> : null}{mt?.statement ? `${String(mt.statement).trim()} ` : ed.arc?.thread ? `${String(ed.arc.thread).trim()} ` : ""}</P>}
                {!ed && <P>{theories.length ? <>The central claim of this study: <b>{theories[0]}</b>{paperSyns[0]?.syn?.lead?.review?.summary?.headline ? <> — {String(paperSyns[0].syn.lead.review.summary.headline).replace(/\.$/, "")}</> : null}.{theories.length > 1 ? <> A second thesis stands beside it: <b>{theories[1]}</b>.</> : null} The sections that follow lay out the recorded evidence, the field around the case{rv.files.length === 1 ? "" : "s"}, and the repairs the crew proposes.</> : <>The detectors recorded {rv.files.reduce((a2: number, f2: any) => a2 + (f2.fc?.violations?.length ?? 0), 0)} violation(s) across {rv.files.length} file(s); no specialist theory survived validation, so this study is the record itself, laid out with its evidence.</>}</P>}
                {(ed?.reading_order?.length ?? 0) > 1 && (
                  <P><span style={{ color: C.dim, fontSize: FS.small }}>Sections 3–{2 + ordered.length} develop the cases in the editor's order ({ed.reading_order.map((ro: any) => String(ro.path).split("/").pop()).join(" → ")}); the synthesis and repairs follow; the appendices hold the instruments and every call.</span></P>
                )}
                {axesAll.length > 0 && (
                  <Fig caption={<>The study at a glance: each thesis wired to the engineering axes it cites (validated citations only){webPairs.length ? "; dashed arcs join cases that cite the same law" : ""}. Axis colors follow the engineering palette.</>}>
                    <AxisWeb web={web} axesAll={axesAll} pairs={webPairs.slice(0, 4)} />
                  </Fig>
                )}
              </Sec>

              {/* 2 · THE FIELD — with the population's own code as evidence */}
              <Sec id="p-field" n="2" title="The field and its instruments" simple={<>
                <P>The file{rv.files.length === 1 ? "" : "s"} here {rv.files.length === 1 ? "is" : "are"} connected to {fieldCount} other file{fieldCount === 1 ? "" : "s"} — things that import {rv.files.length === 1 ? "it" : "them"}, things {rv.files.length === 1 ? "it" : "they"} depend on.{echoes.length ? ` The same rules are also breaking in ${echoes.length} place${echoes.length === 1 ? "" : "s"} OUTSIDE this study — so this is not a local accident.` : ""}</P>
                <P>Everything was measured by the deterministic engine before any AI spoke. Expand to see the code from those other places.</P>
              </>}>
                <P>
                  {rv.files.length === 1 ? "The case does not stand alone: " : "The cases do not stand alone: "}
                  the snapshot places {fieldCount > 0 ? `${fieldCount} file${fieldCount === 1 ? "" : "s"} in direct relation to ${rv.files.length === 1 ? "it" : "them"} — importers, dependencies, and files elsewhere in the codebase breaking the same laws` : "no measured neighbors around the scope"}.
                  Every axis score, violation and hunk below was measured deterministically before any model spoke; the complete record is reproduced in Appendix A.
                  {echoes.length > 0 ? <> The population is not an abstraction — Listing{echoes.length > 1 ? "s" : ""} {LSTN + 1}{echoes.length > 1 ? ` and ${LSTN + 2}` : ""} show{echoes.length > 1 ? "" : "s"} the same laws breaking in files OUTSIDE this study's scope.</> : null}
                </P>
                {echoes.map((e2, i) => (
                  <Listing key={i} rows={e2.w.snippet} sickLine={e2.w.line} severity={e2.w.severity}
                    caption={<>A codebase echo: § {e2.w.law_key} breaking in <b>{String(e2.nodePath).split("/").pop()}</b> — outside the scope, same law{e2.w.evidence ? <>. Detector evidence: «{String(e2.w.evidence).slice(0, 80)}»</> : null}.</>} />
                ))}
              </Sec>

              {/* 3.. · THE CASES — each its own numbered section with subsections */}
              {ordered.map((f: any, fi: number) => {
                const syn = synthesizeFile(f);
                const lt = syn?.lead?.review?.theory;
                const pf = (ed?.per_file ?? []).find((p2: any) => p2.path === f.path);
                const nb2 = nbMap[f.path];
                const oi = nb2?.origin_info;
                const ev = syn ? evidenceFor(f, syn) : { blocks: [], leftoverCards: [] };
                const pats = (patMap[f.path] ?? []).slice(0, 5);
                const divHere = court.divergence.filter((d2: any) => !session.multi || String(d2.key).includes(String(f.path).split("/").pop() ?? ""));
                const lessons: any[] = []; const seenC = new Set<string>();
                for (const ag of (f.agents ?? [])) { const L2 = ag.review?.lesson; if (L2?.concept && !seenC.has(L2.concept)) { seenC.add(L2.concept); lessons.push({ ...L2, agent: ag.agent }); } }
                const sn = caseSec(fi);
                // a case with NO cited listing still shows its worst recorded hunk — an
                // allegation never stands without code (operator round 2)
                const fallbackHunks = ev.blocks.length ? [] : ((f.fc?.worst_list ?? []).filter((w0: any) => w0?.snippet?.length).slice(0, 1));
                // the field's strongest edge + hidden couplings, in prose
                const edges2 = (nb2?.edges ?? []).filter((e2: any) => e2.from === f.path || e2.to === f.path);
                const heavy = [...edges2].filter((e2: any) => e2.kind === "import").sort((a: any, b: any) => (b.via?.length ?? 0) - (a.via?.length ?? 0))[0];
                const coch = edges2.find((e2: any) => e2.kind === "co_change");
                // real-source − side for a thin before-after (the diff must SHOW the work)
                const ba = (syn?.widgets ?? []).find((w2: any) => w2.type === "before-after");
                const src0 = srcMap[f.path];
                const baLine = ev.blocks[0]?.v?.line ?? (f.fc?.worst_list ?? [])[0]?.line ?? null;
                const realBad = ba && src0 && baLine != null && String(ba.payload?.bad ?? "").split("\n").length < 3
                  ? Array.from({ length: Math.min(8, src0.length - Math.max(1, baLine - 3) + 1) }, (_, i) => ({ ln: Math.max(1, baLine - 3) + i, text: String(src0[Math.max(1, baLine - 3) + i - 1] ?? "").slice(0, 140) }))
                  : null;
                const sha = shaOf(oi?.first_commit);
                const topMove = syn?.actions?.[0];
                const w0c = (f.fc?.worst_list ?? [])[0];
                const simpleCase = (<>
                  <P>This file scores <b>{f.fc?.health ?? "—"}</b> of 100. {syn ? <>The problem, plainly: {pf?.simplified ? String(pf.simplified).replace(/^in plain terms[,:]?s*/i, "") : (syn.lead.review.summary?.headline ?? lt?.name ?? "—")}</> : "No validated theory reached this case."}</P>
                  {w0c && <P>Worst recorded breach: § {w0c.law_key}{w0c.line != null ? ` at line ${w0c.line}` : ""}.{topMove ? ` First fix: ${topMove.title}.` : ""} Expand for the evidence, the figures and the field.</P>}
                </>);
                return (
                  <Sec key={f.path} id={`p-case-${fi}`} n={sn} title={<>Case study: {f.path.split("/").pop()}{f.fc?.health != null ? <span style={{ color: tone(f.fc.health), fontWeight: 400 }}>&ensp;(health {f.fc.health})</span> : null}</>}
                    simple={simpleCase}>
                    {(f.errors ?? []).length > 0 && (
                      <div style={{ margin: "4px 0 10px", border: `1px solid color-mix(in oklab, ${C.bad} 50%, ${C.border})`, borderRadius: 7, padding: "4px 9px", fontSize: FS.base, color: C.bad, lineHeight: 1.6 }}>
                        {[...new Set<string>(f.errors)].slice(0, 3).map((e2, i) => <div key={i}>✕ {e2.slice(0, 200)}{/the run failed$/.test(e2) ? <span style={{ color: C.warn }}> — no detail reached the paper; if the BE predates today's contract, restart it and rerun</span> : null}</div>)}
                      </div>
                    )}
                    {pf?.bridge && <P><i>{pf.bridge}</i></P>}

                    <Hs>{sn}.1&ensp;The thesis</Hs>
                    {syn ? (
                      <P>
                        <b>{lt?.name ?? syn.lead.review.summary?.title}.</b>{" "}
                        {syn.lead.review.summary?.headline ? `${String(syn.lead.review.summary.headline).replace(/\.$/, "")}. ` : ""}
                        {lt?.explanation ? `${String(lt.explanation).trim()} ` : ""}
                        {lt?.engineering_story ? `${String(lt.engineering_story).trim()} ` : ""}
                        {lt?.if_nothing_changes ? <>If nothing changes, {String(lt.if_nothing_changes).replace(/^If nothing changes[,:]?\s*/i, "").replace(/\.$/, "")}. </> : null}
                        {(ev.blocks.length || fallbackHunks.length) ? <>The evidence follows in Listing {LSTN + 1}{(ev.blocks.length + fallbackHunks.length) > 1 ? `–${LSTN + ev.blocks.length + fallbackHunks.length}` : ""}.</> : null}
                        <span style={{ color: C.dim, fontSize: FS.small }}> — {lensOf(syn.lead.agent)}{lt?.confidence != null ? `, confidence ${Math.round(lt.confidence * 100)}%` : ""}{syn.cosigners.length ? `; co-signed by ${syn.cosigners.map((cg: any) => lensOf(cg.agent)).join(", ")}` : ""}.</span>
                        {syn.lead.ai_call_id != null && <button onClick={() => setAiCallId(syn.lead.ai_call_id)} title="the exact prompt, envelope and raw output"
                          style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: FS.small, padding: "0 3px" }}>⚙</button>}
                      </P>
                    ) : <P>No validated theory reached this case.</P>}
                    {pf?.narrative && <P>{pf.narrative}{pf.simplified ? <> <i>In plain terms: {String(pf.simplified).replace(/^in plain terms[,:]?\s*/i, "")}</i></> : null}</P>}
                    {syn?.extras?.map((ex: any, i: number) => (
                      <Remark key={`x${i}`} by={lensOf(ex.agent)}>{ex.review.theory?.name ?? ex.review.summary?.title}{ex.review.summary?.headline ? ` — ${ex.review.summary.headline}` : ""}</Remark>
                    ))}

                    <Hs>{sn}.2&ensp;The evidence</Hs>
                    {ev.blocks.map((b: any, bi: number) => (
                      <React.Fragment key={bi}>
                        <Listing rows={b.rows} sickLine={b.v.line} severity={b.v.severity}
                          caption={<>The recorded breach of § {b.v.law_key}{b.v.line != null ? ` at line ${b.v.line}` : ""}{b.v.title ? ` — ${b.v.title}` : ""}.{b.v.evidence ? <> Detector evidence: «{String(b.v.evidence).slice(0, 90)}».</> : null}</>} />
                        {b.card && <Remark by={(b.card.agents ?? []).map(lensOf).join(" + ") || "the crew"}>{b.card.title}{b.card.body ? ` — ${b.card.body}` : ""}</Remark>}
                      </React.Fragment>
                    ))}
                    {fallbackHunks.map((w0: any, i: number) => (
                      <Listing key={`fb${i}`} rows={w0.snippet} sickLine={w0.line} severity={w0.severity}
                        caption={<>The case's worst recorded violation (deterministic, uncited by the crew): § {w0.law_key}{w0.line != null ? ` at line ${w0.line}` : ""}{w0.title ? ` — ${w0.title}` : ""}.</>} />
                    ))}
                    {f.fc?.axes && f.fc?.health != null && (
                      <Fig caption={<>Why health is {f.fc.health} while single axes read higher: each axis's weighted pull on the score, drawn as a descent from the perfect 100. The steepest step names the real problem.</>}>
                        <HealthWaterfall axes={f.fc.axes} health={f.fc.health} />
                      </Fig>
                    )}
                    {(syn?.widgets ?? []).map((w: any, i: number) => (
                      <Fig key={`w${i}`} caption={<>{w.type === "before-after" ? (realBad ? "The repair as a real diff: the recorded shape from the source above, the crew's proposed shape below." : "The repair as a diff: the recorded shape above, the proposed shape below.") : w.type === "root-cause-tree" ? "The causal chain the crew reconstructed, written as source annotations." : w.type === "repair-order" ? "The proposed repair, in order." : "The dependency web this theory binds — drawn from the graph, arrows follow the imports."}{(w.agents?.length ?? 0) > 1 ? ` Drawn independently by ${w.agents.map(lensOf).join(" and ")} — they converge.` : ""}</>}>
                        <div style={{ maxWidth: 680 }}><DrawnWidget w={w} realBad={w.type === "before-after" ? realBad : null} /></div>
                      </Fig>
                    ))}

                    <Hs>{sn}.3&ensp;The field around the case</Hs>
                    <P>
                      {heavy ? <>The heaviest edge {heavy.from === f.path ? "leaves the case for" : "arrives from"} <b>{String(heavy.from === f.path ? heavy.to : heavy.from).split("/").pop()}</b>, carrying {heavy.via?.length ?? 0} symbol{(heavy.via?.length ?? 0) === 1 ? "" : "s"}{heavy.via?.length ? ` (${heavy.via.slice(0, 4).join(", ")})` : ""}. </> : null}
                      {coch ? <><b>{String(coch.from === f.path ? coch.to : coch.from).split("/").pop()}</b> co-changes with the case (×{coch.n}) though no import connects them — a hidden coupling the graph alone would miss. </> : null}
                      {oi ? <>The case's history begins at commit {sha ? <code style={{ fontSize: FS.small }}>{sha}</code> : "(unknown)"}; the record first marks it sick {oi.first_snapshot_at ? `on ${String(oi.first_snapshot_at).slice(0, 10)}` : "in an early snapshot"}{oi.reason ? ` — the origin reads as ${String(oi.reason).replace(/-/g, " ")}` : ""}{oi.file && oi.file !== f.path ? `, tracing upstream to ${String(oi.file).split("/").pop()}` : ""}. </> : null}
                      {pats.length ? <>The measured design patterns present are {pats.map((p2: any, i: number) => <span key={i}>{p2.name ?? p2.pattern}{p2.confidence != null ? ` (${Math.round(p2.confidence <= 1 ? p2.confidence * 100 : p2.confidence)}%)` : ""}{i < pats.length - 1 ? ", " : ""}</span>)}. </> : null}
                      {nb2 && (nb2.nodes ?? []).length > 1 ? <>Figure {FIGN + 1} draws the constellation.</> : null}
                    </P>
                    {nb2 && (nb2.nodes ?? []).length > 1 && (
                      <Fig caption={<>The field around {f.path.split("/").pop()}: importers above, dependencies below{(nb2.nodes ?? []).some((n2: any) => n2.dir === "issue") ? ", and files elsewhere in the codebase breaking the same law at right" : ""}. Sick nodes dashed; edges carry the symbols that actually cross them. Click a node to open its recorded hunk.</>}>
                        <ConstellationSegment nb={nb2} fi={fi} />
                      </Fig>
                    )}
                    {ev.leftoverCards.slice(0, 6).map((c2: any, i: number) => (
                      <Remark key={`c${i}`} by={(c2.agents ?? []).map(lensOf).join(" + ") || "the crew"}>{c2.title}{c2.body ? ` — ${c2.body}` : ""}</Remark>
                    ))}
                    {lessons.slice(0, 1).map((L2: any, i: number) => {
                      // the same principle, seen in the FIELD: neighbor hunks breaking the case's cited law
                      const lessonLaw = ev.blocks[0]?.v?.law_key ?? null;
                      const fieldEx = (nb2?.nodes ?? []).filter((n2: any) => n2.dir !== "center" && (n2.worst_list ?? []).some((w0: any) => w0.snippet?.length && (!lessonLaw || w0.law_key === lessonLaw))).slice(0, 2)
                        .map((n2: any) => ({ p: n2.path, w: (n2.worst_list ?? []).find((w0: any) => w0.snippet?.length && (!lessonLaw || w0.law_key === lessonLaw)) }));
                      return (
                        <React.Fragment key={`l${i}`}>
                          <Fig caption={<>{L2.caption ?? `A classroom illustration of ${L2.concept}.`} ({lensOf(String(L2.agent))})</>}>
                            <div style={{ maxWidth: 620, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 11px" }}>
                              <div style={{ fontSize: FS.small, color: C.dim, letterSpacing: 1, textTransform: "uppercase" }}>the theory — {L2.concept}</div>
                              {L2.sample && <pre style={{ margin: "4px 0 0", padding: "5px 9px", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: FS.base, lineHeight: 1.6, overflowX: "auto", fontFamily: mono }}><TokCode code={L2.sample} /></pre>}
                            </div>
                          </Fig>
                          {fieldEx.length > 0 && <P>The classroom example is not hypothetical here — the same shape lives in the case's own field:</P>}
                          {fieldEx.map((x2: any, j: number) => (
                            <Listing key={`fe${j}`} rows={x2.w.snippet} sickLine={x2.w.line} severity={x2.w.severity}
                              caption={<>The same principle observed in the field: § {x2.w.law_key} in <b>{String(x2.p).split("/").pop()}</b>{x2.w.line != null ? ` at line ${x2.w.line}` : ""}.</>} />
                          ))}
                        </React.Fragment>
                      );
                    })}
                    {pf?.example?.code && (
                      <Fig caption={<>{pf.example.caption ?? "The editor's classroom example."} (The Editor)</>}>
                        <pre style={{ maxWidth: 620, margin: 0, padding: "6px 10px", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: FS.base, lineHeight: 1.6, overflowX: "auto", fontFamily: mono }}><TokCode code={pf.example.code} /></pre>
                      </Fig>
                    )}
                    {syn && (syn.pushbacks.length > 0 || divHere.length > 0) && (
                      <P>
                        <b>Threats to validity.</b>{" "}
                        {syn.pushbacks.map((pb: any, i: number) => <span key={i}>{lensOf(pb.agent)} anticipates that {String(pb.text).replace(/\.$/, "")}. </span>)}
                        {divHere.map((d2: any, i: number) => <span key={`d${i}`}>A live disagreement stands on {d2.key} — {d2.agents.map(lensOf).join(" versus ")} ({d2.sevs.join(" / ")}); it remains unresolved. </span>)}
                        {syn.cosigners.length > 0 ? <>Against these, the thesis is independently replicated by {syn.cosigners.map((cg: any) => lensOf(cg.agent)).join(", ")} through overlapping citations.</> : null}
                      </P>
                    )}
                  </Sec>
                );
              })}

              {/* THE SYNTHESIS */}
              {mt && (
                <Sec id="p-synth" n={synthN} title={<>The synthesis: {mt.name}</>} simple={<P>In one line: <b>{mt.name}</b>. {mt.root_cause ? String(mt.root_cause) : mt.statement ? String(mt.statement).split(/(?<=.)s/)[0] : ""}{mt.confidence != null ? ` The editor is ${Math.round(mt.confidence * 100)}% sure.` : ""}</P>}>
                  <P>{mt.statement}{mt.root_cause ? <> The smallest explanation that accounts for most findings is this: {String(mt.root_cause).replace(/\.$/, "")}.</> : null}{(mt.branches ?? []).length ? <> The claim does not stand alone — it decomposes into {mt.branches.length} connected sub-theses, drawn in Figure {FIGN + 1} and developed below.</> : null}</P>
                  {(mt.branches ?? []).length > 0 && (
                    <>
                      <Fig caption={<>The thesis map: the central claim decomposing into its sub-theses. Green edges support, violet refine, amber (dashed) hold a live tension with the center. Each branch names the specialist theses it digests.</>}>
                        <ThesisMap mt={mt} />
                      </Fig>
                      {(mt.branches ?? []).map((b2: any, i: number) => (
                        <P key={i}>
                          <b>{b2.name ?? `Sub-thesis ${i + 1}`}.</b> {b2.claim}
                          <span style={{ color: C.dim, fontSize: FS.small }}> — {b2.relation === "tensions" ? "in tension with" : b2.relation === "refines" ? "refining" : "supporting"} the central thesis{b2.axis ? ` on the ${b2.axis} axis` : ""}{(b2.from ?? []).length ? `; cooked from ${(b2.from ?? []).map((x2: string) => String(x2).replace(" Reviewer", "")).join(" + ")}` : ""}.</span>
                        </P>
                      ))}
                    </>
                  )}
                  {mt.anatomy && (
                    <Fig caption={<>The life of {mt.name}: how it starts, grows, is recognized, prevented and repaired — the cycle every recurrence follows.</>}>
                      <AnatomyLoop anatomy={mt.anatomy} name={mt.name ?? "the pattern"} />
                    </Fig>
                  )}
                  {mt.anatomy && (
                    <P>
                      As a reusable pattern, <b>{mt.name}</b> has a recognizable anatomy.
                      {mt.anatomy.starts ? <> It starts when {String(mt.anatomy.starts).replace(/^it starts (when )?/i, "").replace(/\.$/, "")}.</> : null}
                      {mt.anatomy.grows ? <> It grows as {String(mt.anatomy.grows).replace(/^it grows (as|when)?\s*/i, "").replace(/\.$/, "")}.</> : null}
                      {mt.anatomy.recognize ? <> One recognizes it by {String(mt.anatomy.recognize).replace(/\.$/, "")}.</> : null}
                      {mt.anatomy.prevent ? <> It is prevented by {String(mt.anatomy.prevent).replace(/\.$/, "")}.</> : null}
                      {mt.anatomy.repair ? <> And it is repaired by {String(mt.anatomy.repair).replace(/\.$/, "")}.</> : null}
                    </P>
                  )}
                  {(mt.counterargument || mt.verdict) && (
                    <P>
                      {mt.counterargument ? <>The strongest objection an experienced architect would raise: {String(mt.counterargument).replace(/\.$/, "")}. </> : null}
                      {mt.verdict ? <><b>Verdict:</b> {mt.verdict} </> : null}
                      <span style={{ color: C.dim, fontSize: FS.small }}>
                        {mt.confidence != null ? `Confidence ${Math.round(mt.confidence * 100)}%` : ""}{(mt.supports ?? []).length ? ` on ${(mt.supports ?? []).length} supports (${(mt.supports ?? []).join("; ")})` : ""}{(mt.unknowns ?? []).length ? `; unknown: ${(mt.unknowns ?? []).join("; ")}` : ""}.
                      </span>
                    </P>
                  )}
                </Sec>
              )}

              {/* DISCUSSION — a spoken transcript, never a chunk of text */}
              {dialogue.length > 0 && (
                <Sec id="p-disc" n={discN} title="Discussion" simple={<P>{court.convergence.length ? `The crews agree on ${court.convergence.map((c2: any) => c2.key).slice(0, 2).join(" and ")}. ` : ""}{court.divergence.length ? `They still disagree on ${court.divergence.map((d2: any) => d2.key).slice(0, 2).join(" and ")}. ` : ""}{!court.convergence.length && !court.divergence.length ? "Each voice spoke once; no formal agreements were computed. " : ""}Expand for the full conversation ({dialogue.length} turns).</P>}>
                  {(() => { const spk = [...new Set(dialogue.filter((t2) => t2.kind !== "court" && t2.kind !== "editor").map((t2) => t2.speaker))]; return spk.length >= 2 ? (
                    <Fig caption={<>The court, drawn: green arcs are independent convergences; amber dashed arcs are live dissents. The transcript below carries the words.</>}>
                      <CourtWeb court={court} speakers={spk} />
                    </Fig>
                  ) : null; })()}
                  <div style={{ margin: "4px 0 10px" }}>
                    {dialogue.map((t2, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, margin: "0 0 9px", marginLeft: t2.kind === "court" ? 40 : t2.kind === "push" ? 22 : 0 }}>
                        <b style={{ flexShrink: 0, color: t2.kind === "court" ? C.dim : C.fg, fontSize: FS.base, minWidth: 118, textAlign: "right", fontStyle: t2.kind === "court" ? "italic" : "normal" }}>{t2.speaker}</b>
                        <span style={{ color: t2.kind === "court" ? C.dim : C.muted, fontSize: FS.base + 0.5, lineHeight: 1.8, fontStyle: t2.kind === "court" ? "italic" : "normal" }}>{t2.text}</span>
                      </div>
                    ))}
                  </div>
                </Sec>
              )}

              {/* THE REPAIR PROGRAM — every step with its drawing */}
              {repairN != null && (
                <Sec id="p-repair" n={repairN} title="The repair program" simple={<><P>{plan.length} fix{plan.length === 1 ? "" : "es"}, in order:</P><ol style={{ margin: "0 0 11px 22px", padding: 0, color: C.fg, fontSize: FS.base + 0.5, lineHeight: 1.8 }}>{plan.map((p2: any, i: number) => <li key={i}><b>{p2.title}</b></li>)}</ol></>}>
                  {ed?.repair_read && <P>{ed.repair_read}</P>}
                  {plan.length > 1 && plan.every((p2: any) => !(p2.widgets ?? []).length) && (
                    <Fig caption={<>The repair program as one flow — the order the moves want to happen in.</>}>
                      <div style={{ maxWidth: 680 }}><DrawnWidget w={{ type: "flow", title: null, payload: { steps: plan.map((p2: any) => p2.title) } }} /></div>
                    </Fig>
                  )}
                  {plan.map((p2: any, i: number) => (
                    <div key={i} style={{ margin: "0 0 12px" }}>
                      <P>
                        <b>Step {i + 1} — {p2.title}.</b> <span style={{ color: C.dim, fontSize: FS.small }}>(impact {p2.impact}, effort {p2.effort}{p2.sites.length > 1 ? `, ${p2.sites.length} files` : ""} · by {p2.agents.map(lensOf).join(" + ")})</span>
                        {p2.strategy ? <> {p2.strategy}</> : null}
                      </P>
                      {(p2.widgets ?? []).slice(0, 1).map((w2: any, j: number) => (
                        <div key={j} style={{ maxWidth: 560, marginLeft: 22 }}><DrawnWidget w={w2} /></div>
                      ))}
                    </div>
                  ))}
                  <P><span style={{ color: C.dim, fontSize: FS.small }}>The full program, grouped across files with every proposer's drawing, lives in the ✎ plan tab.</span></P>
                </Sec>
              )}

              {/* CONCLUSION · REFERENCES */}
              {(ed?.generalization || ed?.conclusion) && (
                <Sec id="p-conc" n="" title="Conclusion" simple={<P><i>{ed?.generalization ?? ed?.conclusion ?? ""}</i></P>}>
                  {ed?.generalization && <P><i>{ed.generalization}</i></P>}
                  {ed?.conclusion && <P>{ed.conclusion}</P>}
                </Sec>
              )}
              {(refI.length > 0 || refE.length > 0) && (
                <>
                  <h3 style={{ fontSize: FS.base + 2.5, color: C.fg, margin: "26px 0 10px", fontWeight: 700 }}>References</h3>
                  <div style={{ fontSize: FS.small, color: C.muted, lineHeight: 1.8 }}>
                    {refI.map((r2: any, i: number) => <div key={`i${i}`}>[{i + 1}] {r2.ref}{r2.note ? <span style={{ color: C.dim }}> — {r2.note}</span> : null}</div>)}
                    {refE.map((r2: any, i: number) => (
                      <div key={`e${i}`}>[{refI.length + i + 1}] {r2.title}{r2.source ? <span style={{ color: C.dim }}> — {r2.source}</span> : null}{r2.url && <a href={r2.url} target="_blank" rel="noreferrer" style={{ color: C.brand, marginLeft: 6 }}>↗</a>}{r2.note ? <span style={{ color: C.dim }}> · {r2.note}</span> : null}</div>
                    ))}
                    {refE.length > 0 && <div style={{ fontStyle: "italic", color: C.dim, marginTop: 3 }}>External references came from the editor's live web search — verify before leaning on them.</div>}
                  </div>
                </>
              )}
              {(ed?.further_study ?? []).length > 0 && <P><span style={{ color: C.dim, fontSize: FS.small }}>Further study: {ed.further_study.join(" · ")}.</span></P>}

              {/* APPENDICES */}
              <h3 style={{ fontSize: FS.base + 2.5, color: C.fg, margin: "26px 0 10px", fontWeight: 700 }}>Appendix A&ensp;The instruments and the record</h3>
              {ordered.map((f: any) => {
                const axesE = Object.entries(f.fc?.axes ?? {}) as [string, any][];
                const nV = (f.fc?.violations ?? []).length;
                const open2 = groundOpen.has(f.path);
                if (!f.fc) return null;
                return (
                  <div key={`ap${f.path}`} style={{ marginBottom: 8, fontSize: FS.small, fontFamily: mono }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                      <b style={{ color: C.fg }}>{f.path.split("/").pop()}</b>
                      {axesE.map(([k, a2]) => <span key={k} style={{ color: C.dim }}>{k} <b style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>{a2?.score ?? "—"}</b></span>)}
                      <button onClick={() => setGroundOpen((s) => { const n = new Set(s); if (n.has(f.path)) n.delete(f.path); else n.add(f.path); return n; })}
                        style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: FS.small, padding: 0 }}>{nV} violation{nV === 1 ? "" : "s"} {open2 ? "▴" : "▾"}</button>
                      {(f.agents ?? []).length > 0 && (
                        <button onClick={() => setLongForm((s) => { const n = new Set(s); if (n.has(f.path)) n.delete(f.path); else n.add(f.path); return n; })}
                          style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: FS.small, padding: 0 }}>{longForm.has(f.path) ? "▴ specialists" : `▾ each specialist in full (${(f.agents ?? []).length})`}</button>
                      )}
                    </div>
                    {open2 && (
                      <div style={{ marginTop: 3, border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 10px", lineHeight: 1.65 }}>
                        {(f.fc.violations ?? []).slice(0, 14).map((v: any, i: number) => (
                          <div key={i} style={{ display: "flex", gap: 7, alignItems: "baseline" }}>
                            <span style={{ color: v.severity === "error" ? C.bad : C.muted, flexShrink: 0 }}>§ {v.law_key}</span>
                            <span style={{ color: C.dim, flexShrink: 0 }}>{v.line != null ? `L${v.line}` : ""}</span>
                            <span style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{v.title ?? ""}{v.evidence ? ` — «${String(v.evidence).slice(0, 80)}»` : ""}</span>
                          </div>
                        ))}
                        {nV > 14 && <div style={{ color: C.dim }}>+{nV - 14} more in the record</div>}
                      </div>
                    )}
                    {longForm.has(f.path) && (f.agents ?? []).map((ag: any, i: number) => <ReviewCard key={i} agent={ag.agent} review={ag.review} validation={ag.validation} aiCallId={ag.ai_call_id} onOpenCall={setAiCallId} />)}
                  </div>
                );
              })}
              {paperSyns.length > 0 && (
                <>
                  <h3 style={{ fontSize: FS.base + 2.5, color: C.fg, margin: "26px 0 10px", fontWeight: 700 }}>Appendix B&ensp;The research bridge</h3>
                  {!bridge ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontFamily: mono }}>
                      <button onClick={() => void fileStudy()} disabled={nbBusyK === "file"}
                        style={{ background: "transparent", border: `1px solid color-mix(in oklab, ${C.brand} 45%, ${C.border})`, color: C.brand, borderRadius: 6, padding: "1px 11px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>⎘ {nbBusyK === "file" ? "filing…" : "file this study as a notebook source ($0)"}</button>
                      <span style={{ fontSize: FS.small, color: C.dim }}>the studio's artifact makers (glossary · questions · risks · quiz) can then work on it</span>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: FS.small, color: C.muted, fontFamily: mono }}>filed as notebook #{bridge.id} — each press below spends ONE AI call on the study's corpus</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                        {["glossary", "questions", "risks", "overview", "slides", "timeline", "table", "quiz", "mindmap", "diagram"].map((k) => (
                          <button key={k} onClick={() => void press(k)} disabled={nbBusyK != null}
                            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "1px 10px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>{nbBusyK === k ? "…" : `✎ ${k}`}</button>
                        ))}
                      </div>
                      {arts.map((a2: any, i: number) => (
                        <div key={i} style={{ marginTop: 9 }}>
                          <div style={{ fontSize: FS.small, color: C.dim, fontFamily: mono }}>◆ {a2.title ?? a2.kind}</div>
                          <ArtifactView item={a2} />
                        </div>
                      ))}
                    </>
                  )}
                  {nbErr && <div style={{ fontSize: FS.small, color: C.bad, marginTop: 3, fontFamily: mono }}>✕ {nbErr}</div>}
                </>
              )}
            </div>
            {/* THE SOURCES — every file of the study; click → the IDE view */}
            <div style={{ position: "sticky", top: 0, alignSelf: "start", maxHeight: "calc(92vh - 130px)", overflowY: "auto", paddingTop: 10 }}>
              <div style={{ fontSize: FS.small, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: mono, marginBottom: 5 }}>the sources</div>
              {sources.map((s2) => (
                <button key={s2.path} onClick={() => setSrcOpen(s2.path)} title={s2.path}
                  style={{ display: "flex", gap: 6, alignItems: "baseline", width: "100%", background: srcOpen === s2.path ? C.panel2 : "transparent", border: "none", borderLeft: `2px solid ${s2.tag === "case" ? C.brand : "transparent"}`, padding: "2px 6px", cursor: "pointer", textAlign: "left", fontFamily: mono, borderRadius: 4 }}>
                  <span style={{ fontSize: FS.base, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>{String(s2.path).split("/").pop()}</span>
                  <span style={{ fontSize: FS.small, color: s2.health != null ? tone(s2.health) : C.dim, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{s2.health ?? ""}</span>
                  <span style={{ fontSize: FS.small, color: C.dim, flexShrink: 0 }}>{s2.tag}</span>
                </button>
              ))}
              <div style={{ fontSize: FS.small, color: C.dim, fontFamily: mono, marginTop: 6, lineHeight: 1.5 }}>click a file to read it, IDE-style</div>
              <div style={{ fontSize: FS.small, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: mono, margin: "12px 0 4px" }}>context — internal</div>
              <div style={{ fontSize: FS.small, color: C.muted, fontFamily: mono, lineHeight: 1.7, padding: "0 6px" }}>
                <div>⛭ the record — {rv.files.reduce((a2: number, f2: any) => a2 + (f2.fc?.violations?.length ?? 0), 0)} violations · Appendix A</div>
                <div>⚖ the court — {court.convergence.length}⚡ · {court.divergence.length}△</div>
                {(session.results ?? []).some((r2: any) => r2.res?.ai_call_id != null) && (
                  <button onClick={() => setAiCallId((session.results ?? []).find((r2: any) => r2.res?.ai_call_id != null)?.res?.ai_call_id)}
                    style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: FS.small, padding: 0, display: "block" }}>⚙ the crew — {(session.results ?? []).length} calls · ${cost.toFixed(3)}</button>
                )}
                {editor?.ai_call_id != null && (
                  <button onClick={() => setAiCallId(editor.ai_call_id)}
                    style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: FS.small, padding: 0, display: "block" }}>✒ the editor — ${Number(editor?.cost_usd ?? 0).toFixed(3)}</button>
                )}
                {bridge && <div>⎘ notebook #{bridge.id}</div>}
              </div>
              <div style={{ fontSize: FS.small, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: mono, margin: "10px 0 4px" }}>context — external · web</div>
              <div style={{ fontSize: FS.small, fontFamily: mono, lineHeight: 1.7, padding: "0 6px" }}>
                {(session.web_sources ?? []).slice(0, 6).map((w2: any, i: number) => (
                  <a key={`w${i}`} href={w2.url} target="_blank" rel="noreferrer" title={`scraped pre-flight: ${w2.query ?? ""}`} style={{ display: "block", color: C.muted, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>⌕ {w2.title || w2.domain}<span style={{ color: C.dim }}> — scraped</span></a>
                ))}
                {refE.length ? refE.slice(0, 6).map((r2: any, i: number) => (
                  r2.url
                    ? <a key={i} href={r2.url} target="_blank" rel="noreferrer" style={{ display: "block", color: C.muted, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>↗ {r2.title}{r2.source ? ` — ${r2.source}` : ""}</a>
                    : <div key={i} style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>◦ {r2.title}{r2.source ? ` — ${r2.source}` : ""}</div>
                )) : null}
                {!refE.length && !(session.web_sources ?? []).length && <div style={{ color: C.dim, fontStyle: "italic" }}>no web research reached this study</div>}
              </div>
            </div>
            {/* the IDE drawer */}
            {srcOpen && (
              <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(840px, 76vw)", zIndex: 1250, background: C.panel, borderLeft: `1px solid ${C.border}`, boxShadow: "-18px 0 50px -20px rgba(0,0,0,.6)", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", gap: 9, alignItems: "baseline", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, fontFamily: mono }}>
                  <b style={{ fontSize: FS.base, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{srcOpen}</b>
                  <span style={{ fontSize: FS.small, color: C.dim, flexShrink: 0 }}>{sources.find((s2) => s2.path === srcOpen)?.tag ?? ""}</span>
                  <span style={{ flex: 1 }} />
                  <button onClick={() => setSrcOpen(null)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "1px 10px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>✕ esc</button>
                </div>
                <div style={{ flex: 1, overflow: "auto", padding: "6px 0" }}>
                  {srcFull[srcOpen] === undefined && <div style={{ padding: 14, color: C.dim, fontFamily: mono, fontSize: FS.base }}>reading…</div>}
                  {srcFull[srcOpen] === null && <div style={{ padding: 14, color: C.warn, fontFamily: mono, fontSize: FS.base }}>the file could not be read from the workspace</div>}
                  {typeof srcFull[srcOpen] === "string" && <Highlighted code={srcFull[srcOpen] as string} fontSize={11} lineNumW={46} />}
                </div>
              </div>
            )}
            </div>
          );
        })()}
        {tab === "plan" && (
          <div style={{ marginTop: 8 }}>
            {plan.length > 0 && <div style={{ fontSize: FS.small, color: C.dim, letterSpacing: 2, textTransform: "uppercase", fontFamily: mono, marginBottom: 8 }}>the repair program — this study's engineering appendix</div>}
            {editor?.editor?.repair_read && (
              <div style={{ marginBottom: 10, maxWidth: 840, fontFamily: mono, borderLeft: `2px solid ${C.border}`, paddingLeft: 10 }}>
                <div style={{ fontSize: FS.base, color: C.fg, lineHeight: 1.75 }}><b style={{ color: C.dim, fontSize: FS.small, letterSpacing: 1, textTransform: "uppercase" }}>the editor reads the program · </b>{editor.editor.repair_read}</div>
              </div>
            )}
            {plan.length ? plan.map((p: any, i: number) => (
              <div key={p.key} style={{ marginTop: i ? 14 : 0, paddingTop: i ? 9 : 0, borderTop: i ? `1px solid color-mix(in oklab, ${C.border} 45%, transparent)` : "none" }}>
                {/* the file-review plan anatomy: the DRAWING left · the step's comment right */}
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", columnGap: 24, alignItems: "start" }}>
                  <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                    {p.widgets.length ? p.widgets.map((w: any, j: number) => <DrawnWidget key={j} w={w} />) : (
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 10px", fontFamily: mono }}>
                        <div style={{ fontSize: FS.small, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>where it lands</div>
                        {p.sites.slice(0, 6).map((s2: any, j: number) => <div key={j} style={{ fontSize: FS.base, color: C.muted }}>{s2.path.split("/").pop()}</div>)}
                        {p.sites.length > 6 && <div style={{ fontSize: FS.small, color: C.dim }}>+{p.sites.length - 6} more</div>}
                      </div>
                    )}
                  </div>
                  <div style={{ position: "relative" }}>
                    <svg style={{ position: "absolute", left: 0, top: 8, width: 1, height: 1, overflow: "visible", pointerEvents: "none" }}>
                      <SArrow2 x1={2} y1={8} x2={-26} y2={16} tone={C.dim} />
                    </svg>
                    <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, background: C.panel2, padding: "6px 10px", transform: `rotate(${i % 2 ? 0.4 : -0.4}deg)`, fontFamily: mono }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                        <b style={{ fontSize: FS.title, color: C.brand }}>{i + 1}</b>
                        <b style={{ fontSize: FS.base, color: C.fg, lineHeight: 1.4 }}>{p.title}</b>
                      </div>
                      <div style={{ display: "flex", gap: 4, marginTop: 2, flexWrap: "wrap" }}>{chip(`impact ${p.impact}`, p.impact === "large" ? C.ok : C.muted)}{chip(`effort ${p.effort}`, C.dim)}{p.agents.length > 1 && chip(`×${p.agents.length} proposed`, C.ok)}</div>
                      {p.strategy && <div style={{ fontSize: FS.small, color: C.muted, lineHeight: 1.55, marginTop: 3 }}>✎ {p.strategy}</div>}
                      <div style={{ fontSize: FS.small, color: C.dim, marginTop: 2 }}>{p.sites.length === 1 ? "one file" : `${p.sites.length} files`} · by {p.agents.map((a2: string) => a2.replace(" Reviewer", "")).join(" + ")}</div>
                    </div>
                  </div>
                </div>
              </div>
            )) : <div style={{ fontSize: FS.base, color: C.ok, fontStyle: "italic" }}>✓ no actions proposed — the crews' theories stand on their own</div>}
          </div>
        )}
        {tab === "manifest" && (() => {
          /* ── the LIVING PAPER — full scientific detail, each section folding between
             a computed one-liner (simplify) and the complete record (expand) ── */
          const Sec = ({ id, title, simple, full }: { id: string; title: string; simple: React.ReactNode; full: React.ReactNode }) => (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", gap: 9, alignItems: "baseline" }}>
                <div style={{ fontSize: FS.small, color: C.dim, textTransform: "uppercase", letterSpacing: 1.2, fontFamily: mono }}>{title}</div>
                <button onClick={() => setPaperEx((m) => ({ ...m, [id]: !m[id] }))}
                  style={{ background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: FS.small, padding: 0 }}>{paperEx[id] ? "▴ simplify" : "▾ expand"}</button>
              </div>
              <div style={{ marginTop: 4, fontFamily: mono, lineHeight: 1.65 }}>{paperEx[id] ? full : simple}</div>
            </div>
          );
          const syns = rv.files.map((f: any) => ({ f, syn: synthesizeFile(f) })).filter((x: any) => x.syn);
          const allAgents = [...new Set((session.results ?? []).map((r: any) => r.agent))] as string[];
          const allCards = rv.files.flatMap((f: any) => (f.agents ?? []).flatMap((ag: any) => (ag.review?.cards ?? []).map((c2: any) => ({ ...c2, agent: ag.agent, path: f.path }))));
          const sevN: Record<string, number> = { error: 0, warn: 0, info: 0 };
          for (const c2 of allCards) sevN[c2.severity] = (sevN[c2.severity] ?? 0) + 1;
          const totalAttempts = (session.results ?? []).reduce((a: number, r: any) => a + (r.res?.attempts ?? 1), 0);
          const totalDropped = (session.results ?? []).filter((r: any) => r.res?.ok !== false && !r.res?.review).length;
          const uncitedTotal = rv.files.reduce((a: number, f: any) => a + (f.agents ?? []).reduce((b: number, ag: any) => b + (ag.validation?.uncited_dropped ?? 0), 0), 0);
          const allActions = rv.files.flatMap((f: any) => (f.agents ?? []).flatMap((ag: any) => (ag.review?.actions ?? []).map((a2: any) => ({ ...a2, agent: ag.agent }))));
          return (
            <div style={{ marginTop: 8, maxWidth: 860 }}>
              <Sec id="abstract" title="abstract"
                simple={<span style={{ fontSize: FS.base, color: C.muted }}>{syns.length ? `${syns.map((x: any) => x.syn.lead.review.summary?.headline ?? x.syn.lead.review.theory?.name).filter(Boolean).join(" · ")}` : "no parsed reviews"} — {allAgents.length} specialist{allAgents.length === 1 ? "" : "s"}, {rv.files.length} file{rv.files.length === 1 ? "" : "s"}, ${cost.toFixed(4)}.</span>}
                full={<div style={{ fontSize: FS.base, color: C.muted }}>{syns.map(({ f, syn }: any, i: number) => (
                  <div key={i} style={{ marginTop: i ? 5 : 0 }}><b style={{ color: C.fg }}>{f.path.split("/").pop()}</b> — <b style={{ color: C.fg }}>{syn.lead.review.theory?.name}</b>: {syn.lead.review.theory?.explanation}{syn.cosigners.length ? ` Co-signed by ${syn.cosigners.map((c2: any) => c2.agent.replace(" Reviewer", "")).join(", ")}.` : ""}</div>
                ))}</div>} />
              <Sec id="method" title="method"
                simple={<span style={{ fontSize: FS.base, color: C.muted }}>{allAgents.map((a2) => a2.replace(" Reviewer", "")).join(" + ")} · {session.results.length} call{session.results.length === 1 ? "" : "s"} ({totalAttempts} attempt{totalAttempts === 1 ? "" : "s"}) · parallel · each money-guarded · validator: citations checked, widgets whitelisted, enums coerced.</span>}
                full={<div style={{ fontSize: FS.base, color: C.muted }}>
                  <div>Each specialist received its lens (laws + axes), the deterministic verdict, the recorded violations with evidence, the citable-id list, and the source (≤5,000 chars). One theory demanded; claims must cite; output JSON only, ≤2,200 tokens out; one retry on a dropped parse (cache bypassed).</div>
                  <div style={{ marginTop: 3 }}>The validator dropped uncited claims ({uncitedTotal} total), converted unknown widgets, and demoted uncited theories to observations. {totalDropped ? `${totalDropped} review(s) failed parsing after retry and were dropped, never guessed at.` : "Every review parsed."}</div>
                </div>} />
              <Sec id="evidence" title="deterministic evidence"
                simple={<span style={{ fontSize: FS.base, color: C.muted }}>{rv.files.reduce((a: number, f: any) => a + (f.fc?.violations?.length ?? 0), 0)} recorded violation(s) across the scope · citations validated per claim · {uncitedTotal} uncited dropped.</span>}
                full={<div style={{ fontSize: FS.base, color: C.muted }}>{rv.files.map((f: any, i: number) => {
                  const cites = [...new Set((f.agents ?? []).flatMap((ag: any) => (ag.review?.evidence ?? []).map((e2: any) => e2.id)))];
                  return <div key={i} style={{ marginTop: i ? 4 : 0 }}><b style={{ color: C.fg }}>{f.path.split("/").pop()}</b> — health {f.fc?.health ?? "—"} · {f.fc?.violations?.length ?? 0} recorded violation(s) · cited: {cites.length ? cites.join(", ") : "nothing"}</div>;
                })}</div>} />
              <Sec id="findings" title="findings"
                simple={<span style={{ fontSize: FS.base, color: C.muted }}>{allCards.length} card{allCards.length === 1 ? "" : "s"} — {sevN.error} error · {sevN.warn} warn · {sevN.info} info.</span>}
                full={<div>{allCards.map((c2: any, i: number) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "2px 0", fontSize: FS.base }}>
                    <span style={{ color: SEV_TONE2[c2.severity] ?? C.dim, width: 34, flexShrink: 0 }}>{c2.severity}</span>
                    <div style={{ minWidth: 0 }}><b style={{ color: C.fg }}>{c2.title}</b><span style={{ color: C.dim, fontSize: FS.small }}> — {c2.agent.replace(" Reviewer", "")}{session.multi ? ` · ${String(c2.path).split("/").pop()}` : ""}</span>
                      {c2.body && <div style={{ color: C.muted, fontSize: FS.small, lineHeight: 1.55 }}>{c2.body}</div>}</div>
                  </div>
                ))}</div>} />
              <Sec id="discussion" title="discussion"
                simple={<span style={{ fontSize: FS.base, color: C.muted }}>{court.convergence.length} convergence · {court.divergence.length} divergence · {syns.reduce((a: number, x: any) => a + x.syn.pushbacks.length, 0)} expected pushback(s).</span>}
                full={<div style={{ fontSize: FS.base, color: C.muted }}>
                  {rv.files.flatMap((f: any) => (f.agents ?? []).map((ag: any, i: number) => (
                    <div key={`${f.path}${i}`} style={{ marginTop: 5 }}>
                      <b style={{ color: C.fg }}>{ag.agent}</b>{session.multi ? <span style={{ color: C.dim }}> · {String(f.path).split("/").pop()}</span> : null} — <b style={{ color: C.fg }}>{ag.review.theory?.name}</b>
                      <div>{ag.review.theory?.explanation}</div>
                      {ag.review.theory?.root_cause && <div><span style={{ color: C.dim }}>root cause —</span> {ag.review.theory.root_cause}</div>}
                      {ag.review.theory?.engineering_story && <div><span style={{ color: C.dim }}>the story —</span> {ag.review.theory.engineering_story}</div>}
                      {ag.review.theory?.if_nothing_changes && <div style={{ fontStyle: "italic", color: C.dim }}>if nothing changes — {ag.review.theory.if_nothing_changes}</div>}
                      {ag.review.expected_pushback && <div style={{ color: C.dim }}>⚖ expects pushback — {ag.review.expected_pushback}</div>}
                    </div>
                  )))}
                  {(court.convergence.length > 0 || court.divergence.length > 0) && (
                    <div style={{ marginTop: 6 }}>
                      {court.convergence.map((c2: any, i: number) => <div key={`cv${i}`} style={{ color: C.muted }}>⚡ convergence on {c2.key} — {c2.agents.length} independent lenses</div>)}
                      {court.divergence.map((d2: any, i: number) => <div key={`dv${i}`} style={{ color: C.muted }}>⚖ divergence on {d2.key} — {d2.agents.join(" vs ")} ({d2.sevs.join(" / ")})</div>)}
                    </div>
                  )}
                </div>} />
              <Sec id="actions" title="proposed actions"
                simple={<span style={{ fontSize: FS.base, color: C.muted }}>{plan.length ? plan.map((p: any) => p.title).join(" · ") : "none proposed"}.</span>}
                full={<div>{allActions.map((a2: any, i: number) => (
                  <div key={i} style={{ padding: "2px 0", fontSize: FS.base }}>
                    <b style={{ color: C.fg }}>{a2.title}</b> <span style={{ color: C.dim, fontSize: FS.small }}>impact {a2.impact} · effort {a2.effort} · {a2.agent.replace(" Reviewer", "")}</span>
                    {a2.strategy && <div style={{ color: C.muted, fontSize: FS.small, lineHeight: 1.55 }}>{a2.strategy}</div>}
                  </div>
                ))}</div>} />
              <Sec id="threats" title="threats to validity"
                simple={<span style={{ fontSize: FS.base, color: C.muted }}>{syns.reduce((a: number, x: any) => a + x.syn.pushbacks.length, 0)} anticipated objection(s) · {court.divergence.length} live disagreement(s) · every uncited claim already dropped ({uncitedTotal}).</span>}
                full={<div style={{ fontSize: FS.base, color: C.muted }}>
                  {syns.flatMap(({ f, syn }: any) => syn.pushbacks.map((pb: any, i: number) => (
                    <div key={`${f.path}${i}`} style={{ marginTop: 2 }}>⚖ <b style={{ color: C.fg }}>{pb.agent.replace(" Reviewer", "")}</b>{session.multi ? ` · ${String(f.path).split("/").pop()}` : ""} anticipates: {pb.text}</div>
                  )))}
                  {court.divergence.map((d2: any, i: number) => <div key={`dv${i}`} style={{ color: C.warn, marginTop: 2 }}>△ unresolved — {d2.key}: {d2.agents.join(" vs ")} ({d2.sevs.join(" / ")})</div>)}
                  <div style={{ marginTop: 4, color: C.dim }}>Construct validity: every citation was checked against the citable list; {uncitedTotal} uncited claim(s) were dropped, never rendered. Levels above "finding" invite scrutiny by design.</div>
                </div>} />
              <Sec id="glossary" title="glossary — the laws this study cites"
                simple={(() => { const cited = [...new Set<string>(rv.files.flatMap((f: any) => (f.agents ?? []).flatMap((ag: any) => (ag.review?.evidence ?? []).filter((e2: any) => e2.kind === "law").map((e2: any) => String(e2.id)))))]; return <span style={{ fontSize: FS.base, color: C.muted }}>{cited.length ? cited.map((k) => `§ ${k}`).join(" · ") : "no law citations"}.</span>; })()}
                full={(() => {
                  const titleOf = new Map<string, string>();
                  for (const f of rv.files) for (const v of (f.fc?.violations ?? [])) if (v.law_key && !titleOf.has(v.law_key)) titleOf.set(v.law_key, v.title ?? "");
                  const cited = [...new Set<string>(rv.files.flatMap((f: any) => (f.agents ?? []).flatMap((ag: any) => (ag.review?.evidence ?? []).filter((e2: any) => e2.kind === "law").map((e2: any) => String(e2.id)))))];
                  return <div style={{ fontSize: FS.base, color: C.muted }}>{cited.length ? cited.map((k) => (
                    <div key={k} style={{ marginTop: 2 }}><b style={{ color: C.fg }}>§ {k}</b>{titleOf.get(k) ? <span> — {titleOf.get(k)}</span> : <span style={{ color: C.dim }}> — cited by the crew; no recorded violation in scope</span>}</div>
                  )) : "no law citations in this study."}</div>;
                })()} />
              <Sec id="figures" title="list of figures"
                simple={(() => { const nL = syns.reduce((a: number, x: any) => a + evidenceFor(x.f, x.syn).blocks.length, 0); const nF = syns.reduce((a: number, x: any) => a + (x.syn.widgets ?? []).length, 0); return <span style={{ fontSize: FS.base, color: C.muted }}>{nL} listing(s) · {nF} figure(s) · every one anchored to validated evidence.</span>; })()}
                full={<div style={{ fontSize: FS.base, color: C.muted }}>{syns.map(({ f, syn }: any, i: number) => {
                  const ev2 = evidenceFor(f, syn);
                  return (
                    <div key={i} style={{ marginTop: i ? 4 : 0 }}>
                      <b style={{ color: C.fg }}>{String(f.path).split("/").pop()}</b>
                      {ev2.blocks.map((b: any, bi: number) => <div key={`l${bi}`} style={{ paddingLeft: 10 }}>Listing {i + 1}.{bi + 1} — § {b.v.law_key} at L{b.v.line}</div>)}
                      {(syn.widgets ?? []).map((w2: any, wi: number) => <div key={`f${wi}`} style={{ paddingLeft: 10 }}>Fig. {i + 1}.{wi + 1} — {w2.type}{w2.title ? `: ${w2.title}` : ""}</div>)}
                    </div>
                  );
                })}</div>} />
              <Sec id="appendix" title="appendix — the raw calls"
                simple={<span style={{ fontSize: FS.base, color: C.muted }}>{session.results.length} call{session.results.length === 1 ? "" : "s"} · ${cost.toFixed(4)} total · every prompt one ⚙ away.</span>}
                full={<div>{session.results.map((r2: any, j: number) => (
                  <div key={j} style={{ marginTop: 5, paddingLeft: 9, borderLeft: `2px solid color-mix(in oklab, ${C.border} 70%, transparent)` }}>
                    <div style={{ display: "flex", gap: 7, alignItems: "baseline", fontSize: FS.small, color: C.dim }}>
                      <span>{r2.agent}{session.multi ? ` · ${String(r2.path).split("/").pop()}` : ""}{r2.res?.attempts > 1 ? ` · ${r2.res.attempts} attempts` : ""} · ${Number(r2.res?.cost_usd ?? 0).toFixed(4)}</span>
                      {r2.res?.ai_call_id != null && <button onClick={() => setAiCallId(r2.res.ai_call_id)} title="open the AI-call window — the exact prompt sent, the envelope, the raw output"
                        style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 4, padding: "0 7px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>⚙ the prompt · call #{r2.res.ai_call_id}</button>}
                    </div>
                    {r2.res?.ok === false ? <div style={{ fontSize: FS.base, color: C.bad }}>{r2.res.error}</div> : <Findings res={r2.res} />}
                  </div>
                ))}</div>} />
            </div>
          );
        })()}
      </div>
      {/* the silent presentation now plays as the CINEMA (operator 2026-07-26); the narrated video keeps its TTS player */}
      {classMode === "slides" && classDeck && <CinematicPlayer deck={classDeck} onClose={() => setClassMode(null)} />}
      {classMode === "video" && classDeck && <ClassPlayer deck={classDeck} mode={classMode} swarmId={session.swarm_id ?? null} onClose={() => setClassMode(null)} />}
      {studioFor && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1300 }}>
        <StudioOverlay
          conv={{ request: `The study "${session.label}" — focus on: ${studioFor}. Use the paper below as the source of truth.`, response: paperMarkdown() }}
          onResult={(r: any) => { const item = r?.item ?? (r?.body_md ? r : null); const next = [...arts, item ?? { title: "studio result", body_md: typeof r === "string" ? r : JSON.stringify(r ?? {}, null, 1).slice(0, 4000) }]; session.nb_arts = next; setArts(next); }}
          onClose={() => setStudioFor(null)}
        />
        </div>
      )}
    </div>
  );
}

// ── AGENT AVATARS (operator 2026-07-19): every specialist is a little professional —
// a round face under a colored HELMET that carries the specialization's symbol.
// Deterministic: same agent, same face, everywhere (roster · the race).
const CAT_TONE: Record<string, string> = {
  axis: C.brand, core: C.ok, specialist: "oklch(0.75 0.13 60)",
  language: "oklch(0.74 0.12 200)", framework: "oklch(0.76 0.13 320)",
  custom: C.warn, editor: "oklch(0.78 0.16 295)",
};
const AGENT_GLYPHS: Array<[RegExp, string]> = [
  [/editor|paper/i, "✒"], [/custom/i, "★"],
  [/compliance|provenance|audit|law/i, "⚖"], [/defect/i, "⌖"],
  [/test|assert|coverage|determin|hygiene|isolat/i, "⚗"],
  [/structure|complex|god|modular/i, "⌂"],
  [/coupling|depend|cycle|graph/i, "⛓"], [/cohesion/i, "◉"], [/change|churn/i, "↯"],
  [/security|inject|secret|trust|transport/i, "⛨"],
  [/pattern|shape|signature/i, "⌸"], [/perform|hot|leak/i, "⚡"],
  [/data|flow/i, "≋"], [/reach|dead|orphan|unused/i, "∅"],
  [/style|suppress/i, "✎"], [/correct|type|rigor|error/i, "✓"],
  [/typescript|javascript|python|language/i, "⌨"], [/react|node|framework|lifecycle|idiom/i, "⚙"],
];
const glyphFor = (key: string) => AGENT_GLYPHS.find(([re]) => re.test(key))?.[1] ?? String(key).replace(/^[a-z]+:/, "").charAt(0).toUpperCase();
// the ROSTER's clean form (operator: the faces read childish in the sidebar):
// a tone-ringed circle with the specialization glyph — an icon node, no face.
export function AgentNode({ id, title, category, size = 24 }: { id: string; title?: string; category?: string; size?: number }) {
  const toneC = CAT_TONE[category ?? ""] ?? CAT_TONE[String(id).split(":")[0]] ?? C.dim;
  const glyph = glyphFor(`${id} ${title ?? ""}`);
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", border: `1.4px solid color-mix(in oklab, ${toneC} 65%, ${C.border})`, background: C.panel2, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: mono, fontSize: Math.round(size * 0.46), color: toneC, lineHeight: 1 }}>{glyph}</span>
  );
}
// keyframes for the race (idempotent; killed under prefers-reduced-motion)
let _raceCssDone = false;
function ensureRaceCss() {
  if (_raceCssDone || typeof document === "undefined") return;
  _raceCssDone = true;
  const s = document.createElement("style");
  s.textContent = "@keyframes loki-flow{to{stroke-dashoffset:-88px}}@keyframes loki-hub{0%,100%{opacity:1}50%{opacity:0.55}}@keyframes loki-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}@keyframes loki-fade-in{from{opacity:0}to{opacity:1}}@keyframes loki-caption{0%{opacity:0;transform:translateY(6px)}14%{opacity:1;transform:translateY(0)}86%{opacity:1}100%{opacity:0}}@keyframes loki-slide-in{from{opacity:0;transform:translateX(70px)}to{opacity:1;transform:translateX(0)}}@media (prefers-reduced-motion: reduce){*{animation:none !important;transition:none !important}}";
  document.head.appendChild(s);
}

// ── the THESIS MAP — one central claim decomposing into connected sub-theses
// (operator 2026-07-19: "a single thesis divided in axes, all fluid"). Relations
// carry tone: supports green, refines violet, tensions amber. A figure, so color.
function ThesisMap({ mt }: { mt: any }) {
  const branches = (mt?.branches ?? []).slice(0, 5);
  if (!branches.length) return null;
  const REL: Record<string, string> = { supports: C.ok, refines: C.brand, tensions: C.warn };
  const W = 860, rowH = 64, H = Math.max(200, 60 + branches.length * rowH);
  const cx = 190, cy = H / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 880, display: "block" }}>
      <g transform={`rotate(-1 ${cx} ${cy})`}>
        <ellipse cx={cx} cy={cy} rx={150} ry={40} fill={C.panel2} stroke={C.fg} strokeWidth={1.5} />
        <text x={cx} y={cy - 4} textAnchor="middle" fill={C.fg} style={{ fontFamily: mono, fontSize: 12, fontWeight: 700 }}>{String(mt.name ?? "the central thesis").slice(0, 26)}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 10 }}>the central thesis</text>
      </g>
      {branches.map((b: any, i: number) => {
        const by = 44 + i * rowH + rowH / 2 - 10;
        const tone2 = REL[b.relation] ?? C.dim;
        return (
          <g key={i}>
            <path d={`M ${cx + 148} ${cy + (i - (branches.length - 1) / 2) * 9} C ${cx + 230} ${cy}, ${470} ${by}, ${520} ${by}`} fill="none" stroke={`color-mix(in oklab, ${tone2} 65%, transparent)`} strokeWidth={1.4} strokeDasharray={b.relation === "tensions" ? "5 4" : undefined} />
            <text x={492} y={by - 7} textAnchor="middle" fill={tone2} style={{ fontFamily: mono, fontSize: 10 }}>{b.relation}</text>
            <g transform={`rotate(${i % 2 ? 0.6 : -0.6} 660 ${by})`}>
              <rect x={522} y={by - 20} width={300} height={42} rx={10} fill={C.panel2} stroke={tone2} strokeWidth={1.2} />
              <text x={672} y={by - 4} textAnchor="middle" fill={C.fg} style={{ fontFamily: mono, fontSize: 11, fontWeight: 700 }}>{String(b.name ?? `branch ${i + 1}`).slice(0, 34)}</text>
              <text x={672} y={by + 12} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 10 }}>{b.axis ? `⬡ ${b.axis}` : ""}{(b.from ?? []).length ? `${b.axis ? " · " : ""}digests ${(b.from ?? []).slice(0, 2).map((x: string) => String(x).replace(" Reviewer", "")).join(" + ")}` : ""}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

// ── THE CLASS PLAYER (operator 2026-07-19): two artifacts on one stage —
// "presentation" (slide-in transitions, the speech as text) and "video class"
// (slow fades, local Kokoro narration, auto-advance on audio end). Slides are
// widgets: each one axis of the topic, drawn in the house forms.
/** Reads the text with the system's own voice; false when this screen has none (then the caller says why there is no sound). */
export function readAloud(text: string, done: () => void): boolean {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined; if (!synth || typeof SpeechSynthesisUtterance === "undefined" || !text.trim()) return false;
  synth.cancel(); const u = new SpeechSynthesisUtterance(text); u.onend = () => done(); synth.speak(u); return true;
}

export function ClassPlayer({ deck, mode, swarmId, onClose }: { deck: any; mode: "video" | "slides"; swarmId?: string | null; onClose: () => void }) {
  const slides = deck?.slides ?? [];
  const [i, setI] = React.useState(0);
  const [playing, setPlaying] = React.useState(mode === "video");
  const [keyMissing, setKeyMissing] = React.useState(false);
  const [err2, setErr2] = React.useState<string | null>(null);
  const [transcript, setTranscript] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const cache = React.useRef<Record<number, string>>({});
  const [nonce, setNonce] = React.useState(0);
  void swarmId;
  const speak = async (idx: number) => {
    try {
      let url = cache.current[idx];
      if (!url) {
        const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.tts.speak", input: { text: slides[idx]?.speech || slides[idx]?.topic || "" } }, { timeoutMs: 60_000 } as any);
        const d = r?.result?.result ?? r?.result ?? r;
        if (d?.key_missing) { setKeyMissing(true); setPlaying(false); return; }
        // NO VOICE ON THE SERVER (2026-11-26, it needed Node): the system's own voice reads the slide
        if (!d?.ok || !d.audio_b64) { if (readAloud(slides[idx]?.speech || slides[idx]?.topic || "", () => { if (idx < slides.length - 1) setI(idx + 1); else setPlaying(false); })) return; setErr2(d?.error ?? "the narration failed"); setPlaying(false); return; }
        url = `data:${d.mime ?? "audio/mpeg"};base64,${d.audio_b64}`;
        cache.current[idx] = url;
      }
      audioRef.current?.pause();
      const a = new Audio(url);
      audioRef.current = a;
      a.onended = () => { if (idx < slides.length - 1) setI(idx + 1); else setPlaying(false); };
      void a.play();
    } catch (e: any) { setErr2(String(e?.message ?? "the narration failed").slice(0, 140)); setPlaying(false); }
  };
  React.useEffect(() => {
    if (mode === "video" && playing && !keyMissing) void speak(i);
    return () => { audioRef.current?.pause(); if (typeof window !== "undefined") window.speechSynthesis?.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, playing]);
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") setI((x) => Math.min(slides.length - 1, x + 1)); if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1)); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose, slides.length]);
  const sl = slides[i];
  if (!sl) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1450, background: "rgba(0,0,0,.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: "loki-fade-in 500ms ease both" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(960px, 95vw)", maxHeight: "92vh", overflow: "auto", background: C.panel, border: `1px solid color-mix(in oklab, ${C.brand} 22%, ${C.border})`, borderRadius: 16, padding: "14px 22px 18px", fontFamily: mono }}>
        <div style={{ display: "flex", gap: 9, alignItems: "baseline" }}>
          <b style={{ fontSize: FS.title, color: C.fg }}>{mode === "video" ? "▶" : "⧉"} {deck.title}</b>
          <span style={{ fontSize: FS.small, color: C.dim }}>slide {i + 1}/{slides.length}</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => { setNonce((x) => x + 1); if (mode === "video") { audioRef.current?.pause(); void speak(i); } }} title="replay this slide" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "1px 10px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>↺</button>
          {mode === "video" && <button onClick={() => setPlaying((v) => !v)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "1px 10px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>{playing ? "⏸ pause" : "▶ play"}</button>}
          {mode === "video" && <button onClick={() => setTranscript((v) => !v)} title="the full narration, in text" style={{ background: transcript ? `color-mix(in oklab, ${C.brand} 12%, transparent)` : "transparent", border: `1px solid ${transcript ? C.brand : C.border}`, color: transcript ? C.brand : C.muted, borderRadius: 5, padding: "1px 10px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>≡ transcript</button>}
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "1px 10px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>✕ esc</button>
        </div>
        {keyMissing && (
          <div style={{ marginTop: 8, border: `1px solid color-mix(in oklab, ${C.warn} 50%, ${C.border})`, borderRadius: 8, padding: "6px 11px", fontSize: FS.base, color: C.warn, lineHeight: 1.6 }}>
            The voice engine did not produce audio — check the BE console ([narration] lines) and retry.
          </div>
        )}
        {err2 && <div style={{ marginTop: 6, fontSize: FS.small, color: C.bad }}>✕ {err2}</div>}
        <div key={`${i}-${nonce}`} style={{ marginTop: 14, minHeight: 320, animation: mode === "video" ? "loki-fade-in 1100ms ease both" : "loki-slide-in 480ms ease both" }}>
          <div style={{ textAlign: "center", fontSize: FS.base + 4, fontWeight: 700, color: C.fg, lineHeight: 1.4, maxWidth: 720, margin: "0 auto" }}>{sl.topic}</div>
          {sl.widget && <div style={{ maxWidth: 720, margin: "16px auto 0" }}><DrawnWidget w={sl.widget} /></div>}
          {(sl.bullets ?? []).length > 0 && (
            <div style={{ maxWidth: 620, margin: "14px auto 0" }}>
              {sl.bullets.map((b2: string, j: number) => <div key={j} style={{ fontSize: FS.base + 0.5, color: C.muted, lineHeight: 1.8 }}>– {b2}</div>)}
            </div>
          )}
          {mode === "slides" && sl.speech && <div style={{ maxWidth: 680, margin: "16px auto 0", fontSize: FS.base, color: C.fg, lineHeight: 1.85, textAlign: "justify", fontStyle: "italic", borderLeft: `2px solid ${C.border}`, paddingLeft: 12 }}>{sl.speech}</div>}
          {mode === "video" && <div style={{ textAlign: "center", marginTop: 14, fontSize: FS.small, color: C.dim }}>{playing ? "narrating…" : "paused"}</div>}
        </div>
        {mode === "video" && transcript && (
          <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10, animation: "loki-fade-in 300ms ease both" }}>
            <div style={{ fontFamily: mono, fontSize: FS.small, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ flex: 1 }}>transcript</span>
              <button onClick={() => { void navigator.clipboard?.writeText(slides.map((s2: any, j: number) => `${j + 1}. ${s2.topic}\n${s2.speech || ""}`).join("\n\n")); }}
                title="copy the whole narration" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 5, padding: "0 8px", cursor: "pointer", fontFamily: mono, fontSize: FS.small, textTransform: "none", letterSpacing: 0 }}>⧉ copy all</button>
            </div>
            <div style={{ maxHeight: 240, overflowY: "auto", paddingRight: 4 }}>
              {slides.map((s2: any, j: number) => (
                <div key={j} onClick={() => setI(j)} title="jump to this slide"
                  style={{ display: "flex", gap: 10, padding: "5px 8px", cursor: "pointer", borderRadius: 7, borderLeft: `2px solid ${j === i ? C.brand : "transparent"}`, background: j === i ? `color-mix(in oklab, ${C.brand} 7%, transparent)` : "transparent", marginBottom: 2 }}>
                  <b style={{ fontFamily: mono, fontSize: FS.small, color: j === i ? C.brand : C.dim, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{j + 1}</b>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: FS.small, color: j === i ? C.fg : C.muted, fontWeight: 600, lineHeight: 1.5 }}>{s2.topic}</div>
                    {s2.speech && <div style={{ fontSize: FS.base, color: j === i ? C.muted : C.dim, lineHeight: 1.75, marginTop: 1 }}>{s2.speech}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
          <button onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} style={{ background: "transparent", border: `1px solid ${C.border}`, color: i === 0 ? C.dim : C.muted, borderRadius: 6, padding: "1px 12px", cursor: "pointer", fontFamily: mono, fontSize: FS.base }}>←</button>
          {slides.map((_: any, j: number) => <span key={j} onClick={() => setI(j)} style={{ width: 7, height: 7, borderRadius: "50%", background: j === i ? C.brand : C.border, alignSelf: "center", cursor: "pointer" }} />)}
          <button onClick={() => setI((x) => Math.min(slides.length - 1, x + 1))} disabled={i === slides.length - 1} style={{ background: "transparent", border: `1px solid ${C.border}`, color: i === slides.length - 1 ? C.dim : C.muted, borderRadius: 6, padding: "1px 12px", cursor: "pointer", fontFamily: mono, fontSize: FS.base }}>→</button>
        </div>
      </div>
    </div>
  );
}

// ── the SWARM NET — agents wired to the hub, data flowing; drawn by the run
// console AND the mission theater (one truth, two stages) ──
function SwarmNet({ ops, catOf }: { ops: any[]; catOf: (id: string) => string }) {
  const workers = ops.filter((o) => o.id !== "editor");
  const edRow = ops.find((o) => o.id === "editor") ?? null;
  const doneCount = workers.filter((o) => o.status === "done").length;
  const hubScale = 1 + (workers.length ? (doneCount / workers.length) * 0.85 : 0) + (edRow?.status === "done" ? 0.18 : 0);
  const H2 = Math.max(150, workers.length * 40 + 28);
  const W2 = 760;
  const ay = (i: number) => 26 + i * 40 + 6;
  const ex = W2 - 92, eyC = H2 / 2 - 8;
  const catOf2 = catOf;
  return (
    <svg viewBox={`0 0 ${W2} ${H2}`} style={{ width: "100%", maxWidth: 780, display: "block" }}>
      {workers.map((o, i) => {
        const toneA = CAT_TONE[catOf2(o.id)] ?? C.dim;
        const y0 = ay(i);
        const path = `M 142 ${y0} C ${W2 * 0.42} ${y0}, ${W2 * 0.58} ${eyC}, ${ex - 26} ${eyC}`;
        return (
          <g key={`p${i}`}>
            <path d={path} fill="none" stroke={`color-mix(in oklab, ${o.status === "failed" ? C.bad : toneA} ${o.status === "queued" ? 20 : 45}%, transparent)`} strokeWidth={1.3} strokeDasharray={o.status === "failed" ? "4 4" : undefined} />
            {o.status === "running" && <path d={path} fill="none" stroke={toneA} strokeWidth={2.1} strokeDasharray="14 74" strokeLinecap="round" style={{ animation: "loki-flow 1.1s linear infinite" }} />}
            {o.status === "done" && <path d={path} fill="none" stroke={`color-mix(in oklab, ${C.ok} 50%, ${toneA})`} strokeWidth={1.7} />}
          </g>
        );
      })}
      {workers.map((o, i) => {
        const toneA = CAT_TONE[catOf2(o.id)] ?? C.dim;
        const glyph = glyphFor(`${o.id} ${o.agent}`);
        const y0 = ay(i);
        return (
          <g key={`n${i}`}>
            <circle cx={122} cy={y0} r={12} fill={C.panel2} stroke={o.status === "failed" ? C.bad : o.status === "done" ? C.ok : toneA} strokeWidth={o.status === "running" ? 2.1 : 1.3} />
            <text x={122} y={y0 + 3.6} textAnchor="middle" fill={toneA} style={{ fontFamily: mono, fontSize: 10.5 }}>{glyph}</text>
            <text x={104} y={y0 + 3.4} textAnchor="end" fill={C.muted} style={{ fontFamily: mono, fontSize: 10.5 }}>{String(o.agent).replace(" Reviewer", "").slice(0, 13)}</text>
            {o.status === "failed" && <text x={140} y={y0 + 3.4} fill={C.bad} style={{ fontFamily: mono, fontSize: 10.5 }}>✕</text>}
            {o.status === "done" && <text x={140} y={y0 + 3.4} fill={C.ok} style={{ fontFamily: mono, fontSize: 10.5 }}>✓</text>}
          </g>
        );
      })}
      <g transform={`translate(${ex} ${eyC})`}>
        <g style={{ transform: `scale(${hubScale})`, transition: "transform 650ms cubic-bezier(.35,1.35,.5,1)" }}>
          <circle r={16} fill={C.panel2} stroke={edRow?.status === "done" ? C.ok : edRow?.status === "failed" ? C.bad : CAT_TONE.editor} strokeWidth={edRow?.status === "running" ? 2.6 : 1.6} style={edRow?.status === "running" ? { animation: "loki-hub 1s ease-in-out infinite" } : undefined} />
          <text y={4.8} textAnchor="middle" fill={CAT_TONE.editor} style={{ fontFamily: mono, fontSize: 13 }}>{edRow ? "✒" : "◈"}</text>
        </g>
        <text y={38} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 10.5 }}>{edRow ? "the editor" : "the study"}</text>
        <text y={51} textAnchor="middle" fill={C.muted} style={{ fontFamily: mono, fontSize: 10.5, fontVariantNumeric: "tabular-nums" }}>{doneCount}/{workers.length} in</text>
      </g>
    </svg>
  );
}

// captions for the theater's cooking act — each line fades in, breathes, fades out
function TheaterCaptions({ items, done }: { items: string[]; done: boolean }) {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    if (done || items.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 2600);
    return () => clearInterval(t);
  }, [items.length, done]);
  const text = done ? items[items.length - 1] : items[idx % items.length];
  return (
    <div key={text} style={{ fontFamily: mono, fontSize: FS.base + 2, color: done ? C.ok : C.muted, letterSpacing: 0.5, animation: "loki-caption 2.6s ease both" }}>{text}</div>
  );
}

// ── the COURT WEB — who agrees with whom, drawn: speakers on a line, green
// arcs = independent convergence, amber dashed = live dissent. Deterministic.
function CourtWeb({ court, speakers }: { court: any; speakers: string[] }) {
  const sp = speakers.slice(0, 8);
  if (sp.length < 2 || (!court.convergence.length && !court.divergence.length)) return null;
  const W = 760, x = (i: number) => 70 + (i + 0.5) * ((W - 140) / sp.length);
  const idx = (a: string) => sp.findIndex((s2) => a.includes(s2) || s2.includes(a.replace(" Reviewer", "")));
  const arcs: any[] = [];
  for (const c2 of court.convergence.slice(0, 4)) { const m = (c2.agents ?? []).map(idx).filter((i: number) => i >= 0); for (let i = 1; i < m.length; i += 1) arcs.push({ a: m[0], b: m[i], kind: "ok", key: c2.key }); }
  for (const d2 of court.divergence.slice(0, 4)) { const m = (d2.agents ?? []).map(idx).filter((i: number) => i >= 0); for (let i = 1; i < m.length; i += 1) arcs.push({ a: m[0], b: m[i], kind: "warn", key: d2.key }); }
  if (!arcs.length) return null;
  const H = 150;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 780, display: "block" }}>
      {arcs.map((a2, i) => (
        <g key={i}>
          <path d={`M ${x(a2.a)} 104 Q ${(x(a2.a) + x(a2.b)) / 2} ${34 - (i % 3) * 14} ${x(a2.b)} 104`} fill="none"
            stroke={`color-mix(in oklab, ${a2.kind === "ok" ? C.ok : C.warn} 60%, transparent)`} strokeWidth={1.4} strokeDasharray={a2.kind === "warn" ? "5 4" : undefined} />
          <text x={(x(a2.a) + x(a2.b)) / 2} y={30 - (i % 3) * 14} textAnchor="middle" fill={a2.kind === "ok" ? C.ok : C.warn} style={{ fontFamily: mono, fontSize: 10 }}>{a2.kind === "ok" ? "⚡" : "△"} {String(a2.key).slice(0, 22)}</text>
        </g>
      ))}
      {sp.map((s2, i) => (
        <g key={s2} transform={`rotate(${i % 2 ? 0.8 : -0.8} ${x(i)} 116)`}>
          <ellipse cx={x(i)} cy={116} rx={Math.max(34, s2.length * 3.4 + 10)} ry={13} fill={C.panel2} stroke={C.dim} strokeWidth={1.1} />
          <text x={x(i)} y={120} textAnchor="middle" fill={C.fg} style={{ fontFamily: mono, fontSize: 10.5 }}>{s2.slice(0, 18)}</text>
        </g>
      ))}
    </svg>
  );
}

// ── the ANATOMY LOOP — the named pattern's life drawn as a cycle:
// starts → grows → recognize → prevent → repair, hand arrows around. ──
function AnatomyLoop({ anatomy, name }: { anatomy: any; name: string }) {
  const steps = ([["starts", anatomy?.starts], ["grows", anatomy?.grows], ["recognize", anatomy?.recognize], ["prevent", anatomy?.prevent], ["repair", anatomy?.repair]] as Array<[string, string | null]>).filter(([, v]) => v);
  if (steps.length < 3) return null;
  const W = 720, H = 300, cx0 = W / 2, cy0 = H / 2 - 4, R = 108;
  const pos = (i: number) => { const ang = (i / steps.length) * Math.PI * 2 - Math.PI / 2; return { x: cx0 + Math.cos(ang) * (R + 82), y: cy0 + Math.sin(ang) * R }; };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 740, display: "block" }}>
      {steps.map((_, i) => { const a2 = pos(i), b2 = pos((i + 1) % steps.length); return (
        <path key={`e${i}`} d={`M ${a2.x} ${a2.y} Q ${cx0 + (a2.x + b2.x - 2 * cx0) * 0.72} ${cy0 + (a2.y + b2.y - 2 * cy0) * 0.72} ${b2.x} ${b2.y}`}
          fill="none" stroke={`color-mix(in oklab, ${C.dim} 55%, transparent)`} strokeWidth={1.2} markerEnd="none" />
      ); })}
      {steps.map(([k, v], i) => { const p = pos(i); return (
        <g key={k} transform={`rotate(${i % 2 ? 0.7 : -0.7} ${p.x} ${p.y})`}>
          <rect x={p.x - 82} y={p.y - 22} width={164} height={44} rx={10} fill={C.panel2} stroke={C.border} />
          <text x={p.x} y={p.y - 7} textAnchor="middle" fill={C.muted} style={{ fontFamily: mono, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>{k}</text>
          <text x={p.x} y={p.y + 9} textAnchor="middle" fill={C.fg} style={{ fontFamily: mono, fontSize: 10 }}>{String(v).slice(0, 26)}…</text>
        </g>
      ); })}
      <text x={cx0} y={cy0 + 4} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 11, fontStyle: "italic" }}>{String(name).slice(0, 26)}</text>
    </svg>
  );
}

// ── the HEALTH WATERFALL — deterministic and hand-drawn: how far each axis
// pulls the score down from a perfect 100. Answers "why is health 60 while one
// axis reads 93" the visual way; the steepest step names the real problem.
function HealthWaterfall({ axes, health }: { axes: Record<string, any>; health: number }) {
  const entries = Object.entries(axes ?? {}).map(([k, a]: any) => ({ k, score: Number(a?.score ?? 100) })).filter((e) => Number.isFinite(e.score));
  const deficits = entries.map((e) => ({ ...e, d: Math.max(0, 100 - e.score) }));
  const totalD = deficits.reduce((s2, e) => s2 + e.d, 0) || 1;
  const drop = Math.max(0, 100 - (health ?? 100));
  const steps = deficits.filter((e) => e.d > 0).map((e) => ({ ...e, pull: (e.d / totalD) * drop })).sort((a, b) => b.pull - a.pull).slice(0, 7);
  if (!steps.length || drop <= 0) return null;
  const W = 720, H = 195;
  const y = (v: number) => 24 + (100 - v) * 1.35;
  const x0 = 62;
  const stepW = Math.min(96, (W - x0 - 132) / steps.length);
  let cur = 100, x = x0;
  const segs: any[] = [];
  for (const st of steps) { segs.push({ ...st, x, from: cur, to: cur - st.pull }); cur -= st.pull; x += stepW; }
  const last = segs[segs.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 740, display: "block" }}>
      <text x={x0 - 8} y={y(100) + 4} textAnchor="end" fill={C.muted} style={{ fontFamily: mono, fontSize: 11 }}>100</text>
      <line x1={x0} y1={y(100)} x2={x0 + 8} y2={y(100)} stroke={C.dim} />
      {segs.map((sg, i) => (
        <g key={sg.k} transform={`rotate(${i % 2 ? 0.4 : -0.4} ${sg.x + stepW / 2} ${y(sg.to)})`}>
          <line x1={sg.x} y1={y(sg.from)} x2={sg.x + stepW - 14} y2={y(sg.from)} stroke={C.dim} strokeWidth={1.2} />
          <path d={`M ${sg.x + stepW - 14} ${y(sg.from)} C ${sg.x + stepW - 6} ${y(sg.from) + (y(sg.to) - y(sg.from)) * 0.3}, ${sg.x + stepW - 18} ${y(sg.to) - (y(sg.to) - y(sg.from)) * 0.3}, ${sg.x + stepW - 10} ${y(sg.to)}`} fill="none" stroke={C.warn} strokeWidth={1.5} />
          <text x={sg.x + (stepW - 14) / 2} y={y(sg.from) - 6} textAnchor="middle" fill={C.muted} style={{ fontFamily: mono, fontSize: 10.5 }}>{sg.k}</text>
          <text x={sg.x + stepW - 4} y={(y(sg.from) + y(sg.to)) / 2 + 4} fill={C.warn} style={{ fontFamily: mono, fontSize: 10.5 }}>−{sg.pull.toFixed(1)}</text>
        </g>
      ))}
      <line x1={last.x + stepW - 10} y1={y(health)} x2={W - 100} y2={y(health)} stroke={C.dim} strokeWidth={1.2} strokeDasharray="4 3" />
      <g transform={`rotate(-1.2 ${W - 60} ${y(health)})`}>
        <ellipse cx={W - 58} cy={y(health)} rx={36} ry={16} fill="none" stroke={C.fg} strokeWidth={1.3} />
        <text x={W - 58} y={y(health) + 4} textAnchor="middle" fill={C.fg} style={{ fontFamily: mono, fontSize: 12.5, fontWeight: 700 }}>{health}</text>
      </g>
      <text x={W - 58} y={y(health) + 30} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 10 }}>where it lands</text>
    </svg>
  );
}

// ── THE AXIS WEB — the study's correlation figure: axes float as dashed nodes,
// every thesis is a tilted plaque wired to the axes it CITED (validated refs
// only); two theses citing the same law get a dashed convergence arc ──
function AxisWeb({ web, axesAll, pairs }: { web: any[]; axesAll: string[]; pairs: any[] }) {
  const W = 940;
  const ax = (i: number) => 90 + (i + 0.5) * ((W - 180) / Math.max(1, axesAll.length));
  const tx = (i: number) => 40 + (i + 0.5) * ((W - 80) / Math.max(1, web.length));
  const H = 172 + (pairs.length ? 18 + pairs.length * 11 : 0);
  // figures earn COLOR (operator round 2) — each axis wears its engineering tone
  const AXT: Record<string, string> = { compliance: C.brand, defects: C.bad, tests: C.ok, structure: C.warn, coupling: "oklch(0.72 0.13 40)", cohesion: "oklch(0.74 0.12 200)", change: "oklch(0.72 0.11 320)" };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 960, display: "block", marginTop: 6 }}>
      {web.map((w, i) => w.axes.map((a: string) => {
        const j = axesAll.indexOf(a);
        return j < 0 ? null : (
          <path key={`${i}${a}`} d={`M ${tx(i)} 116 Q ${(tx(i) + ax(j)) / 2 + (i % 2 ? 18 : -18)} 70 ${ax(j)} 35`}
            fill="none" stroke={`color-mix(in oklab, ${AXT[a] ?? C.dim} 60%, transparent)`} strokeWidth={1.1} />
        );
      }))}
      {axesAll.map((a, i) => (
        <g key={a} transform={`rotate(${i % 2 ? 0.9 : -0.9} ${ax(i)} 21)`}>
          <ellipse cx={ax(i)} cy={20} rx={Math.max(40, a.length * 4.2 + 16)} ry={14} fill={C.panel} stroke={AXT[a] ?? C.dim} strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={ax(i)} y={24} textAnchor="middle" fill={AXT[a] ?? C.fg} style={{ fontFamily: mono, fontSize: 11 }}>⬡ {a}</text>
        </g>
      ))}
      {web.map((w, i) => (
        <g key={w.path} transform={`rotate(${i % 2 ? 0.5 : -0.5} ${tx(i)} 133)`}>
          <rect x={tx(i) - 104} y={117} width={208} height={34} rx={10} fill={C.panel2} stroke={C.border} />
          <text x={tx(i)} y={131} textAnchor="middle" fill={C.fg} style={{ fontFamily: mono, fontSize: 11 }}>{String(w.thesis).slice(0, 32)}</text>
          <text x={tx(i)} y={145} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 10.5 }}>{String(w.name).slice(0, 32)}</text>
        </g>
      ))}
      {pairs.map((p, k) => (
        <g key={k}>
          <path d={`M ${tx(p.i)} 153 Q ${(tx(p.i) + tx(p.j)) / 2} ${176 + k * 11} ${tx(p.j)} 153`} fill="none" stroke={`color-mix(in oklab, ${C.dim} 60%, transparent)`} strokeWidth={1.1} strokeDasharray="5 4" />
          <text x={(tx(p.i) + tx(p.j)) / 2} y={173 + k * 11} textAnchor="middle" fill={C.muted} style={{ fontFamily: mono, fontSize: 10 }}>⚡ both cite § {p.law}</text>
        </g>
      ))}
    </svg>
  );
}

const LEVEL_TONE: Record<string, string> = { observation: C.dim, finding: C.muted, insight: C.brand, discovery: C.warn, revelation: C.warn };
const SEV_TONE2: Record<string, string> = { error: C.bad, warn: C.warn, info: C.dim };

// compact one-liner for ledgers: level · title · headline · cards · cost
function Findings({ res }: { res: any }) {
  const rv = res?.review;
  if (!rv) return <div style={{ fontSize: FS.small, color: C.warn }}>the review did not parse — dropped, never guessed at</div>;
  return (
    <div style={{ fontSize: FS.base, lineHeight: 1.55 }}>
      <span style={{ color: LEVEL_TONE[rv.summary?.level] ?? C.dim }}>{rv.summary?.level}</span>{" "}
      <b style={{ color: C.fg }}>{rv.summary?.title}</b>
      {rv.summary?.headline && <span style={{ color: C.muted }}> — {rv.summary.headline}</span>}
      <span style={{ color: C.dim, fontSize: FS.small }}> · {(rv.cards ?? []).length} card{(rv.cards ?? []).length === 1 ? "" : "s"} · ${Number(res.cost_usd ?? 0).toFixed(4)}</span>
    </div>
  );
}

// hand-drawn arrow (the excalidraw wobble) — local copy of the house primitive
const SArrow2 = ({ x1, y1, x2, y2, tone = C.dim }: any) => {
  const mx = (x1 + x2) / 2 + (y2 - y1) * 0.15, my = (y1 + y2) / 2 - (x2 - x1) * 0.08;
  const ang = Math.atan2(y2 - my, x2 - mx);
  return (
    <g stroke={tone} fill="none" strokeWidth={1.15} strokeLinecap="round">
      <path d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`} />
      <path d={`M ${x2 - 7 * Math.cos(ang - 0.45)} ${y2 - 7 * Math.sin(ang - 0.45)} L ${x2} ${y2} L ${x2 - 7 * Math.cos(ang + 0.45)} ${y2 - 7 * Math.sin(ang + 0.45)}`} />
    </g>
  );
};

// ── S2: the CONSTELLATION — the field around the case, drawn. Upstream above,
// downstream below, the codebase echoes (same law elsewhere) to the right.
// Expand-only: clicking a neighbor opens its sick hunk beneath. Monochrome ink.
function ConstellationSegment({ nb, fi }: { nb: any; fi: number }) {
  const [exp, setExp] = React.useState<string | null>(null);
  const nodes = nb?.nodes ?? [];
  const center = nodes.find((n: any) => n.dir === "center");
  const ups = nodes.filter((n: any) => n.dir === "up").slice(0, 6);
  const downs = nodes.filter((n: any) => n.dir === "down").slice(0, 6);
  const issues = nodes.filter((n: any) => n.dir === "issue").slice(0, 4);
  if (!center || (!ups.length && !downs.length && !issues.length)) return null;
  const W = 940, H = 216, cx = issues.length ? 360 : 470, cy = H / 2;
  const px = (list: any[], i: number) => 90 + (i + 0.5) * ((issues.length ? 560 : 760) / Math.max(1, list.length));
  const edgeOf = (p: string) => (nb.edges ?? []).find((e: any) => (e.from === p && e.to === center.path) || (e.from === center.path && e.to === p));
  const circle = (n: any, x: number, y: number, r: number) => {
    const sick = (n.health ?? 100) < 60;
    return (
      <g key={n.path} onClick={() => setExp((v) => (v === n.path ? null : n.path))} style={{ cursor: "pointer" }}>
        <circle cx={x} cy={y} r={r} fill={exp === n.path ? C.panel2 : C.panel} stroke={n.dir === "center" ? C.fg : C.dim} strokeWidth={n.dir === "center" ? 1.5 : 1.1} strokeDasharray={sick ? "4 3" : undefined} />
        <text x={x} y={y + (n.dir === "center" ? -r - 7 : r + 13)} textAnchor="middle" fill={C.fg} style={{ fontFamily: mono, fontSize: 10.5 }}>{String(n.name ?? n.path.split("/").pop()).slice(0, 22)}</text>
        <text x={x} y={y + 4} textAnchor="middle" fill={n.health != null && n.health < 60 ? C.warn : C.muted} style={{ fontFamily: mono, fontSize: 10.5, fontVariantNumeric: "tabular-nums" }}>{n.health ?? "—"}</text>
        {n.worst_law && n.dir !== "center" && <text x={x} y={y + r + 25} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 10 }}>§ {String(n.worst_law).slice(0, 20)}</text>}
      </g>
    );
  };
  const edgeLine = (n: any, x: number, y: number) => {
    const e = edgeOf(n.path);
    const via = e?.via?.length ? String(e.via[0]).slice(0, 16) + (e.via.length > 1 ? ` +${e.via.length - 1}` : "") : e?.kind === "co_change" ? `co-change ×${e.n}` : "";
    return (
      <g key={`e${n.path}`}>
        <line x1={cx} y1={cy} x2={x} y2={y} stroke={`color-mix(in oklab, ${C.dim} 55%, transparent)`} strokeWidth={1.1} strokeDasharray={e?.kind === "co_change" ? "5 4" : undefined} />
        {via && <text x={(cx + x) / 2} y={(cy + y) / 2 - 4} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 10 }}>{via}</text>}
      </g>
    );
  };
  const expNode = nodes.find((n: any) => n.path === exp);
  const hunk = expNode?.worst_list?.[0];
  void fi; // numbering now comes from the paper's Figure counter
  return (
    <div style={{ marginTop: 2 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 960, display: "block" }}>
        {ups.map((n: any, i: number) => edgeLine(n, px(ups, i), 38))}
        {downs.map((n: any, i: number) => edgeLine(n, px(downs, i), H - 44))}
        {ups.map((n: any, i: number) => circle(n, px(ups, i), 38, 15))}
        {downs.map((n: any, i: number) => circle(n, px(downs, i), H - 44, 15))}
        {circle(center, cx, cy, 19)}
        {issues.map((n: any, i: number) => (
          <g key={`i${n.path}`}>
            <line x1={cx + 19} y1={cy} x2={700} y2={40 + i * 46} stroke={`color-mix(in oklab, ${C.dim} 35%, transparent)`} strokeWidth={1} strokeDasharray="3 4" />
            {circle(n, 720, 40 + i * 46, 13)}
          </g>
        ))}
        {issues.length > 0 && <text x={905} y={16} textAnchor="end" fill={C.dim} style={{ fontFamily: mono, fontSize: 10 }}>same law, outside the scope</text>}
        {ups.length > 0 && <text x={16} y={16} fill={C.dim} style={{ fontFamily: mono, fontSize: 10 }}>↓ imports the case</text>}
        {downs.length > 0 && <text x={16} y={H - 6} fill={C.dim} style={{ fontFamily: mono, fontSize: 10 }}>↑ the case leans on</text>}
      </svg>
      {expNode && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", maxWidth: 640, marginTop: 2 }}>
          <div style={{ fontSize: FS.small, color: C.dim, background: C.panel2, padding: "1px 9px", borderBottom: `1px solid ${C.border}`, fontFamily: mono }}>{expNode.path} · health {expNode.health ?? "—"}{hunk ? ` · § ${hunk.law_key}` : " · no recorded violation"}</div>
          {(hunk?.snippet ?? []).map((row: any) => (
            <div key={row.ln} style={{ display: "flex", height: 17, background: row.ln === hunk.line ? `color-mix(in oklab, ${C.warn} 9%, transparent)` : "transparent" }}>
              <span style={{ width: 30, flexShrink: 0, textAlign: "right", paddingRight: 7, fontSize: FS.small, color: C.dim, lineHeight: "17px", borderRight: `1px solid ${C.border}`, fontFamily: mono }}>{row.ln}</span>
              <code style={{ fontSize: FS.base, whiteSpace: "pre", overflowX: "auto", padding: "0 6px", flex: 1, minWidth: 0, lineHeight: "17px", fontFamily: mono }}><TokLine text={row.text} /></code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── the DRAWN widgets — each contract type gets a real visual, not labeled text ──
function DrawnWidget({ w, realBad = null }: { w: any; realBad?: any[] | null }) {
  const head = <div style={{ fontFamily: mono, fontSize: FS.small, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>{w.title || w.type}</div>;
  if (w.type === "before-after") return (
    <div>
      {head}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", fontFamily: mono, fontSize: FS.base }}>
        {/* when the model's − side is thin and the REAL source is at hand, the diff
            shows the recorded shape verbatim (operator: "show the big part") */}
        {realBad?.length ? (
          <div style={{ background: `color-mix(in oklab, ${C.bad} 6%, transparent)` }}>
            <div style={{ fontSize: FS.small, color: C.bad, padding: "2px 10px 0" }}>− the recorded shape, from the source</div>
            {realBad.map((row: any) => (
              <div key={row.ln} style={{ display: "flex", height: 17 }}>
                <span style={{ width: 34, flexShrink: 0, textAlign: "right", paddingRight: 7, fontSize: FS.small, color: C.dim, lineHeight: "17px", borderRight: `1px solid ${C.border}`, fontFamily: mono }}>{row.ln}</span>
                <code style={{ fontSize: FS.base, whiteSpace: "pre", overflowX: "auto", padding: "0 7px", flex: 1, minWidth: 0, lineHeight: "17px", fontFamily: mono, opacity: 0.9 }}><TokLine text={row.text} /></code>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, background: `color-mix(in oklab, ${C.bad} 7%, transparent)`, padding: "3px 10px" }}><span style={{ color: C.bad, flexShrink: 0 }}>−</span><code style={{ whiteSpace: "pre-wrap", fontFamily: mono, minWidth: 0, opacity: 0.85 }}><TokCode code={String(w.payload?.bad ?? "")} /></code></div>
        )}
        <div style={{ background: `color-mix(in oklab, ${C.ok} 7%, transparent)`, padding: "2px 10px 3px" }}>
          {realBad?.length ? <div style={{ fontSize: FS.small, color: C.ok }}>+ the proposed shape</div> : null}
          <div style={{ display: "flex", gap: 8 }}><span style={{ color: C.ok, flexShrink: 0 }}>+</span><code style={{ whiteSpace: "pre-wrap", fontFamily: mono, minWidth: 0 }}><TokCode code={String(w.payload?.good ?? "")} /></code></div>
        </div>
      </div>
    </div>
  );
  if (w.type === "root-cause-tree") {
    // the WHY written as CODE COMMENTS (operator 2026-07-19) — the investigation
    // annotated the way an engineer would leave it in the source
    const branches = (Array.isArray(w.payload?.branches) ? w.payload.branches : []).slice(0, 5);
    return (
      <div>
        {head}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, padding: "6px 12px", fontFamily: mono, fontSize: FS.base, lineHeight: 1.8 }}>
          <div style={{ color: C.ok }}>{`// WHY — ${String(w.payload?.root ?? "").slice(0, 72)}`}</div>
          {branches.map((b: any, i: number) => (
            <div key={i} style={{ color: `color-mix(in oklab, ${C.ok} ${74 - i * 9}%, ${C.dim})`, paddingLeft: 8 + i * 10 }}>{`//  ↳ ${String(b).slice(0, 76)}`}</div>
          ))}
        </div>
      </div>
    );
  }
  if (w.type === "repair-order") {
    const steps = (Array.isArray(w.payload?.steps) ? w.payload.steps : []).slice(0, 6);
    return (
      <div>
        {head}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, padding: "6px 12px", fontFamily: mono, fontSize: FS.base, lineHeight: 1.8 }}>
          <div style={{ color: C.ok }}>{`// FIX, in order:`}</div>
          {steps.map((s2: any, j: number) => (
            <div key={j} style={{ color: `color-mix(in oklab, ${C.ok} ${74 - j * 7}%, ${C.dim})`, paddingLeft: 8 }}>{`//  ${j + 1}. ${String(s2).slice(0, 78)}`}</div>
          ))}
        </div>
      </div>
    );
  }
  if (w.type === "timeline") {
    const events = (Array.isArray(w.payload?.events) ? w.payload.events : []).map((e: any) => (typeof e === "string" ? { label: e } : e)).filter((e: any) => e?.label);
    return <div>{head}<TimelineSketch events={events} /></div>;
  }
  if (w.type === "flow") {
    const steps = (Array.isArray(w.payload?.steps) ? w.payload.steps : []).slice(0, 7).map(String);
    return (
      <div>
        {head}
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          {steps.map((st: string, i: number) => (
            <React.Fragment key={i}>
              <span style={{ border: `1px solid ${C.border}`, borderRadius: 9, background: C.panel2, padding: "3px 10px", fontFamily: mono, fontSize: FS.base, color: C.fg, transform: `rotate(${i % 2 ? 0.6 : -0.6}deg)`, maxWidth: 190 }}>{st}</span>
              {i < steps.length - 1 && <svg width="26" height="14"><path d="M 2 7 C 9 4, 16 10, 22 7" fill="none" stroke={C.dim} strokeWidth="1.3" /><path d="M 17 3.5 L 23 7 L 17 10.5" fill="none" stroke={C.dim} strokeWidth="1.2" strokeLinejoin="round" /></svg>}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }
  if (w.type === "balance") {
    const Lb = w.payload?.left ?? {}, Rb = w.payload?.right ?? {};
    const side = (S: any, rot: number) => (
      <div style={{ flex: 1, minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel2, padding: "6px 11px", transform: `rotate(${rot}deg)`, fontFamily: mono }}>
        <b style={{ fontSize: FS.base, color: C.fg }}>{S?.label ?? "—"}</b>
        {(S?.items ?? []).slice(0, 4).map((it: any, i: number) => <div key={i} style={{ fontSize: FS.small, color: C.muted, lineHeight: 1.55 }}>– {String(it)}</div>)}
      </div>
    );
    return (
      <div>
        {head}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", maxWidth: 620 }}>
          {side(Lb, -1)}
          <svg width="40" height="52" style={{ flexShrink: 0, marginTop: 8 }}><line x1="4" y1="14" x2="36" y2="20" stroke={C.dim} strokeWidth="1.4" /><path d="M 14 40 L 26 40 L 20 20 Z" fill="none" stroke={C.dim} strokeWidth="1.3" strokeLinejoin="round" /></svg>
          {side(Rb, 1)}
        </div>
        {w.payload?.verdict && <div style={{ fontFamily: mono, fontSize: FS.small, color: C.muted, marginTop: 5 }}>⚖ {String(w.payload.verdict)}</div>}
      </div>
    );
  }
  if (w.type === "layers") {
    const layers = (Array.isArray(w.payload?.layers) ? w.payload.layers : []).slice(0, 6).map(String);
    const breach = String(w.payload?.breach ?? "");
    const bi = layers.findIndex((l: string) => breach.includes(l));
    const bj = layers.findIndex((l: string, i2: number) => i2 !== bi && breach.includes(l));
    return (
      <div>
        {head}
        <div style={{ position: "relative", maxWidth: 420 }}>
          {layers.map((l: string, i: number) => (
            <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel2, padding: "4px 11px", margin: "0 0 5px", transform: `rotate(${i % 2 ? 0.4 : -0.4}deg)`, fontFamily: mono, fontSize: FS.base, color: C.fg }}>{l}</div>
          ))}
          {bi >= 0 && bj >= 0 && (
            <svg style={{ position: "absolute", right: -26, top: 6, height: `${layers.length * 34}px`, width: 26, overflow: "visible", pointerEvents: "none" }} viewBox={`0 0 26 ${layers.length * 34}`} preserveAspectRatio="none">
              <path d={`M 6 ${bi * 34 + 12} C 26 ${bi * 34 + 12}, 26 ${bj * 34 + 12}, 8 ${bj * 34 + 12}`} fill="none" stroke={C.bad} strokeWidth="1.5" strokeDasharray="5 4" />
              <path d={`M 14 ${bj * 34 + 6} L 6 ${bj * 34 + 12} L 14 ${bj * 34 + 17}`} fill="none" stroke={C.bad} strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          )}
          {breach && <div style={{ fontFamily: mono, fontSize: FS.small, color: C.bad, marginTop: 2 }}>⤫ breach: {breach}</div>}
        </div>
      </div>
    );
  }
  if (w.type === "graph-focus") {
    // a REAL drawn graph (operator: "didn't show any graph — just chips"): the
    // subject as a hub, the named files as hand-drawn nodes, curved edges out.
    const files = (Array.isArray(w.payload?.files) ? w.payload.files : []).slice(0, 7).map(String);
    if (!files.length) return <div>{head}{w.payload?.note && <div style={{ fontFamily: mono, fontSize: FS.small, color: C.muted }}>{String(w.payload.note)}</div>}</div>;
    const W2 = 640, H2 = 120 + Math.ceil(files.length / 3) * 52, cxg = W2 / 2, cyg = H2 / 2;
    return (
      <div>
        {head}
        <svg viewBox={`0 0 ${W2} ${H2}`} style={{ width: "100%", maxWidth: 660, display: "block" }}>
          {files.map((f2: string, i: number) => {
            const ang = (i / files.length) * Math.PI * 2 - Math.PI / 2;
            const x = cxg + Math.cos(ang) * (W2 / 2 - 96);
            const yv = cyg + Math.sin(ang) * (cyg - 30);
            const nm = String(f2).split("/").pop() ?? f2;
            return (
              <g key={i}>
                <path d={`M ${cxg} ${cyg} Q ${(cxg + x) / 2 + (i % 2 ? 14 : -14)} ${(cyg + yv) / 2} ${x} ${yv}`} fill="none" stroke={`color-mix(in oklab, ${C.brand} 45%, transparent)`} strokeWidth={1.2} />
                <ellipse cx={x} cy={yv} rx={Math.max(32, nm.length * 3.4 + 10)} ry={13} fill={C.panel} stroke={C.dim} strokeWidth={1.1} transform={`rotate(${i % 2 ? 1 : -1} ${x} ${yv})`} />
                <text x={x} y={yv + 4} textAnchor="middle" fill={C.fg} style={{ fontFamily: mono, fontSize: 10.5 }}>{nm}</text>
              </g>
            );
          })}
          <circle cx={cxg} cy={cyg} r={8} fill={C.brand} />
        </svg>
        {w.payload?.note && <div style={{ fontFamily: mono, fontSize: FS.small, color: C.muted, marginTop: 3 }}>{String(w.payload.note)}</div>}
      </div>
    );
  }
  return null;
}

// ── the INTELLIGENCE as a LIVE PAPER (operator 2026-07-19: "not documentation"):
// the theory is a rotated senior note wearing its level as a STAMP; drawings sit
// LEFT with the margin comment cards arrowed in from the RIGHT (the review
// anatomy); actions climb; the pushback is a dashed aside. Prose folds by default.
function ReviewCard({ agent, review, validation, aiCallId, onOpenCall }: { agent: string; review: any; validation: any; aiCallId?: number | null; onOpenCall?: (id: number) => void }) {
  const [openT, setOpenT] = React.useState(false);
  const [openCards, setOpenCards] = React.useState<Set<number>>(new Set());
  const lvl = review.summary?.level ?? "finding";
  const lvlTone = LEVEL_TONE[lvl] ?? C.dim;
  const t = review.theory;
  const cards = review.cards ?? [];
  const widgets = review.widgets ?? [];
  const toggleCard = (i: number) => setOpenCards((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  return (
    <div style={{ marginTop: 12, fontFamily: mono }}>
      {/* the THEORY — a senior's note, the level worn as a stamp */}
      <div style={{ position: "relative", border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel2, padding: "8px 12px", transform: "rotate(-0.3deg)", maxWidth: 760 }}>
        <div style={{ position: "absolute", top: -9, right: 14, transform: "rotate(4deg)", border: `1px dashed color-mix(in oklab, ${lvlTone} 60%, transparent)`, borderRadius: 6, background: C.panel, padding: "0 7px", fontSize: FS.small, color: lvlTone, whiteSpace: "nowrap" }}>{lvl}{lvl === "revelation" ? " — check the cites" : ""}</div>
        <div style={{ display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ fontSize: FS.small, color: C.brand, border: `1px solid ${C.brand}`, borderRadius: 8, padding: "0 6px" }}>🤖 {agent.replace(" Reviewer", "")}</span>
          <b style={{ fontSize: FS.title, color: C.fg }}>{t?.name ?? review.summary?.title}</b>
          {t?.confidence != null && <span style={{ fontSize: FS.small, color: C.dim }}>conf {Math.round(t.confidence * 100)}%</span>}
          {t?.unsupported && <span style={{ fontSize: FS.small, color: C.bad }}>UNSUPPORTED — zero valid citations</span>}
          {aiCallId != null && onOpenCall && <button onClick={() => onOpenCall(aiCallId)} title="the AI call window — the exact prompt, the envelope, the raw output"
            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 4, padding: "0 7px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>⚙ the call</button>}
        </div>
        {review.summary?.headline && <div style={{ fontSize: FS.base, color: C.muted, marginTop: 2, lineHeight: 1.55 }}>{review.summary.headline}</div>}
        {t && (
          <div style={{ marginTop: 4, fontSize: FS.base, lineHeight: 1.6, ...(openT ? {} : { maxHeight: 44, overflow: "hidden", WebkitMaskImage: "linear-gradient(180deg, black 50%, transparent 100%)", maskImage: "linear-gradient(180deg, black 50%, transparent 100%)" }) }}>
            <div style={{ color: C.muted }}>{t.explanation}</div>
            {t.root_cause && <div style={{ color: C.muted, marginTop: 2 }}><span style={{ color: C.dim }}>root cause —</span> {t.root_cause}</div>}
            {t.engineering_story && <div style={{ color: C.muted, marginTop: 2 }}><span style={{ color: C.dim }}>the story —</span> {t.engineering_story}</div>}
            {t.if_nothing_changes && <div style={{ color: C.dim, fontStyle: "italic", marginTop: 2 }}>if nothing changes — {t.if_nothing_changes}</div>}
          </div>
        )}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4, alignItems: "baseline" }}>
          {t && <button onClick={() => setOpenT((v) => !v)} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: FS.small, padding: 0 }}>{openT ? "▴ fold the theory" : "▾ the full theory"}</button>}
          <span style={{ flex: 1 }} />
          {(review.evidence ?? []).map((ev: any) => chip(`${ev.kind === "axis" ? "⬡" : "§"} ${ev.id}`, C.dim))}
          {validation?.uncited_dropped > 0 && <span style={{ fontSize: FS.small, color: C.warn }}>{validation.uncited_dropped} uncited dropped</span>}
        </div>
      </div>
      {/* the INVESTIGATION — drawings LEFT, margin comments arrowed in from the RIGHT */}
      {(widgets.length > 0 || cards.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 252px", columnGap: 26, marginTop: 9, alignItems: "start" }}>
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 9 }}>
            {widgets.map((w: any, i: number) => <DrawnWidget key={i} w={w} />)}
            {!widgets.length && <div style={{ fontSize: FS.small, color: C.dim, fontStyle: "italic" }}>(no drawing proposed — the comments carry it)</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {cards.map((c2: any, i: number) => (
              <div key={i} style={{ position: "relative" }}>
                <svg style={{ position: "absolute", left: 0, top: 6, width: 1, height: 1, overflow: "visible", pointerEvents: "none" }}>
                  <SArrow2 x1={2} y1={8} x2={-26} y2={16} tone={C.dim} />
                </svg>
                <button onClick={() => toggleCard(i)} title={openCards.has(i) ? "fold" : "read it all"}
                  style={{ textAlign: "left", width: "100%", border: `1px solid color-mix(in oklab, ${SEV_TONE2[c2.severity] ?? C.dim} 45%, ${C.border})`, borderRadius: 9, background: C.panel2, padding: "5px 9px", transform: `rotate(${i % 2 ? 0.5 : -0.5}deg)`, cursor: "pointer", fontFamily: mono }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                    <span style={{ fontSize: FS.small, color: SEV_TONE2[c2.severity] ?? C.dim }}>{c2.severity}</span>
                    <span style={{ fontSize: FS.small, color: C.dim }}>{c2.type}</span>
                  </div>
                  <b style={{ fontSize: FS.base, color: C.fg, display: "block", lineHeight: 1.4 }}>{c2.title}</b>
                  {c2.body && <div style={{ fontSize: FS.small, color: C.muted, lineHeight: 1.5, marginTop: 1, ...(openCards.has(i) ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }) }}>{c2.body}</div>}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* the MOVES — the actions climb, left to right */}
      {(review.actions ?? []).length > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10, alignItems: "flex-end" }}>
          {review.actions.map((a2: any, i: number) => (
            <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 9, background: C.panel2, padding: "5px 10px", transform: `rotate(${i % 2 ? 0.4 : -0.4}deg)`, marginBottom: i * 9, maxWidth: 250 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                <b style={{ fontSize: FS.title, color: C.brand }}>{i + 1}</b>
                <b style={{ fontSize: FS.base, color: C.fg, lineHeight: 1.4 }}>{a2.title}</b>
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 2 }}>{chip(`impact ${a2.impact}`, a2.impact === "large" ? C.ok : C.muted)}{chip(`effort ${a2.effort}`, C.dim)}</div>
              {a2.strategy && <div style={{ fontSize: FS.small, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>{a2.strategy}</div>}
            </div>
          ))}
          <span style={{ fontSize: FS.small, color: C.dim, marginBottom: 4 }}>← the moves, climbing</span>
        </div>
      )}
      {/* the LESSON — this specialist's teaching figure */}
      {review.lesson?.concept && (
        <div style={{ marginTop: 10, maxWidth: 560, border: `1px solid ${C.border}`, borderRadius: 9, padding: "7px 12px", transform: "rotate(-0.3deg)" }}>
          <div style={{ fontSize: FS.small, color: C.dim, letterSpacing: 1, textTransform: "uppercase" }}>the theory · {review.lesson.concept}</div>
          {review.lesson.sample && <pre style={{ margin: "5px 0 0", padding: "5px 9px", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: FS.base, lineHeight: 1.6, overflowX: "auto", fontFamily: mono }}><TokCode code={review.lesson.sample} /></pre>}
          {review.lesson.caption && <div style={{ fontSize: FS.small, color: C.dim, fontStyle: "italic", marginTop: 3 }}>Fig. — {review.lesson.caption}</div>}
        </div>
      )}
      {review.expected_pushback && (
        <div style={{ marginTop: 9, maxWidth: 480, border: `1.3px dashed color-mix(in oklab, ${C.brand} 45%, ${C.border})`, borderRadius: 9, padding: "4px 10px", transform: "rotate(0.4deg)", fontSize: FS.small, color: C.muted, lineHeight: 1.5 }}>⚖ expects pushback — {review.expected_pushback}</div>
      )}
    </div>
  );
}

// ── the RAIL SPLIT: the quiet roster; ⌂ opens the command center ──
export function AgentsPanel({ filePath }: { filePath: string | null }) {
  const reg = useRegistry();
  const [open, setOpen] = React.useState<string | null>(null);
  const [cc, setCc] = React.useState(false);
  const [bound, setBound] = React.useState<Set<string>>(new Set()); // ◼ bound agents → the swarm editor
  // THE PAPER SHELF — every saved study, reopenable as the full review window
  const [tab2, setTab2] = React.useState<"agents" | "papers">("agents");
  const [papers, setPapers] = React.useState<any[] | null>(null);
  const [paperOpen, setPaperOpen] = React.useState<any | null>(null);
  React.useEffect(() => {
    if (tab2 !== "papers") return;
    let alive = true;
    void (async () => {
      try {
        const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.constitution.paper", input: { op: "list", limit: 40 } }, { timeoutMs: 30_000 } as any);
        const d = r?.result?.result ?? r?.result ?? r;
        if (alive) setPapers(Array.isArray(d?.papers) ? d.papers : []);
      } catch { if (alive) setPapers([]); }
    })();
    return () => { alive = false; };
  }, [tab2]);
  const openPaper = async (id: number) => {
    try {
      const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.constitution.paper", input: { op: "get", id } }, { timeoutMs: 30_000 } as any);
      const d = r?.result?.result ?? r?.result ?? r;
      if (d?.ok && d.paper?.session) setPaperOpen({ ...d.paper.session, label: d.paper.label ?? d.paper.title, paper_id: d.paper.id });
    } catch { /* the row said no — nothing opens */ }
  };
  // region heat per axis — the report's own scores tint the groups (cold data, one fetch)
  const [heat, setHeat] = React.useState<Record<string, number> | null>(null);
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.constitution.report", input: {} }, { timeoutMs: 45_000 } as any);
        const d = r?.result?.result ?? r?.result ?? r;
        const ax = d?.axes ?? d?.engineering?.axes ?? null;
        if (alive && ax && typeof ax === "object") {
          const m: Record<string, number> = {};
          for (const [k, v] of Object.entries(ax)) { const sc = typeof v === "number" ? v : (v as any)?.score; if (typeof sc === "number") m[k] = sc; }
          setHeat(m);
        }
      } catch { /* no snapshot yet — the map stays untinted */ }
    })();
    return () => { alive = false; };
  }, []);

  if (!reg) return <div style={{ padding: 14, fontFamily: mono, fontSize: FS.base, color: C.muted }}>◆ deriving the registry…</div>;
  if (reg.error) return <div style={{ padding: 14, fontFamily: mono, fontSize: FS.base, color: C.bad }}>{reg.error}</div>;
  const agents: Agent[] = reg?.agents ?? []; // null-safe: a caller may mount before the registry lands
  const cur = agents.find((a) => a.id === open) ?? null;
  const AXES7 = ["compliance", "defects", "tests", "structure", "coupling", "cohesion", "change"];
  const groups = AXES7.map((ax) => ({ ax, members: agents.filter((a) => (a.axes?.[0] ?? "compliance") === ax) })).filter((g) => g.members.length);
  const heatOf = (ax: string) => (heat?.[ax] != null ? heat[ax] : null);
  const tint = (ax: string) => { const h = heatOf(ax); if (h == null) return "transparent"; const p = Math.round(Math.max(0, Math.min(1, (100 - h) / 55)) * 26); return `color-mix(in oklab, ${h < 55 ? C.bad : C.warn} ${p}%, transparent)`; };
  const toggleBind = (id: string) => setBound((s2) => { const n2 = new Set(s2); if (n2.has(id)) n2.delete(id); else n2.add(id); return n2; });

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "10px 12px", fontFamily: mono }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 8 }}>
        <button onClick={() => setTab2("agents")} style={{ background: "transparent", border: "none", color: tab2 === "agents" ? C.brand : C.dim, cursor: "pointer", fontFamily: mono, fontSize: FS.small, textTransform: "uppercase", letterSpacing: 1, padding: 0 }}>⚉ specialists · {agents.length}</button>
        <button onClick={() => setTab2("papers")} style={{ background: "transparent", border: "none", color: tab2 === "papers" ? C.brand : C.dim, cursor: "pointer", fontFamily: mono, fontSize: FS.small, textTransform: "uppercase", letterSpacing: 1, padding: 0 }}>⎘ papers{papers ? ` · ${papers.length}` : ""}</button>
        <span style={{ flex: 1 }} />
        <button onClick={() => setCc(true)} title="the swarm review editor — bind agents, pick a mission template, give it context"
          style={{ background: "transparent", border: `1px solid color-mix(in oklab, ${C.brand} 45%, ${C.border})`, color: C.brand, borderRadius: 5, padding: "1px 9px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>⌂ swarm editor</button>
      </div>
      {tab2 === "papers" && (
        <div>
          {papers === null && <div style={{ fontSize: FS.base, color: C.dim }}>opening the shelf…</div>}
          {papers?.length === 0 && <div style={{ fontSize: FS.base, color: C.dim, fontStyle: "italic" }}>no studies yet — run a mission; every paper files itself here</div>}
          {(papers ?? []).map((p) => (
            <button key={p.id} onClick={() => void openPaper(p.id)}
              style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", borderLeft: `2px solid transparent`, padding: "5px 6px", cursor: "pointer", fontFamily: mono, borderRadius: 4 }}>
              <div style={{ fontSize: FS.base, color: C.fg, fontWeight: 600, lineHeight: 1.4 }}>{p.title}</div>
              {p.discovery && <div style={{ fontSize: FS.small, color: C.muted, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>✦ {p.discovery}</div>}
              <div style={{ fontSize: FS.small, color: C.dim }}>{String(p.created_at ?? "").slice(0, 16)} · {p.agents} agent{p.agents === 1 ? "" : "s"} · {p.files} file{p.files === 1 ? "" : "s"} · ${Number(p.cost_usd ?? 0).toFixed(4)}</div>
            </button>
          ))}
        </div>
      )}
      {tab2 === "agents" && (<>
      {/* THE HEAT MAP — groups by axis, tinted by the region's own score */}
      {groups.map((g) => (
        <div key={g.ax} style={{ marginBottom: 7, borderRadius: 9, background: tint(g.ax), border: `1px solid color-mix(in oklab, ${C.border} 65%, transparent)`, padding: "5px 8px" }}>
          <div style={{ display: "flex", gap: 7, alignItems: "baseline", marginBottom: 4 }}>
            <span style={{ fontSize: FS.small, color: C.muted }}>⬡ {g.ax}</span>
            {heatOf(g.ax) != null && <b style={{ fontSize: FS.small, color: tone(heatOf(g.ax)), fontVariantNumeric: "tabular-nums" }}>{heatOf(g.ax)}</b>}
            <span style={{ fontSize: FS.small, color: C.dim }}>· {g.members.length}</span>
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {g.members.map((a) => (
              <span key={a.id} style={{ position: "relative" }}>
                <button onClick={() => setOpen(open === a.id ? null : a.id)} title={`${a.title} — click for details`}
                  style={{ display: "flex", gap: 5, alignItems: "center", background: open === a.id ? C.panel2 : "transparent", border: `1px solid ${open === a.id ? C.brand : bound.has(a.id) ? C.ok : "transparent"}`, borderRadius: 7, padding: "2px 6px 2px 3px", cursor: "pointer", maxWidth: 168 }}>
                  <AgentNode id={a.id} title={a.title} category={a.category} size={20} />
                  <span style={{ fontFamily: mono, fontSize: FS.small, color: open === a.id ? C.brand : C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title.replace(" Reviewer", "")}</span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); toggleBind(a.id); }} title={bound.has(a.id) ? "unbind from the swarm" : "bind into a swarm"}
                  style={{ position: "absolute", top: -5, right: -4, width: 13, height: 13, borderRadius: 3, border: `1px solid ${bound.has(a.id) ? C.ok : C.border}`, background: bound.has(a.id) ? `color-mix(in oklab, ${C.ok} 30%, ${C.bg})` : C.bg, color: bound.has(a.id) ? C.ok : C.dim, fontSize: 8, lineHeight: "11px", cursor: "pointer", padding: 0, fontFamily: mono }}>{bound.has(a.id) ? "✓" : "+"}</button>
              </span>
            ))}
          </div>
        </div>
      ))}
      {/* details, full-width under the map */}
      {cur && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid color-mix(in oklab, ${C.border} 55%, transparent)` }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <b style={{ fontSize: FS.base + 1, color: C.fg }}>{cur.title}</b>
            {chip(CAT_LABEL[cur.category] ?? cur.category, C.brand)}
            <span style={{ fontSize: FS.small, color: cur.ready ? C.ok : C.warn }}>{cur.ready ? "ready" : cur.readiness}</span>
            <span style={{ flex: 1 }} />
            <button onClick={() => toggleBind(cur.id)} style={{ background: "transparent", border: `1px solid ${bound.has(cur.id) ? C.ok : C.border}`, color: bound.has(cur.id) ? C.ok : C.muted, borderRadius: 5, padding: "0 9px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>{bound.has(cur.id) ? "◼ bound" : "◻ bind"}</button>
          </div>
          <div style={{ fontSize: FS.base, color: C.muted, lineHeight: 1.6, marginTop: 3 }}>{cur.description}</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
            {cur.laws.length ? chip(`${cur.laws.length} laws`, C.muted) : chip("measured lens", C.muted)}
            {cur.axes.map((ax) => chip(`⬡ ${ax}`))}
            {cur.required_packs.map((p) => chip(`pack: ${p}`, C.warn))}
          </div>
        </div>
      )}
      {/* the BIND bar — a bound set becomes a swarm in the editor */}
      {bound.size > 0 && (
        <div style={{ position: "sticky", bottom: 0, marginTop: 10, background: C.panel, border: `1px solid color-mix(in oklab, ${C.ok} 40%, ${C.border})`, borderRadius: 9, padding: "6px 10px", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: FS.small, color: C.muted }}>◼ {bound.size} agent{bound.size === 1 ? "" : "s"} bound</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => setBound(new Set())} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>clear</button>
          <button onClick={() => setCc(true)} style={{ background: `color-mix(in oklab, ${C.ok} 14%, transparent)`, border: `1px solid ${C.ok}`, color: C.ok, borderRadius: 6, padding: "1px 11px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>→ the swarm editor (mission + context)</button>
        </div>
      )}
      </>)}
      {cc && <CommandCenter reg={reg} filePath={filePath} initialCrew={bound.size ? [...bound] : null} onClose={() => setCc(false)} />}
      {paperOpen && <MissionReview session={paperOpen} onClose={() => setPaperOpen(null)} />}
    </div>
  );
}
// ── PAPER CREATOR (né the Engineering Command Center) ──
// The mission gallery wears the Studio's exact card design (GenCard from
// studio-kit) with mission-flavored sample thumbnails; clicking ENTERS the
// mission — the gallery fades out and the content becomes that mission's
// dashboard (discrete ← back), which states EXPLICITLY how the mission
// approaches the problem and how the resulting paper is organized.
const missionCat = (m: any) => (String(m.id).startsWith("nb-") ? "from your sources" : m.id === "diagnose" ? "diagnose" : String(m.id).startsWith("audit:") ? "audits by concern" : String(m.id).startsWith("axis-audit:") ? "audits by axis" : String(m.id).startsWith("pattern:") ? "pattern hunts" : "standing studies");

const msv = { width: "100%", height: 44 } as const;
const mbar = (x: number, y: number, w: number, c: string, o = 0.8) => <rect x={x} y={y} width={w} height="4" rx="2" fill={c} opacity={o} />;
const MISSION_SAMPLE: Record<string, React.ReactNode> = {
  "from your sources": <svg viewBox="0 0 120 44" style={msv}><rect x="10" y="8" width="28" height="28" rx="3" fill="none" stroke={C.brand} />{mbar(15, 14, 18, C.dim, 0.6)}{mbar(15, 21, 14, C.dim, 0.6)}{mbar(15, 28, 18, C.dim, 0.6)}<line x1="38" y1="22" x2="64" y2="22" stroke={C.dim} /><circle cx="78" cy="12" r="6" fill="none" stroke={C.brand} /><circle cx="78" cy="32" r="6" fill="none" stroke={C.brand} /><circle cx="102" cy="22" r="6" fill="none" stroke={C.dim} /><line x1="64" y1="22" x2="72" y2="14" stroke={C.dim} /><line x1="64" y1="22" x2="72" y2="30" stroke={C.dim} /><line x1="84" y1="14" x2="96" y2="20" stroke={C.dim} /><line x1="84" y1="30" x2="96" y2="24" stroke={C.dim} /></svg>,
  diagnose: <svg viewBox="0 0 120 44" style={msv}><circle cx="60" cy="22" r="14" fill="none" stroke={C.brand} /><circle cx="60" cy="22" r="6" fill="none" stroke={C.dim} /><line x1="60" y1="3" x2="60" y2="12" stroke={C.brand} /><line x1="60" y1="32" x2="60" y2="41" stroke={C.brand} /><line x1="41" y1="22" x2="50" y2="22" stroke={C.brand} /><line x1="70" y1="22" x2="79" y2="22" stroke={C.brand} /><circle cx="60" cy="22" r="2" fill={C.brand} /></svg>,
  "audits by concern": <svg viewBox="0 0 120 44" style={msv}><path d="M 60 4 L 74 10 V 24 Q 74 34 60 40 Q 46 34 46 24 V 10 Z" fill="none" stroke={C.brand} /><path d="M 54 21 L 59 26 L 68 15" fill="none" stroke={C.ok} strokeWidth="2" /></svg>,
  "audits by axis": <svg viewBox="0 0 120 44" style={msv}><polygon points="60,5 76,14 76,30 60,39 44,30 44,14" fill="none" stroke={C.dim} opacity="0.5" /><polygon points="60,12 70,17 68,28 60,33 48,27 52,16" fill="none" stroke={C.brand} /><line x1="60" y1="22" x2="60" y2="5" stroke={C.dim} opacity="0.35" /><line x1="60" y1="22" x2="76" y2="14" stroke={C.dim} opacity="0.35" /><line x1="60" y1="22" x2="76" y2="30" stroke={C.dim} opacity="0.35" /><line x1="60" y1="22" x2="60" y2="39" stroke={C.dim} opacity="0.35" /><line x1="60" y1="22" x2="44" y2="30" stroke={C.dim} opacity="0.35" /><line x1="60" y1="22" x2="44" y2="14" stroke={C.dim} opacity="0.35" /></svg>,
  "pattern hunts": <svg viewBox="0 0 120 44" style={msv}><rect x="14" y="8" width="18" height="12" rx="2" fill="none" stroke={C.dim} opacity="0.6" /><rect x="38" y="8" width="18" height="12" rx="2" fill="none" stroke={C.dim} opacity="0.6" /><rect x="62" y="8" width="18" height="12" rx="2" fill="none" stroke={C.brand} strokeWidth="1.6" /><rect x="86" y="8" width="18" height="12" rx="2" fill="none" stroke={C.dim} opacity="0.6" /><rect x="14" y="24" width="18" height="12" rx="2" fill="none" stroke={C.dim} opacity="0.6" /><rect x="38" y="24" width="18" height="12" rx="2" fill="none" stroke={C.brand} strokeWidth="1.6" /><rect x="62" y="24" width="18" height="12" rx="2" fill="none" stroke={C.dim} opacity="0.6" /><rect x="86" y="24" width="18" height="12" rx="2" fill="none" stroke={C.dim} opacity="0.6" /></svg>,
  "standing studies": <svg viewBox="0 0 120 44" style={msv}><line x1="14" y1="36" x2="106" y2="36" stroke={C.dim} /><rect x="20" y="24" width="10" height="12" fill={C.dim} opacity="0.5" /><rect x="38" y="16" width="10" height="20" fill={C.brand} opacity="0.75" /><rect x="56" y="27" width="10" height="9" fill={C.dim} opacity="0.5" /><rect x="74" y="10" width="10" height="26" fill={C.brand} opacity="0.75" /><rect x="92" y="20" width="10" height="16" fill={C.dim} opacity="0.5" /></svg>,
};

// how each mission KIND approaches the problem — stated before any spend.
const MISSION_APPROACH: Record<string, string> = {
  "from your sources": "The crew reads the notebook's own scope — every claim must cite the file it came from; the paper teaches what YOUR sources actually do.",
  diagnose: "One sick file, every relevant lens at once. The paper centers on WHY it is sick — the field around it, the laws it breaks — and ends in the exact repair.",
  "audits by concern": "Every scoped file examined under ONE concern's laws. Independent lenses on the same cases — where they converge becomes the discussion's spine.",
  "audits by axis": "One measured axis across the whole scope, with the population baseline saying what 'normal' looks like here — outliers must explain themselves.",
  "pattern hunts": "Hunt one named anti-pattern across the scope. Every hit gets an anatomy: surface symptom → root cause → repair, drawn before it is argued.",
  "standing studies": "A comparative sweep — the scope is ranked, the extremes are read closely, and the difference between best and worst becomes the thesis.",
};

// the paper's organization — the TRUE scientific form, section by section.
const PAPER_FORM: [string, string][] = [
  ["1 Introduction", "the thesis — what the study found, never the method"],
  ["2 Concepts", "every named pattern defined before it is used"],
  ["3 Case studies", "one per file — thesis · cited evidence · the field around it"],
  ["4 Synthesis", "one central thesis, branches per axis — the thesis map"],
  ["5 Discussion", "the court — where the lenses converge and where they clash"],
  ["6 Repair", "the ranked plan, before → after"],
  ["7 Threats to validity", "what could make this study wrong"],
  ["A·B", "references · the instruments + the record · the research bridge"],
];

// the PAPER SAMPLE — a sketched miniature of the paper this mission produces,
// in the studio-kit sample language: the single centered column, the abstract,
// the mission's own figure mid-paper, one case block per scoped file.
function PaperSample({ cat, cases }: { cat: string; cases: number }) {
  const t = (x: number, y: number, w: number, c: string = C.dim, o = 0.5, h = 2.2) => <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx={1.1} fill={c} opacity={o} />;
  const fig = (x: number, y: number, w: number, h: number) => {
    const cx = x + w / 2, cy = y + h / 2;
    if (cat === "audits by axis") return <g><polygon points={`${cx},${y + 3} ${x + w - 44},${cy} ${cx},${y + h - 3} ${x + 44},${cy}`} fill="none" stroke={C.brand} strokeWidth="0.9" /><polygon points={`${cx},${y + 7} ${x + w - 56},${cy} ${cx},${y + h - 7} ${x + 56},${cy}`} fill="none" stroke={C.dim} strokeWidth="0.7" opacity="0.5" /></g>;
    if (cat === "pattern hunts") return <g>{[0, 1, 2].map((i) => <rect key={i} x={x + 26 + i * ((w - 52) / 3)} y={cy - 5} width={(w - 52) / 3 - 4} height={10} rx={1.5} fill="none" stroke={i === 1 ? C.brand : C.dim} strokeWidth="0.9" opacity={i === 1 ? 0.9 : 0.5} />)}</g>;
    if (cat === "audits by concern") return <g><path d={`M ${cx} ${y + 3} L ${cx + 8} ${y + 6} V ${cy + 2} Q ${cx + 8} ${y + h - 5} ${cx} ${y + h - 3} Q ${cx - 8} ${y + h - 5} ${cx - 8} ${cy + 2} V ${y + 6} Z`} fill="none" stroke={C.brand} strokeWidth="0.9" /><path d={`M ${cx - 3.5} ${cy - 1} L ${cx - 0.5} ${cy + 2.5} L ${cx + 4.5} ${cy - 4}`} fill="none" stroke={C.ok} strokeWidth="1.1" /></g>;
    if (cat === "standing studies") return <g>{[0, 1, 2, 3, 4].map((i) => { const bh = i % 2 ? h - 9 : (h - 9) * 0.55; return <rect key={i} x={x + 30 + i * ((w - 60) / 5)} y={y + h - 4 - bh} width={(w - 60) / 5 - 3} height={bh} fill={i % 2 ? C.brand : C.dim} opacity={i % 2 ? 0.7 : 0.4} />; })}</g>;
    return <g><circle cx={cx} cy={cy} r={5} fill="none" stroke={C.brand} strokeWidth="0.9" /><circle cx={cx - 26} cy={cy - 5} r={3} fill="none" stroke={C.dim} strokeWidth="0.7" /><circle cx={cx + 26} cy={cy - 4} r={3} fill="none" stroke={C.dim} strokeWidth="0.7" /><circle cx={cx + 18} cy={cy + 7} r={3} fill="none" stroke={C.dim} strokeWidth="0.7" /><line x1={cx - 5} y1={cy - 1.5} x2={cx - 23} y2={cy - 4.5} stroke={C.dim} strokeWidth="0.6" opacity="0.6" /><line x1={cx + 5} y1={cy - 1.5} x2={cx + 23} y2={cy - 4} stroke={C.dim} strokeWidth="0.6" opacity="0.6" /><line x1={cx + 4} y1={cy + 3} x2={cx + 15} y2={cy + 6} stroke={C.dim} strokeWidth="0.6" opacity="0.6" /></g>;
  };
  const caseY = (i: number) => 116 + i * 9;
  return (
    <svg viewBox="0 0 170 212" style={{ width: "100%", height: "auto", display: "block" }}>
      <rect x="3" y="2" width="164" height="208" rx="3" fill={C.panel2} stroke={C.border} />
      {t(50, 12, 70, C.brand, 0.85, 3)}{t(62, 19, 46, C.dim, 0.5, 2)}
      {t(32, 28, 20, C.brand, 0.5)}{t(32, 33, 106, C.dim, 0.45)}{t(32, 37.5, 106, C.dim, 0.45)}{t(32, 42, 66, C.dim, 0.45)}
      <line x1="16" y1="50" x2="154" y2="50" stroke={C.dim} opacity="0.3" />
      {t(16, 56, 30, C.muted, 0.8, 2.6)}{t(16, 62, 138, C.dim, 0.45)}{t(16, 66.5, 86, C.dim, 0.45)}
      <rect x="16" y="74" width="138" height="26" rx="2" fill="none" stroke={C.dim} strokeDasharray="3 2.5" opacity="0.55" />
      {fig(16, 74, 138, 26)}
      {t(58, 103, 54, C.dim, 0.4, 1.8)}
      {t(16, 110, 36, C.muted, 0.8, 2.6)}
      {Array.from({ length: Math.max(1, Math.min(3, cases)) }, (_, i) => (
        <g key={i}>{t(20, caseY(i), 26, C.brand, 0.6)}{t(52, caseY(i), 86, C.dim, 0.4)}<circle cx={146} cy={caseY(i) + 1.2} r={3} fill="none" stroke={C.ok} strokeWidth="0.8" opacity="0.7" /></g>
      ))}
      {t(16, 148, 32, C.muted, 0.8, 2.6)}{t(16, 154, 96, C.dim, 0.45)}{t(16, 158.5, 60, C.dim, 0.45)}
      <circle cx="136" cy="155" r="4" fill="none" stroke={C.brand} strokeWidth="0.9" />
      <circle cx="124" cy="147" r="2" fill="none" stroke={C.dim} strokeWidth="0.7" /><circle cx="150" cy="149" r="2" fill="none" stroke={C.dim} strokeWidth="0.7" /><circle cx="146" cy="163" r="2" fill="none" stroke={C.dim} strokeWidth="0.7" />
      <line x1="133" y1="152" x2="126" y2="148.5" stroke={C.dim} strokeWidth="0.6" opacity="0.6" /><line x1="140" y1="153" x2="148" y2="150" stroke={C.dim} strokeWidth="0.6" opacity="0.6" /><line x1="139" y1="158" x2="144" y2="161.5" stroke={C.dim} strokeWidth="0.6" opacity="0.6" />
      {t(16, 170, 24, C.muted, 0.8, 2.6)}
      <rect x="50" y="168" width="22" height="9" rx="1.5" fill="none" stroke={C.warn} strokeWidth="0.8" opacity="0.75" />
      <line x1="76" y1="172.5" x2="86" y2="172.5" stroke={C.dim} strokeWidth="0.7" /><path d="M 84 170.5 L 87 172.5 L 84 174.5" fill="none" stroke={C.dim} strokeWidth="0.7" />
      <rect x="90" y="168" width="22" height="9" rx="1.5" fill="none" stroke={C.ok} strokeWidth="0.8" opacity="0.8" />
      {t(16, 186, 34, C.muted, 0.7, 2.2)}
      {t(16, 192, 90, C.dim, 0.35, 1.8)}{t(16, 196.5, 70, C.dim, 0.35, 1.8)}{t(16, 201, 80, C.dim, 0.35, 1.8)}
    </svg>
  );
}

// ── THE COMMAND CENTER COMPONENT ──
/** THE PAPER CREATOR ON THE ULTRA REVIEW TAB (operator 2026-09-19: "we had a list of agents and a window to
 *  generate a paper based on a mission — add it to the current ultra review"): the command center inline —
 *  missions derived from the evidence, the crew, the paper. */
// ── THE RUN LOG (operator 2026-09-19) ────────────────────────────────────────────────────────────
export type RunLogLine = { t: number; kind: string; text: string; who?: string };
const LOG_TONE: Record<string, string> = { error: C.bad, done: C.ok, run: C.brand, call: C.brand, answer: C.fg, research: C.warn, context: C.muted, start: C.muted, validate: C.ok, reject: C.warn, engine: C.fg };
/** A CLI trace from the serve's audit → one log line: engine, verdict, time, tokens, the tools it ran. Pure. */
export function traceLine(tr: any): string {
  const tools: any[] = Array.isArray(tr?.tools) ? tr.tools : [];
  const byName = new Map<string, string[]>();
  for (const t of tools) { const n = String(t?.name ?? "tool"); const arr = byName.get(n) ?? []; if (t?.target) arr.push(String(t.target).split("/").pop() ?? ""); byName.set(n, arr); }
  const toolsTxt = [...byName.entries()].map(([n, targets]) => `${n}${targets.length ? ` ${targets.slice(0, 3).join(", ")}${targets.length > 3 ? ` +${targets.length - 3}` : ""}` : ""}`).join(" · ");
  const tok = tr?.tokensIn != null || tr?.tokensOut != null ? ` · ${tr.tokensIn ?? 0}→${tr.tokensOut ?? 0} tok` : "";
  return `${tr?.engine === "ClaudeCode" || tr?.engine === "claude-code" ? "claude -p" : tr?.engine === "Codex" || tr?.engine === "codex" ? "codex exec" : tr?.engine === "Opencode" || tr?.engine === "opencode" ? "opencode run" : String(tr?.engine ?? "engine")} ${tr?.ok ? "answered" : `failed${tr?.error ? ` — ${String(tr.error).slice(0, 80)}` : ""}`} in ${Math.round((Number(tr?.ms) || 0) / 100) / 10}s${tok}${tools.length ? ` · ${tools.length} tool call${tools.length === 1 ? "" : "s"}: ${toolsTxt}` : ""}`;
}
export function RunLogPanel({ lines, busy, startedAt, maxHeight = 220 }: { lines: RunLogLine[]; busy: boolean; startedAt: number; maxHeight?: number }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [lines.length]);
  const rel = (t: number) => { const s2 = Math.max(0, t - startedAt) / 1000; return s2 < 60 ? `${s2.toFixed(1)}s` : `${Math.floor(s2 / 60)}m${Math.round(s2 % 60).toString().padStart(2, "0")}`; };
  return (
    <div data-testid="run-log" style={{ marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 9, background: C.bg, fontFamily: mono }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "5px 10px 3px", borderBottom: `1px solid color-mix(in oklab, ${C.border} 60%, transparent)` }}>
        <span style={{ fontSize: FS.small, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>the run log</span>
        <span style={{ fontSize: FS.small, color: C.dim }}>· {lines.length} line{lines.length === 1 ? "" : "s"}</span>
        {busy && <span style={{ fontSize: FS.small, color: C.brand }}>● live</span>}
      </div>
      <div ref={ref} style={{ maxHeight, overflowY: "auto", padding: "4px 10px 6px" }}>
        {!lines.length && <div style={{ fontSize: FS.small, color: C.dim, fontStyle: "italic" }}>nothing yet</div>}
        {lines.map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "44px 150px 1fr", gap: 8, fontSize: FS.small, lineHeight: 1.55, color: LOG_TONE[l.kind] ?? C.muted }}>
            <span style={{ color: C.dim, fontVariantNumeric: "tabular-nums" }}>{rel(l.t)}</span>
            <span style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.who}>{l.who ?? l.kind}</span>
            <span style={{ wordBreak: "break-word" }}>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── THE RUN-ON CHOICE + THE ESTIMATE (operator 2026-09-19) ────────────────────────────────────
export type Tier3 = "low" | "mid" | "high";
export type EngineChoice = "routed" | EngineKey;
export type RunOn = { agentsTier: Tier3; agentsEngine: EngineChoice; editorTier: Tier3; editorEngine: EngineChoice };
export const RUN_ON_DEFAULT: RunOn = { agentsTier: "mid", agentsEngine: "routed", editorTier: "high", editorEngine: "routed" };
const RUN_ON_KEY = "antiloki:ultra:run-on";
const TIERS: Tier3[] = ["low", "mid", "high"];
const ENGINES: [EngineChoice, string][] = [["routed", "the tier's default"], ["claude-code", "Claude Code"], ["codex", "Codex"], ["gemini", "Antigravity"], ["grok", "Grok"], ["cursor", "Cursor"], ["opencode", "OpenCode"]];
export function readRunOn(): RunOn {
  try {
    const j = JSON.parse(localStorage.getItem(RUN_ON_KEY) || "null");
    const tier = (v: any, d: Tier3): Tier3 => (TIERS.includes(v) ? v : d);
    const eng = (v: any, d: EngineChoice): EngineChoice => (ENGINES.some(([k]) => k === v) ? v : d);
    return j ? { agentsTier: tier(j.agentsTier, "mid"), agentsEngine: eng(j.agentsEngine, "routed"), editorTier: tier(j.editorTier, "high"), editorEngine: eng(j.editorEngine, "routed") } : RUN_ON_DEFAULT;
  } catch { return RUN_ON_DEFAULT; }
}
export type MissionEstimate = {
  agents: { calls: number; tokens_in: number; tokens_out: number; model: string | null; billing: string; usd: number | null; equiv: number | null };
  editor: { calls: number; tokens_in: number; tokens_out: number; model: string | null; billing: string; usd: number | null; equiv: number | null } | null;
  breakdown: { source: number; record: number; sources: number; prompt: number } | null;
  tokens_in: number; out_cap: number; usd: number | null; equiv: number | null; sampled: number; model: string | null;
};
/** The mission's estimate, pure: the agents' sampled prompts × the cases × the crew on the agents'
 *  route; the editor reads every review (~900 tok each) plus its own template on the editor's route.
 *  A subscription route costs $0 metered and shows the API-equivalent; a metered route prices itself. */
export function missionEstimate(samples: any[], editorRoute: any | null, files: number, crew: number, withEditor: boolean): MissionEstimate {
  const perFile = samples.reduce((a, r) => a + (Number(r.est_tokens_in) || 0), 0) / Math.max(1, samples.length);
  const calls = Math.max(1, files) * Math.max(1, crew);
  const outPer = Number(samples[0]?.max_output_tokens) || 2200;
  const price = (r: any, tin: number, tout: number) => {
    const a = Number(r?.usd_in_per_mtok), b = Number(r?.usd_out_per_mtok);
    return Number.isFinite(a) && Number.isFinite(b) && r?.usd_in_per_mtok != null ? (tin / 1e6) * a + (tout / 1e6) * b : null;
  };
  const r0 = samples[0];
  const aIn = Math.round(perFile * files * crew), aOut = outPer * calls;
  const aPriced = price(r0, aIn, aOut);
  const aBilling = String(r0?.billing ?? "none");
  const agents = { calls, tokens_in: aIn, tokens_out: aOut, model: r0?.model ?? null, billing: aBilling, usd: aBilling === "subscription" || aBilling === "local" ? 0 : aPriced, equiv: aBilling === "subscription" ? aPriced : null };
  // what one call carries, averaged over the samples (the case's source · the measured record · the attached sources · the prompt)
  const bd = (k: string) => Math.round(samples.reduce((a, r) => a + (Number(r?.est_breakdown?.[k]) || 0), 0) / Math.max(1, samples.length));
  const breakdown = samples.some((r) => r?.est_breakdown) ? { source: bd("source"), record: bd("record"), sources: bd("sources"), prompt: bd("prompt") } : null;
  let editor: MissionEstimate["editor"] = null;
  if (withEditor) {
    const eIn = 900 * calls + 3000, eOut = 4000;
    const eBilling = String(editorRoute?.billing ?? "none");
    const ePriced = price(editorRoute, eIn, eOut);
    editor = { calls: 1, tokens_in: eIn, tokens_out: eOut, model: editorRoute?.model ?? null, billing: eBilling, usd: eBilling === "subscription" || eBilling === "local" ? 0 : ePriced, equiv: eBilling === "subscription" ? ePriced : null };
  }
  const sum = (a: number | null, b: number | null | undefined) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0));
  return { agents, editor, breakdown, tokens_in: aIn + (editor?.tokens_in ?? 0), out_cap: aOut + (editor?.tokens_out ?? 0), usd: sum(agents.usd, editor?.usd), equiv: sum(agents.equiv, editor?.equiv), sampled: samples.length, model: agents.model };
}
const fmtUsd = (v: number | null) => (v == null ? "—" : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);
const fmtTok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n));

export function RunOnField({ value, onChange, withEditor }: { value: RunOn; onChange: (v: RunOn) => void; withEditor: boolean }) {
  const seats = useSeats();
  const sel = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, color: C.fg, fontFamily: mono, fontSize: FS.small, padding: "1px 4px" } as React.CSSProperties;
  const row = (role: "agents" | "editor", label: string) => (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: FS.small, color: C.muted, fontFamily: mono, minWidth: 74 }}>{label}</span>
      <select data-testid={`run-on-${role}-tier`} value={value[`${role}Tier`]} onChange={(e) => onChange({ ...value, [`${role}Tier`]: e.target.value as Tier3 })} style={sel} title="the tier — the substrate maps it to the engine's model (claude sonnet / opus, codex gpt-5-mini / gpt-5)">
        {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select data-testid={`run-on-${role}-engine`} value={value[`${role}Engine`]} onChange={(e) => onChange({ ...value, [`${role}Engine`]: e.target.value as EngineChoice })} style={sel} title="which subscription runs it — routed follows the tier's active provider (Settings › Seats)">
        {ENGINES.filter(([k]) => k === "routed" || offered(seats, value[`${role}Engine`]).includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </div>
  );
  return (
    <div data-testid="run-on" style={{ marginTop: 10, border: `1px solid ${C.border}`, borderRadius: 9, padding: "7px 10px", display: "grid", gap: 5 }}>
      <div style={{ fontSize: FS.small, color: C.dim, fontFamily: mono, textTransform: "uppercase", letterSpacing: 1 }}>run on <span style={{ textTransform: "none", letterSpacing: 0 }}>— your subscriptions; the tier picks the model</span></div>
      {row("agents", "⚉ the agents")}
      {withEditor && row("editor", "✒ the editor")}
      {(value.agentsTier !== "mid" || value.editorTier !== "high" || value.agentsEngine !== "routed" || value.editorEngine !== "routed") && (
        <button onClick={() => onChange(RUN_ON_DEFAULT)} style={{ justifySelf: "start", background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: FS.small, padding: 0 }}>↺ defaults (agents mid · editor high · routed)</button>
      )}
    </div>
  );
}

export function EstimateCard({ est, calls }: { est: MissionEstimate | null; calls: number }) {
  const line = (label: string, r: MissionEstimate["agents"]) => (
    <div style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: 8, fontSize: FS.small, fontFamily: mono, lineHeight: 1.6 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ color: C.fg }}>
        {r.calls} call{r.calls === 1 ? "" : "s"} · ≈{fmtTok(r.tokens_in)} tok in · ≤{fmtTok(r.tokens_out)} out · <span style={{ color: C.brand }}>{r.model ?? "no route"}</span>
        {" · "}{r.billing === "subscription" ? <span style={{ color: C.ok }}>subscription{r.equiv != null ? ` (≈${fmtUsd(r.equiv)} API-equivalent)` : ""}</span>
          : r.billing === "metered" ? <span style={{ color: C.warn }}>metered ≈{fmtUsd(r.usd)}</span>
          : r.billing === "local" ? <span style={{ color: C.ok }}>local · free</span> : <span style={{ color: C.bad }}>no active provider for this tier</span>}
      </span>
    </div>
  );
  return (
    <div data-testid="mission-estimate" style={{ marginTop: 8, border: `1px solid color-mix(in oklab, ${C.brand} 30%, ${C.border})`, borderRadius: 9, padding: "7px 10px", background: `color-mix(in oklab, ${C.brand} 4%, transparent)` }}>
      <div style={{ fontSize: FS.small, color: C.dim, fontFamily: mono, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>the estimate <span style={{ textTransform: "none", letterSpacing: 0 }}>— before anything runs</span></div>
      {!est ? <div style={{ fontSize: FS.small, color: C.dim, fontFamily: mono }}>measuring the real prompts… ({calls} call{calls === 1 ? "" : "s"})</div> : (<>
        {line("⚉ agents", est.agents)}
        {est.editor && line("✒ editor", est.editor)}
        <div style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: 8, fontSize: FS.small, fontFamily: mono, lineHeight: 1.6, marginTop: 2, borderTop: `1px solid color-mix(in oklab, ${C.border} 60%, transparent)`, paddingTop: 3 }}>
          <span style={{ color: C.muted }}>Σ total</span>
          <span style={{ color: C.fg }}>≈{fmtTok(est.tokens_in)} tok in · ≤{fmtTok(est.out_cap)} out · <b style={{ color: est.usd ? C.warn : C.ok }}>{est.usd ? `${fmtUsd(est.usd)} metered` : "$0 metered"}</b>{est.equiv != null ? <span style={{ color: C.dim }}> · ≈{fmtUsd(est.equiv)} API-equivalent on the subscription</span> : null} · ≈{Math.round(calls * 20 + (est.editor ? 80 : 0))}s</span>
        </div>
        {(est.agents.billing === "subscription" || est.editor?.billing === "subscription") && <div style={{ fontSize: FS.small, color: C.dim, fontFamily: mono, marginTop: 3 }}>each headless run also carries the engine's own system prompt and tools (claude -p ≈ 30k tok, cache-priced) — the subscription pays it, these numbers are antiloki's context only</div>}
      </>)}
    </div>
  );
}

// ── THE SPECIALISTS' RAIL (operator 2026-09-19: "place the specialists as a sidebar right, like a
// profile of them divided by category"): every agent of the registry as a profile card — avatar,
// title, what it reviews, its axes and laws — grouped by category. When a mission is armed, a card
// binds the specialist into the crew (up to SWARM_CAP); otherwise the rail is the roster to read.
const CAT_ORDER = ["axis", "core", "specialist", "language", "framework", "book"];
/** THE PAPER SHELF (operator 2026-09-19: "ultra reviews are not being saved anywhere, or at least I can't
 *  see the list") — every study files itself (`system.constitution.paper` op save, by swarm_id) and this
 *  lists them: title · discovery · when · agents · files · cost; click reopens the full review window.
 *  Reloads after every finished mission (`refreshKey`). */
export function PaperShelf({ onOpen, refreshKey = 0, limit = 40 }: { onOpen: (session: any) => void; refreshKey?: number; limit?: number }) {
  const [papers, setPapers] = React.useState<any[] | null>(null);
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.constitution.paper", input: { op: "list", limit } }, { timeoutMs: 30_000 } as any);
        const d = r?.result?.result ?? r?.result ?? r;
        if (alive) setPapers(Array.isArray(d?.papers) ? d.papers : []);
      } catch { if (alive) setPapers([]); }
    })();
    return () => { alive = false; };
  }, [refreshKey, limit]);
  const open = async (id: number) => {
    try {
      const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.constitution.paper", input: { op: "get", id } }, { timeoutMs: 30_000 } as any);
      const d = r?.result?.result ?? r?.result ?? r;
      if (d?.ok && d.paper?.session) onOpen({ ...d.paper.session, label: d.paper.label ?? d.paper.title, paper_id: d.paper.id });
    } catch { /* the row said no — nothing opens */ }
  };
  return (
    <div data-testid="paper-shelf" style={{ borderBottom: `1px solid ${C.border}`, padding: "10px 12px", fontFamily: mono }}>
      <div onClick={() => setCollapsed((c) => !c)} style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: collapsed ? 0 : 6, cursor: "pointer" }}>
        <span style={{ fontSize: FS.small, color: C.brand, textTransform: "uppercase", letterSpacing: 1 }}>📄 the papers</span>
        <span style={{ fontSize: FS.small, color: C.dim }}>· {papers?.length ?? "…"}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: FS.small, color: C.dim }}>{collapsed ? "▸" : "▾"}</span>
      </div>
      {!collapsed && papers === null && <div style={{ fontSize: FS.small, color: C.dim }}>opening the shelf…</div>}
      {!collapsed && papers?.length === 0 && <div style={{ fontSize: FS.small, color: C.dim, fontStyle: "italic", lineHeight: 1.5 }}>no studies yet — run a mission; every paper files itself here</div>}
      {!collapsed && (papers ?? []).map((p) => (
        <button key={p.id} data-testid={`paper-${p.id}`} onClick={() => void open(p.id)} title={p.discovery ? `✦ ${p.discovery}` : p.title}
          style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", borderLeft: `2px solid transparent`, padding: "4px 6px", cursor: "pointer", fontFamily: mono, borderRadius: 4 }}>
          <div style={{ fontSize: FS.base, color: C.fg, fontWeight: 600, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>{p.title}</div>
          <div style={{ fontSize: FS.small, color: C.dim }}>{String(p.created_at ?? "").slice(0, 16)} · {p.label ?? ""}{p.agents ? ` · ${p.agents} agent${p.agents === 1 ? "" : "s"}` : ""}{p.files ? ` · ${p.files} file${p.files === 1 ? "" : "s"}` : ""} · ${Number(p.cost_usd ?? 0).toFixed(2)}</div>
        </button>
      ))}
    </div>
  );
}

export function SpecialistsRail({ agents, crew, onToggle, armed, inColumn = false }: { agents: Agent[]; crew: Set<string>; onToggle: (id: string) => void; armed: boolean; inColumn?: boolean }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState("");
  const q = filter.trim().toLowerCase();
  const groups = CAT_ORDER.map((c) => ({ c, members: agents.filter((a) => (a.category ?? "specialist") === c && (!q || `${a.title} ${a.description} ${a.axes.join(" ")}`.toLowerCase().includes(q))) })).filter((g) => g.members.length);
  const rest = agents.filter((a) => !CAT_ORDER.includes(a.category ?? "specialist"));
  if (rest.length) groups.push({ c: "other", members: rest });
  return (
    <div data-testid="specialists-rail" style={inColumn ? { padding: "10px 12px", fontFamily: mono } : { width: 292, flexShrink: 0, borderLeft: `1px solid ${C.border}`, overflowY: "auto", padding: "10px 12px", fontFamily: mono }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 6 }}>
        <span style={{ fontSize: FS.small, color: C.brand, textTransform: "uppercase", letterSpacing: 1 }}>⚉ the specialists</span>
        <span style={{ fontSize: FS.small, color: C.dim }}>· {agents.length}</span>
        <span style={{ flex: 1 }} />
        {armed && <span style={{ fontSize: FS.small, color: crew.size ? C.ok : C.dim }}>{crew.size}/{SWARM_CAP} in the crew</span>}
      </div>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="find a specialist…"
        style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.fg, fontFamily: mono, fontSize: FS.small, padding: "3px 7px", marginBottom: 8 }} />
      {groups.map((g) => (
        <div key={g.c} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: FS.small, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{CAT_LABEL[g.c] ?? g.c} <span style={{ color: C.dim }}>· {g.members.length}</span></div>
          {g.members.map((a) => {
            const on = crew.has(a.id); const isOpen = open === a.id;
            return (
              <div key={a.id} data-testid="specialist-card" onClick={() => setOpen(isOpen ? null : a.id)}
                style={{ display: "grid", gridTemplateColumns: "26px 1fr auto", gap: "2px 8px", alignItems: "center", padding: "5px 6px", borderRadius: 8, cursor: "pointer", marginBottom: 2,
                  background: isOpen ? C.panel2 : "transparent", border: `1px solid ${on ? C.ok : isOpen ? `color-mix(in oklab, ${C.brand} 40%, ${C.border})` : "transparent"}` }}>
                <AgentNode id={a.id} title={a.title} category={a.category} size={24} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: FS.base, color: a.ready ? C.fg : C.dim, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</div>
                  {!isOpen && <div style={{ fontSize: FS.small, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.description}</div>}
                </div>
                {armed ? (
                  <button onClick={(e) => { e.stopPropagation(); if (a.ready) onToggle(a.id); }} disabled={!a.ready} title={a.ready ? (on ? "remove from the crew" : "bind into the crew") : a.readiness}
                    style={{ background: on ? `color-mix(in oklab, ${C.ok} 18%, transparent)` : "transparent", border: `1px solid ${on ? C.ok : C.border}`, color: on ? C.ok : a.ready ? C.muted : C.dim, borderRadius: 5, padding: "0 7px", cursor: a.ready ? "pointer" : "not-allowed", fontFamily: mono, fontSize: FS.small, lineHeight: "18px" }}>{on ? "✓ crew" : "+ crew"}</button>
                ) : <span style={{ fontSize: FS.small, color: a.ready ? C.ok : C.warn }}>{a.ready ? "●" : "○"}</span>}
                {isOpen && (
                  <div style={{ gridColumn: "1 / -1", paddingTop: 3 }}>
                    <div style={{ fontSize: FS.small, color: C.muted, lineHeight: 1.55 }}>{a.description}</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                      {a.axes.map((ax) => chip(`⬡ ${ax}`))}
                      {a.laws.length ? chip(`${a.laws.length} laws`, C.muted) : chip("measured lens", C.muted)}
                      {a.languages.length > 0 && chip(a.languages.join(" · "), C.dim)}
                      {chip(`${a.est_cost} cost · ~${a.est_runtime_s}s`, C.dim)}
                      {!a.ready && chip(a.readiness, C.warn)}
                    </div>
                    {(a.consumes.length > 0 || a.produces.length > 0) && (
                      <div style={{ fontSize: FS.small, color: C.dim, marginTop: 5, lineHeight: 1.5 }}>
                        {a.consumes.length > 0 && <div>reads: {a.consumes.join(", ")}</div>}
                        {a.produces.length > 0 && <div>writes: {a.produces.join(", ")}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function PaperCreatorInline({ filePath }: { filePath: string | null }) {
  const reg = useRegistry();
  if (!reg) return <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, padding: 12 }}>loading the agents…</div>;
  return <CommandCenter reg={reg} filePath={filePath} onClose={() => {}} embedded />;
}

export function CommandCenter({ reg, filePath, onClose, initialCrew = null, initialScope = null, extraMissions = null, classMode = null, originNotebookId = null, title = null, subtitle = null, contextRail = null, missionsOnly = false, bookMain = null, embedded = false }: { embedded?: boolean; reg: any; filePath: string | null; onClose: () => void; initialCrew?: string[] | null; initialScope?: string[] | null; extraMissions?: any[] | null; classMode?: "video" | "slides" | "audio" | null; originNotebookId?: number | null; title?: string | null; subtitle?: string | null; contextRail?: React.ReactNode | null; missionsOnly?: boolean; bookMain?: React.ReactNode | null }) {
  const agents: Agent[] = reg.agents ?? [];
  const byId = new Map(agents.map((a) => [a.id, a]));
  const { setAiCallId } = useShell();
  const [report, setReport] = React.useState<any | null>(null);
  const [armed, setArmed] = React.useState<Mission | null>(null);   // the selected mission
  // THE MISSION THEATER (operator 2026-07-19): the run gets its own window — the
  // swarm feeds the hub; when the editor cooks, everything cross-fades into the
  // centered act ("cooking… writing the essay…"), then the theater fades and the
  // essay stands revealed underneath. All slow fades; reduced-motion kills them.
  const [theater, setTheater] = React.useState(false);
  // THE RUN LOG (operator 2026-09-19: "a log window with exactly the actions happening — agents, calls,
  // context, web scraping"): every step the FE knows, every step each call's trace reports, and the
  // CLI engines' own runs polled live from the serve's audit while the mission is busy.
  const [runLog, setRunLog] = React.useState<RunLogLine[]>([]);
  const runStartRef = React.useRef(0);
  const seenTracesRef = React.useRef<Set<number>>(new Set()); // the engine audit's trace ids already logged (survives StrictMode's double effects)
  const pushLog = React.useCallback((kind: string, text: string, who?: string) => setRunLog((l) => [...l, { t: Date.now(), kind, text, who }].slice(-400)), []);
  const [theaterOut, setTheaterOut] = React.useState(false);
  // a BOUND SWARM from the roster arms immediately — the editor asks only for
  // the mission intent (a template or the custom instruction) and the context
  React.useEffect(() => {
    if (!initialCrew?.length) return;
    const ids = initialCrew.filter((id) => byId.get(id)?.ready).slice(0, SWARM_CAP);
    if (!ids.length) return;
    setArmed({ id: "bound", title: "Bound swarm", reason: `${ids.length} agent${ids.length === 1 ? "" : "s"} bound from the roster — pick a mission template or write the intent, then give it context`, crew: ids, mass: 0, target: filePath ?? null });
    setCrew(new Set(ids));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [crew, setCrew] = React.useState<Set<string>>(new Set());   // its crew (customizable)
  const [customize, setCustomize] = React.useState(false);
  const [scopeList, setScopeList] = React.useState<string[]>(initialScope?.length ? initialScope.slice(0, 6) : []);   // the mission's files (a notebook preloads its scope)
  const [wiz, setWiz] = React.useState(false);                      // ⌖ the scope wizard
  const [wizFiles, setWizFiles] = React.useState<any[] | null>(null);
  const [wizFilter, setWizFilter] = React.useState("");
  const [wizSel, setWizSel] = React.useState<Set<string>>(new Set());
  const [custom, setCustom] = React.useState("");                   // the inline custom specialist
  const withEditor = true;                                          // the paper specialist is OBLIGATORY (operator 2026-07-20) — no toggle
  const [webResearch, setWebResearch] = React.useState(true);       // pre-flight scraping — the wizard below carries URLs
  const [researchUrls, setResearchUrls] = React.useState<{ url: string; why?: string }[]>([]); // the wizard's pinned URLs (pasted or AI-suggested)
  const [urlDraft, setUrlDraft] = React.useState("");               // the paste box, one URL per line
  const [suggesting, setSuggesting] = React.useState(false);        // the AI-picks call is in flight
  const [suggestErr, setSuggestErr] = React.useState<string | null>(null);
  const [sourceKinds, setSourceKinds] = React.useState<string[]>([]); // the rail's extra context sources (corpus kinds)
  const [leaving, setLeaving] = React.useState(false); // gallery → mission cross-fade
  React.useEffect(() => { ensureRaceCss(); }, []); // loki-fade-in must exist before the first fade
  const [dashHist, setDashHist] = React.useState<any[] | null>(null); // the armed mission's run history (the shelf)
  React.useEffect(() => {
    if (!armed) { setDashHist(null); return; }
    let alive = true;
    void (async () => {
      try {
        const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.constitution.paper", input: { op: "list", limit: 40 } }, { timeoutMs: 30_000 } as any);
        const d = r?.result?.result ?? r?.result ?? r;
        if (alive) setDashHist((Array.isArray(d?.papers) ? d.papers : []).filter((p: any) => String(p.label ?? "").startsWith(armed.title)));
      } catch { if (alive) setDashHist([]); }
    })();
    return () => { alive = false; };
  }, [armed?.id]);
  const [est, setEst] = React.useState<any | null>(null);           // token/model/cost estimates
  // THE RUN-ON CHOICE (operator 2026-09-19: "wire the missions with the tiers AI, like the claude
  // subscription; a field to choose which ones; default mid for the agents, high for the editor"):
  // a tier per role (the substrate's tier table maps it to the engine's model) and an optional
  // engine pin (routed = the tier's active row — the subscription by default).
  const [runOn, setRunOn] = React.useState<RunOn>(() => readRunOn());
  React.useEffect(() => { try { localStorage.setItem(RUN_ON_KEY, JSON.stringify(runOn)); } catch { /* private mode */ } }, [runOn]);
  const routeOf = (role: "agents" | "editor") => ({ tier: runOn[`${role}Tier`], ...(runOn[`${role}Engine`] !== "routed" ? { engine: runOn[`${role}Engine`] } : {}) });
  const [reviewOpen, setReviewOpen] = React.useState<any | null>(null); // the mission code-review window
  const [ops, setOps] = React.useState<any[] | null>(null);         // live timeline rows
  const [sessions, setSessions] = React.useState<any[]>([]);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!busy) return;
    let alive = true; const seen = seenTracesRef.current; let since = runStartRef.current;
    const tick = async () => {
      try {
        const r: any = await apiGet(`/api/v1/cli-llm/traces?since=${since}`, { timeoutMs: 8000 } as any);
        const traces: any[] = Array.isArray(r?.traces) ? r.traces : [];
        for (const tr of traces) { if (seen.has(tr.id)) continue; seen.add(tr.id); pushLog("engine", traceLine(tr), "engine audit"); since = Math.max(since, Number(tr.ended) || since); }
      } catch { /* the audit is best-effort */ }
    };
    const h = window.setInterval(() => { if (alive) void tick(); }, 2500);
    return () => { alive = false; window.clearInterval(h); };
  }, [busy]);
  React.useEffect(() => {
    if (!busy) return;
    let alive = true; const seen = seenTracesRef.current; let since = runStartRef.current;
    const tick = async () => {
      try {
        const r: any = await apiGet(`/api/v1/cli-llm/traces?since=${since}`, { timeoutMs: 8000 } as any);
        const traces: any[] = Array.isArray(r?.traces) ? r.traces : [];
        for (const tr of traces) { if (seen.has(tr.id)) continue; seen.add(tr.id); pushLog("engine", traceLine(tr), "engine audit"); since = Math.max(since, Number(tr.ended) || since); }
      } catch { /* the audit is best-effort */ }
    };
    const h = window.setInterval(() => { if (alive) void tick(); }, 2500);
    return () => { alive = false; window.clearInterval(h); };
  }, [busy]);

  // THE ARTIFACT FOCUS (operator 2026-07-20: reuse THIS window, never a new one):
  // classMode arms the Ultra review (the Paper Creator, as it was called) as the artifact wizard — the shelf of
  // published papers joins the gallery; entering one shows the PREVIEW (crew ·
  // files · costs · token sum) and, for audio, the drafted SCRIPT with its
  // voicing stats — every paid step a labeled button, nothing fires on entry.
  const [artShelf, setArtShelf] = React.useState<any[] | null>(null);
  const [artPaper, setArtPaper] = React.useState<any | null>(null);
  const [artInfo, setArtInfo] = React.useState<any | null>(null);
  const [artScript, setArtScript] = React.useState<any | null>(null);
  const [artBusy, setArtBusy] = React.useState<string | null>(null);
  const [artErr, setArtErr] = React.useState<string | null>(null);
  const [artDeck, setArtDeck] = React.useState<any | null>(null);   // the built deck → ClassPlayer
  const [artVoiced, setArtVoiced] = React.useState<any | null>(null); // the voiced item → inline player
  React.useEffect(() => {
    if (!classMode) return;
    let alive = true;
    void (async () => {
      try { const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.constitution.paper", input: { op: "list", limit: 30 } }, { timeoutMs: 30_000 } as any); const d = r?.result?.result ?? r?.result ?? r; if (alive) setArtShelf(Array.isArray(d?.papers) ? d.papers : []); }
      catch { if (alive) setArtShelf([]); }
    })();
    return () => { alive = false; };
  }, [classMode]);
  const artEnter = async (p: any) => {
    if (artBusy) return;
    setArtPaper(p); setArtInfo(null); setArtScript(null); setArtVoiced(null); setArtErr(null); setArtBusy("info");
    try {
      const g: any = await apiPost("/api/v1/dispatch", { action_name: "system.constitution.paper", input: { op: "get", id: p.id } }, { timeoutMs: 30_000 } as any);
      const gp = (g?.result?.result ?? g?.result ?? g)?.paper;
      setArtInfo(gp ? { agents: gp.agents ?? [], files: gp.files ?? [], cost_usd: gp.cost_usd ?? 0, tokens: Math.round(String(gp.markdown ?? "").length / 4), has_md: !!gp.markdown } : null);
    } catch { setArtInfo(null); }
    finally { setArtBusy(null); }
  };
  const artDraft = async () => {
    if (artBusy || !artPaper) return;
    setArtBusy("script"); setArtErr(null);
    try {
      const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.constitution.soliloquy", input: { paper_id: artPaper.id, preview: true } }, { timeoutMs: 180_000 } as any);
      const d = r?.result?.result ?? r?.result ?? r;
      if (d?.ok && d.preview && d.script) setArtScript(d);
      else setArtErr(d?.dropped ? `the narration did not parse — dropped (paid $${Number(d?.cost_usd ?? 0).toFixed(4)})` : (d?.error ?? "the script call failed"));
    } catch (e: any) { setArtErr(String(e?.message ?? "failed").slice(0, 140)); }
    finally { setArtBusy(null); }
  };
  const artVoice = async () => {
    if (artBusy || !artPaper || !artScript) return;
    setArtBusy("voice"); setArtErr(null);
    try {
      const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.constitution.soliloquy", input: { paper_id: artPaper.id, notebook_id: originNotebookId ?? undefined, script: artScript.script, script_ai_call_id: artScript.ai_call_id ?? undefined, script_cost_usd: artScript.cost_usd ?? undefined } }, { timeoutMs: 300_000 } as any);
      const d = r?.result?.result ?? r?.result ?? r;
      if (d?.ok && d.soliloquy) setArtVoiced(d);
      else if (d?.key_missing) setArtErr("the voice engine is unavailable — check the BE console, then retry");
      else setArtErr(d?.error ?? "the voicing failed");
    } catch (e: any) { setArtErr(String(e?.message ?? "failed").slice(0, 140)); }
    finally { setArtBusy(null); }
  };
  const artBuild = async () => {
    if (artBusy || !artPaper || !classMode || classMode === "audio") return;
    setArtBusy("class"); setArtErr(null);
    try {
      const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.constitution.class", input: { paper_id: artPaper.id, notebook_id: originNotebookId ?? undefined } }, { timeoutMs: 180_000 } as any);
      const d = r?.result?.result ?? r?.result ?? r;
      if (d?.ok && d.deck) setArtDeck({ deck: d.deck, mode: classMode });
      else setArtErr(d?.dropped ? `the deck did not parse — dropped (paid $${Number(d?.cost_usd ?? 0).toFixed(4)})` : (d?.error ?? "the class call failed"));
    } catch (e: any) { setArtErr(String(e?.message ?? "failed").slice(0, 140)); }
    finally { setArtBusy(null); }
  };

  React.useEffect(() => { if (embedded) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose, embedded]);
  React.useEffect(() => {
    let alive = true;
    void apiPost(`/api/v1/dispatch`, { action_name: "system.constitution.report", input: {} })
      .then((r: any) => { const d = r?.result?.result ?? r?.result ?? r; if (alive) setReport(d ?? null); })
      .catch(() => { if (alive) setReport(null); });
    return () => { alive = false; };
  }, []);
  // the FULL file list — every file with its health, worst first (operator 2026-07-20:
  // the rail's candidate chips need the wizard's dozens, not the report's risk top-N)
  const [allFiles, setAllFiles] = React.useState<any[] | null>(null);
  React.useEffect(() => {
    let alive = true;
    void apiPost(`/api/v1/dispatch`, { action_name: "system.constitution.estimate", input: { list: true, max_files: 2000 } })
      .then((r: any) => { const d = r?.result?.result ?? r?.result ?? r; if (alive) setAllFiles(d?.ok ? [...(d.files ?? [])].filter((f: any) => !String(f.path ?? "").includes("|")).sort((a: any, b: any) => (a.health ?? 101) - (b.health ?? 101)) : []); })
      .catch(() => { if (alive) setAllFiles([]); });
    return () => { alive = false; };
  }, []);

  const summary = report?.summary ?? null;
  const deltas = report?.deltas ?? null;
  // the report's worst mixes FILES and BINDINGS (pair rows, path "a|b") — only
  // files are runnable scopes; a binding as a target made every call fail instantly
  const worst = (report?.worst ?? []).filter((w: any) => !String(w.path ?? "").includes("|"));
  const byLaw = report?.by_law ?? [];
  const byCat = report?.by_category ?? [];
  // a concern drafts its WHOLE decomposition: the category lens, every derived
  // sub-specialist inside it, and the axis (operator 2026-07-19: 2 agents for
  // architecture was an insult to the topic)
  const crewForCategory = (cat: string) => [
    `category:${cat}`,
    ...agents.filter((a) => a.category === "specialist" && a.id.startsWith(`${cat}:`)).map((a) => a.id),
    `axis:${CAT_AXIS[cat] ?? "compliance"}`,
  ].filter((id) => byId.get(id)?.ready);
  const ownerOfLaw = (k: string) => agents.find((a) => a.laws.includes(k) && a.category !== "axis") ?? agents.find((a) => a.laws.includes(k));

  // ── RECOMMENDED MISSIONS — derived from the evidence, ranked by mass, never a catalog
  const missions: Mission[] = React.useMemo(() => {
    const out: Mission[] = [];
    if (filePath) out.push({ id: "diagnose", title: `Diagnose ${filePath.split("/").pop()}`, reason: "the open file — its weak axes and broken laws pick the crew at launch", crew: [], needsFile: true, mass: 9e9 });
    const w0 = worst[0];
    if (w0) {
      const sick = [...byCat].filter((c: any) => c.violations > 0).sort((a: any, b: any) => a.score - b.score).slice(0, 2);
      out.push({ id: "sweep", title: `Sweep ${String(w0.path).split("/").pop()}`, reason: `the worst spot — health ${w0.health ?? w0.score ?? "?"}${sick.length ? ` · sickest: ${sick.map((c: any) => `${c.category} ${c.score}`).join(", ")}` : ""}`, crew: sick.flatMap((c: any) => crewForCategory(c.category)), target: String(w0.path), mass: 8e8 });
    }
    for (const c of [...byCat].filter((c2: any) => c2.violations > 0).sort((a: any, b: any) => b.mass - a.mass).slice(0, 5)) {
      out.push({ id: `audit:${c.category}`, title: `${cap1(c.category)} Audit`, reason: `score ${c.score} · ×${c.violations} violation${c.violations === 1 ? "" : "s"} across the region — that's why this mission exists`, crew: crewForCategory(c.category), target: w0 ? String(w0.path) : null, mass: c.mass });
    }
    for (const l of byLaw.filter((l2: any) => l2.n >= 2).slice(0, 4)) {
      const o = ownerOfLaw(l.law_key);
      if (o) out.push({ id: `pattern:${l.law_key}`, title: `Pattern hunt — ${l.title ?? l.law_key}`, reason: `breaks ×${l.n} — a house pattern, one fix applies everywhere`, crew: [o.id], target: w0 ? String(w0.path) : null, mass: l.mass ?? l.n });
    }
    // MORE missions (operator 2026-07-19): per-axis audits + standing studies
    const AX7 = ["compliance", "defects", "tests", "structure", "coupling", "cohesion", "change"];
    for (const ax of AX7) {
      const lens = byId.get(`axis:${ax}`);
      if (lens?.ready) out.push({ id: `axis-audit:${ax}`, title: `${ax[0].toUpperCase()}${ax.slice(1)} audit`, reason: `the ${ax} axis read end to end — its lens plus the concerns that feed it`, crew: [`axis:${ax}`, ...[...byId.values()].filter((a2: any) => a2.category === "specialist" && (a2.axes?.[0] === ax) && a2.ready).slice(0, 2).map((a2: any) => a2.id)], target: w0 ? String(w0.path) : null, mass: 4e5 });
    }
    if (worst.length >= 3) out.push({ id: "sweep:top3", title: "Sweep the three sickest", reason: `${worst.slice(0, 3).map((x: any) => String(x.path).split("/").pop()).join(" · ")} — one comparative study`, crew: crewForCategory((byCat[0]?.category) ?? "architecture"), target: null, mass: 5e5 });
    out.push({ id: "study:untested", title: "The untested core", reason: "load-bearing code no test reaches — the tests lens leads", crew: ["axis:tests", ...[...byId.values()].filter((a2: any) => a2.category === "specialist" && a2.id.startsWith("testing:") && a2.ready).slice(0, 2).map((a2: any) => a2.id)], target: w0 ? String(w0.path) : null, mass: 3.5e5 });
    out.push({ id: "study:hidden", title: "The hidden couplings", reason: "files that change together with no import between them — the field's dark matter", crew: ["axis:coupling", "axis:change", ...(byId.get("architecture:dataflow")?.ready ? ["architecture:dataflow"] : [])], target: w0 ? String(w0.path) : null, mass: 3.4e5 });
    const sorted = out.filter((m) => (m.crew?.length ?? 0) || m.needsFile).sort((a, b) => b.mass - a.mass).slice(0, 24);
    // a notebook's SELF-GENERATED suggestions (derived from its sources) lead the list
    // missionsOnly (Book Creator, operator 2026-07-27: "replace ALL of them with book tools") —
    // the gallery carries ONLY the caller's missions; the native paper missions stay home.
    if (missionsOnly && extraMissions?.length) return extraMissions.slice(0, 12);
    return extraMissions?.length ? [...extraMissions, ...sorted].slice(0, 12) : sorted;
  }, [report, filePath, agents.length]);

  // arm a mission: assemble its crew (diagnose computes it from the file's real state)
  const arm = async (m: Mission) => {
    setOps(null);
    if (m.needsFile && filePath) {
      setArmed({ ...m, reason: "reading the file's verdict…" });
      const fc: any = await fetchFileCon(filePath);
      if (!fc) { setArmed({ ...m, reason: "the open file is outside the snapshot — rebuild first", crew: [] }); setCrew(new Set()); return; }
      const weakAxes = Object.entries(fc.axes ?? {}).filter(([, a]: any) => a && a.score < 70).map(([k]) => k);
      const cats = [...new Set((fc.violations ?? []).map((v: any) => v.category).filter(Boolean))] as string[];
      const ids = [...new Set([...weakAxes.map((ax) => `axis:${ax}`), ...cats.flatMap((c2) => crewForCategory(c2))])].filter((id) => byId.get(id)?.ready).slice(0, SWARM_CAP);
      setArmed({ ...m, reason: `${weakAxes.length ? `weak axes: ${weakAxes.join(", ")}` : "no weak axis"}${cats.length ? ` · broken concerns: ${cats.join(", ")}` : " · no broken laws"} — the crew below follows`, crew: ids });
      setCrew(new Set(ids.length ? ids : ["axis:compliance"]));
      setScopeList([filePath]);
      return;
    }
    setArmed(m);
    setCrew(new Set(m.crew.filter((id) => byId.get(id)?.ready).slice(0, SWARM_CAP)));
    setScopeList([]); // scope is OBLIGATORY (operator 2026-07-18) — the target is only a suggestion
  };
  const openWizard = () => {
    setWiz(true);
    setWizSel(new Set(scopeList));
    if (!wizFiles) {
      void apiPost(`/api/v1/dispatch`, { action_name: "system.constitution.estimate", input: { list: true, max_files: 2000 } })
        .then((r: any) => { const d = r?.result?.result ?? r?.result ?? r; setWizFiles(d?.ok ? [...(d.files ?? [])].sort((a: any, b: any) => (a.health ?? 101) - (b.health ?? 101)) : []); })
        .catch(() => setWizFiles([]));
    }
  };

  // ⑂ FORK (operator 2026-07-20): the armed mission becomes a NEW, editable base
  // template — same crew prefilled, its title + intent now yours to rewrite. It
  // keeps a fresh id (so history reads "never run") and opens the crew customizer.
  const forkMission = () => {
    if (!armed || busy) return;
    setArmed({ ...armed, id: `fork:${armed.id}:${Date.now().toString(36).slice(-4)}`, title: `${armed.title} — my mission`, reason: armed.reason, forked: true });
  };
  // a BLANK custom mission (operator 2026-07-20: "the same screen as fork but a
  // blank template") — you name it, write its intent, build its crew from scratch.
  const createBlankMission = () => {
    if (busy) return;
    setOps(null);
    setArmed({ id: `fork:blank:${Date.now().toString(36).slice(-4)}`, title: "", reason: "", crew: [], forked: true, mass: 0, target: filePath ?? null });
    setCrew(new Set());
    setScopeList([]);
  };

  // open a saved paper from the history tab → the full study modal
  const openPaper = async (id: number) => {
    try {
      const r: any = await apiPost(`/api/v1/dispatch`, { action_name: "system.constitution.paper", input: { op: "get", id } }, { timeoutMs: 30_000 } as any);
      const d = r?.result?.result ?? r?.result ?? r;
      const sess = d?.paper?.session;
      if (sess) setReviewOpen(sess);
    } catch { /* a paper that predates session saving simply won't open */ }
  };

  // the RESEARCH WIZARD (operator 2026-07-20) — pasted URLs and AI-suggested URLs
  const mergeUrls = (incoming: { url: string; why?: string }[]) => setResearchUrls((cur) => {
    const seen = new Set(cur.map((u) => u.url)); const out = [...cur];
    for (const u of incoming) { if (u.url && !seen.has(u.url)) { seen.add(u.url); out.push(u); } }
    return out.slice(0, 12);
  });
  const commitDraft = () => {
    const parsed = urlDraft.split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s)).map((url) => ({ url }));
    if (parsed.length) { mergeUrls(parsed); setUrlDraft(""); }
  };
  const suggestUrls = async () => {
    if (suggesting || (!scopeList.length && !crewMembers.length)) return;
    setSuggesting(true); setSuggestErr(null);
    // a new-today action reads as a stale BE (403/unknown) — name the cure, don't hide it
    const staleHint = (msg: string) => (/403|404|400|not allowed|unknown action|no such action|forbidden/i.test(msg)
      ? "'AI picks' is a new action today — restart the BE, reopen this window, then try again (or paste URLs by hand)" : msg.slice(0, 170));
    try {
      const crewLaws = [...new Set(crewMembers.flatMap((m) => byId.get(m.id)?.laws ?? []))];
      const r: any = await apiPost(`/api/v1/dispatch`, { action_name: "system.constitution.research.suggest", input: {
        path: scopeList[0], paths: scopeList,
        mission: armed ? `${armed.title}${armed.reason ? `: ${armed.reason}` : ""}`.slice(0, 300) : "",
        crew_laws: crewLaws, sources: sourceKinds,
      } }, { timeoutMs: 90_000 } as any);
      const d = r?.result?.result ?? r?.result ?? r;
      if (d?.ok && Array.isArray(d.urls) && d.urls.length) mergeUrls(d.urls);
      else if (d?.ok) setSuggestErr(d?.note ?? "the AI proposed no usable sources — paste your own, or run without the web");
      else setSuggestErr(staleHint(String(d?.error ?? d?.message ?? "the suggestion call failed")));
    } catch (e: any) { setSuggestErr(staleHint(String(e?.message ?? "the suggestion call failed"))); }
    finally { setSuggesting(false); }
  };

  // ── the SELECTION'S NEIGHBORHOOD (operator 2026-07-18): adding files to the scope
  // builds their analysis intel live — verdicts, the wiring AMONG the chosen files,
  // and the selection scored as ONE region. $0, pure reads, cached per path.
  const fcCache = React.useRef(new Map<string, any>());
  const [selIntel, setSelIntel] = React.useState<any | null>(null);
  React.useEffect(() => {
    let alive = true;
    const paths = scopeList.slice(0, 8);
    if (!paths.length) { setSelIntel(null); return; }
    void (async () => {
      const cons: any[] = [];
      for (const p of paths) {
        if (!fcCache.current.has(p)) { try { fcCache.current.set(p, await fetchFileCon(p)); } catch { fcCache.current.set(p, null); } }
        cons.push({ path: p, fc: fcCache.current.get(p) });
      }
      if (!alive) return;
      const judged = cons.filter((c) => c.fc);
      const wOf = (c: any) => Math.max(1, c.fc?.signals?.loc ?? 1);
      let hs = 0, hw = 0;
      for (const c of judged) if (c.fc.health != null) { hs += c.fc.health * wOf(c); hw += wOf(c); }
      const inSel = new Set(paths);
      const edges: { a: string; b: string }[] = [];
      for (const c of judged) for (const to of (c.fc.anchors?.imports ?? [])) if (inSel.has(to)) edges.push({ a: c.path, b: to });
      const lawN = new Map<string, number>();
      for (const c of judged) for (const v of (c.fc.violations ?? [])) lawN.set(v.law_key, (lawN.get(v.law_key) ?? 0) + 1);
      setSelIntel({
        cons, health: hw ? Math.round(hs / hw) : null, edges,
        topLaws: [...lawN.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4),
        over: scopeList.length > 8 ? scopeList.length - 8 : 0,
      });
    })();
    return () => { alive = false; };
  }, [scopeList.join("|")]);

  // ── RUN — files × crew, in PARALLEL (operator 2026-07-18); each call its own
  // money-guarded dispatch. Then the deterministic FORMATTER shapes the raw JSON
  // into the mission code review, which opens in the review window.
  const CAP_CALLS = 24;
  const crewMembers = React.useMemo(() => [
    ...agents.filter((a) => crew.has(a.id)).map((a) => ({ id: a.id, title: a.title })),
    ...(custom.trim() ? [{ id: "custom", title: "Custom Reviewer" }] : []),
  ], [agents, [...crew].join("|"), custom.trim() ? 1 : 0]);
  const totalCalls = crewMembers.length * Math.max(1, scopeList.length);
  const runMission = async () => {
    if (!armed || !crewMembers.length || !scopeList.length || busy || totalCalls > CAP_CALLS) return;
    setBusy(true);
    setTheater(true); setTheaterOut(false);
    const multi = scopeList.length > 1;
    // one swarm id per mission run — every call (and the editor call) is
    // stamped with it (ai_calls.session_id), so the AI-call window's swarm tab
    // can sum the whole crew's tokens, time and money
    const swarmId = `swarm:constitution:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const rows: any[] = [];
    for (const p of scopeList) for (const m of crewMembers) rows.push({ id: m.id, agent: m.title, path: p, label: multi ? `${m.title} · ${p.split("/").pop()}` : m.title, status: "queued", res: null as any });
    if (withEditor) rows.push({ id: "editor", agent: "The Paper Specialist", path: "the whole study", label: "✒ the editor — after the crew", status: "queued", res: null as any });
    setOps([...rows]);
    runStartRef.current = Date.now();
    seenTracesRef.current = new Set();
    setRunLog([]);
    const engineName = (role: "agents" | "editor") => runOn[`${role}Engine`] === "routed" ? "the tier's subscription" : runOn[`${role}Engine`];
    pushLog("run", `mission "${armed.title}" · ${swarmId} · ${rows.length - (withEditor ? 1 : 0)} isolated call${rows.length - (withEditor ? 1 : 0) === 1 ? "" : "s"} (${crewMembers.length} specialist${crewMembers.length === 1 ? "" : "s"} × ${scopeList.length} case${scopeList.length === 1 ? "" : "s"}) on ${engineName("agents")} at tier ${runOn.agentsTier}${withEditor ? ` · then the editor on ${engineName("editor")} at tier ${runOn.editorTier}` : ""}`);
    if (webResearch) pushLog("research", researchUrls.length ? `web research: ${researchUrls.length} pinned URL${researchUrls.length === 1 ? "" : "s"} scraped per case` : "web research: deterministic queries derived from each case's record");
    if (sourceKinds.length) pushLog("context", `attached sources for every call: ${sourceKinds.map((k) => SRC_LABEL[k] ?? k).join(", ")}`);
    const crewRows = rows.filter((r) => r.id !== "editor");
    await Promise.all(crewRows.map(async (row) => {
      const i = rows.indexOf(row);
      rows[i] = { ...rows[i], status: "running" }; setOps([...rows]);
      pushLog("start", `assembling the case's context (verdict · laws · violations · field · baseline · source) and calling the engine…`, row.label);
      const res = await runAgent(row.id, row.path, { ...routeOf("agents"), swarm_id: swarmId, research: webResearch, research_urls: webResearch ? researchUrls.map((u) => u.url) : [], sources: sourceKinds, ...(row.id === "custom" ? { custom_instruction: custom.trim() } : {}) });
      for (const st of (res?.trace ?? []) as any[]) pushLog(String(st.kind ?? "step"), `+${Math.round((Number(st.t) || 0) / 100) / 10}s ${st.text}`, row.label);
      if (res?.ok === false) pushLog("error", `✕ ${res?.error ?? "failed"}`, row.label);
      else pushLog("done", `✓ ${res?.review?.summary?.level ?? "review"} — ${res?.review?.summary?.title ?? "(untitled)"}${res?.dropped ? " · the reply could not be validated" : ""}${res?.cost_usd ? ` · $${Number(res.cost_usd).toFixed(4)}` : ""}${res?.ai_call_id != null ? ` · ai_call #${res.ai_call_id}` : ""}`, row.label);
      rows[i] = { ...rows[i], status: res?.ok === false ? "failed" : "done", res }; setOps([...rows]);
    }));
    const results = rows.filter((r) => r.id !== "editor").map((r) => ({ agent: r.agent, path: r.path, res: r.res }));
    const review = buildReview(results, scopeList, fcCache.current); // the formatter — deterministic, $0
    const label = `${armed.title} · ${multi ? `${scopeList.length} files` : scopeList[0].split("/").pop()}`;
    // the union of scraped sources — the editor's real bibliography candidates
    const webSources = [...new Map(rows.flatMap((r) => r.res?.research?.sources ?? []).map((s2: any) => [s2.url, s2])).values()].slice(0, 12);
    // THE EDITOR IS DEFAULT (operator 2026-07-19: "without it the paper is a sum
    // of specialists' talks") — the run's consent covered it; a dropped edit
    // never blocks the paper, and the ✒ button in the review offers the retry.
    let editorRes: any = null;
    const edIdx = rows.findIndex((r) => r.id === "editor");
    if (withEditor && edIdx >= 0) {
      const reviews = (review.files ?? []).flatMap((f: any) => (f.agents ?? []).map((ag: any) => ({ agent: ag.agent, path: f.path, review: ag.review })));
      if (reviews.length) {
        rows[edIdx] = { ...rows[edIdx], status: "running" }; setOps([...rows]);
        pushLog("start", `binding ${reviews.length} validated review${reviews.length === 1 ? "" : "s"} into the paper on ${engineName("editor")} at tier ${runOn.editorTier}…`, "✒ the editor");
        try {
          const courtData = courtOf(results, multi);
          const actionsFlat = (review.files ?? []).flatMap((f: any) => (f.agents ?? []).flatMap((ag: any) => (ag.review?.actions ?? []).map((a2: any) => ({ title: a2.title, impact: a2.impact, effort: a2.effort, agents: [ag.agent] }))));
          const r: any = await apiPost(`/api/v1/dispatch`, { action_name: "system.constitution.editor", input: { ...routeOf("editor"), reviews, label, swarm_id: swarmId, court: { convergence: courtData.convergence, divergence: courtData.divergence }, actions: actionsFlat, web_sources: webSources } }, { timeoutMs: 180_000 } as any);
          const d = r?.result?.result ?? r?.result ?? r;
          if (d?.ok && d.editor) editorRes = d;
          if (d?.ok && d.editor) pushLog("done", `✓ the paper: "${d.editor.title ?? label}" · ${d.attempts ?? 1} attempt${(d.attempts ?? 1) === 1 ? "" : "s"}${d.cost_usd ? ` · $${Number(d.cost_usd).toFixed(4)}` : ""}`, "✒ the editor");
          else pushLog("error", `✕ ${d?.error ?? (d?.parse_excerpt ? `the reply did not parse: ${String(d.parse_excerpt).slice(0, 120)}` : r == null ? "no reply from antiloki-serve" : "the editor returned no paper")}`, "✒ the editor");
          rows[edIdx] = { ...rows[edIdx], status: d?.ok && d.editor ? "done" : "failed", res: d }; setOps([...rows]);
        } catch (e: any) { pushLog("error", `✕ ${String(e?.message ?? "failed").slice(0, 140)}`, "✒ the editor"); rows[edIdx] = { ...rows[edIdx], status: "failed", res: { ok: false, error: String(e?.message ?? "failed").slice(0, 140) } }; setOps([...rows]); }
      } else { pushLog("error", "✕ no validated reviews to edit — every specialist call failed", "✒ the editor"); rows[edIdx] = { ...rows[edIdx], status: "failed", res: { ok: false, error: "no validated reviews to edit" } }; setOps([...rows]); }
    }
    pushLog("run", results.some((r) => r.res?.ok !== false) ? `the run is in · ${results.filter((r) => r.res?.ok !== false).length}/${results.length} review${results.length === 1 ? "" : "s"} validated` : "every call failed — the lines above say where");
    const sess = { label, multi, files: [...scopeList], results, review, swarm_id: swarmId, editor: editorRes, web_sources: webSources, class_request: classMode ?? null, origin_nb: originNotebookId ?? null };
    setSessions((s) => [sess, ...s]);
    // a fully-failed run stays on the console where the failure banner explains itself
    if (results.some((r) => r.res?.ok !== false)) setReviewOpen(sess);
    setBusy(false);
    // the REVEAL: the essay is already open UNDER the theater (z 1400 > 1150) —
    // a slow fade-out of the stage lets the paper appear through it
    setTheaterOut(true);
    setTimeout(() => { setTheater(false); setTheaterOut(false); }, 1300);
  };

  // ── the ESTIMATE (operator 2026-07-18): the REAL prompts are assembled and
  // measured BE-side ($0) — one sample per file, multiplied by the crew.
  React.useEffect(() => {
    let alive = true;
    setEst(null);
    if (!scopeList.length || !crewMembers.length || totalCalls > CAP_CALLS) return;
    const firstId = crewMembers[0].id;
    const extra0 = firstId === "custom" ? { custom_instruction: custom.trim() || "review" } : {};
    // the agents' real prompts, sampled per file on the agents' route; the editor's route priced once
    void Promise.all([
      Promise.all(scopeList.slice(0, 8).map((p) => runAgent(firstId, p, { ...extra0, ...routeOf("agents"), sources: sourceKinds, estimate: true }))),
      withEditor ? runAgent(firstId, scopeList[0], { ...extra0, ...routeOf("editor"), sources: sourceKinds, estimate: true }) : Promise.resolve(null),
    ])
      .then(([rs, ed]) => {
        if (!alive) return;
        const okd = rs.filter((r) => r?.ok && r.estimate);
        if (!okd.length) { setEst(null); return; }
        setEst(missionEstimate(okd, ed?.ok && ed.estimate ? ed : null, scopeList.length, crewMembers.length, withEditor));
      })
      .catch(() => { if (alive) setEst(null); });
    return () => { alive = false; };
  }, [scopeList.join("|"), crewMembers.map((m) => m.id).join("|"), sourceKinds.join("|"), runOn.agentsTier, runOn.agentsEngine, runOn.editorTier, runOn.editorEngine, withEditor]);

  const kicker: React.CSSProperties = { fontFamily: mono, fontSize: FS.small, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 };
  const estCost = totalCalls <= 3 ? "low" : totalCalls <= 8 ? "medium" : "high";
  const court = ops && !busy ? courtOf(ops.filter((o) => o.res), scopeList.length > 1) : null;

  return (
    <div onClick={embedded ? undefined : onClose} style={embedded ? { display: "flex", width: "100%" } : { position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      {/* EMBEDDED (operator 2026-09-19: "integrate it to the background design, not a box"): no frame, no
          header — the X-ray tab's own section title names it; the rails sit straight on the page. */}
      <div onClick={(e) => e.stopPropagation()} style={embedded
        ? { width: "100%", height: "min(840px, 80vh)", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: mono }
        : { width: "min(1320px, 97vw)", height: "min(840px, 94vh)", display: "flex", flexDirection: "column", background: C.panel, border: `1px solid color-mix(in oklab, ${C.brand} 22%, ${C.border})`, borderRadius: 15, boxShadow: "0 24px 70px -12px rgba(0,0,0,.7)", overflow: "hidden", fontFamily: mono }}>
        <style>{STUDIO_CSS}</style>
        {/* header (the overlay only) */}
        {!embedded && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
          <span style={{ fontSize: FS.title, fontWeight: 700, color: C.fg }}>{title ?? "⚉ Ultra review"}{classMode === "audio" ? " · 🎙 soliloquy" : classMode === "video" ? " · ▶ video class" : classMode === "slides" ? " · ⧉ presentation" : ""}</span>
          <span style={{ fontSize: FS.small, color: C.dim }}>{subtitle ?? `a mission → a swarm → the paper${classMode ? " → the artifact" : ""}`}</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "2px 10px", cursor: "pointer", fontFamily: mono, fontSize: FS.base }}>✕ esc</button>
        </div>}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* ── LEFT: the context rail. In Book Creator mode it is REPLACED by the book's
              deterministic extraction (operator 2026-07-27: "the context sidebar left instead of
              the normal context") — the book IS the mission's context. ── */}
          {contextRail ? (
            <div style={{ width: 322, flexShrink: 0, borderRight: `1px solid ${C.border}`, overflowY: "auto", background: C.bg }}>{contextRail}</div>
          ) : embedded ? null : ( /* embedded (operator 2026-09-19): no left rail — the missions carry their scope */
            <MissionRail missionTitle={armed?.title ?? null} scope={scopeList} onScope={setScopeList}
              candidates={(allFiles && allFiles.length ? allFiles : worst).map((w: any) => ({ path: String(w.path), health: w.health ?? w.score ?? null }))}
              research={webResearch} onResearch={() => setWebResearch((v) => !v)}
              sources={sourceKinds} onSources={setSourceKinds} />
          )}
          {/* ── BOOK MAIN (Book Creator, operator 2026-07-27: "not paper stuff — just the paper
              creator's DESIGN"): when provided, the right column is the book's own tools. ── */}
          {bookMain && <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "12px 16px" }}>{bookMain}</div>}
          {/* ── RIGHT: missions → the console → the ops timeline → sessions ── */}
          <div style={{ flex: bookMain ? undefined : 1, minWidth: 0, overflowY: "auto", padding: "12px 16px", display: bookMain ? "none" : undefined }}>
            {/* ── THE ARTIFACT PREVIEW (classMode + an entered shelf paper): the paper
                strategy focused on the artifact — stats, then the script, then the voice ── */}
            {!armed && classMode && artPaper && (
              <div style={{ animation: "loki-fade-in 420ms ease both", maxWidth: 700 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                  <button onClick={() => { if (!artBusy) { setArtPaper(null); setArtScript(null); setArtVoiced(null); setArtErr(null); } }}
                    style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: FS.small, padding: 0 }}>← missions</button>
                  <span style={{ color: C.dim, fontSize: FS.small }}>·</span>
                  <span style={{ fontSize: FS.base, color: C.fg, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{artPaper.title}</span>
                </div>
                {artPaper.discovery && <div style={{ fontSize: FS.base, color: C.muted }}>✦ {artPaper.discovery}</div>}
                {artBusy === "info" && <div style={{ fontSize: FS.small, color: C.dim, marginTop: 8 }}>reading the study…</div>}
                {artInfo && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 9 }}>
                    <span style={{ fontSize: FS.small, color: C.brand, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1px 8px" }}>Σ ~{Math.round(artInfo.tokens / 100) / 10}k tok study</span>
                    <span style={{ fontSize: FS.small, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1px 8px" }}>{artInfo.files.length} file{artInfo.files.length === 1 ? "" : "s"}</span>
                    <span style={{ fontSize: FS.small, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1px 8px" }}>paper cost ${Number(artInfo.cost_usd ?? 0).toFixed(4)}</span>
                    {(artInfo.agents ?? []).slice(0, 6).map((a2: any, i: number) => <span key={i} style={{ fontSize: FS.small, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1px 8px" }}>🕵 {String(a2?.agent ?? a2).slice(0, 26)}</span>)}
                  </div>
                )}
                {artInfo && !artInfo.has_md && <div style={{ fontSize: FS.base, color: C.warn, marginTop: 8 }}>this paper carries no markdown — reopen it once to save one</div>}
                {classMode !== "audio" && artInfo?.has_md && !artDeck && (
                  <button onClick={() => void artBuild()} disabled={artBusy != null}
                    style={{ display: "block", marginTop: 12, background: "transparent", border: `1px solid ${C.brand}`, color: C.brand, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontFamily: mono, fontSize: FS.base }}>
                    {artBusy === "class" ? "✒ building the deck…" : `${classMode === "video" ? "▶ build the video class" : "⧉ build the presentation"} · 1 mid call`}</button>
                )}
                {classMode === "audio" && artInfo?.has_md && !artScript && (
                  <button onClick={() => void artDraft()} disabled={artBusy != null}
                    style={{ display: "block", marginTop: 12, background: "transparent", border: `1px solid ${C.brand}`, color: C.brand, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontFamily: mono, fontSize: FS.base }}>
                    {artBusy === "script" ? "✒ the narrator is drafting…" : "✒ draft the narration script · 1 mid call — nothing voiced yet"}</button>
                )}
                {artScript && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ ...kicker }}>the script · {artScript.script.title}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "6px 0 8px" }}>
                      <span style={{ fontSize: FS.small, color: C.brand, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1px 8px" }}>{artScript.stats.chapters} chapters</span>
                      <span style={{ fontSize: FS.small, color: C.brand, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1px 8px" }}>{artScript.stats.words} words · ~{Math.floor(artScript.stats.est_duration_s / 60)}m{String(artScript.stats.est_duration_s % 60).padStart(2, "0")}s</span>
                      <span style={{ fontSize: FS.small, color: C.warn, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1px 8px" }}>{artScript.stats.tts_chars} chars → the local voice ($0)</span>
                      <span style={{ fontSize: FS.small, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1px 8px" }}>script cost ${Number(artScript.cost_usd ?? 0).toFixed(4)}</span>
                    </div>
                    {artScript.script.chapters.map((c2: any, i: number) => (
                      <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", marginBottom: 5 }}>
                        <div style={{ fontSize: FS.base, color: C.fg, fontWeight: 600 }}>{i + 1} · {c2.title} <span style={{ color: C.dim, fontWeight: 400 }}>· {c2.speech.split(/\s+/).filter(Boolean).length}w</span></div>
                        <div style={{ fontSize: FS.base, color: C.muted, lineHeight: 1.55, marginTop: 2 }}>{c2.speech}</div>
                      </div>
                    ))}
                    {!artVoiced && (
                      <button onClick={() => void artVoice()} disabled={artBusy != null}
                        style={{ display: "block", marginTop: 8, background: C.brand, border: "none", color: C.bg, borderRadius: 8, padding: "7px 16px", cursor: "pointer", fontFamily: mono, fontSize: FS.base, fontWeight: 700 }}>
                        {artBusy === "voice" ? "🎙 voicing chapter by chapter…" : `🎙 voice it · ${artScript.stats.tts_chars} chars, local Kokoro ($0)${originNotebookId ? " — files on the notebook" : ""}`}</button>
                    )}
                    {artVoiced?.item && (
                      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                        <span style={{ fontSize: FS.small, color: C.ok }}>✓ voiced — {Math.round(artVoiced.soliloquy?.duration_s ?? 0)}s{originNotebookId ? " · filed on the notebook" : ""}</span>
                        <audio controls preload="metadata" src={`${BE_URL}/api/v1/notebook/audio/${artVoiced.item.id}`} style={{ width: "100%", height: 30 }} />
                      </div>
                    )}
                    {artVoiced && !artVoiced.item && <div style={{ fontSize: FS.small, color: C.ok, marginTop: 8 }}>✓ voiced — open it from a notebook to play (no filing target here)</div>}
                  </div>
                )}
                {artErr && <div style={{ fontSize: FS.base, color: C.bad, marginTop: 8 }}>✕ {artErr}</div>}
              </div>
            )}
            {!armed && !(classMode && artPaper) && (
              <div style={{ animation: "loki-fade-in 420ms ease both", opacity: leaving ? 0 : 1, transition: "opacity 260ms ease" }}>
                {/* THE SHELF (artifact focus): teach/narrate a paper that already exists */}
                {classMode && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={kicker}>the shelf · {classMode === "audio" ? "narrate an existing paper" : "teach an existing paper"}</div>
                    {artShelf === null && <div style={{ fontSize: FS.small, color: C.dim }}>opening the shelf…</div>}
                    {artShelf?.length === 0 && <div style={{ fontSize: FS.small, color: C.dim, fontStyle: "italic" }}>no papers yet — run a mission below; the artifact door glows on the paper</div>}
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {(artShelf ?? []).map((p: any) => (
                        <button key={p.id} onClick={() => void artEnter(p)} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 11px", cursor: "pointer", fontFamily: mono }}>
                          <span style={{ fontSize: FS.base, color: C.fg, fontWeight: 600 }}>📜 {p.title}</span>
                          <span style={{ fontSize: FS.small, color: C.dim }}> · {String(p.created_at ?? "").slice(0, 16)} · {p.agents} agent{p.agents === 1 ? "" : "s"} · ${Number(p.cost_usd ?? 0).toFixed(3)}</span>
                          {p.discovery && <div style={{ fontSize: FS.small, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>✦ {p.discovery}</div>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* YOUR OWN (operator 2026-07-20) — a blank mission: the fork screen, empty */}
                <div style={{ marginBottom: 12 }}>
                  <div style={kicker}>your own</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))", gap: 8 }}>
                    <GenCard k="blank" label="Create your own mission" busy={false} disabled={false} selected={false}
                      onClick={() => { if (leaving) return; setLeaving(true); window.setTimeout(() => { createBlankMission(); setLeaving(false); }, 260); }}
                      sample={<svg viewBox="0 0 120 44" style={{ width: "100%", height: 44 }}><rect x="34" y="6" width="52" height="32" rx="4" fill="none" stroke={C.brand} strokeDasharray="4 3" /><line x1="60" y1="15" x2="60" y2="29" stroke={C.brand} strokeWidth="1.6" /><line x1="53" y1="22" x2="67" y2="22" stroke={C.brand} strokeWidth="1.6" /></svg>}
                      desc="a blank template — name it, write its intent, build its crew from scratch" />
                  </div>
                </div>
                {/* the evidence-derived groups (concern audits, pattern hunts, the sweep) need the report — say so
                    instead of showing two groups and then more (operator 2026-09-19: "why just 2 categories at first?") */}
                {report === null && (
                  <div data-testid="missions-deriving" style={{ marginBottom: 12, fontFamily: mono, fontSize: FS.small, color: C.dim, display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: C.brand, animation: "loki-pulse 1.2s ease-in-out infinite" }} />
                    deriving the missions from the evidence — the sweep, the audits by concern, the pattern hunts land when the report is read…
                  </div>
                )}
                {(() => {
                  const order = ["from your sources", "diagnose", "audits by concern", "audits by axis", "pattern hunts", "standing studies"];
                  const groups2 = order.map((g) => ({ g, ms: missions.filter((m) => missionCat(m) === g) })).filter((x) => x.ms.length);
                  const enter = (m: any) => { if (leaving) return; setLeaving(true); window.setTimeout(() => { void arm(m); setLeaving(false); }, 260); };
                  return groups2.map(({ g, ms }) => (
                    <div key={g} style={{ marginBottom: 12 }}>
                      <div style={kicker}>{g}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))", gap: 8 }}>
                        {ms.map((m) => (
                          <GenCard key={m.id} k={m.id} label={m.title} busy={false} disabled={false} selected={false} onClick={() => enter(m)}
                            sample={MISSION_SAMPLE[missionCat(m)] ?? MISSION_SAMPLE.diagnose}
                            desc={`${m.reason}${m.needsFile ? " · crew computed at launch" : ` · crew ×${m.crew.length || "?"}`}`} />
                        ))}
                      </div>
                    </div>
                  ));
                })()}
                {!missions.length && <div style={{ fontSize: FS.base, color: C.dim, fontStyle: "italic" }}>no evidence to derive missions from — rebuild first</div>}
              </div>
            )}
            {/* ── the OPERATIONS CONSOLE ── */}
            {armed && (
              <div style={{ animation: "loki-fade-in 420ms ease both" }}>
                {/* the slim breadcrumb toolbar — the prose header is GONE (operator
                    2026-07-20): back · the mission (editable when forked) · ⑂ fork */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                  <button onClick={() => { if (!busy) setArmed(null); }} title={busy ? "the mission is running — it returns here when done" : "back to the missions"}
                    style={{ background: "transparent", border: "none", color: busy ? C.dim : C.muted, cursor: busy ? "default" : "pointer", fontFamily: mono, fontSize: FS.small, padding: 0, flexShrink: 0 }}>← missions</button>
                  <span style={{ color: C.dim, fontSize: FS.small, flexShrink: 0 }}>·</span>
                  {armed.forked
                    ? <input value={armed.title} onChange={(e) => setArmed({ ...armed, title: e.target.value })} spellCheck={false} title="your mission's name" placeholder="name your mission…"
                        style={{ flex: 1, minWidth: 0, background: C.bg, border: `1px solid color-mix(in oklab, ${C.brand} 45%, ${C.border})`, color: C.fg, borderRadius: 5, padding: "2px 9px", fontFamily: mono, fontSize: FS.base, fontWeight: 600, outline: "none" }} />
                    : <span style={{ fontSize: FS.base, color: C.fg, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{armed.title}</span>}
                  {armed.forked && <span style={{ fontSize: FS.small, color: C.brand, flexShrink: 0 }}>⑂ forked</span>}
                  <button onClick={forkMission} disabled={busy || armed.forked} title="fork this mission as a base template — a new, editable mission with this crew prefilled"
                    style={{ background: "transparent", border: `1px solid color-mix(in oklab, ${C.brand} 40%, ${C.border})`, color: armed.forked ? C.dim : C.brand, borderRadius: 5, padding: "1px 10px", cursor: armed.forked || busy ? "default" : "pointer", fontFamily: mono, fontSize: FS.small, flexShrink: 0 }}>⑂ fork as template</button>
                </div>
                {armed.forked && (
                  <input value={armed.reason} onChange={(e) => setArmed({ ...armed, reason: e.target.value })} spellCheck={false} placeholder="what should this mission do? — the intent shown in the preview"
                    style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "3px 9px", fontFamily: mono, fontSize: FS.small, outline: "none", marginBottom: 6 }} />
                )}
                {/* ── THE PREVIEW leads (operator 2026-07-20: no header above it) — the
                    paper it becomes + how the mission approaches the problem + form ── */}
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px" }}>
                  <div style={{ width: 176, flexShrink: 0, animation: "loki-fade-in 1300ms ease both" }}>
                    <div style={kicker}>the paper it becomes</div>
                    <PaperSample cat={missionCat(armed)} cases={Math.max(1, Math.min(3, scopeList.length))} />
                  </div>
                  <div style={{ flex: 1, minWidth: 250, animation: "loki-fade-in 700ms ease both" }}>
                    <div style={kicker}>how it approaches the problem</div>
                    <div style={{ fontSize: FS.base, color: C.muted, lineHeight: 1.65 }}>{MISSION_APPROACH[missionCat(armed)]}</div>
                    <div style={{ ...kicker, marginTop: 8 }}>how the paper is organized</div>
                    {PAPER_FORM.map(([n, what]) => (
                      <div key={n} style={{ display: "flex", gap: 7, alignItems: "baseline", fontSize: FS.small, lineHeight: 1.7 }}>
                        <b style={{ color: C.brand, flexShrink: 0, minWidth: 14, fontVariantNumeric: "tabular-nums" }}>{n.split(" ")[0]}</b>
                        <span style={{ color: C.fg, flexShrink: 0 }}>{n.split(" ").slice(1).join(" ")}</span>
                        <span style={{ color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>— {what}</span>
                      </div>
                    ))}
                    <div style={{ fontSize: FS.small, color: C.dim, marginTop: 6, borderTop: `1px dashed ${C.border}`, paddingTop: 4, lineHeight: 1.6 }}>
                      ≈55% prose · 45% figures — every figure captioned and referenced from the prose · listings numbered · crew remarks inline · web sources flagged UNVERIFIED
                    </div>
                  </div>
                </div>
                {/* ── THE MISSION DASHBOARD — three COLUMNS, each COMPLETE (operator
                    2026-07-20: columns, not tabs): the prompt each agent gets in depth ·
                    the crew with full info + stats · all the run history, rows open the paper ── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 12, alignItems: "start" }}>
                  {/* COLUMN 1 — the prompt, in depth (per agent) */}
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", minWidth: 0 }}>
                    <div style={kicker}>the prompt — in depth</div>
                    <div style={{ maxHeight: 380, overflowY: "auto" }}>
                      {(() => {
                        const scopeViols = selIntel ? selIntel.cons.flatMap((c: any) => c.fc?.violations ?? []) : [];
                        return (<>
                          <div style={{ fontSize: FS.small, color: C.muted, lineHeight: 1.7, marginBottom: 7 }}>Every specialist gets the SAME contract — one theory (not ten findings), evidence by citation, draw-first — filled with ITS lens. The assembly, in order:</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 9 }}>
                            {["lens", "case", "verdict", "its laws", "recorded violations", "the field", "population", "+ your sources", "web research", "citable ids", "source ≤5k"].map((s) => chip(s, C.dim))}
                          </div>
                          {!crewMembers.length && <div style={{ fontSize: FS.small, color: C.dim, fontStyle: "italic" }}>{armed.forked ? "no crew yet — build it below" : "no crew yet — pick a mission, or create your own"}</div>}
                          {crewMembers.map((m) => {
                            const a = byId.get(m.id);
                            const viols = scopeViols.filter((v: any) => (a?.laws ?? []).includes(v.law_key)).length;
                            return (
                              <div key={m.id} style={{ borderTop: `1px solid ${C.border}`, padding: "6px 0" }}>
                                <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                                  <AgentNode id={m.id} title={m.title} category={a?.category ?? "custom"} size={17} />
                                  <b style={{ fontSize: FS.base, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{m.title.replace(" Reviewer", "")}</b>
                                </div>
                                <div style={{ fontFamily: mono, fontSize: FS.small, color: C.muted, lineHeight: 1.65, marginTop: 3 }}>YOU ARE: {m.id === "custom" ? `Custom — ${custom.trim() || "(write the instruction below)"}` : `${m.title} (${a?.category}) — ${a?.description ?? ""}`}</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                                  {(a?.laws ?? []).slice(0, 12).map((k: string) => <span key={k} style={{ fontFamily: mono, fontSize: 9, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 4, padding: "0 5px" }}>{k}</span>)}
                                  {!a?.laws?.length && <span style={{ fontSize: FS.small, color: C.dim }}>a measured lens — interprets the axes{a?.axes?.length ? `: ${a.axes.join(", ")}` : ""}</span>}
                                </div>
                                <div style={{ fontSize: FS.small, color: viols ? C.brand : C.dim, marginTop: 3 }}>will interpret {viols} recorded violation{viols === 1 ? "" : "s"} in scope under its laws</div>
                              </div>
                            );
                          })}
                          <div style={{ fontSize: FS.small, color: C.dim, marginTop: 7 }}>after a run, each call's EXACT prompt is one ⚙ away in the ledger.</div>
                        </>);
                      })()}
                    </div>
                  </div>
                  {/* COLUMN 2 — the crew, complete info + stats */}
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", minWidth: 0 }}>
                    <div style={kicker}>the crew · {crewMembers.length}</div>
                    <div style={{ maxHeight: 380, overflowY: "auto" }}>
                      {!crewMembers.length && <div style={{ fontSize: FS.small, color: C.dim, fontStyle: "italic" }}>no crew yet</div>}
                      {crewMembers.map((m) => {
                        const a = byId.get(m.id);
                        return (
                          <div key={m.id} style={{ borderTop: `1px solid ${C.border}`, padding: "7px 0", display: "flex", gap: 9 }}>
                            <AgentNode id={m.id} title={m.title} category={a?.category ?? "custom"} size={24} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }}>
                                <b style={{ fontSize: FS.base, color: C.fg }}>{m.title.replace(" Reviewer", "")}</b>
                                <span style={{ fontSize: FS.small, color: C.dim }}>{a?.category ?? "custom"}{a?.axes?.length ? ` · ${a.axes.join(", ")}` : ""}</span>
                                {a && !a.ready && <span style={{ fontSize: FS.small, color: C.warn }}>not ready</span>}
                              </div>
                              <div style={{ fontSize: FS.small, color: C.muted, lineHeight: 1.6, marginTop: 2 }}>{m.id === "custom" ? (custom.trim() || "your inline instruction is the lens") : (a?.description ?? "")}</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                                {(a?.laws ?? []).map((k: string) => <span key={k} style={{ fontFamily: mono, fontSize: 9, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 4, padding: "0 5px" }}>{k}</span>)}
                              </div>
                              <div style={{ fontSize: FS.small, color: C.dim, marginTop: 4, lineHeight: 1.6 }}>
                                ⚖ {a?.laws?.length ?? 0} law{a?.laws?.length === 1 ? "" : "s"} · ⬡ {a?.axes?.length ?? 0} {a?.axes?.length === 1 ? "axis" : "axes"} · {a?.laws?.length ? `exists because ${a.laws.length} law${a.laws.length === 1 ? "" : "s"} target its concern` : "measured lens"}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {crewMembers.length > 0 && <div style={{ fontSize: FS.small, color: C.dim, marginTop: 6, borderTop: `1px dashed ${C.border}`, paddingTop: 4 }}>{crewMembers.length} specialist{crewMembers.length === 1 ? "" : "s"} · {crewMembers.reduce((s, m) => s + (byId.get(m.id)?.laws?.length ?? 0), 0)} laws between them · {armed.forked ? "edit in build the crew below" : "chosen by the mission"}</div>}
                    </div>
                  </div>
                  {/* COLUMN 3 — history, all runs, each opens its paper */}
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", minWidth: 0 }}>
                    <div style={kicker}>history · {dashHist?.length ?? "…"}</div>
                    <div style={{ maxHeight: 380, overflowY: "auto" }}>
                      {dashHist === null && <div style={{ fontSize: FS.small, color: C.dim }}>reading the shelf…</div>}
                      {dashHist?.length === 0 && <div style={{ fontSize: FS.small, color: C.dim, fontStyle: "italic" }}>never run — this would be its first study{armed.forked ? " (forks start fresh)" : ""}</div>}
                      {(dashHist ?? []).map((p: any) => (
                        <div key={p.id} onClick={() => void openPaper(p.id)} title="open this study"
                          style={{ borderTop: `1px solid ${C.border}`, padding: "6px 4px", cursor: "pointer", borderRadius: 6 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                            <span style={{ fontSize: FS.small, color: C.dim, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{String(p.created_at ?? "").slice(5, 16)}</span>
                            <b style={{ fontSize: FS.small, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>{p.title}</b>
                            <span style={{ fontSize: FS.small, color: C.dim, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>${Number(p.cost_usd ?? 0).toFixed(3)}</span>
                          </div>
                          <div style={{ fontSize: FS.small, color: C.muted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.discovery ? `✦ ${p.discovery}` : "—"} · {p.agents ?? 0} agent{p.agents === 1 ? "" : "s"} · {p.files ?? 0} file{p.files === 1 ? "" : "s"}</div>
                        </div>
                      ))}
                      {(dashHist?.length ?? 0) > 0 && (
                        <div style={{ fontSize: FS.small, color: C.muted, marginTop: 5, borderTop: `1px dashed ${C.border}`, paddingTop: 4 }}>
                          {dashHist!.length} run{dashHist!.length === 1 ? "" : "s"} · Σ ${dashHist!.reduce((a2: number, p: any) => a2 + Number(p.cost_usd ?? 0), 0).toFixed(3)} · avg ${(dashHist!.reduce((a2: number, p: any) => a2 + Number(p.cost_usd ?? 0), 0) / dashHist!.length).toFixed(3)} · click to open
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {/* ── CONFIGURE THE RUN — two columns (operator 2026-07-20): in scope |
                    the field. The scope wizard is gone (the rail picks scope + surfaces
                    candidate chips); the inline custom specialist is gone; crew-editing
                    shows only for your OWN missions (forked / blank). ── */}
                {/* ── THE SCOPE BOX (embedded, operator 2026-09-19): the left rail is gone from the X-ray tab, so the
                    full scope edit — the cases, the context sources, the run switches — sits inside the mission. ── */}
                {embedded && (
                  <MissionRail layout="box" missionTitle={armed.title} scope={scopeList} onScope={setScopeList}
                    candidates={(allFiles && allFiles.length ? allFiles : worst).map((w: any) => ({ path: String(w.path), health: w.health ?? w.score ?? null }))}
                    research={webResearch} onResearch={() => setWebResearch((v) => !v)}
                    sources={sourceKinds} onSources={setSourceKinds} />
                )}
                {/* ── THE INGREDIENTS (operator 2026-07-20) — the run's whole context as
                    grouped node-islands: files · agents · context sources · web expansion.
                    A visual panorama; per-agent-call tokens + the swarm's total; everything
                    removable but the agents. ── */}
                {(() => {
                  const perCall = est ? Math.max(1, Math.round((est.agents?.tokens_in ?? est.tokens_in) / Math.max(1, totalCalls))) : null;
                  const conHealth = new Map<string, number | null>((selIntel?.cons ?? []).map((c: any) => [String(c.path), c.fc?.health ?? null]));
                  const island = { flex: "1 1 220px", minWidth: 200, border: `1px solid ${C.border}`, borderRadius: 10, padding: "7px 9px", background: C.panel, minHeight: 66 } as React.CSSProperties;
                  const head = { fontSize: FS.small, color: C.dim, marginBottom: 6, display: "flex", gap: 6, alignItems: "baseline" } as React.CSSProperties;
                  const node = { display: "inline-flex", gap: 5, alignItems: "center", border: `1px solid ${C.border}`, borderRadius: 7, padding: "2px 6px", fontFamily: mono, fontSize: FS.small, color: C.fg, maxWidth: "100%" } as React.CSSProperties;
                  const rm = { background: "transparent", border: "none", color: C.dim, cursor: "pointer", padding: 0, fontFamily: mono, fontSize: FS.small, flexShrink: 0 } as React.CSSProperties;
                  const empty = { fontSize: FS.small, color: C.dim, fontStyle: "italic" } as React.CSSProperties;
                  return (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ ...kicker, display: "flex", gap: 8, alignItems: "baseline" }}>
                        <span style={{ flex: 1 }}>ingredients</span>
                        {est && <span style={{ textTransform: "none", letterSpacing: 0, color: C.brand }}>Σ swarm ≈ {est.tokens_in.toLocaleString()} tok in · ≤ {est.out_cap.toLocaleString()} out · {totalCalls} call{totalCalls === 1 ? "" : "s"}{est.editor ? " + 1 editor" : ""}{est.usd ? ` · ≈$${est.usd.toFixed(4)}` : ""}</span>}
                        {est?.breakdown && <span data-testid="ingredients-breakdown" style={{ textTransform: "none", letterSpacing: 0, color: C.muted, flexBasis: "100%" }}>each call carries ≈{(est.breakdown.source + est.breakdown.record + est.breakdown.sources + est.breakdown.prompt).toLocaleString()} tok: the case's source {est.breakdown.source.toLocaleString()} · the measured record (verdict · laws · violations · field · baseline) {est.breakdown.record.toLocaleString()} · attached sources {est.breakdown.sources.toLocaleString()} · the specialist's prompt {est.breakdown.prompt.toLocaleString()}</span>}
                      </div>
                      <div style={{ marginTop: 6, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", backgroundColor: `color-mix(in oklab, ${C.brand} 3%, ${C.bg})`, backgroundImage: `radial-gradient(color-mix(in oklab, ${C.brand} 9%, transparent) 0.5px, transparent 0.5px)`, backgroundSize: "14px 14px" }}>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
                          {/* FILES */}
                          <div style={island}>
                            <div style={head}><span style={{ color: C.fg }}>📁 files</span><span>· {scopeList.length}</span></div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                              {scopeList.map((p) => { const h = conHealth.get(p); return (
                                <span key={p} style={node} title={p}>
                                  <b style={{ color: tone(h ?? null), fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{h ?? "—"}</b>
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.split("/").pop()}</span>
                                  <button onClick={() => setScopeList(scopeList.filter((x) => x !== p))} title="remove from scope" style={rm}>✕</button>
                                </span>
                              ); })}
                              {!scopeList.length && <span style={empty}>none — check files in the scope box above</span>}
                            </div>
                          </div>
                          {/* AGENTS — no remove */}
                          <div style={island}>
                            <div style={head}><span style={{ color: C.fg }}>⚉ agents</span><span>· {crewMembers.length}</span>{perCall != null && <span style={{ color: C.brand }}>· ~{perCall.toLocaleString()} tok/call</span>}</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                              {crewMembers.map((m) => { const a = byId.get(m.id); return (
                                <span key={m.id} style={node} title={`${m.title}${perCall != null ? ` · ~${perCall} tok/call${scopeList.length > 1 ? ` × ${scopeList.length} files` : ""}` : ""}`}>
                                  <AgentNode id={m.id} title={m.title} category={a?.category ?? "custom"} size={15} />
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title.replace(" Reviewer", "")}</span>
                                  {perCall != null && <span style={{ color: C.dim, flexShrink: 0 }}>~{perCall >= 1000 ? `${(perCall / 1000).toFixed(1)}k` : perCall}</span>}
                                </span>
                              ); })}
                              <span key="editor" style={{ ...node, borderStyle: "dashed" }} title="the paper specialist — one high-tier call after the crew (obligatory)">
                                <span style={{ color: CAT_TONE.editor }}>✒</span><span>the editor</span>
                              </span>
                              {!crewMembers.length && <span style={empty}>no crew yet</span>}
                            </div>
                          </div>
                          {/* CONTEXT SOURCES */}
                          <div style={island}>
                            <div style={head}><span style={{ color: C.fg }}>◆ context</span><span>· {sourceKinds.length}</span></div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                              {sourceKinds.map((k) => (
                                <span key={k} style={node} title={`${SRC_LABEL[k] ?? k} — rides the crew as background`}>
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{SRC_LABEL[k] ?? k}</span>
                                  <button onClick={() => setSourceKinds(sourceKinds.filter((x) => x !== k))} title="remove this source" style={rm}>✕</button>
                                </span>
                              ))}
                              {!sourceKinds.length && <span style={empty}>none — add above (X-ray / Code)</span>}
                            </div>
                          </div>
                          {/* WEB EXPANSION */}
                          <div style={island}>
                            <div style={head}><span style={{ color: C.fg }}>🌐 web expansion</span><span>· {researchUrls.length}</span></div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                              {researchUrls.map((u, j) => { let host = u.url; try { host = new URL(u.url).hostname.replace(/^www\./, ""); } catch { /* keep raw */ } return (
                                <span key={`${u.url}-${j}`} style={node} title={`${u.url}${u.why ? `\n${u.why}` : ""}`}>
                                  <a href={u.url} target="_blank" rel="noreferrer" style={{ color: C.fg, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{host}</a>
                                  <button onClick={() => setResearchUrls((list) => list.filter((_, k) => k !== j))} title="remove this link" style={rm}>✕</button>
                                </span>
                              ); })}
                              {!researchUrls.length && <span style={empty}>{webResearch ? "◆ AI picks, or paste URLs above" : "web research is off"}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {/* BUILD THE CREW — only for your OWN missions (forked / blank); derived
                    missions show their crew read-only in the dashboard column above */}
                {armed.forked && (
                  <div style={{ marginTop: 10, border: `1px solid color-mix(in oklab, ${C.brand} 30%, ${C.border})`, borderRadius: 10, padding: "8px 11px" }}>
                    <div style={{ fontSize: FS.small, color: C.dim, marginBottom: 6 }}>build the crew — pick up to {SWARM_CAP} specialists ({crew.size} chosen)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2px 12px" }}>
                      {agents.map((a) => {
                        const toggle = () => setCrew((s) => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else if (n.size < SWARM_CAP) n.add(a.id); return n; });
                        return (
                          <div key={a.id} onClick={() => { if (a.ready) toggle(); }} title={a.ready ? "" : a.readiness}
                            style={{ display: "flex", gap: 7, alignItems: "center", fontSize: FS.small, color: a.ready ? (crew.has(a.id) ? C.fg : C.muted) : C.dim, cursor: a.ready ? "pointer" : "not-allowed", minWidth: 0, padding: "1px 0" }}>
                            <Check on={crew.has(a.id)} disabled={!a.ready} onToggle={toggle} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* ✒ the editor is OBLIGATORY now (operator 2026-07-20) — stated, not a toggle */}
                <div style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 8 }}>
                  <span style={{ fontSize: FS.small, color: C.brand }}>✒</span>
                  <span style={{ fontSize: FS.small, color: C.muted, fontFamily: mono }}>the paper specialist binds the study — obligatory (+1 high-tier call after the crew); without it a paper is just a sum of talks</span>
                </div>
                {/* ── THE WEB-RESEARCH WIZARD (operator 2026-07-20): paste your own URLs,
                    or let the AI pick search angles from the mission's context → real,
                    editable URLs. Every pinned URL is scraped for each case, UNVERIFIED. ── */}
                <div style={{ marginTop: 8, border: `1px solid ${webResearch ? `color-mix(in oklab, ${C.brand} 30%, ${C.border})` : C.border}`, borderRadius: 10, padding: "8px 12px" }}>
                  <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                    <Check on={webResearch} onToggle={() => setWebResearch((v) => !v)} title="pre-flight research: scraped BEFORE the crew, flagged UNVERIFIED, cited by URL" />
                    <span style={{ fontSize: FS.base, color: webResearch ? C.fg : C.dim, fontFamily: mono }}>🌐 web research{researchUrls.length ? ` · ${researchUrls.length} URL${researchUrls.length === 1 ? "" : "s"} pinned` : ""}</span>
                  </div>
                  {webResearch && (
                    <div style={{ marginTop: 7 }}>
                      <div style={{ fontSize: FS.small, color: C.dim, marginBottom: 5, lineHeight: 1.6 }}>Give the crew sources to weigh — paste your own URLs, or let the AI choose search angles from this mission's concerns (it returns real URLs you can edit).</div>
                      <div style={{ display: "flex", gap: 7, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <textarea value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} onBlur={commitDraft} spellCheck={false} rows={2}
                          placeholder={"paste URLs — one per line — then click + add"}
                          style={{ flex: 1, minWidth: 220, resize: "vertical", background: C.bg, border: `1px solid ${C.border}`, color: C.fg, borderRadius: 6, padding: "5px 8px", fontFamily: mono, fontSize: FS.small, outline: "none" }} />
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          <button onClick={commitDraft} disabled={!/https?:\/\//.test(urlDraft)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: /https?:\/\//.test(urlDraft) ? C.brand : C.dim, borderRadius: 5, padding: "2px 10px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>+ add</button>
                          {(() => { const ready = scopeList.length > 0 || crewMembers.length > 0; return (
                          <button onClick={() => void suggestUrls()} disabled={suggesting || !ready} title={ready ? "one small AI call reads the mission, the crew's laws and the files, then the scrape returns real URLs from serious sources" : "add files or a crew first"}
                            style={{ background: suggesting ? "transparent" : `color-mix(in oklab, ${C.brand} 12%, transparent)`, border: `1px solid ${ready ? C.brand : C.border}`, color: ready ? C.brand : C.dim, borderRadius: 5, padding: "2px 10px", cursor: suggesting || !ready ? "default" : "pointer", fontFamily: mono, fontSize: FS.small }}>{suggesting ? "◆ choosing…" : "◆ AI picks from context"}</button>
                          ); })()}
                        </div>
                      </div>
                      {suggestErr && <div style={{ fontSize: FS.small, color: C.warn, marginTop: 5 }}>! {suggestErr}</div>}
                      <div style={{ fontSize: FS.small, color: C.dim, marginTop: 6 }}>{researchUrls.length ? `${researchUrls.length} URL${researchUrls.length === 1 ? "" : "s"} → shown as web-expansion nodes in the ingredients above (remove them there) · scraped per case, flagged UNVERIFIED` : "no URLs pinned — the crew falls back to deterministic queries derived from each case's record."}</div>
                    </div>
                  )}
                </div>
                {/* ── RUN ON (operator 2026-09-19): the tier and engine per role — the agents at mid, the editor at high ── */}
                <RunOnField value={runOn} onChange={setRunOn} withEditor={withEditor} />
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: FS.small, color: C.dim, fontFamily: mono }}>routing —</span>
                  <span style={{ fontSize: FS.small, color: C.dim, fontFamily: mono }}>crew</span>
                  <HeimdallFlag template="constitution-agent-review" />
                  <span style={{ fontSize: FS.small, color: C.dim, fontFamily: mono }}>editor</span>
                  <HeimdallFlag template="constitution-editor" />
                </div>
                {/* ── THE ESTIMATE BEFORE THE RUN (operator 2026-09-19): tokens from the real context, calls from the
                    crew × the cases, cost from the selected route's pricing — subscription rows show the API-equivalent ── */}
                {scopeList.length > 0 && totalCalls <= CAP_CALLS && <EstimateCard est={est} calls={totalCalls} />}
                {/* the pre-spend status — real numbers, one line (the prose header is gone) */}
                <div style={{ fontSize: FS.small, marginTop: 9, lineHeight: 1.7, fontFamily: mono, color: totalCalls > CAP_CALLS ? C.bad : scopeList.length ? C.muted : C.warn }}>
                  {!scopeList.length ? "○ scope REQUIRED — check files in the scope box above, a 🎯 threat, or the open file"
                    : totalCalls > CAP_CALLS ? `✕ ${totalCalls} AI calls — over the ${CAP_CALLS}-call cap: trim the crew or the scope`
                    : `✓ ${totalCalls} AI call${totalCalls === 1 ? "" : "s"} (${crewMembers.length} crew × ${Math.max(1, scopeList.length)} file${scopeList.length === 1 ? "" : "s"})${withEditor ? " + the editor" : ""} · est. cost ${estCost} · ≈${totalCalls * 20 + (withEditor ? 80 : 0)}s`}
                </div>
                <button onClick={() => void runMission()} disabled={!crewMembers.length || !scopeList.length || busy || totalCalls > CAP_CALLS}
                  style={{ marginTop: 6, background: crewMembers.length && scopeList.length && totalCalls <= CAP_CALLS ? C.brand : "transparent", border: `1px solid ${C.brand}`, color: crewMembers.length && scopeList.length && totalCalls <= CAP_CALLS ? C.bg : C.dim, borderRadius: 6, padding: "3px 16px", cursor: "pointer", fontFamily: mono, fontSize: FS.base, fontWeight: 600 }}>{busy ? "mission running… (parallel)" : `▶ Run Mission (${totalCalls} call${totalCalls === 1 ? "" : "s"} + the editor)`}</button>
                {/* ── THE RACE (operator 2026-07-19) — every spawned agent is an avatar
                    on its lane: queued at the start, running mid-track (bobbing),
                    done past the checkered line, failed tipped over where it stopped ── */}
                {theater && ops && (() => {
          const workers = ops.filter((o) => o.id !== "editor");
          const edRow = ops.find((o) => o.id === "editor") ?? null;
          const allIn = workers.length > 0 && workers.every((o) => o.status !== "queued" && o.status !== "running");
          const cooking = allIn && edRow != null && edRow.status !== "queued";
          const captions = edRow?.status === "done"
            ? ["the essay is ready"]
            : ["gathering the crews' theses…", "cooking the synthesis…", "weaving the arc…", "writing the essay…", "placing the figures…"];
          return (
            <div onClick={() => { setTheaterOut(true); setTimeout(() => { setTheater(false); setTheaterOut(false); }, 900); }}
              style={{ position: "fixed", inset: 0, zIndex: 1400, background: "rgba(0,0,0,.62)", backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: "loki-fade-in 700ms ease both", opacity: theaterOut ? 0 : 1, transition: "opacity 1.2s ease" }}>
              <div onClick={(e) => e.stopPropagation()}
                style={{ width: "min(900px, 94vw)", background: C.panel, borderRadius: 18, padding: "16px 22px 20px", fontFamily: mono, position: "relative", border: cooking ? "1px solid transparent" : `1px solid color-mix(in oklab, ${C.brand} 26%, ${C.border})`, boxShadow: cooking ? "0 0 90px -30px rgba(0,0,0,.9)" : "0 24px 70px -12px rgba(0,0,0,.7)", transition: "border-color 1.8s ease, box-shadow 1.8s ease" }}>
                <div style={{ display: "flex", gap: 9, alignItems: "baseline" }}>
                  <b style={{ fontSize: FS.title, color: C.fg }}>{armed?.title ?? "the mission"}</b>
                  <span style={{ fontSize: FS.small, color: C.dim }}>{workers.filter((o) => o.status === "done").length}/{workers.length} in{edRow ? ` · the editor ${edRow.status}` : ""}</span>
                  <span style={{ flex: 1 }} />
                  <button onClick={() => { setTheaterOut(true); setTimeout(() => { setTheater(false); setTheaterOut(false); }, 900); }}
                    style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 5, padding: "1px 10px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>continue backstage</button>
                </div>
                <div style={{ position: "relative", minHeight: 240, marginTop: 8 }}>
                  {/* the SWARM act — fades away as the cooking begins */}
                  <div style={{ opacity: cooking ? 0 : 1, transition: "opacity 1.6s ease", pointerEvents: cooking ? "none" : undefined }}>
                    <SwarmNet ops={ops} catOf={(id2: string) => (id2 === "editor" ? "editor" : id2 === "custom" ? "custom" : (byId.get(id2)?.category ?? String(id2).split(":")[0]))} />
                  </div>
                  {/* the COOKING act — the hub, centered and grown, breathing captions */}
                  {edRow && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, opacity: cooking ? 1 : 0, transition: "opacity 1.6s ease 500ms", pointerEvents: cooking ? undefined : "none" }}>
                      <svg width="120" height="120" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="34" fill={C.panel2} stroke={edRow.status === "done" ? C.ok : CAT_TONE.editor} strokeWidth={1.8}
                          style={{ transform: cooking ? "scale(1.18)" : "scale(0.6)", transformOrigin: "60px 60px", transition: "transform 2.2s cubic-bezier(.3,1.2,.5,1)", animation: edRow.status === "running" ? "loki-hub 1.6s ease-in-out infinite" : undefined }} />
                        <text x="60" y="67" textAnchor="middle" fill={CAT_TONE.editor} style={{ fontFamily: mono, fontSize: 22 }}>✒</text>
                      </svg>
                      <TheaterCaptions items={captions} done={edRow.status === "done"} />
                    </div>
                  )}
                </div>
                <RunLogPanel lines={runLog} busy={busy} startedAt={runStartRef.current} maxHeight={200} />
              </div>
            </div>
          );
        })()}
        {ops && (() => {
                  ensureRaceCss();
                  const catOf2 = (id2: string) => (id2 === "editor" ? "editor" : id2 === "custom" ? "custom" : (byId.get(id2)?.category ?? String(id2).split(":")[0]));
                  if (theater) return (
                    <div style={{ marginTop: 9, display: "flex", gap: 8, alignItems: "center", fontFamily: mono, fontSize: FS.small, color: C.dim }}>
                      <span>⚑ the mission runs in the theater</span>
                      <button onClick={() => setTheater(true)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "0 8px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>reopen</button>
                    </div>
                  );
                  return (
                  <div style={{ marginTop: 9, position: "relative", border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 10px" }}>
                    {/* THE SWARM — every agent wired to the hub; data flows down the
                        lines while a call runs; the hub GROWS as results land */}
                    <SwarmNet ops={ops} catOf={catOf2} />
                    {/* the ledger under the swarm — the honest numbers per call */}
                    {ops.map((o, i) => (
                      <div key={`l${i}`} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: FS.small, padding: "1px 0", fontFamily: mono }}>
                        <span style={{ width: 12, color: o.status === "done" ? C.ok : o.status === "running" ? C.brand : o.status === "failed" ? C.bad : C.dim }}>{o.status === "done" ? "✓" : o.status === "running" ? "●" : o.status === "failed" ? "✕" : "○"}</span>
                        <span style={{ color: C.muted, width: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label ?? o.agent}</span>
                        <span style={{ color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                          {o.status === "queued" ? "waiting" : o.status === "running" ? "flowing…" : o.status === "failed" ? (o.res?.error ?? "failed").slice(0, 60) : `${o.res?.review?.summary?.level ?? (o.res?.editor ? "edited" : "dropped")} · $${Number(o.res?.cost_usd ?? 0).toFixed(4)}`}
                        </span>
                        {o.res?.ai_call_id != null && <button onClick={() => setAiCallId(o.res.ai_call_id)} title="the exact prompt sent — the AI-call window"
                          style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: FS.small, padding: 0 }}>⚙</button>}
                      </div>
                    ))}
                    {/* every call failed the same way → say it LOUDLY, with the likely cure */}
                    {!busy && ops.length > 0 && ops.every((o) => o.status === "failed") && (() => {
                      const e0 = String(ops[0].res?.error ?? "the call failed");
                      const stale = /403|404|400|not allowed|unknown action|no such action|forbidden/i.test(e0);
                      return (
                        <div style={{ marginTop: 6, border: `1px solid color-mix(in oklab, ${C.bad} 50%, ${C.border})`, borderRadius: 7, padding: "5px 10px", fontFamily: mono, fontSize: FS.base, color: C.bad, lineHeight: 1.6 }}>
                          every call failed: {e0.slice(0, 160)}
                          {stale && <div style={{ color: C.warn }}>the serve refused the action — restart antiloki-serve, reopen the tab, run again</div>}
                          <div style={{ color: C.muted }}>the run log below has every step that did happen, per call</div>
                        </div>
                      );
                    })()}
                    <RunLogPanel lines={runLog} busy={busy} startedAt={runStartRef.current} />
                    {court && (court.convergence.length > 0 || court.divergence.length > 0) && (
                      <div style={{ marginTop: 5, fontSize: FS.base, lineHeight: 1.6 }}>
                        {court.convergence.map((c2, i) => <div key={`cv${i}`} style={{ color: C.muted }}>⚡ convergence on {c2.key} — {c2.agents.length} independent lenses, same spot</div>)}
                        {court.divergence.map((d2, i) => <div key={`dv${i}`} style={{ color: C.muted }}>⚖ divergence on {d2.key} — {d2.agents.join(" vs ")} rate it {d2.sevs.join(" / ")}; the court is you</div>)}
                      </div>
                    )}
                  </div>
                  );
                })()}
              </div>
            )}
            {/* ── SESSIONS — this window's history ── */}
            {sessions.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={kicker}>mission log · this window</div>
                {sessions.map((s, i) => (
                  <div key={i} style={{ marginTop: 7, paddingTop: 6, borderTop: `1px solid color-mix(in oklab, ${C.border} 50%, transparent)` }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <b style={{ fontSize: FS.base, color: C.brand }}>{s.label}</b>
                      <span style={{ fontSize: FS.small, color: C.dim }}>${s.results.reduce((a2: number, r2: any) => a2 + Number(r2.res?.cost_usd ?? 0), 0).toFixed(4)} total</span>
                      {s.review && <button onClick={() => setReviewOpen(s)} style={{ background: "transparent", border: `1px solid color-mix(in oklab, ${C.brand} 45%, ${C.border})`, color: C.brand, borderRadius: 5, padding: "0 9px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>⧉ open the code review</button>}
                    </div>
                    {s.results.map((r2: any, j: number) => (
                      <div key={j} style={{ marginTop: 4, paddingLeft: 9, borderLeft: `2px solid color-mix(in oklab, ${C.border} 70%, transparent)` }}>
                        <div style={{ fontSize: FS.small, color: C.dim }}>{s.multi && r2.path ? `${r2.agent} · ${String(r2.path).split("/").pop()}` : r2.agent}</div>
                        {r2.res?.ok === false ? <div style={{ fontSize: FS.base, color: C.bad }}>{r2.res.error}</div> : <Findings res={r2.res} />}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* ── THE SPECIALISTS' RAIL (embedded only): the roster as profiles by category; binds into the crew ── */}
          {embedded && !bookMain && (
            <div style={{ width: 292, flexShrink: 0, borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto" }}>
              <PaperShelf onOpen={(sess) => setReviewOpen(sess)} refreshKey={sessions.filter((x: any) => (x?.results ?? []).length).length} />
              <SpecialistsRail agents={agents} crew={crew} armed={!!armed} inColumn
                onToggle={(id) => setCrew((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else if (n.size < SWARM_CAP) n.add(id); return n; })} />
            </div>
          )}
        </div>
      </div>
      {reviewOpen && <MissionReview session={reviewOpen} onClose={() => setReviewOpen(null)} />}
      {artDeck && <ClassPlayer deck={artDeck.deck} mode={artDeck.mode === "video" ? "video" : "slides"} swarmId={artPaper?.swarm_id ?? null} onClose={() => setArtDeck(null)} />}
    </div>
  );
}
