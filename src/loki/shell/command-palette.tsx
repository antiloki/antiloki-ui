// THE ⌘K COMMAND STORE v3 (operator 2026-07-14, three rounds: "a complete
// wizard store, smart HERE section, categorized everything" → "style like the
// studio artifacts draws" → "smaller, more discrete boxes; much more features;
// stats info; a JOURNAL — an internal blog, deterministic, about everything
// that is happening; beautiful animations").
//
// Anatomy: search → PULSE (live stat chips) → ⌖ HERE (the current screen's
// live features via command-store-registry) → ⚡ THE JOURNAL (a deterministic
// feed derived from real rows — sessions, merges, notebooks; no AI) → THE
// STORE (every screen + feature, categorized, studio-artifact tiles).
import React, { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useShell } from "./slug-context";
import { resetTours } from "./mini-tour";
import { C } from "@/loki/theme";
import { apiPost } from "@/loki/api/client";
import { startNarrationJob, beginPress, requestAutoplay, requestDockExpand, requestCastWhenReady, requestClassWhenReady, hydrateJobFromArtifact, armAudio } from "@/loki/widgets/narration-jobs";
import { STUDIO_CSS } from "@/loki/widgets/studio-kit";
import { getHere, subscribeHere, type StoreItem } from "./command-store-registry";
import { isTypingTarget } from "./typing-target";

const mono = '"JetBrains Mono", monospace';
const STORE_CSS = `
@keyframes storePop { from { opacity: 0; transform: translateX(-50%) translateY(-7px) scale(.985); } to { opacity: 1; transform: translateX(-50%); } }
@keyframes storeRise { from { opacity: 0; transform: translateY(7px) scale(.96); } to { opacity: 1; transform: none; } }
`;

