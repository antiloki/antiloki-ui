// SHAPE TREE — the shape pane reborn (operator 2026-07-15: "the first node is
// the ARTIFACT of the plan from the brainstorm · branches with CIRCLES as
// nodes · each branch a dimension · microtasks · alternatives with
// justifications to choose the path · shared context as a branch · round
// lines · navigate like a canvas · phases written like excalidraw pointing at
// nodes · this is an RFC generator · design is a major concern").
//
// Anatomy: ROOT (the base-plan artifact) → dimension BRANCHES (tinted) →
// microtask NODES (circles; ⑂ badge = a real choice pending; ring = path
// chosen) + the CONTEXT branch (shared docs + your own). Pan by dragging the
// void, zoom with the wheel. Selecting anything opens the editor rail.
// 📜 presses the complete RFC as a session context doc.
import * as React from "react";
import { apiPost, unwrapResult as unwrap } from "@/loki/api/client";
import { C, mono, nav } from "@/loki/theme";
import { readSessionBasePlan, writeSessionBasePlan, collectionOf, BrainstormWizard } from "./cockpit-panes-tools";
import { growShapeTree, uid, type Alt, type TNode, type TBranch, type Tree } from "./shape-grow";
import { startBlockDrag } from "@/loki/widgets/agent-interact";
import { reportScreenState, clearScreenState } from "@/loki/chat/screen-manifest";

const serif = "Georgia, 'Iowan Old Style', serif";

const TINTS = ["oklch(0.72 0.14 250)", "oklch(0.72 0.13 160)", "oklch(0.76 0.13 80)", "oklch(0.72 0.13 310)", "oklch(0.74 0.12 200)", "oklch(0.72 0.13 20)"];
const tintOf = (i: number) => TINTS[i % TINTS.length];
// phases read across the branches — give them their OWN warm ramp so a phase
// badge never reads as a branch tint (operator: "the phased lines are messy").
const PHASE_TINT = ["oklch(0.80 0.15 45)", "oklch(0.82 0.14 95)", "oklch(0.76 0.15 340)", "oklch(0.74 0.14 285)", "oklch(0.78 0.14 135)", "oklch(0.80 0.15 20)"];
const phaseTint = (i: number) => PHASE_TINT[i % PHASE_TINT.length];

// node TYPE ↔ dimension: a glyph symbolising the branch a microtask lives in
// (operator 2026-07-15: "a pretty icon that symbolizes the type of node").
const DIM_ICON: Record<string, string> = {
  product: "📦", feature: "✨", features: "✨", business: "💼", market: "📈",
  growth: "🌱", ux: "🎨", design: "🎨", ui: "🖼", code: "💻", eng: "💻",
  arch: "🏛", architecture: "🏛", data: "🗄", db: "🗄", api: "🔌",
  test: "🧪", tests: "🧪", qa: "🧪", risk: "⚠", security: "🔒", auth: "🔒",
  perf: "⚡", performance: "⚡", ops: "🛠", infra: "☁", devops: "🛠",
  content: "📝", docs: "📚", context: "📎", integration: "🔗", ai: "🧠",
};
const iconOf = (key: string) => DIM_ICON[String(key ?? "").toLowerCase()] ?? "◆";
// blast radius bucket → [label, colour] from a derived score
const blastBucket = (score: number): [string, string] =>
  score >= 16 ? ["systemic", C.bad] : score >= 9 ? ["wide", C.warn] : score >= 4 ? ["moderate", "oklch(0.80 0.13 90)"] : ["contained", C.ok];

// one control-center stat tile
function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 7px", display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontFamily: mono, fontSize: 7, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: tone ?? C.fg }}>{value}</span>
    </div>
  );
}

