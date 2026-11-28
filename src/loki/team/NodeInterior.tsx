// INSIDE A NODE (the operator 2026-11-15: "on a click on a node, instead of a sidebar, we enter a canvas inside the node, with the connections of each section branching from it, like a git graph, to all sides"): the team canvas gives way (a fade) to the node's own canvas: the step in the middle and a lane to
// every part of it, drawn as a git graph: straight lanes, rounded elbows, a dot where a lane leaves the step and a ring where it arrives. A part is a card with its one-line summary; a click opens it below, with the same controls the old drawer had (model, cap, autonomy, brief, output, trail).
// Esc or the arrow goes back to the team. Flat, 1px lines, icons first; motion is a fade and a short rise only.
import { failureOf } from "./model";
import { SectionMark, type PartKey } from "./SectionMarks";
import { Mark, providerOf } from "./AgentGraph";
import { DeliveredPreview } from "./DeliveredPreview";
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { editNode, mediaUrl } from "./api";
import { Icon } from "./icons";
import { AutonomyDial, STOPS, type Autonomy } from "./AutonomyDial";
import { AccessMap, accessOf } from "./DrawerLive";
import { NodeDrawer, type Part } from "./NodeDrawer";
import { iconOf, modelLine, money, nodeState, sublabel, titleOf, windowOf, stepsOf, type NodeState } from "./model";
import type { Graph, Run } from "./types";

export type SectionKey = "model" | "cap" | "out" | "trail" | "auto" | "tools" | "brief" | "ctx" | "chain";
export type Section = { key: SectionKey; icon: string; title: string; line: string; color: string; slot: number };
/** The eight places around the step, clockwise from the top: 0 top, 1 top right, 2 right, 3 bottom right, 4 bottom, 5 bottom left, 6 left, 7 top left. */
export type Cat = "who" | "work" | "knows";
export const CATS: Record<Cat, { title: string; at: [number, number] }> = { who: { title: "who it is", at: [18, 46] }, work: { title: "what it makes", at: [80, 46] }, knows: { title: "what it knows", at: [50, 86] } };
const CAT_OF: Record<string, Cat> = { model: "who", auto: "who", cap: "who", tools: "who", chain: "who", out: "work", trail: "work", brief: "knows", ctx: "knows" };
export const catOf = (key: string): Cat => CAT_OF[key] ?? "who";
/** Where each part sits: in a small group around its category's centre (a column for the sides, a row for the bottom), as % of the canvas plus pixels. Pure over the parts. */
export function placeParts(keys: string[]): Record<string, { x: number; y: number; dx: number; dy: number }> {
  const out: Record<string, { x: number; y: number; dx: number; dy: number }> = {};
  for (const cat of Object.keys(CATS) as Cat[]) { const mine = keys.filter((k) => catOf(k) === cat); const [x, y] = CATS[cat].at;
    mine.forEach((k, i) => { const o = i - (mine.length - 1) / 2; out[k] = cat === "knows" ? { x, y, dx: o * 130, dy: 0 } : { x, y, dx: 0, dy: o * 100 }; }); }
  return out;
}
/** Where each of the eight places sits, in % of the canvas: the step in the middle, the parts around it on an ellipse, clockwise from the top (a graph, not a table). */
export const SLOT_GRID: [number, number][] = Array.from({ length: 8 }, (_, i) => { const a = ((-90 + i * 45) * Math.PI) / 180; return [Math.round((50 + 36 * Math.cos(a)) * 10) / 10, Math.round((50 + 34 * Math.sin(a)) * 10) / 10] as [number, number]; });
const COLOR: Record<SectionKey, string> = { model: "#7b8cff", cap: "#e5a63b", out: "#3ecf8e", trail: "#a78bfa", chain: "#2dd4bf", auto: "#f5b942", tools: "#2dd4bf", brief: "#60a5fa", ctx: "#94a3b8" };
const GLYPH: Record<NodeState, { icon: string; color: string }> = { idle: { icon: "clock", color: "#94a3b8" }, working: { icon: "spark", color: "#60a5fa" }, waiting: { icon: "hand", color: "#f5b942" }, done: { icon: "tick", color: "#34d399" }, failed: { icon: "x", color: "#f87171" } };
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