// ── drawn thumbnails, studio-kit dialect (120×40, tighter than v2) ───────────
const sv = { width: "100%", height: 30 } as React.CSSProperties;
const bar = (x: number, y: number, w: number, c: string, o = 0.8) => <rect x={x} y={y} width={w} height="4" rx="2" fill={c} opacity={o} />;
const THUMBS: Record<string, (t: string) => React.ReactNode> = {
  chat: (t) => (<svg viewBox="0 0 120 44" style={sv}><rect x="14" y="7" width="52" height="14" rx="7" fill="none" stroke={t} /><rect x="54" y="24" width="52" height="14" rx="7" fill={C.panel2} stroke={C.dim} />{bar(22, 12, 36, t, 0.55)}{bar(62, 29, 36, C.dim, 0.55)}</svg>),
  vibe: (t) => (<svg viewBox="0 0 120 44" style={sv}><rect x="10" y="8" width="30" height="20" rx="3" fill="none" stroke={t} /><rect x="48" y="14" width="30" height="20" rx="3" fill="none" stroke={C.dim} /><rect x="86" y="6" width="26" height="18" rx="3" fill="none" stroke={t} opacity="0.7" /><circle cx="25" cy="36" r="3" fill={t} /><line x1="40" y1="18" x2="48" y2="22" stroke={C.dim} /><line x1="78" y1="22" x2="86" y2="16" stroke={C.dim} /></svg>),
  research: (t) => (<svg viewBox="0 0 120 44" style={sv}><path d="M30 8 Q42 12 60 8 L60 34 Q42 38 30 34 Z" fill="none" stroke={t} /><path d="M90 8 Q78 12 60 8 L60 34 Q78 38 90 34 Z" fill="none" stroke={C.dim} />{bar(36, 15, 16, t, 0.6)}{bar(66, 15, 16, C.dim, 0.5)}</svg>),
  board: (t) => (<svg viewBox="0 0 120 44" style={sv}><rect x="12" y="6" width="28" height="32" rx="3" fill="none" stroke={t} /><rect x="46" y="6" width="28" height="32" rx="3" fill="none" stroke={C.dim} /><rect x="80" y="6" width="28" height="32" rx="3" fill="none" stroke={C.dim} />{bar(16, 12, 20, t, 0.6)}{bar(50, 12, 20, C.dim, 0.5)}{bar(84, 12, 20, C.dim, 0.5)}</svg>),
  pulls: (t) => (<svg viewBox="0 0 120 44" style={sv}><circle cx="20" cy="12" r="4" fill="none" stroke={C.dim} /><circle cx="20" cy="32" r="4" fill="none" stroke={t} /><circle cx="96" cy="22" r="4" fill="none" stroke={t} /><path d="M24 12 Q60 12 92 21" fill="none" stroke={C.dim} /><path d="M24 32 Q60 32 92 23" fill="none" stroke={t} /></svg>),
  code: (t) => (<svg viewBox="0 0 120 44" style={sv}>{bar(12, 7, 50, t)}{bar(22, 15, 74, "oklch(0.80 0.12 150)", 0.7)}{bar(22, 23, 40, C.dim, 0.6)}{bar(12, 31, 58, "oklch(0.82 0.10 65)", 0.7)}</svg>),
  tagging: (t) => (<svg viewBox="0 0 120 44" style={sv}><path d="M14 14 L34 14 L44 22 L34 30 L14 30 Z" fill="none" stroke={t} /><path d="M50 14 L70 14 L80 22 L70 30 L50 30 Z" fill="none" stroke={C.dim} /><circle cx="20" cy="22" r="1.6" fill={t} /></svg>),
  pipeline: (t) => (<svg viewBox="0 0 120 44" style={sv}><rect x="10" y="16" width="22" height="12" rx="2" fill="none" stroke={t} /><rect x="48" y="16" width="22" height="12" rx="2" fill="none" stroke={C.dim} /><rect x="86" y="16" width="22" height="12" rx="2" fill="none" stroke={C.dim} /><line x1="32" y1="22" x2="48" y2="22" stroke={t} /><line x1="70" y1="22" x2="86" y2="22" stroke={C.dim} /></svg>),
  audit: (t) => (<svg viewBox="0 0 120 44" style={sv}><rect x="16" y="16" width="18" height="12" rx="6" fill="none" stroke={t} /><rect x="40" y="16" width="18" height="12" rx="6" fill="none" stroke={C.dim} /><rect x="64" y="16" width="18" height="12" rx="6" fill="none" stroke={C.dim} /><rect x="88" y="16" width="18" height="12" rx="6" fill="none" stroke={t} opacity="0.6" /><line x1="34" y1="22" x2="40" y2="22" stroke={C.dim} /><line x1="58" y1="22" x2="64" y2="22" stroke={C.dim} /><line x1="82" y1="22" x2="88" y2="22" stroke={C.dim} /></svg>),
  diffs: () => (<svg viewBox="0 0 120 44" style={sv}>{bar(14, 9, 40, "oklch(0.72 0.17 145)", 0.8)}{bar(14, 19, 30, "oklch(0.72 0.17 145)", 0.5)}{bar(66, 9, 40, "oklch(0.66 0.19 25)", 0.8)}{bar(66, 19, 24, "oklch(0.66 0.19 25)", 0.5)}</svg>),
  personas: (t) => (<svg viewBox="0 0 120 44" style={sv}><circle cx="30" cy="17" r="6" fill="none" stroke={t} /><path d="M20 34 Q30 26 40 34" fill="none" stroke={t} /><circle cx="62" cy="17" r="6" fill="none" stroke={C.dim} /><path d="M52 34 Q62 26 72 34" fill="none" stroke={C.dim} /><circle cx="92" cy="17" r="6" fill="none" stroke={C.dim} opacity="0.6" /><path d="M82 34 Q92 26 102 34" fill="none" stroke={C.dim} opacity="0.6" /></svg>),
  knowledge: (t) => (<svg viewBox="0 0 120 44" style={sv}><circle cx="60" cy="22" r="6" fill="none" stroke={t} /><circle cx="24" cy="12" r="4" fill="none" stroke={C.dim} /><circle cx="24" cy="34" r="4" fill="none" stroke={C.dim} /><circle cx="96" cy="12" r="4" fill="none" stroke={C.dim} /><circle cx="96" cy="34" r="4" fill="none" stroke={C.dim} /><line x1="54" y1="19" x2="28" y2="13" stroke={C.dim} /><line x1="54" y1="25" x2="28" y2="33" stroke={C.dim} /><line x1="66" y1="19" x2="92" y2="13" stroke={C.dim} /><line x1="66" y1="25" x2="92" y2="33" stroke={C.dim} /></svg>),
  prompts: (t) => (<svg viewBox="0 0 120 44" style={sv}><text x="12" y="28" fontSize="15" fill={t} fontFamily="monospace">{"{{"}</text>{bar(40, 12, 44, C.dim, 0.6)}{bar(40, 22, 56, C.dim, 0.45)}<text x="98" y="28" fontSize="15" fill={t} fontFamily="monospace">{"}}"}</text></svg>),
  cost: (t) => (<svg viewBox="0 0 120 44" style={sv}><path d="M20 36 A40 40 0 0 1 100 36" fill="none" stroke={C.dim} opacity="0.5" /><path d="M20 36 A40 40 0 0 1 66 6" fill="none" stroke={t} /><line x1="60" y1="36" x2="76" y2="18" stroke={t} /><circle cx="60" cy="36" r="3" fill={t} /></svg>),
  settings: (t) => (<svg viewBox="0 0 120 44" style={sv}><circle cx="60" cy="22" r="9" fill="none" stroke={t} /><circle cx="60" cy="22" r="3.5" fill="none" stroke={t} />{[0, 60, 120, 180, 240, 300].map((a) => { const r = (a * Math.PI) / 180; return <line key={a} x1={60 + Math.cos(r) * 11} y1={22 + Math.sin(r) * 11} x2={60 + Math.cos(r) * 15} y2={22 + Math.sin(r) * 15} stroke={t} />; })}</svg>),
  safety: (t) => (<svg viewBox="0 0 120 44" style={sv}><path d="M60 6 L76 12 L76 24 Q76 34 60 39 Q44 34 44 24 L44 12 Z" fill="none" stroke={t} /><path d="M53 21 L58 27 L68 15" fill="none" stroke={t} /></svg>),
  account: (t) => (<svg viewBox="0 0 120 44" style={sv}><circle cx="60" cy="15" r="7" fill="none" stroke={t} /><path d="M44 38 Q60 26 76 38" fill="none" stroke={t} /></svg>),
  tour: (t) => (<svg viewBox="0 0 120 44" style={sv}><line x1="36" y1="6" x2="36" y2="38" stroke={C.dim} /><path d="M36 8 L82 12 L36 22 Z" fill={t} opacity="0.85" /></svg>),
  drawer: (t) => (<svg viewBox="0 0 120 44" style={sv}><rect x="14" y="7" width="92" height="30" rx="3" fill="none" stroke={C.dim} /><rect x="74" y="7" width="32" height="30" rx="3" fill={C.panel2} stroke={t} />{bar(80, 14, 20, t, 0.6)}</svg>),
  wizard: (t) => (<svg viewBox="0 0 120 44" style={sv}><circle cx="24" cy="22" r="6" fill="none" stroke={t} /><circle cx="60" cy="22" r="6" fill="none" stroke={t} opacity="0.7" /><circle cx="96" cy="22" r="6" fill="none" stroke={C.dim} /><line x1="30" y1="22" x2="54" y2="22" stroke={t} opacity="0.6" /><line x1="66" y1="22" x2="90" y2="22" stroke={C.dim} /><text x="21" y="26" fontSize="9" fill={t} fontFamily="monospace">1</text><text x="57" y="26" fontSize="9" fill={t} fontFamily="monospace">2</text><text x="93" y="26" fontSize="9" fill={C.dim} fontFamily="monospace">3</text></svg>),
  studio: (t) => (<svg viewBox="0 0 120 44" style={sv}><rect x="14" y="10" width="26" height="24" rx="3" fill="none" stroke={t} /><rect x="47" y="10" width="26" height="24" rx="3" fill="none" stroke={C.dim} /><rect x="80" y="10" width="26" height="24" rx="3" fill="none" stroke={C.dim} opacity="0.6" /><path d="M22 26 L27 18 L32 24" fill="none" stroke={t} opacity="0.8" />{bar(51, 16, 16, C.dim, 0.5)}{bar(51, 24, 12, C.dim, 0.4)}</svg>),
  rebuild: (t) => (<svg viewBox="0 0 120 44" style={sv}><path d="M74 10 A16 16 0 1 0 76 30" fill="none" stroke={t} /><path d="M70 4 L76 11 L67 13 Z" fill={t} /></svg>),
  formations: (t) => (<svg viewBox="0 0 120 44" style={sv}><rect x="26" y="6" width="22" height="14" rx="3" fill="none" stroke={t} /><rect x="14" y="24" width="22" height="14" rx="3" fill="none" stroke={C.dim} /><rect x="42" y="24" width="22" height="14" rx="3" fill="none" stroke={C.dim} /><rect x="76" y="14" width="26" height="16" rx="3" fill="none" stroke={t} opacity="0.6" /><line x1="37" y1="20" x2="25" y2="24" stroke={C.dim} /><line x1="37" y1="20" x2="53" y2="24" stroke={C.dim} /></svg>),
  fuel: (t) => (<svg viewBox="0 0 120 44" style={sv}>{bar(16, 30, 20, t, 0.9)}{bar(42, 22, 20, t, 0.7)}{bar(68, 14, 20, t, 0.55)}{bar(94, 8, 12, C.dim, 0.5)}<line x1="12" y1="38" x2="108" y2="38" stroke={C.dim} opacity="0.5" /></svg>),
};
const glyphThumb = (icon: string, tint: string) => (<svg viewBox="0 0 120 44" style={sv}><text x="60" y="30" fontSize="19" textAnchor="middle" fill={tint}>{icon}</text></svg>);