// ── deterministic tidy layout: root left, branch bands stacked right ────────
const NODE_GAP = 64; const BAND_PAD = 44; const TOP_PAD = 96;
function layout(tree: Tree) {
  const branches = [...tree.branches, { key: "context", title: "the context", nodes: tree.context } as TBranch];
  const bands = branches.map((b) => Math.max(b.nodes.length * NODE_GAP, 92));
  const worldH = Math.max(bands.reduce((a, b) => a + b + BAND_PAD, TOP_PAD + 60), 560);
  const worldW = 1080;
  let y = TOP_PAD;
  const hubs = branches.map((b, i) => {
    const band = bands[i];
    const hub = { b, i, x: 330, y: y + band / 2, nodes: b.nodes.map((n, j) => ({ n, x: 600 + (j % 2) * 84, y: y + NODE_GAP / 2 + j * NODE_GAP + 6 })) };
    y += band + BAND_PAD;
    return hub;
  });
  return { root: { x: 104, y: worldH / 2 }, hubs, worldW, worldH };
}
const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = Math.max(46, (x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
};

export function ShapeTreePane({ p, panes, sessionId, onChanged, onRfc }: { p: any; panes: any[]; sessionId: number; onChanged: () => void; onRfc?: (title: string, body_md: string) => void }) {
  const [tree, setTree] = React.useState<Tree | null>(null);
  const [rowId, setRowId] = React.useState<number | null>(null);
  const [legacyItems, setLegacyItems] = React.useState(0);
  const [sel, setSel] = React.useState<string | null>(null); // 'root' | branch key | node id
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const [seed, setSeed] = React.useState("");
  const [toast, setToast] = React.useState("");
  const [artifact, setArtifact] = React.useState("");
  const [wizOpen, setWizOpen] = React.useState(false);
  const [hoverNode, setHoverNode] = React.useState<string | null>(null); // the node showing ±
  const [hlPhase, setHlPhase] = React.useState<number | null>(null); // a hovered phase pill lights its members
  const [newFile, setNewFile] = React.useState(""); // the files-affected input in the control center
  const [view, setView] = React.useState({ tx: 0, ty: 0, s: 0.9 });
  const panRef = React.useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const saveTimer = React.useRef<any>(null);

  // the base-plan ARTIFACT arrives DIRECTLY from the brainstorm — a session
  // baseplan doc (no decision pane, no paste box in a collection)
  const inCollection = !!collectionOf(p);

  const load = React.useCallback(async () => {
    const bp = await readSessionBasePlan(sessionId);
    if (bp?.md) setArtifact(bp.md);
    const d = unwrap(await apiPost("/api/v1/cockpit/blackboard/read", { session_id: sessionId, pane_id: p.id }, { timeoutMs: 30000 }).catch(() => null));
    const mine: any[] = d?.scratch ?? [];
    const shapeRow = [...mine].reverse().find((r: any) => r.kind === "shape");
    if (shapeRow) {
      try { const v = JSON.parse(shapeRow.body_md); if (v?.branches) { setTree(v); setRowId(shapeRow.id); } } catch { /* corrupt row — regrow */ }
    }
    const planRow = [...mine].reverse().find((r: any) => r.kind === "plan");
    if (planRow) { try { setLegacyItems((JSON.parse(planRow.body_md)?.phases ?? []).reduce((a: number, ph: any) => a + (ph.items?.length ?? 0), 0)); } catch { /* */ } }
  }, [sessionId, p.id]);
  React.useEffect(() => { void load(); }, [load]);
  // the intent ✨ forge hands off here (operator 2026-07-15: "go to shape and
  // it should already be growing") — take the artifact instantly, no poll wait
  React.useEffect(() => {
    const h = (e: any) => { if (e?.detail?.sessionId === sessionId) { if (e.detail.artifact) setArtifact(String(e.detail.artifact)); else void load(); } };
    window.addEventListener("antiloki:baseplan", h as any);
    return () => window.removeEventListener("antiloki:baseplan", h as any);
  }, [sessionId, load]);
  // the ⚖ judge tribunal applies its proposed edits onto this tree — reload the
  // shape row so the change appears live (operator 2026-07-16)
  React.useEffect(() => {
    const h = (e: any) => { if (e?.detail?.sessionId === sessionId) void load(); };
    window.addEventListener("antiloki:shape-reload", h as any);
    return () => window.removeEventListener("antiloki:shape-reload", h as any);
  }, [sessionId, load]);
  // AUTO-GROW when a fresh artifact arrives (a forge) — no click. Re-forging a
  // NEW artifact re-grows; the same one never re-grows (autoGrownFor guard).
  const autoGrownFor = React.useRef<string>("");
  React.useEffect(() => {
    const a = artifact.trim();
    if (!a || busy) return;
    if (tree?.planted) return; // a hand-planted tree is yours — an arriving base plan never regrows over it
    const grownFrom = (tree?.artifact_md ?? "").trim();
    if (a === grownFrom || autoGrownFor.current === a) return;
    autoGrownFor.current = a;
    void grow(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact, tree]);
  // while there's no tree yet, poll the base-plan channel so a forge from
  // elsewhere still arrives. Stops once a tree exists (never clobbers edits).
  React.useEffect(() => {
    if (tree) return;
    const t = setInterval(() => { void load(); }, 4000);
    return () => clearInterval(t);
  }, [tree, load]);

  // SCREEN MANIFEST: the drawer describes its tree to the chat whenever it changes
  React.useEffect(() => {
    const uid = `rfc-${p.id}`;
    if (!tree) { clearScreenState(uid); return () => clearScreenState(uid); }
    const nodes = tree.branches.reduce((a, b) => a + b.nodes.length, 0) + tree.context.length;
    const open = tree.branches.reduce((a, b) => a + b.nodes.filter((n) => n.alts.length > 0 && n.chosen == null).length, 0);
    reportScreenState(uid, `RFC drawer "${tree.title}" — ${tree.branches.length} branch${tree.branches.length === 1 ? "" : "es"} · ${nodes} nodes · ${open ? `⚠ ${open} unresolved path${open === 1 ? "" : "s"}` : "all paths chosen"}`);
    return () => clearScreenState(uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, p.id]);
  const persist = (next: Tree) => {
    setTree(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const body = JSON.stringify(next).slice(0, 19500);
      if (rowId) await apiPost("/api/v1/cockpit/blackboard/post", { op: "update", id: rowId, body_md: body }, { timeoutMs: 20000 }).catch(() => null);
      else {
        const r = unwrap(await apiPost("/api/v1/cockpit/blackboard/post", { session_id: sessionId, pane_id: p.id, kind: "shape", body_md: body }, { timeoutMs: 20000 }).catch(() => null));
        if (r?.id) setRowId(r.id);
      }
    }, 800);
  };

  const grow = async (art?: string) => {
    const a = (art ?? artifact.trim() ?? seed.trim() ?? "").trim() || artifact.trim() || seed.trim();
    if (!a) { setErr(inCollection ? "no artifact yet — run ✨ brainstorm on the intent pane" : "no plan yet — 🧠 brainstorm or paste one below"); return; }
    if (busy) return;
    setBusy("grow"); setErr("");
    const res = await growShapeTree(sessionId, p.id, a);
    if (res.ok && res.tree) { setTree(res.tree); if (res.rowId) setRowId(res.rowId); setSel("root"); }
    else setErr(res.error ?? "the tree did not grow");
    setBusy("");
  };
  // the shape hosts the brainstorm itself (standalone): forge writes the
  // artifact; the auto-grow effect grows the tree (no extra click, no double)
  const onForged = async (r: { base_plan_md: string; cards: any[] }) => {
    const md = r.base_plan_md || seed.trim();
    await writeSessionBasePlan(sessionId, md);
    setArtifact(md); setWizOpen(false); setToast("🧠 forged — 🌱 growing the tree…"); onChanged();
  };
  // PLANT YOURSELF (operator 2026-07-26: "grow directly is making a template — I don't want that"):
  // NO generation of any kind. An empty tree — just the root — and you branch by hand from there.
  const plant = () => {
    if (busy) return;
    const a = seed.trim();
    const t: Tree = { title: (a.split("\n")[0] || "the plan").slice(0, 90), artifact_md: a || "planted by hand — the plan grows on the canvas.", branches: [], context: [], phases: [], planted: true };
    persist(t); setSel(null); setToast("🌱 planted — ＋ branch to start shaping");
  };
  const addBranch = () => {
    if (!tree) return;
    const key = uid();
    const fresh: TNode = { id: uid(), title: "new microtask", detail: "", alts: [], chosen: null };
    persist({ ...tree, branches: [...tree.branches, { key, title: `branch ${tree.branches.length + 1}`, nodes: [fresh] }] });
    setSel(key);
  };

  // ── the RFC: the tree pressed into complete documentation ─────────────────
  const pressRfc = async () => {
    if (!tree) return;
    const L = [`RFC — ${tree.title}`, "", "## The plan (the artifact)", "", tree.artifact_md.trim(), ""];
    tree.branches.forEach((b) => {
      L.push(`## ${b.title}`);
      b.nodes.forEach((n, i) => {
        L.push(`${i + 1}. **${n.title}**${n.detail ? ` — ${n.detail}` : ""}`);
        if (n.alts.length) {
          n.alts.forEach((a, ai) => L.push(n.chosen === ai ? `   - ✅ **CHOSEN: ${a.title}** — ${a.why}` : `   - ◻ considered: ${a.title} — ${a.why}`));
          if (n.chosen == null) L.push(`   - ⚠ UNRESOLVED — agents must not assume a path here`);
        }
      });
      L.push("");
    });
    if (tree.context.length) { L.push("## The context"); tree.context.forEach((n) => L.push(`- ${n.title}${n.detail ? ` — ${n.detail}` : ""}`)); L.push(""); }
    if (tree.phases.length) { L.push("## Phases"); tree.phases.forEach((f) => L.push(`- ${f.title} → ${f.refs.join(", ")}`)); L.push(""); }
    L.push("Agents: chosen paths are binding; surface conflicts instead of silently diverging.");
    await apiPost("/api/v1/cockpit/blackboard/post", { session_id: sessionId, kind: "context", body_md: L.join("\n").slice(0, 19500) }, { timeoutMs: 20000 }).catch(() => null);
    // in the chat, the RFC ALSO lands as an ARTIFACT on the session's rail (operator 2026-07-25).
    onRfc?.(`RFC — ${tree.title}`, L.join("\n"));
    setErr(""); setBusy(""); onChanged();
    setToast(onRfc ? "📜 RFC pressed — context doc for every agent + an artefact on the session rail" : "📜 RFC pressed — every agent now receives it with its mission");
  };

  // ── canvas navigation ──────────────────────────────────────────────────────
  // the wheel ZOOMS — one native non-passive listener does EVERYTHING (operator 2026-07-26: "zoom not
  // working"): preventDefault kills the container scroll, stopPropagation keeps ancestors out of it —
  // which also blocks React's root-delegated onWheel, so the zoom math must live HERE, not in a React
  // handler (that split was exactly the bug). Functional setView avoids the stale-closure trap.
  React.useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault(); e.stopPropagation();
      const box = el.getBoundingClientRect();
      const mx = e.clientX - box.left; const my = e.clientY - box.top;
      setView((v) => {
        const ns = Math.min(2.2, Math.max(0.3, v.s * (e.deltaY > 0 ? 0.9 : 1.1)));
        // zoom around the cursor
        return { s: ns, tx: mx - ((mx - v.tx) / v.s) * ns, ty: my - ((my - v.ty) / v.s) * ns };
      });
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);
  const panStart = (e: React.MouseEvent) => {
    // pan only from the void — the box, the world div, or the empty-state panel
    // all carry data-void; nodes/hubs/root/controls do not. (The old check read
    // dataset.void, but data-void="" is a FALSY empty string → never panned.)
    const el = e.target as HTMLElement;
    if (!el?.hasAttribute?.("data-void")) return;
    panRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
  };
  React.useEffect(() => {
    const mv = (e: MouseEvent) => { const g = panRef.current; if (g) setView((v) => ({ ...v, tx: g.tx + e.clientX - g.x, ty: g.ty + e.clientY - g.y })); };
    const up = () => { panRef.current = null; };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
  }, []);
  const fit = () => {
    if (!tree || !boxRef.current) return;
    const { worldW, worldH } = layout(tree);
    const r = boxRef.current.getBoundingClientRect();
    const s = Math.min((r.width - 40) / worldW, (r.height - 40) / worldH, 1.4);
    setView({ s, tx: (r.width - worldW * s) / 2, ty: (r.height - worldH * s) / 2 });
  };

  // ── tree mutations ─────────────────────────────────────────────────────────
  const patchNode = (id: string, patch: Partial<TNode>) => {
    if (!tree) return;
    persist({
      ...tree,
      branches: tree.branches.map((b) => ({ ...b, nodes: b.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })),
      context: tree.context.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    });
  };
  const removeNode = (id: string) => {
    if (!tree) return;
    persist({ ...tree, branches: tree.branches.map((b) => ({ ...b, nodes: b.nodes.filter((n) => n.id !== id) })), context: tree.context.filter((n) => n.id !== id) });
    setSel(null);
  };
  const addNode = (branchKey: string) => {
    if (!tree) return;
    const fresh: TNode = { id: uid(), title: "new microtask", detail: "", alts: [], chosen: null };
    if (branchKey === "context") persist({ ...tree, context: [...tree.context, { ...fresh, title: "specified context", detail: "" }] });
    else persist({ ...tree, branches: tree.branches.map((b) => (b.key === branchKey ? { ...b, nodes: [...b.nodes, fresh] } : b)) });
    setSel(fresh.id);
  };
  // the hover ＋ grows a sibling right after this node (in-branch); − removes it
  const addSiblingAfter = (branchKey: string, afterId: string) => {
    if (!tree) return;
    const fresh: TNode = { id: uid(), title: "new microtask", detail: "", alts: [], chosen: null };
    const insert = (arr: TNode[]) => { const i = arr.findIndex((n) => n.id === afterId); const out = [...arr]; out.splice(i < 0 ? arr.length : i + 1, 0, fresh); return out; };
    if (branchKey === "context") persist({ ...tree, context: insert(tree.context) });
    else persist({ ...tree, branches: tree.branches.map((b) => (b.key === branchKey ? { ...b, nodes: insert(b.nodes) } : b)) });
    setSel(fresh.id);
  };
  const findNode = (id: string): { n: TNode; b: TBranch | null } | null => {
    if (!tree) return null;
    for (const b of tree.branches) { const n = b.nodes.find((x) => x.id === id); if (n) return { n, b }; }
    const cn = tree.context.find((x) => x.id === id);
    return cn ? { n: cn, b: null } : null;
  };

  const lay = tree ? layout(tree) : null;
  // which phase does each node belong to? refs are "branchKey:index" → node id.
  const nodePhase = new Map<string, number>();
  tree?.phases.forEach((f, fi) => f.refs.forEach((ref) => {
    const [bk, si] = String(ref).split(":");
    const n = tree.branches.find((b) => b.key === bk)?.nodes[Number(si)];
    if (n) nodePhase.set(n.id, fi);
  }));
  const selInfo = sel && sel !== "root" && tree ? findNode(sel) : null;
  const selBranch = sel && tree ? tree.branches.find((b) => b.key === sel) : null;
  // ── the control-center derivations for one node (all deterministic) ─────────
  const statsFor = (n: TNode, b: TBranch | null) => {
    const branchNodes = b ? b.nodes : tree!.context;
    const idx = branchNodes.findIndex((x) => x.id === n.id);
    const weight = n.weight ?? 50;
    const files = n.files ?? [];
    const allNodes = [...tree!.branches.flatMap((x) => x.nodes), ...tree!.context];
    const shared = allNodes.filter((o) => o.id !== n.id && (o.files ?? []).some((f) => files.includes(f)));
    const unresolved = n.alts.length > 0 && n.chosen == null;
    const blast = files.length * 2 + shared.length * 3 + (unresolved ? 4 : 0) + n.alts.length;
    const tokEst = Math.round((n.title.length + (n.detail?.length ?? 0)) / 4 + files.length * 90 + n.alts.length * 50 + 40);
    return { branchNodes, idx, weight, files, shared, blast, tokEst, phase: nodePhase.get(n.id) };
  };
  // DRAG A BRANCH ONTO AN AGENT (operator 2026-07-26: "we don't drag nodes, we drag branches") —
  // grabbing ANY node lifts its whole lineage: the branch and every step under it, packed as one
  // organized numbered list (details, phases, chosen paths, files). A ghost card rides the cursor,
  // the lifted branch pops, everything else fades.
  const [dragKey, setDragKey] = React.useState<string | null>(null);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const dragBranch = (e: React.DragEvent, b: TBranch, tint: string) => {
    if (!tree) return;
    const L: string[] = [`Branch "${b.title}" of plan "${tree.title}" — ${b.nodes.length} step${b.nodes.length === 1 ? "" : "s"}, in order:`];
    b.nodes.forEach((n, i) => {
      const ph = nodePhase.get(n.id);
      L.push(`${i + 1}. ${n.title}${n.detail?.trim() ? ` — ${n.detail.trim()}` : ""}${ph != null ? ` (phase ${ph + 1}: ${tree.phases[ph]?.title ?? ""})` : ""}`);
      if (n.alts.length > 0) L.push(n.chosen != null
        ? `   chosen path: ${n.alts[n.chosen]?.title} — ${n.alts[n.chosen]?.why}`
        : `   open paths (unresolved): ${n.alts.map((a, ai) => `${ai + 1}) ${a.title} — ${a.why}`).join(" · ")}`);
      if (n.files?.length) L.push(`   files: ${n.files.join(", ")}`);
    });
    startBlockDrag(e, { label: `${b.title} · ${b.nodes.length} steps`.slice(0, 40), uid: `shape-branch-${b.key}`, source: `RFC drawer (${tree.title})`, content: L.join("\n") });
    // the ghost card — a mini ordered step list riding the cursor
    const g = document.createElement("div");
    g.style.cssText = `position:absolute;top:-1000px;left:-1000px;z-index:9999;max-width:250px;background:${C.panel};border:1.5px solid ${tint};border-radius:10px;padding:8px 11px;font-family:${mono};box-shadow:0 12px 32px rgba(0,0,0,.5)`;
    g.innerHTML = `<div style="font-size:10px;font-weight:700;color:${tint}">${iconOf(b.key)} ${esc(b.title)} · ${b.nodes.length}</div>`
      + b.nodes.slice(0, 5).map((n, i) => `<div style="font-size:9px;color:${C.muted};margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${i + 1}. ${esc(n.title)}</div>`).join("")
      + (b.nodes.length > 5 ? `<div style="font-size:8.5px;color:${C.dim};margin-top:3px">＋ ${b.nodes.length - 5} more…</div>` : "");
    document.body.appendChild(g);
    try { e.dataTransfer.setDragImage(g, 24, 16); } catch { /* drag image unsupported */ }
    setTimeout(() => g.remove(), 0);
    setDragKey(b.key);
  };

  const inpS: React.CSSProperties = { background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 9px", fontFamily: nav, fontSize: 11, outline: "none" };
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* toolbar */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 10px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>🧩 RFC drawer</span>
        <span style={{ fontFamily: mono, fontSize: 8, color: artifact ? C.ok : C.dim }} title={artifact ? "the root artifact came from the brainstorm" : "no artifact yet — run the ✨ brainstorm"}>{artifact ? "◉ artifact received" : "◌ awaiting the brainstorm"}</span>
        {legacyItems > 0 && <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim }} title="the old rectangles plan still feeds execute/judge">legacy plan · {legacyItems} items</span>}
        <span style={{ flex: 1 }} />
        {tree && (<>
          <button onClick={addBranch} title="grow a new branch" style={{ background: "transparent", border: `1px dashed ${C.ok}`, color: C.ok, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: "1px 8px", borderRadius: 7 }}>＋ branch</button>
          <button onClick={fit} title="fit the tree" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: "1px 8px", borderRadius: 7 }}>⊡ fit</button>
          <button onClick={() => void pressRfc()} title="press the complete RFC — a session context doc every agent receives"
            style={{ background: `linear-gradient(120deg, ${C.brand}, color-mix(in oklab, ${C.brand} 60%, ${C.ok}))`, border: "none", color: C.bg, cursor: "pointer", fontFamily: mono, fontSize: 9.5, fontWeight: 700, padding: "3px 12px", borderRadius: 7 }}>📜 press RFC</button>
        </>)}
        <button onClick={() => void grow()} disabled={!!busy}
          style={{ background: "transparent", border: `1px solid ${busy ? C.warn : C.ok}`, color: busy ? C.warn : C.ok, cursor: "pointer", fontFamily: mono, fontSize: 9.5, padding: "2px 11px", borderRadius: 7 }}>{busy === "grow" ? "⏳ growing…" : tree ? "🌱 regrow" : "🌱 grow the tree"}</button>
      </div>
      {(err || toast) && <div style={{ padding: "3px 10px", fontFamily: mono, fontSize: 8.5, color: err ? C.bad : C.ok, borderBottom: `1px solid ${C.border}` }}>{err || toast}</div>}

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {/* THE CANVAS */}
        <div ref={boxRef} onMouseDown={panStart} data-void=""
          style={{ flex: 1, minWidth: 0, position: "relative", overflow: "hidden", cursor: panRef.current ? "grabbing" : "grab", background: `radial-gradient(circle at 30% 20%, color-mix(in oklab, ${C.brand} 5%, transparent), transparent 60%), ${C.bg}`, backgroundImage: `radial-gradient(circle, color-mix(in oklab, ${C.border} 60%, transparent) 1px, transparent 1px)`, backgroundSize: "26px 26px" }}>
          {!tree ? (
            <div data-void="" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", overflowY: "auto" }}>
              <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 11, alignItems: "center", maxWidth: 520, padding: "18px" }}>
                <span style={{ fontSize: 30 }}>🌳</span>
                <span style={{ fontFamily: serif, fontSize: 15, color: C.fg, lineHeight: 1.4 }}>The shape grows from the artifact the brainstorm forged.</span>
                {artifact ? (<>
                  <div style={{ fontFamily: serif, fontSize: 11.5, color: C.muted, lineHeight: 1.6, textAlign: "left", maxHeight: 150, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", background: C.panel, whiteSpace: "pre-wrap" }}>{artifact.slice(0, 600)}{artifact.length > 600 ? "…" : ""}</div>
                  <button onClick={() => void grow()} disabled={!!busy} style={{ background: C.ok, border: "none", color: C.bg, cursor: "pointer", fontFamily: mono, fontSize: 11, fontWeight: 700, padding: "8px 20px", borderRadius: 9 }}>{busy === "grow" ? "⏳ growing…" : "🌱 grow the tree"}</button>
                </>) : inCollection ? (
                  <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, lineHeight: 1.7 }}>run the <b style={{ color: C.warn }}>✨ brainstorm</b> on the intent pane — its forged artifact arrives here automatically.</span>
                ) : (<>
                  <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>brainstorm it with AI — or plant it yourself (manual, no AI, no template: an empty canvas; add branches and nodes by hand):</span>
                  <textarea value={seed} onChange={(e) => setSeed(e.target.value)} rows={3} placeholder="what are we planning? (the product, a feature…) or paste a plan…" style={{ ...inpS, width: 380, resize: "vertical" }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => seed.trim() && setWizOpen(true)} disabled={!seed.trim() || wizOpen} style={{ background: `linear-gradient(120deg, ${C.brand}, color-mix(in oklab, ${C.brand} 60%, ${C.ok}))`, border: "none", color: C.bg, cursor: "pointer", fontFamily: mono, fontSize: 10.5, fontWeight: 700, padding: "7px 16px", borderRadius: 9, opacity: seed.trim() && !wizOpen ? 1 : 0.5 }}>🧠 brainstorm it</button>
                    <button onClick={plant} disabled={!!busy} style={{ background: "transparent", border: `1px solid ${C.ok}`, color: C.ok, cursor: "pointer", fontFamily: mono, fontSize: 10.5, fontWeight: 700, padding: "7px 16px", borderRadius: 9 }}>🌱 plant yourself</button>
                  </div>
                  {wizOpen && <div style={{ width: "min(560px, 92%)", textAlign: "left", marginTop: 6 }}><BrainstormWizard sessionId={sessionId} paneId={p.id} initialSeed={seed} sources={["mission", "shared", "digest"]} onForged={onForged} onClose={() => setWizOpen(false)} /></div>}
                </>)}
              </div>
            </div>
          ) : lay ? (
            <React.Fragment>
              {/* PHASE TIMELINE — screen-space, always legible; hover a pill and
                  its member nodes light while the rest fade (operator: "the
                  phased lines are messy — a better way to show the phases") */}
              {tree.phases.length > 0 && (
                <div style={{ position: "absolute", left: 10, top: 8, right: 10, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", zIndex: 6, pointerEvents: "none" }}>
                  <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, letterSpacing: 1, pointerEvents: "auto" }}>◷ PHASES</span>
                  {tree.phases.map((f, fi) => {
                    const on = hlPhase === fi; const pt = phaseTint(fi);
                    return (
                      <button key={fi} onMouseEnter={() => setHlPhase(fi)} onMouseLeave={() => setHlPhase((p) => (p === fi ? null : p))}
                        style={{ pointerEvents: "auto", display: "inline-flex", alignItems: "center", gap: 5, background: on ? pt : `color-mix(in oklab, ${pt} 15%, ${C.panel})`, border: `1px solid ${pt}`, color: on ? "#160f00" : C.fg, cursor: "pointer", fontFamily: nav, fontSize: 9.5, fontWeight: 600, padding: "2px 9px 2px 5px", borderRadius: 20, boxShadow: on ? `0 2px 10px color-mix(in oklab, ${pt} 50%, transparent)` : "none" }}>
                        <span style={{ width: 15, height: 15, borderRadius: "50%", background: on ? "#160f00" : pt, color: on ? pt : "#160f00", fontFamily: mono, fontSize: 8.5, fontWeight: 800, display: "grid", placeItems: "center" }}>{fi + 1}</span>
                        <span style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.title.replace(/^\s*phase\s*\d+\s*[—–:-]\s*/i, "")}</span>
                        <span style={{ fontFamily: mono, fontSize: 7.5, opacity: 0.7 }}>·{f.refs.length}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div data-void="" style={{ position: "absolute", left: 0, top: 0, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, transformOrigin: "0 0", width: lay.worldW, height: lay.worldH }}>
                {/* round connecting lines (decorative — never intercept the pan drag) */}
                <svg width={lay.worldW} height={lay.worldH} style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
                  {lay.hubs.map((h) => (
                    <g key={h.b.key}>
                      <path d={curve(lay.root.x + 36, lay.root.y, h.x - 24, h.y)} fill="none" stroke={h.b.key === "context" ? C.dim : tintOf(h.i)} strokeWidth={2.4} opacity={0.55} />
                      {h.nodes.map(({ n, x, y }) => (
                        <path key={n.id} d={curve(h.x + 22, h.y, x - 18, y)} fill="none" stroke={h.b.key === "context" ? C.dim : tintOf(h.i)} strokeWidth={1.5} opacity={hlPhase != null && nodePhase.get(n.id) !== hlPhase ? 0.1 : 0.45} />
                      ))}
                    </g>
                  ))}
                </svg>
                {/* ROOT — the artifact */}
                <div data-node="" onClick={() => setSel("root")} title="the plan artifact — click to read"
                  style={{ position: "absolute", left: lay.root.x - 36, top: lay.root.y - 36, width: 72, height: 72, borderRadius: "50%", cursor: "pointer", display: "grid", placeItems: "center", background: `linear-gradient(140deg, color-mix(in oklab, ${C.brand} 30%, ${C.panel}), ${C.panel})`, border: `2.5px solid ${sel === "root" ? C.fg : C.brand}`, boxShadow: `0 0 34px color-mix(in oklab, ${C.brand} 35%, transparent)` }}>
                  <span style={{ fontSize: 24 }}>📜</span>
                </div>
                <div style={{ position: "absolute", left: lay.root.x - 70, top: lay.root.y + 42, width: 140, textAlign: "center", fontFamily: serif, fontSize: 11, color: C.fg, lineHeight: 1.3, pointerEvents: "none" }}>{tree.title}</div>
                {/* a freshly planted tree — invite the first branch right on the canvas */}
                {tree.branches.length === 0 && (
                  <button data-node="" onClick={addBranch}
                    style={{ position: "absolute", left: lay.root.x + 120, top: lay.root.y - 46, background: "transparent", border: `1.5px dashed ${C.ok}`, color: C.ok, cursor: "pointer", fontFamily: mono, fontSize: 10.5, fontWeight: 700, padding: "8px 16px", borderRadius: 10 }}>＋ grow your first branch</button>
                )}
                {/* branch hubs + nodes */}
                {lay.hubs.map((h) => {
                  const tint = h.b.key === "context" ? C.dim : tintOf(h.i);
                  return (
                    <React.Fragment key={h.b.key}>
                      <div data-node="" onClick={() => setSel(h.b.key)} title={`${h.b.title} — click to manage · drag to an agent`}
                        draggable onDragStart={(e) => dragBranch(e, h.b, tint)} onDragEnd={() => setDragKey(null)}
                        style={{ position: "absolute", left: h.x - 22, top: h.y - 22, width: 44, height: 44, borderRadius: "50%", cursor: "pointer", display: "grid", placeItems: "center", background: `color-mix(in oklab, ${tint} 16%, ${C.panel})`, border: `2px solid ${sel === h.b.key ? C.fg : tint}`, transform: dragKey === h.b.key ? "scale(1.12)" : "none", boxShadow: dragKey === h.b.key ? `0 0 26px color-mix(in oklab, ${tint} 55%, transparent)` : "none", opacity: dragKey != null && dragKey !== h.b.key ? 0.3 : 1, transition: "transform .3s cubic-bezier(.34,1.56,.64,1), box-shadow .3s, opacity .2s" }}>
                        <span style={{ fontSize: 15 }}>{iconOf(h.b.key)}</span>
                      </div>
                      <div style={{ position: "absolute", left: h.x - 60, top: h.y + 26, width: 120, textAlign: "center", fontFamily: mono, fontSize: 8.5, color: tint, textTransform: "uppercase", letterSpacing: 1, pointerEvents: "none" }}>{h.b.title} · {h.b.nodes.length}</div>
                      {h.nodes.map(({ n, x, y }) => {
                        const pendingChoice = n.alts.length > 0 && n.chosen == null;
                        const chosen = n.alts.length > 0 && n.chosen != null;
                        const ph = nodePhase.get(n.id);
                        const lifted = dragKey === h.b.key;
                        const dimmed = (hlPhase != null && ph !== hlPhase) || (dragKey != null && !lifted);
                        const ring = sel === n.id ? C.fg : chosen ? C.ok : pendingChoice ? C.warn : tint;
                        return (
                          <React.Fragment key={n.id}>
                            {/* node cluster — the circle plus the hover ± controls */}
                            <div data-node="" onMouseEnter={() => setHoverNode(n.id)} onMouseLeave={() => setHoverNode((h2) => (h2 === n.id ? null : h2))}
                              style={{ position: "absolute", left: x - 58, top: y - 18, width: 76, height: 36, opacity: dimmed ? 0.26 : 1, transform: lifted ? "translateY(-3px) scale(1.06)" : "none", transition: "opacity .15s, transform .3s cubic-bezier(.34,1.56,.64,1)" }}>
                              {hoverNode === n.id && (<>
                                <button title="grow a sibling task after this one" onClick={(e) => { e.stopPropagation(); addSiblingAfter(h.b.key, n.id); }}
                                  style={{ position: "absolute", left: 0, top: -1, width: 17, height: 17, borderRadius: "50%", border: `1px solid ${C.ok}`, background: C.panel, color: C.ok, cursor: "pointer", fontFamily: mono, fontSize: 11, lineHeight: 1, padding: 0, display: "grid", placeItems: "center" }}>＋</button>
                                <button title="remove this task" onClick={(e) => { e.stopPropagation(); removeNode(n.id); }}
                                  style={{ position: "absolute", left: 0, top: 19, width: 17, height: 17, borderRadius: "50%", border: `1px solid ${C.bad}`, background: C.panel, color: C.bad, cursor: "pointer", fontFamily: mono, fontSize: 13, lineHeight: 1, padding: 0, display: "grid", placeItems: "center" }}>−</button>
                              </>)}
                              <div onClick={() => setSel(n.id)} title={`${n.title} — drag to an agent (lifts the whole branch)`} draggable onDragStart={(e) => dragBranch(e, h.b, tint)} onDragEnd={() => setDragKey(null)}
                                style={{ position: "absolute", left: 40, top: 0, width: 36, height: 36, borderRadius: "50%", cursor: "pointer", display: "grid", placeItems: "center", background: sel === n.id ? `color-mix(in oklab, ${tint} 30%, ${C.panel})` : C.panel, border: `2px solid ${ring}`, boxShadow: sel === n.id ? `0 0 18px color-mix(in oklab, ${tint} 45%, transparent)` : ph != null ? `0 0 0 3px color-mix(in oklab, ${phaseTint(ph)} 32%, transparent)` : "none" }}>
                                <span style={{ fontSize: 16 }}>{iconOf(h.b.key)}</span>
                                {ph != null && <span title={tree.phases[ph]?.title} style={{ position: "absolute", right: -6, top: -6, minWidth: 14, height: 14, padding: "0 2px", borderRadius: 7, background: phaseTint(ph), color: "#160f00", fontFamily: mono, fontSize: 8.5, fontWeight: 800, display: "grid", placeItems: "center" }}>{ph + 1}</span>}
                                {pendingChoice && <span title="a path is unresolved" style={{ position: "absolute", right: -4, bottom: -4, width: 13, height: 13, borderRadius: "50%", background: C.warn, color: C.bg, fontFamily: mono, fontSize: 8, fontWeight: 800, display: "grid", placeItems: "center" }}>⑂</span>}
                                {chosen && <span style={{ position: "absolute", right: -4, bottom: -4, width: 13, height: 13, borderRadius: "50%", background: C.ok, color: C.bg, fontFamily: mono, fontSize: 8, fontWeight: 800, display: "grid", placeItems: "center" }}>✓</span>}
                              </div>
                            </div>
                            <div data-node="" onClick={() => setSel(n.id)} draggable onDragStart={(e) => dragBranch(e, h.b, tint)} onDragEnd={() => setDragKey(null)} style={{ position: "absolute", left: x + 22, top: y - 14, width: 200, cursor: "pointer", opacity: dimmed ? 0.26 : 1, transform: lifted ? "translateY(-3px) scale(1.04)" : "none", transition: "opacity .15s, transform .3s cubic-bezier(.34,1.56,.64,1)" }}>
                              <div style={{ fontFamily: nav, fontSize: 10.5, fontWeight: 600, color: sel === n.id ? C.fg : C.muted, lineHeight: 1.25, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{n.title}</div>
                              {n.alts.length > 0 && <div style={{ fontFamily: mono, fontSize: 7.5, color: pendingChoice ? C.warn : C.ok }}>{pendingChoice ? `${n.alts.length} paths — choose` : n.alts[n.chosen!]?.title}</div>}
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
            </React.Fragment>
          ) : null}
        </div>

        {/* THE CONTROL CENTER RAIL */}
        {tree && sel && (
          <div style={{ width: 292, flexShrink: 0, borderLeft: `1px solid ${C.border}`, background: C.panel, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {sel === "root" ? (<>
              <span style={{ fontFamily: mono, fontSize: 8.5, color: C.brand, textTransform: "uppercase", letterSpacing: 1.2 }}>the artifact — the plan itself</span>
              <div style={{ fontFamily: serif, fontSize: 12, color: C.fg, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{tree.artifact_md}</div>
            </>) : selBranch || sel === "context" ? (() => {
              const b = selBranch ?? ({ key: "context", title: "the context", nodes: tree.context } as TBranch);
              return (<>
                <span style={{ fontFamily: mono, fontSize: 8.5, color: C.brand, textTransform: "uppercase", letterSpacing: 1.2 }}>branch · {b.title}</span>
                {selBranch && <input value={selBranch.title} onChange={(e) => persist({ ...tree, branches: tree.branches.map((x) => (x.key === selBranch.key ? { ...x, title: e.target.value } : x)) })} style={inpS} />}
                <button onClick={() => addNode(b.key)} style={{ alignSelf: "flex-start", background: "transparent", border: `1px dashed ${C.brand}`, color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: "3px 11px", borderRadius: 7 }}>＋ node</button>
                {selBranch && <button onClick={() => { persist({ ...tree, branches: tree.branches.filter((x) => x.key !== selBranch.key) }); setSel(null); }} style={{ alignSelf: "flex-start", background: "transparent", border: "none", color: C.bad, cursor: "pointer", fontFamily: mono, fontSize: 8.5 }}>✕ remove this branch</button>}
              </>);
            })() : selInfo ? (() => {
              const s = statsFor(selInfo.n, selInfo.b);
              const bk = selInfo.b?.key ?? "context";
              const [bLabel, bColor] = blastBucket(s.blast);
              const maxW = Math.max(50, ...s.branchNodes.map((x) => x.weight ?? 50));
              const openFork = selInfo.n.alts.length > 0 && selInfo.n.chosen == null;
              return (<>
                {/* header — the node's type, glyph, and phase */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 22 }}>{iconOf(bk)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: mono, fontSize: 8, color: C.brand, textTransform: "uppercase", letterSpacing: 1 }}>{selInfo.b ? selInfo.b.title : "context node"}</div>
                    <div style={{ fontFamily: mono, fontSize: 7.5, color: s.phase != null ? phaseTint(s.phase) : C.dim }}>{s.phase != null ? `◷ ${tree.phases[s.phase]?.title ?? `phase ${s.phase + 1}`}` : "◌ no phase"}</div>
                  </div>
                </div>
                <input value={selInfo.n.title} onChange={(e) => patchNode(selInfo.n.id, { title: e.target.value })} style={inpS} />
                <textarea value={selInfo.n.detail} onChange={(e) => patchNode(selInfo.n.id, { detail: e.target.value })} rows={2} placeholder="the nuance…" style={{ ...inpS, resize: "vertical", fontSize: 10.5 }} />
                {/* stat tiles */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                  <Stat label="position" value={`${s.idx + 1} / ${s.branchNodes.length}`} />
                  <Stat label="siblings" value={String(Math.max(0, s.branchNodes.length - 1))} />
                  <Stat label="≈ tokens" value={s.tokEst >= 1000 ? `${(s.tokEst / 1000).toFixed(1)}k` : String(s.tokEst)} />
                  <Stat label="paths" value={selInfo.n.alts.length ? (selInfo.n.chosen != null ? "chosen" : `${selInfo.n.alts.length} open`) : "—"} tone={openFork ? C.warn : undefined} />
                </div>
                {/* lineage — root → branch → this */}
                <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, lineHeight: 1.6 }}>
                  ⌂ <b style={{ color: C.muted }}>{tree.title.slice(0, 34)}</b> → {selInfo.b?.title ?? "the context"} → <b style={{ color: C.fg }}>{selInfo.n.title.slice(0, 26) || "this task"}</b>
                </div>
                {/* WEIGHT — conviction, compared against the branch siblings */}
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 7, display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>⚖ decision weight</span>
                    <span style={{ fontFamily: mono, fontSize: 9, color: C.fg, fontWeight: 700 }}>{s.weight}</span>
                  </div>
                  <input type="range" min={0} max={100} value={s.weight} onChange={(e) => patchNode(selInfo.n.id, { weight: Number(e.target.value) })} style={{ width: "100%", accentColor: C.brand }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {s.branchNodes.map((sib) => {
                      const w = sib.weight ?? 50; const me = sib.id === selInfo.n.id;
                      return (
                        <div key={sib.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <div style={{ flex: 1, height: 8, background: C.bg, borderRadius: 5, overflow: "hidden" }}>
                            <div style={{ width: `${(w / maxW) * 100}%`, height: "100%", background: me ? C.brand : `color-mix(in oklab, ${C.muted} 45%, transparent)`, borderRadius: 5 }} />
                          </div>
                          <span style={{ fontFamily: mono, fontSize: 7, color: me ? C.brand : C.dim, width: 58, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me ? "◆ this" : sib.title.slice(0, 13)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* FILES AFFECTED — the paths this task would touch */}
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 7, display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>🗂 files affected</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {s.files.length === 0 && <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, fontStyle: "italic" }}>none named yet</span>}
                    {s.files.map((f, fi) => (
                      <span key={fi} style={{ display: "inline-flex", alignItems: "center", gap: 3, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 4px 2px 6px", fontFamily: mono, fontSize: 8, color: C.fg }}>
                        {f}
                        <button title="drop this file" onClick={() => patchNode(selInfo.n.id, { files: s.files.filter((_, i) => i !== fi) })} style={{ background: "transparent", border: "none", color: C.bad, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: 0, lineHeight: 1 }}>✕</button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <input value={newFile} onChange={(e) => setNewFile(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newFile.trim()) { patchNode(selInfo.n.id, { files: [...s.files, newFile.trim()] }); setNewFile(""); } }} placeholder="src/…  ⏎" style={{ ...inpS, flex: 1, fontFamily: mono, fontSize: 9 }} />
                    <button onClick={() => { if (newFile.trim()) { patchNode(selInfo.n.id, { files: [...s.files, newFile.trim()] }); setNewFile(""); } }} style={{ background: "transparent", border: `1px dashed ${C.brand}`, color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: "0 9px", borderRadius: 7 }}>＋</button>
                  </div>
                </div>
                {/* BLAST RADIUS — derived from files × coupling × open forks */}
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 7, display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>💥 blast radius</span>
                    <span style={{ fontFamily: mono, fontSize: 8.5, color: bColor, fontWeight: 800, textTransform: "uppercase" }}>{bLabel}</span>
                  </div>
                  <div style={{ height: 8, background: C.bg, borderRadius: 5, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, s.blast * 5)}%`, height: "100%", background: bColor, borderRadius: 5 }} />
                  </div>
                  <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, lineHeight: 1.55 }}>{s.files.length} file{s.files.length === 1 ? "" : "s"} · couples {s.shared.length} task{s.shared.length === 1 ? "" : "s"}{openFork ? " · unresolved fork" : ""}</span>
                  {s.shared.length > 0 && <span style={{ fontFamily: mono, fontSize: 7, color: C.warn, lineHeight: 1.5 }}>⚠ shares files with: {s.shared.slice(0, 3).map((o) => o.title.slice(0, 18)).join(", ")}{s.shared.length > 3 ? "…" : ""}</span>}
                </div>
                {/* THE PATHS — the fork mechanic (unchanged) */}
                {selInfo.n.alts.length > 0 && <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 1, borderTop: `1px solid ${C.border}`, paddingTop: 7 }}>⑂ the paths — choose one</span>}
                {selInfo.n.alts.map((a, ai) => {
                  const on = selInfo.n.chosen === ai;
                  return (
                    <div key={ai} onClick={() => patchNode(selInfo.n.id, { chosen: on ? null : ai })}
                      style={{ cursor: "pointer", border: `1px solid ${on ? C.ok : C.border}`, background: on ? `color-mix(in oklab, ${C.ok} 8%, transparent)` : C.bg, borderRadius: 9, padding: "7px 9px", display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontFamily: nav, fontSize: 10.5, fontWeight: 700, color: on ? C.ok : C.fg }}>{on ? "✓ " : "○ "}{a.title}</span>
                      <span style={{ fontFamily: serif, fontSize: 10, color: C.muted, fontStyle: "italic", lineHeight: 1.45 }}>{a.why}</span>
                    </div>
                  );
                })}
                {selInfo.n.alts.length > 0 && selInfo.n.chosen != null && (
                  <textarea value={selInfo.n.alts[selInfo.n.chosen]?.why ?? ""} onChange={(e) => patchNode(selInfo.n.id, { alts: selInfo.n.alts.map((a, ai) => (ai === selInfo.n.chosen ? { ...a, why: e.target.value } : a)) })} rows={2} placeholder="why this path…" style={{ ...inpS, resize: "vertical", fontSize: 10 }} />
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 7 }}>
                  <button onClick={() => patchNode(selInfo.n.id, { alts: [...selInfo.n.alts, { title: "another path", why: "…" }] })}
                    style={{ background: "transparent", border: `1px dashed ${C.border}`, color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 8.5, padding: "2px 10px", borderRadius: 7 }}>＋ alternative</button>
                  <span style={{ flex: 1 }} />
                  <button onClick={() => removeNode(selInfo.n.id)} style={{ background: "transparent", border: "none", color: C.bad, cursor: "pointer", fontFamily: mono, fontSize: 8.5 }}>✕ remove node</button>
                </div>
              </>);
            })() : null}
            <span style={{ flex: 1 }} />
            <button onClick={() => setSel(null)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: "3px 10px", borderRadius: 7 }}>close</button>
          </div>
        )}
      </div>
    </div>
  );
}
