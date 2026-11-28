// DATA STORIES as a first-class tab (operator 2026-07-23: "make data stories be a tab of the
// graph, make it relevant, they are telling a story"): each story is the FULL PATH OF THE DATA —
// entry → every file it crosses → death point. Three ways to read it, all deterministic ($0):
//   · timeline — the narrative rail, hop by hop, with ▶ play
//   · graph    — the WHOLE atlas with every other file greyed; only the story's files colored +
//                the journey animated (operator: "all other files are grey and just the files on
//                the story are colored and focused")
//   · diagram  — the same greying as boxes/arrows: the story spine colored, its neighborhood grey
// Propose is deterministic + instant (the BE walks the real import/call graph); forward AND
// backward both work. Click any file → open it in the reader.
import React from "react";
import { C, mono } from "@/loki/theme";
import {
  storyList, storyGet, storyAdd, storyDelete, storyPropose,
  type StoryListItem, type StoryProposal, type DataStory, type AtlasResponse,
} from "@/loki/api/codebase";
import { AtlasGraphMini, layoutDiagram, roleOfPath, DIAG_ROLE } from "./atlas-graph";
import { askEngine, type TemplateAsk } from "@/loki/api/engine";

// AI-SCRAPED STORIES (operator 2026-09-19: "deterministic works, but also a button to AI-scrape more data
// stories e2e inside the code"): the engine reads the code and proposes end-to-end journeys — entry →
// every file the data crosses → where it dies — as JSON; each hop's path is resolved to an atlas node,
// hops the atlas does not know are dropped, a story keeps ≥ 2 resolved hops. Pure around the one call.
/** the AI scrape's catalog call (template `xray.data_stories` on the serve — Settings › Prompts edits the text): the known files and the stories already saved */
export const storyAsk = (known: string[], have: string[]): TemplateAsk => ({
  template: "xray.data_stories",
  vars: { known: known.length ? `${known.slice(0, 400).join(", ")}${known.length > 400 ? ", …" : ""}` : "", have: have.join("; ") },
});
export function scrapedToProposals(j: any, pathToId: Map<string, string>): { proposals: StoryProposal[]; dropped: number } {
  const arr: any[] = Array.isArray(j?.stories) ? j.stories : Array.isArray(j) ? j : [];
  let dropped = 0;
  const proposals: StoryProposal[] = [];
  for (const s of arr) {
    if (!s || typeof s.name !== "string" || !Array.isArray(s.hops)) continue;
    const hops = s.hops.map((h: any) => { const p = String(h?.path ?? "").replace(/^\.\//, ""); const id = pathToId.get(p); if (!id) { dropped += 1; return null; } return { node_id: id, label: typeof h?.label === "string" ? h.label.slice(0, 120) : undefined }; }).filter(Boolean) as { node_id: string; label?: string }[];
    if (hops.length < 2) continue;
    proposals.push({ name: String(s.name).slice(0, 80), description: String(s.description ?? "").slice(0, 300), direction: s.direction === "backward" ? "backward" : "forward", hops });
  }
  return { proposals, dropped };
}

const baseName = (p: string) => String(p ?? "").split(/[/\\]/).filter(Boolean).pop() || String(p);
const btn: React.CSSProperties = { fontFamily: mono, fontSize: 9.5, padding: "2px 8px", borderRadius: 5, cursor: "pointer", background: "transparent", border: `1px solid ${C.border}`, color: C.muted };

type Dir = "forward" | "backward";

// one hop row of the timeline: rail + dot, the file, its role in the story.
function HopRow({ hop, i, n, dir, active, done, onOpen }: { hop: any; i: number; n: number; dir: Dir; active: boolean; done: boolean; onOpen?: (path: string) => void }) {
  const path = hop.meta?.path ?? hop.__path ?? hop.node_id?.replace(/@\w+$/, "") ?? "";
  const broken = hop.edge_ok === false;
  const first = i === 0, last = i === n - 1;
  const dotColor = broken ? C.bad : active ? C.brand : done ? C.ok : C.dim;
  const label = String(hop.label ?? "");
  const role = label.includes(" — ") ? label.slice(label.indexOf(" — ") + 3) : label || (first ? "the flow starts here" : last ? "the data lands here" : "passes through");
  // badges honor DIRECTION (forward: entry→death; backward: origin→surface).
  const startBadge = dir === "forward" ? { t: "ENTRY", c: C.ok } : { t: "DATA ORIGIN", c: C.warn };
  const endBadge = dir === "forward" ? { t: "DEATH POINT", c: C.warn } : { t: "SURFACE", c: C.ok };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "18px 1fr", columnGap: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: 2, flex: 1, minHeight: 4, background: first ? "transparent" : (broken ? C.bad : done || active ? C.ok : C.border) }} />
        <div style={{ width: active ? 11 : 8, height: active ? 11 : 8, borderRadius: 11, background: dotColor, flexShrink: 0, transition: "all 200ms", boxShadow: active ? `0 0 8px ${C.brand}` : "none" }} />
        <div style={{ width: 2, flex: 1, minHeight: 4, background: last ? "transparent" : C.border }} />
      </div>
      <div onClick={() => path && onOpen?.(path)} style={{ padding: "3px 0 7px", cursor: path ? "pointer" : "default", opacity: done || active || broken ? 1 : 0.55, transition: "opacity 200ms" }}
        title={path ? `${path} — click to open in the reader` : undefined}>
        <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, minWidth: 14 }}>{i + 1}</span>
          <code style={{ fontFamily: mono, fontSize: 10.5, color: active ? C.brand : C.fg, fontWeight: active ? 700 : 400 }}>{baseName(path) || hop.node_id}</code>
          {first && <span style={{ fontFamily: mono, fontSize: 7.5, color: startBadge.c, border: `1px solid ${startBadge.c}`, borderRadius: 8, padding: "0 4px" }}>{startBadge.t}</span>}
          {last && !broken && <span style={{ fontFamily: mono, fontSize: 7.5, color: endBadge.c, border: `1px solid ${endBadge.c}`, borderRadius: 8, padding: "0 4px" }}>{endBadge.t}</span>}
          {broken && <span style={{ fontFamily: mono, fontSize: 7.5, color: C.bad, border: `1px solid ${C.bad}`, borderRadius: 8, padding: "0 4px" }}>BROKEN — no edge connects this hop anymore</span>}
        </div>
        <div style={{ fontFamily: mono, fontSize: 9, color: broken ? C.bad : C.dim, paddingLeft: 20, lineHeight: 1.5 }}>{role}</div>
        {path && <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, paddingLeft: 20, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path}</div>}
      </div>
    </div>
  );
}