/** THE FALLBACK CHAIN OF A MODEL NODE (the operator's AffectUI review: "Fallback Chain, like the design"): its seats in the order they are tried (the first, the ones that must agree with it, then the ladder), and what happened in this run: the one that answered, the ones the guard climbed past, the ones never needed. Pure. */
export type ChainSeat = { seat: string; state: "answered" | "climbed" | "unused" | "first"; why?: string };
export function chainOf(n: any, out: any): ChainSeat[] {
  const seats: string[] = [n.seat, ...(n.agree_with ?? []), ...(n.fallback ?? [])].filter((x: unknown): x is string => typeof x === "string" && !!x); if (!seats.length) return [];
  const used = typeof out?.seat_used === "string" ? out.seat_used : ""; const at = used ? seats.indexOf(used) : -1;
  return seats.map((seat, i) => at < 0 ? { seat, state: i === 0 ? "first" : "unused" } : i < at ? { seat, state: "climbed", why: i === 0 && typeof out?.why_escalated === "string" ? out.why_escalated : undefined } : i === at ? { seat, state: "answered" } : { seat, state: "unused" });
}
/** The parts a node has, each with its one line. A tool or a piece of control flow has no model, no tools and no autonomy to set; an agent has them all. Pure. */
export function interiorOf(graph: Graph, run: Run | null, id: string): Section[] {
  const n: any = graph.nodes[id]; if (!n) return []; const isRole = n.node === "role"; const isTool = n.node === "use_tool"; const spent = run?.state.node_cost?.[id] ?? 0; const out: any = run?.state.values?.[id]; const now = run?.live ? Date.now() : run?.state.now_ms ?? 0;
  const said = out && typeof out === "object" ? String(out.report ?? out.said ?? "") : typeof out === "string" ? out : "";
  const L: Section[] = [];
  // GROUPED LIKE A MAP: who it is on the left (model, autonomy, cost cap, tools), what it makes on the right (output, trail), what it knows at the bottom (brief, context); a fallback chain sits with the model
  const SLOT_OF: Record<string, number> = { model: 7, auto: 6, cap: 5, tools: 0, chain: 0, out: 1, trail: 2, brief: 3, ctx: 4 };
  const add = (key: SectionKey, icon: string, title: string, line: string, _slot: number) => L.push({ key, icon, title, line, color: COLOR[key], slot: SLOT_OF[key] ?? _slot });
  if (isRole || n.node === "llm") add("model", "spark", "Model", isRole ? modelLine(n) : String(n.spec?.seat ?? "its seat"), 0);
  if (isRole || isTool || n.node === "loop") add("cap", "coin", "Cost cap", `${money(spent)} of ${n.cap_usd ? money(n.cap_usd) : "no cap"}`, 1);
  if (n.node === "deliver") add("out", "play", "Delivered", out === undefined ? "nothing yet" : "preview of what the run made", 2); else add("out", "file", "Output", out === undefined ? "nothing yet" : said ? said.replace(/\s+/g, " ").slice(0, 60) : `wrote ${Object.keys(out ?? {}).length} field${Object.keys(out ?? {}).length === 1 ? "" : "s"}`, 2);
  add("trail", "list", "Trail", run ? `${stepsOf(id, run, now, 50).length} tool step${stepsOf(id, run, now, 50).length === 1 ? "" : "s"} · ${(run.events ?? []).filter((e) => e.actor === id).length} events` : "no run yet", 3);
  if (["role", "llm", "use_tool", "code", "transform", "check", "sub_team"].includes(n.node)) add("auto", "hand", "Autonomy", STOPS.find((s) => s.key === (n.autonomy ?? "auto"))?.label ?? "Runs on its own", 4);
  if (n.node === "llm") { const ch = chainOf(n, out); if (ch.length) add("chain", "fallback", "Fallback chain", out?.seat_used ? `${out.seat_used} answered${out.escalated_from ? " (climbed)" : ""}` : `${ch.length} seat${ch.length === 1 ? "" : "s"}, in order`, 5); }
  if (isRole && n.role === "agent") add("tools", "plug", "Tools", `${accessOf(graph, run, id).length} it may reach`, 5);
  add("brief", isTool ? "term" : "file", isTool ? "The call" : "Brief", isRole && n.agent?.responsibility ? String(n.agent.responsibility).slice(0, 60) : isTool ? `${n.tool?.type} · ${n.tool?.name}` : sublabel(n) || n.node.replace("_", " "), 6);
  if (run) add("ctx", "layers", "Context in", `about ${k(windowOf(run, id).used)} tokens`, 7);
  return L;
}