type CatalogItem = StoreItem & { art?: string };

function Tile({ it, onDone, first, i }: { it: CatalogItem; onDone: () => void; first?: boolean; i: number }) {
  const tint = it.tint ?? C.brand;
  const thumb = it.art && THUMBS[it.art] ? THUMBS[it.art](tint) : glyphThumb(it.icon, tint);
  return (
    <div className="studio-card" onClick={() => { onDone(); it.run(); }} title={it.hint ?? it.label}
      style={{ border: `1px solid ${first ? `color-mix(in oklab, ${tint} 55%, ${C.border})` : C.border}`, borderRadius: 9, overflow: "hidden", background: C.bg, cursor: "pointer", minWidth: 0, animation: `storeRise .22s ${Math.min(i, 20) * 0.018}s cubic-bezier(.2,.9,.3,1.2) backwards` }}>
      <div style={{ height: 32, display: "flex", alignItems: "center", justifyContent: "center", padding: "1px 7px", background: C.panel2, borderBottom: `1px solid ${C.border}` }}>{thumb}</div>
      <div style={{ padding: "4px 7px 5px" }}>
        <div style={{ fontFamily: mono, fontSize: 9, color: C.fg, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</div>
        {it.hint && <div style={{ marginTop: 1, fontFamily: mono, fontSize: 7.5, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.hint}</div>}
      </div>
    </div>
  );
}

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setChatOpen } = useShell();
  const [q, setQ] = useState("");
  const [, bump] = useState(0);
  const [pulse, setPulse] = useState<{ totals?: any; sessions?: any[]; notebooks?: any[] } | null>(null);
  const [arts, setArts] = useState<any[]>([]);
  // clicking an artifact REHYDRATES it into the generation queue and opens the right player
  // (operator: "video cast should open the video player; the same for podcast, video class, any
  // artefact") — cache-hit replays in seconds; an expired cache re-presses in the background.
  const openArtefact = (a2: any) => {
    // every step is LOUD — a silent exit here cost a debugging round ("clicked and nothing appeared")
    // eslint-disable-next-line no-console
    console.info(`[narr] artefact open ← ${a2?.kind} "${String(a2?.title ?? a2?.file ?? "?").slice(0, 60)}" narration=${a2?.narration_id} session=${a2?.session_id} deck=${a2?.deck != null}`);
    try {
      if (a2.narration_id == null) {
        // eslint-disable-next-line no-console
        console.error("[narr] artefact has NO narration_id in its sidecar — it cannot rehydrate; regenerate it once.");
        return;
      }
      armAudio();
      const nid = Number(a2.narration_id);
      void startNarrationJob(nid, String(a2.title ?? a2.file), {
        kind: String(a2.kind ?? "narration"),
        voice: a2.voice ?? undefined,
        meta: { ...(a2.session_id != null ? { sessionId: Number(a2.session_id) } : {}), ...(a2.deck != null ? { deck: a2.deck } : {}) },
      }).then(async () => {
        // the shelf FIRST — the saved artifact slices back into sections in seconds; pressing is
        // only the fallback for pre-receipt artifacts or a missing file.
        if (a2.kind === "video-cast" && a2.session_id != null) {
          requestCastWhenReady({ narrationId: nid, sessionId: Number(a2.session_id), title: String(a2.title ?? a2.file) });
        } else if (a2.kind === "video-class" && a2.deck != null) {
          requestClassWhenReady({ narrationId: nid, deck: a2.deck, title: String(a2.title ?? a2.file) });
        } else {
          requestAutoplay(nid);
        }
        requestDockExpand();
        const hydrated = a2.file ? await hydrateJobFromArtifact(nid, String(a2.file)) : false;
        if (!hydrated) void beginPress(nid, a2.voice ?? undefined);
        // eslint-disable-next-line no-console
        console.info(`[narr] artefact open → job #${nid} ${hydrated ? "hydrated from the shelf (instant)" : "queued for pressing (fallback)"}`);
      }).catch((e) => {
        // eslint-disable-next-line no-console
        console.error("[narr] artefact open FAILED in job boot:", e);
      });
      setPaletteOpen(false); // the corner queue (or the film) takes it from here
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[narr] artefact open FAILED:", e);
    }
  };
  const navigate = useNavigate();

  useEffect(() => subscribeHere(() => bump((x) => x + 1)), []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl/⌘+K no longer opens this menu (the operator 2026-11-22: it is the old menu; the key stays the terminal's "kill line")
      if (e.key === "\\" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) { e.preventDefault(); setChatOpen(true); }
      else if (e.key === "Escape" && paletteOpen) setPaletteOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [paletteOpen, setPaletteOpen, setChatOpen]);
  useEffect(() => { if (paletteOpen) setQ(""); }, [paletteOpen]);
  // PULSE + JOURNAL data — real rows, fetched on open, no AI anywhere
  useEffect(() => {
    if (!paletteOpen) return;
    let dead = false;
    (async () => {
      const [ov, nb, af] = await Promise.all([
        apiPost("/api/v1/cockpit/overview", {}).catch(() => null),
        apiPost("/api/v1/notebook/store", { op: "list" }).catch(() => null),
        apiPost("/api/v1/artefacts/manage", { op: "list" }).catch(() => null),
      ]);
      if (dead) return;
      const o = (ov as any)?.result ?? ov; const n = (nb as any)?.result ?? nb;
      const a2: any = (af as any)?.result?.result ?? (af as any)?.result ?? af;
      setPulse({ totals: o?.totals, sessions: o?.sessions ?? [], notebooks: n?.notebooks ?? [] });
      setArts(a2?.artefacts ?? []);
    })();
    return () => { dead = true; };
  }, [paletteOpen]);

  if (!paletteOpen) return null;

  const nav = (to: string) => () => navigate({ to: to as any });
  // THE STORE — the full functionality catalog, categorized
  const STORE: Array<{ title: string; items: CatalogItem[] }> = [
    { title: "screens", items: [
      { icon: "💬", art: "chat", tint: C.brand, label: "Cowork", hint: "your threads, panes and teams", run: nav("/") },
      { icon: "⊙", art: "board", tint: C.ok, label: "Sagas", hint: "goals, tasks, who did what and what it cost", run: nav("/sagas") },
      { icon: "⟨⟩", art: "code", tint: C.brand, label: "X-ray", hint: "the code's verdict, maps, scores and rules", run: nav("/operations/atlas") },
      { icon: "📖", art: "docs", tint: C.dim, label: "Docs", hint: "how antiloki works", run: nav("/docs") },
    ] },
    { title: "older screens", items: [
      { icon: "▦", art: "board", tint: C.ok, label: "Harness", hint: "cards · waterfall", run: nav("/operations") },
      { icon: "⇄", art: "pulls", tint: C.warn, label: "Pulls & Tests", run: nav("/operations/pulls") },
      { icon: "🏷", art: "tagging", tint: C.ok, label: "Tagging", hint: "rate answers to teach the router", run: nav("/tagging") },
      { icon: "▸", art: "pipeline", tint: C.warn, label: "Pipeline", hint: "driver waterfall", run: nav("/pipeline") },
      { icon: "🧙", art: "wizard", tint: C.brand, label: "Features wizard", hint: "inventory → cards", run: nav("/features") },
      { icon: "⛓", art: "audit", tint: C.dim, label: "Audit", hint: "every call", run: nav("/operations/audit") },
      { icon: "⚉", art: "personas", tint: C.brand, label: "Personas", hint: "agent dashboard", run: nav("/personas") },
    ] },
    { title: "help", items: [
      { icon: "🎓", art: "tour", tint: C.ok, label: "Welcome tour", run: () => resetTours() }, // forgets every section: this screen's tour now, the others on their next access
      { icon: "🗨", art: "drawer", tint: C.brand, label: "Chat drawer", hint: "\\ anywhere", run: () => setChatOpen(true) },
    ] },
  ];

  // ⚡ THE JOURNAL — deterministic entries from real rows, newest first
  const J: Array<{ ts: string; icon: string; tint: string; text: string }> = [];
  (pulse?.sessions ?? []).forEach((s: any) => {
    const ts = String(s.created_at ?? ""); if (!ts) return;
    J.push({ ts, icon: "❖", tint: C.brand, text: `super-session “${s.name}” started · ${s.panes ?? 0} agent${(s.panes ?? 0) === 1 ? "" : "s"}${s.calls ? ` · ${s.calls} turns` : ""}` });
    if (s.status === "merged") J.push({ ts, icon: "⛙", tint: C.ok, text: `“${s.name}” merged${s.cost_usd ? ` · $${Number(s.cost_usd).toFixed(3)} spent` : ""}` });
  });
  (pulse?.notebooks ?? []).forEach((n: any) => {
    const ts = String(n.created_at ?? n.updated_at ?? ""); if (!ts) return;
    J.push({ ts, icon: "📓", tint: C.warn, text: `notebook “${n.title}”${n.item_count ? ` · ${n.item_count} artifact${n.item_count === 1 ? "" : "s"}` : " opened its covers"}` });
  });
  J.sort((a, b) => b.ts.localeCompare(a.ts));
  const todayK = new Date().toISOString().slice(0, 10);
  const yesterK = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dayLabel = (ts: string) => { const d = ts.slice(0, 10); return d === todayK ? "today" : d === yesterK ? "yesterday" : d.slice(5); };

  const here = getHere();
  const ql = q.toLowerCase();
  const match = (it: StoreItem) => !ql || it.label.toLowerCase().includes(ql) || (it.hint ?? "").toLowerCase().includes(ql);
  const hereItems = (here?.items ?? []).filter(match);
  const storeSections = STORE.map((s) => ({ ...s, items: s.items.filter(match) })).filter((s) => s.items.length);
  const journal = J.filter((e) => !ql || e.text.toLowerCase().includes(ql)).slice(0, 22);
  const firstItem = hereItems[0] ?? storeSections[0]?.items[0];
  const close = () => setPaletteOpen(false);
  const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))", gap: 7 };
  const secTitle: React.CSSProperties = { fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 1.4, padding: "2px 2px 6px" };
  const t = pulse?.totals;
  const chip = (v: any, l: string, tint: string, i: number) => (
    <span key={l} style={{ display: "inline-flex", alignItems: "baseline", gap: 5, padding: "3px 10px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.bg, animation: `storeRise .22s ${i * 0.04}s cubic-bezier(.2,.9,.3,1.2) backwards` }}>
      <span style={{ fontFamily: mono, fontSize: 11.5, fontWeight: 700, color: tint }}>{v}</span>
      <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>{l}</span>
    </span>
  );

  return (
    <>
      <style>{STUDIO_CSS + STORE_CSS}</style>
      <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", zIndex: 100 }} />
      <div role="dialog" aria-modal="true" aria-label="Command store"
        style={{ position: "fixed", top: "8vh", left: "50%", transform: "translateX(-50%)", width: 820, maxWidth: "94vw", maxHeight: "80vh", background: C.panel, border: `1px solid color-mix(in oklab, ${C.brand} 22%, ${C.border})`, borderRadius: 15, zIndex: 110, display: "flex", flexDirection: "column", boxShadow: "0 24px 70px -12px rgba(0,0,0,.7)", overflow: "hidden", animation: "storePop .2s cubic-bezier(.2,.9,.3,1.2) backwards" }}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && firstItem) { e.preventDefault(); close(); firstItem.run(); } }}
          placeholder="search everything — screens, features, the journal…"
          style={{ background: "transparent", border: "none", outline: "none", color: C.fg, padding: "14px 18px", fontSize: 14, fontFamily: "-apple-system, system-ui, sans-serif", borderBottom: `1px solid ${C.border}` }} />
        {t && !ql && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "9px 16px 0" }}>
            {chip(t.sessions ?? 0, "sessions", C.brand, 0)}
            {chip(t.active ?? 0, "active", C.ok, 1)}
            {chip(t.panes ?? 0, "agents", C.warn, 2)}
            {chip(t.calls ?? 0, "AI turns", C.brand, 3)}
            {chip(`$${Number(t.cost_usd ?? 0).toFixed(3)}`, "spend", C.ok, 4)}
            {chip((pulse?.notebooks ?? []).length, "notebooks", C.warn, 5)}
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
          <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 15 }}>
            {here && hereItems.length > 0 && (
              <div>
                <div style={{ ...secTitle, color: C.brand }}>⌖ here · {here.title}</div>
                <div style={grid}>
                  {hereItems.map((it, i) => <Tile key={`h${i}`} it={it} onDone={close} first={firstItem === it} i={i} />)}
                </div>
              </div>
            )}
            {storeSections.map((s) => (
              <div key={s.title}>
                <div style={secTitle}>{s.title}</div>
                <div style={grid}>
                  {s.items.map((it, i) => <Tile key={`${s.title}${i}`} it={it} onDone={close} first={firstItem === it} i={i} />)}
                </div>
              </div>
            ))}
            {!hereItems.length && !storeSections.length && (
              <div style={{ padding: 24, textAlign: "center", color: C.dim, fontFamily: mono, fontSize: 11 }}>nothing matches “{q}”</div>
            )}
          </div>
          {/* ⚡ RIGHT SIDEBAR — the ARTIFACT STORE (operator 2026-07-27: permanent shelf,
              .antiloki/sources/artefacts) on top, the journal below */}
          {(
            <div style={{ width: 230, flexShrink: 0, borderLeft: `1px solid ${C.border}`, overflowY: "auto", padding: "12px 12px", display: "flex", flexDirection: "column", gap: 8, background: C.bg }}>
              <div style={{ ...secTitle, color: C.brand }}>⛶ the artifact store</div>
              {arts.length === 0 && (
                <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, lineHeight: 1.6 }}>nothing shelved yet — finished podcasts, video casts and reads land in .antiloki/sources/artefacts and appear here.</span>
              )}
              {arts.length > 0 && (
                <>
                  {arts.filter((a2) => !ql || String(a2.title ?? "").toLowerCase().includes(ql) || String(a2.kind ?? "").toLowerCase().includes(ql)).slice(0, 14).map((a2) => {
                    const icon = a2.kind === "video-cast" ? "🎬" : a2.kind === "podcast" ? "⛶" : a2.kind === "chat-reply" ? "💬" : "♪";
                    const durS = Math.round((a2.duration_ms ?? 0) / 1000);
                    return (
                      <button key={a2.file} onClick={() => openArtefact(a2)}
                        title={`${a2.kind} · ${a2.file} — opens in ${a2.kind === "video-cast" ? "the video player" : "the corner player"}`}
                        style={{ display: "flex", gap: 7, alignItems: "flex-start", background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                        <span style={{ width: 17, height: 17, borderRadius: 5, flex: "none", display: "grid", placeItems: "center", fontSize: 9.5, marginTop: 1, background: `color-mix(in oklab, ${C.brand} 14%, transparent)`, color: C.brand }}>{icon}</span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", fontFamily: mono, fontSize: 7.5, color: C.dim }}>{String(a2.created_at ?? "").slice(5, 10)} · {Math.floor(durS / 60)}:{String(durS % 60).padStart(2, "0")} · {a2.kind}</span>
                          <span style={{ display: "block", fontFamily: mono, fontSize: 9, color: C.muted, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 178 }}>{a2.title}</span>
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
              <div style={{ height: 1, background: C.border, margin: "3px 0" }} />
              <div style={{ ...secTitle, color: C.warn }}>⚡ the journal</div>
              {journal.length === 0 && (
                <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, lineHeight: 1.6 }}>quiet so far — super-sessions and notebooks write themselves here.</span>
              )}
              {journal.length > 0 && <>
              {journal.map((e, i) => (
                <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", animation: `storeRise .2s ${Math.min(i, 16) * 0.03}s cubic-bezier(.2,.9,.3,1.2) backwards` }}>
                  <span style={{ width: 17, height: 17, borderRadius: 5, flex: "none", display: "grid", placeItems: "center", fontSize: 9.5, marginTop: 1, background: `color-mix(in oklab, ${e.tint} 14%, transparent)`, color: e.tint }}>{e.icon}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: mono, fontSize: 7.5, color: C.dim }}>{dayLabel(e.ts)}</span>
                    <span style={{ display: "block", fontFamily: mono, fontSize: 9, color: C.muted, lineHeight: 1.5 }}>{e.text}</span>
                  </span>
                </div>
              ))}
              </>}
            </div>
          )}
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "7px 14px", fontFamily: mono, fontSize: 9, color: C.dim, display: "flex", gap: 14 }}>
          <span>⏎ first result</span><span>esc close</span><span style={{ flex: 1 }} /><span>\ chat drawer</span>
        </div>
      </div>
    </>
  );
}