// ── STORY DIAGRAM — boxes+arrows: the spine role-colored & numbered, its import-neighborhood grey.
// The layered layout engine (shared with DiagramView) positions everyone by import direction; the
// journey itself is drawn as bold arrows in HOP order (so backward reads db→…→surface).
function StoryDiagram({ atlas, storyPaths, onOpen, maxH = 560 }: { atlas: AtlasResponse; storyPaths: string[]; onOpen?: (path: string) => void; maxH?: number }) {
  const lay = React.useMemo(() => {
    const storySet = new Set(storyPaths);
    const idToPath = new Map(atlas.nodes.map((n) => [n.id, n.path]));
    // file-level import adjacency
    const importsOf = new Map<string, Set<string>>();
    const importersOf = new Map<string, Set<string>>();
    for (const e of atlas.edges) {
      if (e.type !== "imports") continue;
      const a = idToPath.get(e.from_node), b = idToPath.get(e.to_node);
      if (!a || !b || a === b) continue;
      (importsOf.get(a) ?? importsOf.set(a, new Set()).get(a)!).add(b);
      (importersOf.get(b) ?? importersOf.set(b, new Set()).get(b)!).add(a);
    }
    // grey neighborhood: each spine file's direct importers + imports, capped so the diagram stays legible.
    const neighbors: string[] = [];
    const nseen = new Set(storySet);
    for (const p of storyPaths) {
      for (const q of [...(importersOf.get(p) ?? []), ...(importsOf.get(p) ?? [])]) {
        if (!nseen.has(q)) { nseen.add(q); neighbors.push(q); if (neighbors.length >= 26) break; }
      }
      if (neighbors.length >= 26) break;
    }
    const union = [...storyPaths, ...neighbors];
    const unionSet = new Set(union);
    const hopIndex = new Map(storyPaths.map((p, i) => [p, i]));
    const nodes = union.map((p) => ({ id: p, label: baseName(p), role: roleOfPath(p), file: p, story: storySet.has(p), hop: hopIndex.get(p) ?? -1 }));
    const edges: { from: string; to: string }[] = [];
    const eseen = new Set<string>();
    for (const [a, bs] of importsOf) { if (!unionSet.has(a)) continue; for (const b of bs) { if (!unionSet.has(b)) continue; const k = a + "" + b; if (!eseen.has(k)) { eseen.add(k); edges.push({ from: a, to: b }); } } }
    const { pos, W, H } = layoutDiagram(nodes, edges, false);
    // the spine, in hop order, as (from,to) path segments
    const spine: { a: string; b: string }[] = [];
    for (let i = 1; i < storyPaths.length; i++) spine.push({ a: storyPaths[i - 1], b: storyPaths[i] });
    return { nodes, pos, W, H, spine };
  }, [atlas, storyPaths]);

  if (!storyPaths.length) return null;
  const { nodes, pos, W, H, spine } = lay;
  const ctr = (id: string) => { const p = pos.get(id); return p ? { x: p.x + p.w / 2, y: p.y + p.h / 2, w: p.w, h: p.h, x0: p.x, y0: p.y } : null; };
  return (
    <div style={{ width: "100%", overflow: "auto" }}>
      <svg viewBox={`-8 -8 ${W + 16} ${H + 16}`} width="100%" style={{ display: "block", minHeight: 260, maxHeight: maxH }} preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id="sd-grey" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill={C.dim} /></marker>
          <marker id="sd-spine" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill={C.brand} /></marker>
        </defs>
        {/* grey neighborhood import edges */}
        {(() => {
          const idToPath = new Map(atlas.nodes.map((nd) => [nd.id, nd.path]));
          const drawn: React.ReactNode[] = [];
          const posSet = new Set(nodes.map((n) => n.id));
          let k = 0;
          for (const e of atlas.edges) {
            if (e.type !== "imports") continue;
            const a = idToPath.get(e.from_node), b = idToPath.get(e.to_node);
            if (!a || !b || !posSet.has(a) || !posSet.has(b) || a === b) continue;
            const ca = ctr(a), cb = ctr(b); if (!ca || !cb) continue;
            drawn.push(<line key={"ge" + k++} x1={ca.x0 + ca.w} y1={ca.y} x2={cb.x0} y2={cb.y} stroke={C.dim} strokeWidth={0.7} opacity={0.28} markerEnd="url(#sd-grey)" />);
            if (drawn.length > 200) break;
          }
          return drawn;
        })()}
        {/* the STORY SPINE — bold brand arrows in hop order */}
        {spine.map((s, i) => { const a = ctr(s.a), b = ctr(s.b); if (!a || !b) return null;
          return <line key={"sp" + i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={C.brand} strokeWidth={2.2} opacity={0.92} markerEnd="url(#sd-spine)" />; })}
        {/* nodes */}
        {nodes.map((n) => { const p = pos.get(n.id); if (!p) return null;
          const col = DIAG_ROLE[n.role] ?? DIAG_ROLE.logic;
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`} style={{ cursor: "pointer" }} onClick={() => onOpen?.(n.id)}
              opacity={n.story ? 1 : 0.34}>
              <rect width={p.w} height={p.h} rx={9}
                fill={n.story ? `color-mix(in oklab, ${col} 16%, ${C.panel})` : C.panel}
                stroke={n.story ? col : C.border} strokeWidth={n.story ? 1.6 : 1} />
              {n.story && n.hop >= 0 && <circle cx={12} cy={12} r={7} fill={C.brand} />}
              {n.story && n.hop >= 0 && <text x={12} y={15} textAnchor="middle" fontFamily={mono} fontSize={8} fontWeight={700} fill={C.bg}>{n.hop + 1}</text>}
              <text x={p.w / 2} y={p.h / 2 - 1} textAnchor="middle" fontFamily={mono} fontSize={10} fontWeight={n.story ? 600 : 400} fill={n.story ? C.fg : C.muted}>{String(n.label).slice(0, 18)}</text>
              <text x={p.w / 2} y={p.h / 2 + 12} textAnchor="middle" fontFamily={mono} fontSize={7.5} fill={n.story ? col : C.dim} opacity={0.85}>{n.role}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function DataStoriesPanel({ atlas, onOpen }: { atlas?: AtlasResponse | null; onOpen?: (path: string) => void }) {
  const [stories, setStories] = React.useState<StoryListItem[]>([]);
  const [proposals, setProposals] = React.useState<StoryProposal[] | null>(null);
  const [active, setActive] = React.useState<DataStory | null>(null);
  const [activeProposal, setActiveProposal] = React.useState<StoryProposal | null>(null);
  const [dir, setDir] = React.useState<Dir>("forward");
  const [view, setView] = React.useState<"timeline" | "graph" | "diagram">("timeline");
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [step, setStep] = React.useState(-1);        // ▶ play cursor (-1 = all revealed)
  const [playing, setPlaying] = React.useState(false);
  const timerRef = React.useRef<any>(null);

  const [fullH, setFullH] = React.useState(600); // graph/diagram open FULLSCREEN (operator 2026-07-23)

  const load = React.useCallback(async () => { const r = await storyList(); if (r) setStories(r.stories); }, []);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);
  // fullscreen sizing + Esc-to-close while a visual view is open
  React.useEffect(() => {
    if (view !== "graph" && view !== "diagram") return;
    const upd = () => setFullH(Math.max(420, window.innerHeight - 64));
    upd(); window.addEventListener("resize", upd);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setView("timeline"); };
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("resize", upd); window.removeEventListener("keydown", esc); };
  }, [view]);

  const idToPath = React.useMemo(() => new Map((atlas?.nodes ?? []).map((n) => [n.id, n.path])), [atlas]);
  const activeDir: Dir = (activeProposal?.direction as Dir) ?? active?.direction ?? dir;
  // the active hops, each resolved to a file path (proposals lack meta.path → resolve via the atlas).
  const hops: any[] = React.useMemo(() => {
    const raw = activeProposal?.hops ?? active?.hops ?? [];
    return raw.map((h: any) => ({ ...h, __path: h.meta?.path ?? idToPath.get(h.node_id) ?? null }));
  }, [activeProposal, active, idToPath]);
  const storyPaths = React.useMemo(() => hops.map((h) => h.__path).filter((p): p is string => !!p), [hops]);

  function stopPlay() { if (timerRef.current) clearInterval(timerRef.current); setPlaying(false); }
  function play() {
    stopPlay();
    if (hops.length < 2) { setStep(-1); return; }
    setStep(0); setPlaying(true);
    let s = 0;
    timerRef.current = setInterval(() => {
      s += 1;
      if (s >= hops.length) { clearInterval(timerRef.current); setPlaying(false); setStep(-1); return; }
      setStep(s);
    }, 650);
  }

  async function propose(direction: Dir) {
    setDir(direction);
    // clear the open view so a direction switch visibly resets (operator: "backward isn't working")
    setActive(null); setActiveProposal(null); setStep(-1); stopPlay();
    setBusy(true); setErr(null); setNote(null); setProposals(null);
    const r = await storyPropose({ direction, limit: 6 });
    setBusy(false);
    if (!r) { setErr("propose failed — is the BE running?"); return; }
    setProposals(r.proposals ?? []);
    if (r.error) setErr(r.error);
    else if (r.note) setNote(r.note);
  }
  const [aiNote, setAiNote] = React.useState<string | null>(null);
  async function scrape() {
    setBusy(true); setErr(null); setNote(null); setAiNote("◆ the engine is reading the code for journeys… (a minute or two)");
    const files = (atlas?.nodes ?? []).filter((n) => n.type === "file").map((n) => n.path);
    const pathToId = new Map((atlas?.nodes ?? []).filter((n) => n.type === "file").map((n) => [n.path, n.id] as [string, string]));
    const r = await askEngine(storyAsk(files, stories.map((s) => s.name)), { json: true, timeoutMs: 600_000, maxTurns: 40 });
    setBusy(false);
    if (!r.ok) { setAiNote(null); setErr(`AI scrape failed — ${r.error}`); return; }
    const { proposals: found, dropped } = scrapedToProposals(r.json, pathToId);
    setProposals((ps) => [...found, ...(ps ?? [])]);
    setAiNote(`◆ ${found.length} AI-scraped stor${found.length === 1 ? "y" : "ies"} added to the journeys${dropped ? ` · ${dropped} hop${dropped === 1 ? "" : "s"} the atlas does not know were dropped` : ""} — ＋ save the ones worth keeping`);
  }
  async function openStory(id: number) {
    setActiveProposal(null); setStep(-1); stopPlay();
    const s = await storyGet({ id });
    if (s) { setActive(s); setTimeout(play, 40); }
  }
  function openProposal(p: StoryProposal) {
    setActive(null); setActiveProposal(p); setStep(-1); stopPlay();
    setTimeout(play, 40);
  }
  async function saveProposal(p: StoryProposal) {
    const r = await storyAdd({ name: p.name, description: p.description, direction: p.direction, hops: p.hops });
    if (r) { await load(); setProposals((ps) => ps?.filter((x) => x !== p) ?? null); }
  }
  async function removeStory(id: number) { await storyDelete({ id }); if (active?.id === id) setActive(null); await load(); }

  const hasStory = hops.length > 0;
  const graphHi = React.useMemo(() => Object.fromEntries(storyPaths.map((p) => [p, "touched"])), [storyPaths]);
  const graphFlow = React.useMemo(() => storyPaths.map((p) => ({ path: p })), [storyPaths]);

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "8px 12px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>data stories</span>
        <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>the FULL path of the data — entry → every file it crosses → death point. Computed from the real graph, $0.</span>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <button style={{ ...btn, color: dir === "forward" ? C.brand : C.muted, borderColor: dir === "forward" ? `color-mix(in oklab, ${C.brand} 45%, ${C.border})` : C.border }} disabled={busy} onClick={() => void propose("forward")} title="entry → death point (deterministic, instant)">{busy && dir === "forward" ? "computing…" : "⇢ forward"}</button>
        <button style={{ ...btn, color: dir === "backward" ? C.brand : C.muted, borderColor: dir === "backward" ? `color-mix(in oklab, ${C.brand} 45%, ${C.border})` : C.border }} disabled={busy} onClick={() => void propose("backward")} title="death point → surface (reversed walk over the same graph)">{busy && dir === "backward" ? "computing…" : "⇠ backward"}</button>
        <button data-testid="stories-ai-scrape" style={{ ...btn, color: C.brand, borderColor: `color-mix(in oklab, ${C.brand} 45%, ${C.border})` }} disabled={busy || !atlas} onClick={() => void scrape()} title="your subscription engine reads the code and proposes end-to-end journeys the graph alone cannot see (a minute or two)">◆ AI: scrape more stories</button>
        {hasStory && (
          <>
            <span style={{ width: 1, height: 14, background: C.border, margin: "0 2px" }} />
            {(["timeline", "graph", "diagram"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} disabled={(v !== "timeline") && !atlas}
                title={v === "graph" ? "the whole atlas, story files colored, the rest grey" : v === "diagram" ? "boxes + arrows: the story spine colored, its neighborhood grey" : "the narrative rail, hop by hop"}
                style={{ ...btn, color: view === v ? C.brand : C.muted, borderColor: view === v ? C.brand : C.border, opacity: (v !== "timeline" && !atlas) ? 0.4 : 1 }}>{v}</button>
            ))}
            {view === "timeline" && <button style={{ ...btn, color: playing ? C.ok : C.muted }} onClick={() => (playing ? stopPlay() : play())}>{playing ? "◼ stop" : "▶ play"}</button>}
          </>
        )}
      </div>

      {err && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.bad, marginBottom: 6, wordBreak: "break-all" }}>✗ {err}</div>}
      {note && <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, marginBottom: 6 }}>◆ {note}</div>}
      {aiNote && <div data-testid="stories-ai-note" style={{ fontFamily: mono, fontSize: 9, color: C.brand, marginBottom: 6 }}>{aiNote}</div>}

      {/* TWO EQUAL COLUMNS (operator 2026-09-18): the journeys on the left (computed | saved, side by side), the story on the right */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
        {/* LEFT — proposals + the saved shelf */}
        <div style={{ display: "grid", gridTemplateColumns: proposals && proposals.length > 0 ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)", gap: 12, alignItems: "start" }}>
          {proposals && proposals.length > 0 && (
            <div>
              <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>computed journeys ({dir})</div>
              {proposals.map((p, i) => (
                <div key={i} style={{ padding: "3px 0", borderBottom: `1px solid color-mix(in oklab, ${C.border} 40%, transparent)` }}>
                  <div onClick={() => openProposal(p)} style={{ cursor: "pointer" }}>
                    <div style={{ fontFamily: mono, fontSize: 10, color: activeProposal === p ? C.brand : C.fg }}>{p.name}</div>
                    <div style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>{p.hops.length} hops · {p.direction}</div>
                  </div>
                  <button style={{ ...btn, fontSize: 8, padding: "0 6px", marginTop: 2 }} onClick={() => void saveProposal(p)}>＋ save</button>
                </div>
              ))}
            </div>
          )}
          <div>
          {proposals && proposals.length === 0 && !busy && <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, marginBottom: 8 }}>no {dir} path found — the graph may lack {dir === "forward" ? "route/ui seeds" : "data sinks"}</div>}
          <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>saved stories ({stories.length})</div>
          {stories.length === 0 && <div style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>none yet — propose, then ＋ save the journeys worth keeping</div>}
          {stories.map((s) => (
            <div key={s.id} style={{ display: "flex", gap: 4, alignItems: "baseline", padding: "2px 0" }}>
              <div onClick={() => void openStory(s.id)} style={{ cursor: "pointer", flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: mono, fontSize: 10, color: active?.id === s.id ? C.brand : C.fg }}>{s.direction === "backward" ? "⇠ " : "⇢ "}{s.name}</span>
                <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}> · {s.hop_count} hops</span>
              </div>
              <button style={{ ...btn, fontSize: 8, padding: "0 5px", border: "none", color: C.dim }} title="delete" onClick={() => void removeStory(s.id)}>✕</button>
            </div>
          ))}
          </div>
        </div>

        {/* RIGHT — the story itself, in the selected view */}
        <div style={{ minWidth: 0 }}>
          {!hasStory ? (
            <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, padding: "18px 8px", lineHeight: 1.7 }}>
              ⇢ propose to compute the journeys, then click one — the story shows as a timeline, on the graph (rest greyed), or as a diagram:<br />
              <span style={{ color: C.dim }}>where the data enters, every file it crosses, where it dies. Broken hops (the code no longer connects) show red.</span>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 6, flexWrap: "wrap" }}>
                <b style={{ fontFamily: mono, fontSize: 11, color: C.fg }}>{activeProposal?.name ?? active?.name}</b>
                <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>{hops.length} hops · {activeDir}</span>
                {active && active.status === "broken" && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.bad }}>⚠ {active.broken} broken hop{active.broken === 1 ? "" : "s"} — the story no longer holds end-to-end</span>}
                {active && active.status === "ok" && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.ok }}>✓ verified against the live graph</span>}
              </div>
              {(activeProposal?.description || active?.description) && <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, marginBottom: 8 }}>{activeProposal?.description ?? active?.description}</div>}

              {view === "timeline" && hops.map((h, i) => (
                <HopRow key={i} hop={h} i={i} n={hops.length} dir={activeDir} onOpen={onOpen}
                  active={step === i} done={step === -1 || i < step} />
              ))}
              {/* graph + diagram open FULLSCREEN (overlay below) — the inline pane just notes it */}
              {(view === "graph" || view === "diagram") && (
                <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, padding: "10px 2px" }}>
                  {storyPaths.length === 0
                    ? "this story's files aren't in the current atlas — rebuild, or view it as a timeline."
                    : <>opened fullscreen — press <b style={{ color: C.muted }}>Esc</b> or ✕ to close.</>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* FULLSCREEN graph / diagram (operator 2026-07-23: "graph and diagram should open full screen") */}
      {(view === "graph" || view === "diagram") && atlas && hasStory && storyPaths.length > 0 && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: C.bg, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: mono, fontSize: 11, color: C.fg, fontWeight: 600 }}>{activeProposal?.name ?? active?.name}</span>
            <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{hops.length} hops · {activeDir} · story files colored, the rest grey</span>
            <span style={{ flex: 1 }} />
            {(["graph", "diagram"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} style={{ ...btn, color: view === v ? C.brand : C.muted, borderColor: view === v ? C.brand : C.border }}>{v}</button>
            ))}
            <button onClick={() => setView("timeline")} title="close (Esc)" style={{ ...btn, color: C.fg }}>✕ close</button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: view === "diagram" ? 12 : 0 }}>
            {view === "graph"
              ? <AtlasGraphMini key={storyPaths.join(">")} atlas={atlas} height={fullH} highlight={graphHi} flow={graphFlow} onPick={(id) => onOpen?.(idToPath.get(id) ?? id)} />
              : <StoryDiagram atlas={atlas} storyPaths={storyPaths} onOpen={onOpen} maxH={fullH} />}
          </div>
        </div>
      )}
    </div>
  );
}