type Pt = { x: number; y: number }; type Lane = { key: SectionKey; d: string; color: string; from: Pt; to: Pt; delay: number };
/** A line through points with rounded corners of radius r (the elbows of a git graph). Pure. */
/** A soft curve from the first point to the last (the graph's wires), instead of square corners. Pure. */
export function curveOf(pts: Pt[]): string { const a = pts[0], b = pts[pts.length - 1]; const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y); return horizontal ? `M${a.x} ${a.y} C${a.x + (b.x - a.x) / 2} ${a.y} ${a.x + (b.x - a.x) / 2} ${b.y} ${b.x} ${b.y}` : `M${a.x} ${a.y} C${a.x} ${a.y + (b.y - a.y) / 2} ${b.x} ${a.y + (b.y - a.y) / 2} ${b.x} ${b.y}`; }
/** Zoom the view by `f` keeping the point under the pointer (px, py in the view's own pixels) still; between 0.4x and 3x. Pure. */
export function zoomView(c: { k: number; x: number; y: number }, f: number, px: number, py: number) { const k = Math.max(0.4, Math.min(3, c.k * f)); const r = k / c.k; return { k, x: px - (px - c.x) * r, y: py - (py - c.y) * r }; }
export function roundedPath(pts: Pt[], r = 12): string {
  if (pts.length < 2) return ""; let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) { const a = pts[i - 1], b = pts[i], c = pts[i + 1]; const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y); const rr = Math.min(r, l1 / 2, l2 / 2); if (rr < 0.5) { d += ` L${b.x} ${b.y}`; continue; }
    const p1 = { x: b.x - ((b.x - a.x) / l1) * rr, y: b.y - ((b.y - a.y) / l1) * rr }, p2 = { x: b.x + ((c.x - b.x) / l2) * rr, y: b.y + ((c.y - b.y) / l2) * rr }; d += ` L${p1.x} ${p1.y} Q${b.x} ${b.y} ${p2.x} ${p2.y}`; }
  return `${d} L${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
}
/** The wire from the step to a part, as the graph draws it: from the facing edge of one tile to the facing edge of the other. Pure. */
export function edgeLane(hub: DOMRect, card: DOMRect, origin: DOMRect): Pt[] {
  const c = (r: DOMRect) => ({ x: r.left - origin.left + r.width / 2, y: r.top - origin.top + r.height / 2, hw: r.width / 2, hh: r.height / 2 }); const a = c(hub), b = c(card); const dx = b.x - a.x, dy = b.y - a.y;
  return Math.abs(dx) >= Math.abs(dy) ? [{ x: a.x + Math.sign(dx) * a.hw, y: a.y }, { x: b.x - Math.sign(dx) * b.hw, y: b.y }] : [{ x: a.x, y: a.y + Math.sign(dy) * a.hh }, { x: b.x, y: b.y - Math.sign(dy) * b.hh }];
}
/** The lane from the step to one part: straight to a part above, below, left or right of it; a corner part is reached by leaving the step's top or bottom, running along the gap between the rows and turning into the part. Pure. */
export function laneTo(hub: DOMRect, card: DOMRect, slot: number, origin: DOMRect): Pt[] {
  const R = (r: DOMRect) => ({ l: r.left - origin.left, r: r.right - origin.left, t: r.top - origin.top, b: r.bottom - origin.top, cx: r.left - origin.left + r.width / 2, cy: r.top - origin.top + r.height / 2 }); const h = R(hub), c = R(card);
  if (slot === 0) return [{ x: h.cx, y: h.t }, { x: h.cx, y: c.b }]; if (slot === 4) return [{ x: h.cx, y: h.b }, { x: h.cx, y: c.t }];
  if (slot === 2) return [{ x: h.r, y: h.cy }, { x: c.l, y: h.cy }]; if (slot === 6) return [{ x: h.l, y: h.cy }, { x: c.r, y: h.cy }];
  const top = slot === 1 || slot === 7; const left = slot === 5 || slot === 7; const rad = (h.r - h.l) / 2; const x0 = h.cx + (left ? -1 : 1) * rad * 0.6; const y0 = h.cy + (top ? -1 : 1) * rad * 0.8; const edge = top ? c.b : c.t; const mid = (y0 + edge) / 2;
  return [{ x: x0, y: y0 }, { x: x0, y: mid }, { x: c.cx, y: mid }, { x: c.cx, y: edge }];
}

const CSS = `@keyframes ni-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@keyframes ni-fade{from{opacity:0}to{opacity:1}}@keyframes ni-trace{to{stroke-dashoffset:0}}@keyframes ni-pop{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}
.ni{animation:ni-fade .3s ease both}.ni-unit{opacity:0;animation:ni-in .4s ease forwards}.ni-dot{opacity:0;animation:ni-fade .3s ease forwards}.ni-win{transform-origin:50% 0;animation:ni-pop .22s ease both}
.ni-trace{stroke-dasharray:1;stroke-dashoffset:1;animation:ni-trace .7s ease forwards}
.ni-node{transition:border-color .2s,color .2s,box-shadow .2s}.ni-node:hover,.ni-node[aria-expanded=true]{border-color:var(--c-muted)!important}
@media (prefers-reduced-motion:reduce){.ni,.ni-unit,.ni-dot,.ni-win{animation:none;opacity:1}.ni-trace{animation:none;stroke-dashoffset:0}}`;

export function NodeInterior({ graph, run, id, onClose, onChanged }: { graph: Graph; run: Run | null; id: string; onClose: () => void; onChanged?: () => void }) {
  const n: any = graph.nodes[id]; const st = nodeState(graph, run, id); const secs = React.useMemo(() => interiorOf(graph, run, id), [graph, run, id]);
  const [open, setOpen] = React.useState<SectionKey | null>(null); const [hot, setHot] = React.useState<SectionKey | null>(null); const [msg, setMsg] = React.useState<{ text: string; bad?: boolean } | null>(null);
  const box = React.useRef<HTMLDivElement>(null); const world = React.useRef<HTMLDivElement>(null);
  const shiftKey = `antiloki.team.interior.${graph.team}.${id}`; const [shift, setShift] = React.useState<Record<string, { dx: number; dy: number }>>(() => { try { return JSON.parse(localStorage.getItem(shiftKey) ?? "{}"); } catch { return {}; } });
  const [camState, setCam] = React.useState({ k: 1, x: 0, y: 0 }); const cam = React.useRef(camState); cam.current = camState; const gesture = React.useRef<{ kind: "pan" | "tile"; key?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null); const wasDrag = React.useRef(false); const hub = React.useRef<HTMLButtonElement>(null); const win = React.useRef<HTMLDivElement>(null); const cards = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const [groups, setGroups] = React.useState<{ cat: Cat; x: number; y: number; w: number; h: number }[]>([]); const [lanes, setLanes] = React.useState<Lane[]>([]); const [size, setSize] = React.useState({ w: 0, h: 0 }); const [at, setAt] = React.useState<{ left: number; top: number; w: number; stem: [Pt, Pt]; h: number } | null>(null);
  React.useEffect(() => { const k2 = (e: KeyboardEvent) => { if (e.key === "Escape") { if (open) setOpen(null); else onClose(); } }; window.addEventListener("keydown", k2); return () => window.removeEventListener("keydown", k2); }, [onClose, open]);
  const measure = React.useCallback(() => {
    const b = world.current, h = hub.current; if (!b || !h) return; const k = cam.current.k || 1; const raw = b.getBoundingClientRect();
    /* everything is measured inside the drawing, in its own units: the view may be zoomed or moved (the operator 2026-11-18: the inside of a node is a surface like the graph) */
    const o = { left: 0, top: 0, width: raw.width / k, height: raw.height / k } as DOMRect; const R = (e: Element) => { const r = e.getBoundingClientRect(); return { left: (r.left - raw.left) / k, top: (r.top - raw.top) / k, right: (r.right - raw.left) / k, bottom: (r.bottom - raw.top) / k, width: r.width / k, height: r.height / k } as DOMRect; };
    const hr = R(h); const next: Lane[] = [];
    secs.forEach((s, i) => { const el = cards.current[s.key]; if (!el) return; const pts = edgeLane(hr, R(el), o); next.push({ key: s.key, d: curveOf(pts), color: s.color, from: pts[0], to: pts[pts.length - 1], delay: 120 + i * 70 }); });
    const boxes = new Map<Cat, { l: number; t: number; r: number; b: number }>(); secs.forEach((s) => { const el = cards.current[s.key]; if (!el) return; const r = R(el); const c = catOf(s.key); const q = { l: r.left - o.left, t: r.top - o.top, r: r.right - o.left, b: r.bottom - o.top }; const e = boxes.get(c); boxes.set(c, e ? { l: Math.min(e.l, q.l), t: Math.min(e.t, q.t), r: Math.max(e.r, q.r), b: Math.max(e.b, q.b) } : q); });
    setGroups([...boxes].map(([cat, q]) => ({ cat, x: q.l - 22, y: q.t - 30, w: q.r - q.l + 44, h: q.b - q.t + 66 })));
    setLanes(next); setSize({ w: o.width, h: o.height });
    // THE WINDOW OF AN OPEN PART branches from its circle: below it for the top and middle rows, above it for the bottom row, kept inside the canvas, with a stem from the circle to the window
    const sec = open ? secs.find((s) => s.key === open) : null; const el = sec ? cards.current[sec.key] : null;
    if (sec && el) { const r = R(el); const cx = r.left - o.left + r.width / 2, ct = r.top - o.top, cb = r.bottom - o.top; const w = Math.min(380, o.width - 24); const left = Math.max(12, Math.min(cx - w / 2, o.width - w - 12)); const wh = win.current?.offsetHeight ?? 0; const above = (r.top - o.top) > o.height * 0.55; const gap = 40;
      const top = above ? Math.max(8, ct - gap - wh) : cb + gap; setAt({ left, top, w, h: wh, stem: above ? [{ x: cx, y: ct }, { x: cx, y: top + wh }] : [{ x: cx, y: cb }, { x: cx, y: top }] }); } else setAt(null);
  }, [secs, open]);
  React.useLayoutEffect(() => {
    measure(); const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null; if (ro && box.current) ro.observe(box.current); if (ro && win.current) ro.observe(win.current);
    /* the tiles settle after the first paint (their labels, the entrance animation, the fonts): measure each one again when its size changes and a few times while they settle, so a wire always ends on its tile */
    if (ro) { Object.values(cards.current).forEach((el) => el && ro.observe(el)); if (hub.current) ro.observe(hub.current); } const timers = [60, 250, 700].map((ms) => setTimeout(measure, ms)); const fonts = (document as any).fonts?.ready; if (fonts?.then) void fonts.then(measure);
    window.addEventListener("resize", measure); return () => { ro?.disconnect(); timers.forEach(clearTimeout); window.removeEventListener("resize", measure); };
  }, [measure]);
  React.useEffect(() => { const el = box.current; if (!el) return; const wheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top; setCam((c) => zoomView(c, e.deltaY < 0 ? 1.12 : 1 / 1.12, px, py)); }; el.addEventListener("wheel", wheel, { passive: false }); return () => el.removeEventListener("wheel", wheel); }, []);
  React.useLayoutEffect(() => { measure(); }, [shift, measure]);
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest?.("[data-testid=interior-detail],[data-testid=interior-zoom]")) return; const t = (e.target as Element).closest?.("[data-testid^='interior-']"); const tid = t?.getAttribute("data-testid") ?? ""; const key = tid.startsWith("interior-") ? tid.slice(9) : "";
    wasDrag.current = false; const sh = shift[key];
    if (key && key !== "hub" && key !== "canvas" && cards.current[key]) gesture.current = { kind: "tile", key, sx: e.clientX, sy: e.clientY, ox: sh?.dx ?? 0, oy: sh?.dy ?? 0, moved: false };
    else if (!key || key === "hub" || key === "canvas") gesture.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: cam.current.x, oy: cam.current.y, moved: false };
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current; if (!g) return; const dx = e.clientX - g.sx, dy = e.clientY - g.sy; if (!g.moved && Math.hypot(dx, dy) < 4) return;
    if (!g.moved) { try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* no capture */ } } g.moved = true; wasDrag.current = true;
    if (g.kind === "tile" && g.key) { const key = g.key; setShift((m) => ({ ...m, [key]: { dx: g.ox + dx / cam.current.k, dy: g.oy + dy / cam.current.k } })); } else setCam((c) => ({ ...c, x: g.ox + dx, y: g.oy + dy }));
  };
  const up = (e: React.PointerEvent<HTMLDivElement>) => { const g = gesture.current; gesture.current = null; try { (e.currentTarget as Element).releasePointerCapture?.(e.pointerId); } catch { /* none */ } if (g?.kind === "tile" && g.moved) { try { localStorage.setItem(shiftKey, JSON.stringify(shift)); } catch { /* private window */ } } };
  const resetView = () => { setCam({ k: 1, x: 0, y: 0 }); setShift({}); try { localStorage.removeItem(shiftKey); } catch { /* private window */ } };
  // every hook above this line: a node that is not there yet must not change how many hooks run
  const places = React.useMemo(() => placeParts(secs.map((s) => s.key)), [secs]);
  if (!n) return null; const g = GLYPH[st]; const target = run?.live ? { run: run.id } : { team: graph.team };
  const shown = open ? secs.find((s) => s.key === open) ?? null : null;
  const setAuto = async (v: Autonomy) => { const r = await editNode(target, id, { autonomy: v === "auto" ? null : v }); setMsg(r.ok ? { text: "saved" } : { text: r.error ?? "not saved", bad: true }); if (r.ok) onChanged?.(); };

  const part = (key: SectionKey): React.ReactNode => {
    if (key === "auto") return <div style={{ display: "grid", gap: 10 }}><AutonomyDial value={n.autonomy} onChange={(v) => void setAuto(v)} />{msg && <span style={{ fontSize: 12, color: msg.bad ? "var(--c-bad)" : "var(--c-ok)" }}>{msg.text}</span>}</div>;
    if (key === "tools") return <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}><AccessMap graph={graph} run={run} id={id} /><div style={{ display: "grid", gap: 6, fontSize: 13 }}>{accessOf(graph, run, id).map((t) => <span key={t.name} style={{ display: "inline-flex", gap: 8, alignItems: "center", color: t.lit ? "#60a5fa" : C.fg }}><Icon name={t.icon} size={14} />{t.name.replace(/^mcp__/, "")}{t.used && <span style={{ color: C.dim, fontSize: 11 }}>used</span>}</span>)}{!accessOf(graph, run, id).length && <span style={{ color: C.muted }}>No tool is named for this agent.</span>}</div></div>;
    if (key === "out" && n.node === "deliver" && run) return <DeliveredPreview run={run.id} />;
    if (key === "out" && n.node === "artifact" && ["mp4", "webm", "mov", "png", "jpg", "gif", "webp", "mp3", "wav"].includes(String(n.format)) && run && run.state.values?.[id]?.ok) {
      // A MEDIA ARTIFACT SHOWS ITS MEDIA (the operator: "the video is an artifact that should have its own node"): the run keeps it under `kept/`
      const f = `kept/${String(run.state.values[id].path ?? "").replace(/^media\//, "") || `${n.name}.${n.format}`}`; const u = mediaUrl(run.id, f); const fmt = String(n.format);
      return <div style={{ display: "grid", gap: 10 }}>{["mp4", "webm", "mov"].includes(fmt) ? <video data-testid="interior-video" controls preload="metadata" src={u} style={{ width: "100%", maxHeight: 300, background: "#000", borderRadius: 8 }} /> : ["mp3", "wav"].includes(fmt) ? <audio data-testid="interior-audio" controls src={u} style={{ width: "100%" }} /> : <img data-testid="interior-image" alt={String(n.name)} src={u} style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 8 }} />}
        <span style={{ fontFamily: mono, fontSize: 11.5, color: C.muted }}>{n.name}.{fmt} · {(Number(run.state.values[id].bytes) / 1024).toFixed(0)} KB · kept with the run</span></div>;
    }
    if (key === "chain") { const ch = chainOf(n, run?.state.values?.[id]); return <div data-testid="chain" style={{ display: "grid", gap: 0 }}>{ch.map((c, i) => { const col = c.state === "answered" ? "#34d399" : c.state === "climbed" ? "#f87171" : c.state === "first" ? C.fg : C.dim; return <div key={`${c.seat}-${i}`} data-testid={`chain-${i}`} data-state={c.state} style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 10, alignItems: "start" }}>
      <span style={{ display: "grid", justifyItems: "center", alignSelf: "stretch" }}><span style={{ width: 14, height: 14, borderRadius: "50%", border: `1.5px solid ${col}`, background: c.state === "answered" ? col : "transparent", color: C.bg, display: "inline-flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>{c.state === "answered" ? <Icon name="tick" size={9} /> : c.state === "climbed" ? <span style={{ color: col, display: "inline-flex" }}><Icon name="x" size={9} /></span> : null}</span>{i < ch.length - 1 && <span style={{ width: 1, flex: 1, minHeight: 14, background: C.border }} />}</span>
      <span style={{ paddingBottom: 8, minWidth: 0 }}><span style={{ fontFamily: mono, fontSize: 12.5, color: c.state === "unused" ? C.muted : C.fg, wordBreak: "break-all" }}>{c.seat}</span><span style={{ display: "block", fontSize: 11.5, color: col }}>{c.state === "answered" ? "answered" : c.state === "climbed" ? `did not pass the guard${c.why ? `: ${c.why}` : ""}` : c.state === "first" ? "tried first" : i === 0 ? "" : "kept for when the one before fails"}</span></span></div>; })}</div>; }
    if (key === "ctx") { const w = run ? windowOf(run, id) : null; return w ? <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "color-mix(in srgb, currentColor 10%, transparent)" }}><i style={{ width: `${Math.max(1, w.share * 100)}%`, background: w.share > 0.8 ? "#f87171" : "#60a5fa" }} /></div>
      <span style={{ color: C.muted }}>about {k(w.used)} of {k(w.limit)} tokens of its window (an estimate)</span>
      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Icon name="file" size={13} />its brief · about 800</span>
      {w.parts.map((p) => <span key={p.id} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Icon name="chev" size={12} />{titleOf(p.id, graph.nodes[p.id] ?? n)} · {k(p.tokens)}</span>)}{!w.parts.length && <span style={{ color: C.muted }}>No earlier step wrote anything for it.</span>}</div> : <span style={{ color: C.muted }}>No run yet.</span>; }
    return <NodeDrawer graph={graph} run={run} id={id} onClose={onClose} onChanged={onChanged} only={key as Part} />;
  };
  const unit = (key: string, slot: [number, number], off: [number, number], delay: number, title: string, line: string, drawing: React.ReactNode, color: string, on: boolean, ref: (el: HTMLButtonElement | null) => void, props: React.ButtonHTMLAttributes<HTMLButtonElement>, big = false) => {
    const D = big ? 56 : 44; return (
      <div key={key} className="ni-unit" style={{ position: "absolute", width: big ? 170 : 140, left: `calc(${slot[0]}% + ${off[0]}px - ${big ? 85 : 70}px)`, top: `calc(${slot[1]}% + ${off[1]}px - ${big ? 28 : 22}px)`, zIndex: 1,   /* placed by margins, not by a transform: the entrance animation ends on `transform: none` and used to throw every tile half a width off its wires */ display: "grid", justifyItems: "center", gap: 4, animationDelay: `${delay}ms`, minWidth: 0 }}>
                <button ref={ref} className="ni-node" {...props} style={{ width: D, height: D, borderRadius: 11, border: `1.1px solid ${on ? color : C.border}`, backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", background: big ? `radial-gradient(circle at 50% 40%, color-mix(in srgb, ${color} 16%, transparent), transparent 70%), color-mix(in srgb, var(--c-panel2, ${C.panel}) 80%, transparent)` : `color-mix(in srgb, var(--c-panel2, ${C.panel}) 80%, transparent)`, position: "relative", boxShadow: on || big ? `0 0 0 3px color-mix(in srgb, ${color} 16%, transparent), 0 0 28px color-mix(in srgb, ${color} ${big ? 28 : 0}%, transparent)` : "none", color: on ? color : C.muted, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>{drawing}{key === "hub" && (st === "done" || st === "failed") && <span aria-hidden style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: 8, background: st === "done" ? "#3ecf8e" : "#f04e4e", color: "#0b1213", fontSize: 11, lineHeight: "16px", textAlign: "center", fontWeight: 700 }}>{st === "done" ? "✓" : "!"}</span>}</button>
<span style={{ fontSize: 11, fontWeight: 500, padding: "0 4px", maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
        <span style={{ fontSize: 9.5, color: C.muted, padding: "0 4px", maxWidth: 132, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "center" }} title={line}>{line}</span>
      </div>); };
  return (
    <div data-testid="node-interior" data-node={id} className="ni" style={{ fontFamily: nav, color: C.fg, background: "transparent" }}>
      <style>{CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px", height: 42, borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
        <button data-testid="interior-back" aria-label="back to the team" title="back to the team (Esc)" onClick={onClose} style={{ display: "inline-flex", background: "transparent", border: "none", color: C.muted, cursor: "pointer", padding: 4, borderRadius: 8, transform: "rotate(90deg)" }}><Icon name="chev" size={15} /></button>
        <span style={{ color: C.muted, display: "inline-flex", gap: 7, alignItems: "center" }}><Icon name="graph" size={14} />{graph.team}</span><span style={{ color: C.dim, display: "inline-flex", transform: "rotate(-90deg)" }}><Icon name="chev" size={11} /></span><b style={{ fontWeight: 500 }}>{titleOf(id, n)}</b>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 12, alignItems: "center", color: C.muted, fontSize: 12.5 }}><span style={{ color: g.color, display: "inline-flex", gap: 5, alignItems: "center" }}><Icon name={g.icon} size={14} />{st}</span><span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><Icon name="coin" size={13} />{money(run?.state.node_cost?.[id])}</span></span>
      </div>
      {st === "failed" && (() => { const f = failureOf(run, id); return f ? <div data-testid="interior-failure" role="alert" style={{ margin: "10px 14px 0", border: "1px solid color-mix(in srgb, #f04e4e 50%, var(--c-border))", background: "color-mix(in srgb, #f04e4e 9%, transparent)", borderRadius: 12, padding: "10px 14px", display: "grid", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#f04e4e", fontWeight: 600 }}>Failed · {f.kind}<button data-testid="interior-failure-copy" onClick={() => void navigator.clipboard?.writeText(f.text)} style={{ marginLeft: "auto", background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "1px 9px", cursor: "pointer", fontFamily: nav, fontSize: 11.5, fontWeight: 400 }}>Copy</button></div>
        <pre data-testid="interior-failure-text" style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: mono, fontSize: 12.5, lineHeight: 1.5, color: C.fg, userSelect: "text" }}>{f.text}</pre>
      </div> : null; })()}
      <div ref={box} data-testid="interior-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={(e) => { if ((e.target as Element).getAttribute("data-testid") === "interior-canvas" || !(e.target as Element).closest?.("[data-testid^='interior-']")) resetView(); }} onClickCapture={(e) => { if (wasDrag.current) { e.stopPropagation(); wasDrag.current = false; } }} data-zoom={camState.k.toFixed(2)} style={{ position: "relative", overflow: "hidden", touchAction: "none", cursor: "grab", height: Math.max(520, at ? at.top + at.h + 24 : 0) }}>
        <div data-testid="interior-zoom" style={{ position: "absolute", top: 10, right: 12, zIndex: 5, display: "inline-flex", gap: 4 }}>{[["−", "zoom out", () => setCam((c) => zoomView(c, 1 / 1.25, (box.current?.clientWidth ?? 0) / 2, (box.current?.clientHeight ?? 0) / 2))], ["+", "zoom in", () => setCam((c) => zoomView(c, 1.25, (box.current?.clientWidth ?? 0) / 2, (box.current?.clientHeight ?? 0) / 2))], ["⤢", "fit (double-click the background does the same)", resetView]].map(([t, tip, fn]: any) => <button key={t} type="button" title={tip} aria-label={tip} onClick={fn} style={{ width: 22, height: 22, borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer", fontSize: 13, lineHeight: "18px", padding: 0 }}>{t}</button>)}</div>
        <div ref={world} style={{ position: "absolute", inset: 0, transformOrigin: "0 0", transform: `translate(${camState.x}px, ${camState.y}px) scale(${camState.k})` }}>
        <svg width={size.w} height={size.h} aria-hidden style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 0, overflow: "visible" }}>
          {groups.map((g2) => <g key={g2.cat} data-testid={`interior-group-${g2.cat}`}><rect x={g2.x} y={g2.y} width={g2.w} height={g2.h} rx={18} fill="color-mix(in srgb, var(--c-panel2, var(--c-panel)) 30%, transparent)" stroke="var(--c-border)" strokeDasharray="3 4" strokeWidth={1} /><text x={g2.x + 14} y={g2.y + 16} fill={C.muted} fontSize={10} fontFamily={nav} letterSpacing=".06em">{CATS[g2.cat].title.toUpperCase()}</text></g>)}
          {lanes.map((l, i) => { const on = open === l.key || hot === l.key; const col = on ? l.color : "var(--c-muted)"; return <g key={i}>
            <path data-testid="interior-lane" data-on={on ? "1" : "0"} className="ni-trace" pathLength={1} d={l.d} fill="none" stroke={col} strokeOpacity={on ? 0.8 : 0.4} strokeWidth={1} strokeDasharray="2 4" strokeLinecap="round" style={{ animationDelay: `${l.delay}ms`, transition: "stroke .2s, stroke-opacity .2s" }} />
            <circle className="ni-dot" cx={l.from.x} cy={l.from.y} r={on ? 3.5 : 2.6} fill={col} style={{ animationDelay: `${l.delay}ms` }} /><circle className="ni-dot" cx={l.to.x} cy={l.to.y} r={3.6} fill={C.bg} stroke={col} strokeWidth={1.3} style={{ animationDelay: `${l.delay + 600}ms` }} /></g>; })}
          {at && shown && <g className="ni-dot"><path data-testid="interior-stem" d={roundedPath(at.stem, 0)} fill="none" stroke={shown.color} strokeOpacity={0.9} strokeWidth={1.8} strokeLinecap="round" /><circle cx={at.stem[1].x} cy={at.stem[1].y} r={3.5} fill={shown.color} /></g>}
        </svg>
        {unit("hub", [50, 40], [0, 0], 0, titleOf(id, n), `${st} · ${n.node === "role" ? n.role : n.node.replace("_", " ")}`, <svg viewBox="-13 -13 26 26" width={34} height={34} aria-hidden><Mark k={providerOf(n)} x={0} y={0} s={24} /></svg>, g.color, true, (el) => { hub.current = el; }, { "data-testid": "interior-hub", "aria-label": `${titleOf(id, n)}, ${st}`, onClick: () => setOpen(null) } as any, true)}
        {secs.map((s, i) => unit(s.key, [places[s.key].x, places[s.key].y], [places[s.key].dx + (shift[s.key]?.dx ?? 0), places[s.key].dy + (shift[s.key]?.dy ?? 0)], 160 + i * 70, s.title, s.line, <SectionMark k={(s.key === "out" && n.node === "deliver" ? "delivered" : s.key) as PartKey} color={s.color} size={22} />, s.color, open === s.key || hot === s.key, (el) => { cards.current[s.key] = el; },
          { "data-testid": `interior-${s.key}`, "aria-expanded": open === s.key, "aria-label": `${s.title}: ${s.line}`, onClick: () => setOpen(open === s.key ? null : s.key), onMouseEnter: () => setHot(s.key), onMouseLeave: () => setHot(null), onFocus: () => setHot(s.key), onBlur: () => setHot(null) } as any))}
        {shown && <div ref={win} data-testid="interior-detail" data-part={shown.key} className="ni-win" style={{ position: "absolute", zIndex: 3, left: at?.left ?? 12, top: at?.top ?? 0, width: at?.w ?? 340, maxHeight: "min(60vh, 460px)", overflowY: "auto", boxSizing: "border-box", background: "color-mix(in srgb, var(--c-panel2, var(--c-panel)) 86%, transparent)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: `1px solid color-mix(in srgb, ${shown.color} 55%, var(--c-border))`, borderRadius: 14, padding: "12px 14px 14px", visibility: at ? "visible" : "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontWeight: 500, fontSize: 13.5 }}><span style={{ color: shown.color, display: "inline-flex" }}><Icon name={shown.icon} size={15} /></span>{shown.title}<button aria-label="close this part" onClick={() => setOpen(null)} style={{ marginLeft: "auto", display: "inline-flex", background: "transparent", border: "none", color: C.muted, cursor: "pointer" }}><Icon name="x" size={14} /></button></div>
          {part(shown.key)}
        </div>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", color: C.dim, fontSize: 12, borderTop: `1px solid ${C.border}` }}><Icon name="hand" size={12} />Click a tile to open it; drag a tile or the background; the wheel zooms. Esc closes it, then goes back to the team.</div>
    </div>
  );
}
