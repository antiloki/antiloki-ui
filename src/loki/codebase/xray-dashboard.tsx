// X-RAY, ONE SCREEN OF VISUAL WIDGETS (the operator 2026-11-19: "one screen, not three tabs; pretty, animated, deterministic, visual widgets, not text boxes"; the look is the approved AffectUI-style mockups): what the teams made, how the work went, what the codebase is made of, how it grew.
// Every widget draws from one reading of the space (`dash`: runs, outputs, files, commits), with fixed drawings: the same reading always gives the same picture. The motion is only an entrance (numbers count up, lines draw, bars fill) and stops when less motion is asked for.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { mediaUrl } from "@/loki/team/api";
import { x2 } from "./xray-board";
import { SlotFrame } from "./xray-slot";

type Run = { run: string; team: string; ask: string; status: string; spent_usd: number; started: number };
type Out = { run: string; kind: string; name: string; kb: number; from: string };
type File = { path: string; kb: number; kind: string };
type Commit = { sha: string; ts: number; author: string; subject: string };
export type Health = { report?: { summary?: { health?: number; compliance?: number; violations?: number; axes_avg?: Record<string, number>; knowledge?: { hotspots?: { path: string; churn: number; complexity: number; hot: number }[] } }; by_law?: { law_key: string; title: string; category: string; n: number; mass: number }[]; by_category?: { category: string; violations: number; score: number }[]; worst?: { path: string; score: number }[] }; smells?: { counts?: Record<string, number>; smells?: { kind: string; severity: string; nodes: string[]; detail: string }[]; file_count?: number }; authors?: { commit_count?: number; authors?: { id: string; name: string; commits: number; files: number; solo: number; first: string; last: string }[]; bus_factor?: { total_files: number; solo_files: number } } };
export type Dash = { health?: Health | null; now: number; runs: Run[]; outputs: Out[]; stats: Record<string, number>; kinds: Record<string, number>; files: File[]; commits: Commit[] };

const KIND_COLOR: Record<string, string> = { md: "#4d8dff", html: "#ee7d4f", json: "#f5a524", js: "#f5d24d", ts: "#2dd4bf", py: "#3ecf8e", css: "#e08fd0", svg: "#e08fd0", mp4: "#f04e4e", png: "#e08fd0", txt: "#8b95a1", "(none)": "#5c6470" };
export const colorOfKind = (k: string) => KIND_COLOR[k] ?? "#8b95a1";
const calm = () => { try { return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

/** A number that counts up to its value once, then stays. */
export function useCountUp(value: number, ms = 900): number {
  const [v, setV] = React.useState(() => (calm() ? value : 0));
  React.useEffect(() => { if (calm()) { setV(value); return; } let raf = 0; const t0 = performance.now(); const tick = (t: number) => { const k = Math.min(1, (t - t0) / ms); setV(value * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [value, ms]);
  return v;
}
/** The squarified-enough layout of weighted cells inside a box (slice and dice by halves, heaviest first). Pure. */
export function treemap(items: { key: string; w: number }[], x: number, y: number, w: number, h: number): { key: string; x: number; y: number; w: number; h: number }[] {
  const list = [...items].filter((i) => i.w > 0).sort((a, b) => b.w - a.w); if (!list.length) return []; if (list.length === 1) return [{ key: list[0].key, x, y, w, h }];
  const total = list.reduce((a, i) => a + i.w, 0); let acc = 0, cut = 1; for (let i = 0; i < list.length - 1; i++) { acc += list[i].w; cut = i + 1; if (acc >= total / 2) break; }
  const a = list.slice(0, cut), b = list.slice(cut); const wa = a.reduce((s, i) => s + i.w, 0) / total;
  return w >= h ? [...treemap(a, x, y, w * wa, h), ...treemap(b, x + w * wa, y, w * (1 - wa), h)] : [...treemap(a, x, y, w, h * wa), ...treemap(b, x, y + h * wa, w, h * (1 - wa))];
}
/** Cumulative things made over the runs' own time, for the area chart. Pure. */
export function growth(d: Pick<Dash, "runs" | "outputs">): { t: number; n: number }[] {
  const per = new Map<string, number>(); for (const o of d.outputs) per.set(o.run, (per.get(o.run) ?? 0) + 1);
  const runs = [...d.runs].sort((a, b) => a.started - b.started); let n = 0; return runs.map((r) => { n += per.get(r.run) ?? 0; return { t: r.started, n }; });
}
/** The last seven days (today last), each with the runs that started in it. Pure. */
export function week(runs: Run[], now: number): { day: Date; runs: Run[] }[] {
  const end = new Date(now); end.setHours(0, 0, 0, 0); return Array.from({ length: 7 }, (_, i) => { const day = new Date(end.getTime() - (6 - i) * 86_400_000); const next = day.getTime() + 86_400_000; return { day, runs: runs.filter((r) => r.started >= day.getTime() && r.started < next) }; });
}
const money = (n: number) => `$${(n ?? 0).toFixed(2)}`;
const ago = (ms: number, now: number) => { const m = Math.max(0, Math.round((now - ms) / 60000)); if (m < 1) return "now"; if (m < 60) return `${m}m`; const h = Math.round(m / 60); if (h < 48) return `${h}h`; return `${Math.round(h / 24)}d`; };

// LINEAR-LIKE (the operator 2026-11-19: "more linear-like and less dashboard"): one quiet column, section headers in small caps, dense rows on hairlines, status shown by a small mark, charts drawn inline as part of a row. Flat: no cards, no glass, no glow.
const CSS = `
@keyframes xd-row{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes xd-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes xd-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes xd-fade{from{opacity:0}to{opacity:1}}
@keyframes xd-pulse{0%,100%{opacity:.5}50%{opacity:1}}
.xd-row{animation:xd-row .35s ease both}
.xd-line{stroke-dasharray:1;stroke-dashoffset:0;animation:xd-draw 1s ease both}
.xd-bar{transform-origin:left center;animation:xd-grow .7s ease both}
.xd-fade{animation:xd-fade .5s ease both}
.xd-live{animation:xd-pulse 1.6s ease-in-out infinite}
.xd-hover:hover{background:color-mix(in srgb, var(--c-fg) 4%, transparent)}
@media (prefers-reduced-motion:reduce){.xd-row,.xd-line,.xd-bar,.xd-fade,.xd-live{animation:none!important}}`;

const sec = (label: string, right?: React.ReactNode) => <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "22px 0 8px", fontFamily: mono, fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: C.dim }}>{label}<span style={{ flex: 1, height: 1, background: C.border }} />{right}</div>;
/** Stars (the operator 2026-11-19, from the approved mockups): a starred section moves to the top and stays there, kept in this browser. */
const STAR_KEY = "antiloki.xray.stars";
const readStars = (): string[] => { try { return JSON.parse(localStorage.getItem(STAR_KEY) ?? "[]"); } catch { return []; } };
const StarCtx = React.createContext<{ stars: string[]; toggle: (id: string) => void }>({ stars: [], toggle: () => {} });
/** A section of the screen: its small-caps header with a star, and its content; starred ones come first (CSS order, so nothing is re-mounted and no drawing restarts). */
function Block({ id, label, right, children }: { id: string; label: string; right?: React.ReactNode; children: React.ReactNode }) {
  const { stars, toggle } = React.useContext(StarCtx); const on = stars.includes(id);
  return <section id={`xd-sec-${id}`} data-testid={`xd-sec-${id}`} data-starred={on ? "1" : "0"} style={{ order: on ? -1 : 0, scrollMarginTop: 8 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "22px 0 8px", fontFamily: mono, fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: C.dim }}>
      <button data-testid={`xd-star-${id}`} aria-pressed={on} aria-label={on ? `unstar ${label}` : `star ${label}`} title={on ? "Starred: kept at the top" : "Star: keep this at the top"} onClick={() => toggle(id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12, lineHeight: 1, color: on ? "#f5a524" : C.dim, opacity: on ? 1 : 0.55 }}>{on ? "★" : "☆"}</button>
      {label}<span style={{ flex: 1, height: 1, background: C.border }} />{right}</div><SlotFrame slot={`sec-${id}`}>{children}</SlotFrame></section>;
}
const dim = (t: React.ReactNode) => <span style={{ color: C.dim }}>{t}</span>;
const STATUS: Record<string, string> = { done: "#3ecf8e", running: "#4d8dff", paused: "#f5a524", blocked: "#f04e4e", stopped: "#f04e4e" };
/** A status mark as Linear draws one: a ring that is empty, half, full or crossed. */
function Mark({ status }: { status: string }) {
  const c = STATUS[status] ?? C.dim; return <svg width="14" height="14" viewBox="0 0 14 14" aria-label={status} style={{ flex: "none" }}><circle cx="7" cy="7" r="5.5" fill="none" stroke={c} strokeWidth="1.5" strokeDasharray={status === "running" ? "4 3" : undefined} />{status === "done" && <path d="M4.4 7.2 6.2 9 9.6 5.2" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}{(status === "blocked" || status === "stopped") && <path d="M5 5l4 4M9 5l-4 4" stroke={c} strokeWidth="1.5" strokeLinecap="round" />}{status === "running" && <circle cx="7" cy="7" r="2" fill={c} className="xd-live" />}</svg>;
}
/** A line that draws itself, small enough to sit in a row. */
function Spark({ data, w = 120, h = 26, color = "#3ecf8e" }: { data: number[]; w?: number; h?: number; color?: string }) {
  if (data.length < 2) return <span style={{ width: w }} />; const max = Math.max(1, ...data); const X = (i: number) => 2 + (i / (data.length - 1)) * (w - 4), Y = (v: number) => h - 3 - (v / max) * (h - 6);
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ display: "block", flex: "none" }}><path d={`M${data.map((v, i) => `${X(i)},${Y(v)}`).join(" L")}`} pathLength={1} className="xd-line" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" /><circle cx={X(data.length - 1)} cy={Y(data[data.length - 1])} r="2.2" fill={color} /></svg>;
}

function Media({ items }: { items: Out[] }) {
  if (!items.length) return <div style={{ color: C.dim, fontSize: 12.5, padding: "6px 0 2px" }}>Nothing to watch yet. A video, page or picture a team makes shows up here, playing.</div>;
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>{items.slice(0, 6).map((m, i) => { const u = mediaUrl(m.run, `kept/${m.name}`); return (
    <a key={i} href={u} target="_blank" rel="noreferrer" className="xd-row" style={{ animationDelay: `${i * 70}ms`, display: "grid", gap: 6, textDecoration: "none", color: "inherit", minWidth: 0 }}>
      <div style={{ position: "relative", aspectRatio: "16 / 9", borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}`, background: "#0b0d12" }}>
        {m.kind === "page" ? <iframe title={m.name} sandbox="allow-scripts" src={u} loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, pointerEvents: "none" }} /> : m.kind === "video" ? <video src={u} muted loop playsInline autoPlay preload="metadata" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : <img alt={m.name} src={u} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "baseline", fontSize: 12, minWidth: 0 }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.muted }}>{m.name}</span><span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10.5, color: C.dim }}>{m.kind}</span></div>
    </a>); })}</div>;
}

function Runs({ runs, now }: { runs: Run[]; now: number }) {
  const max = Math.max(0.01, ...runs.map((r) => r.spent_usd)); const groups: [string, Run[]][] = [["In progress", runs.filter((r) => r.status === "running" || r.status === "paused")], ["Done", runs.filter((r) => r.status === "done")], ["Stopped", runs.filter((r) => !["running", "paused", "done"].includes(r.status))]];
  const days = week(runs, now);
  return <div data-testid="xd-runs">
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.dim, paddingBottom: 6 }}>last 7 days <span data-testid="xd-week" style={{ display: "inline-flex", gap: 3 }}>{days.map((d, i) => <i key={i} title={`${d.day.toLocaleDateString()} · ${d.runs.length} run${d.runs.length === 1 ? "" : "s"}`} style={{ width: 12, height: 12, borderRadius: 3, background: d.runs.length ? `color-mix(in srgb, #3ecf8e ${Math.min(80, 25 + d.runs.length * 25)}%, transparent)` : "var(--c-border)", display: "block" }} />)}</span></div>
    {groups.filter(([, l]) => l.length).map(([name, list]) => <div key={name}><div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: C.muted, padding: "8px 0 4px", fontWeight: 500 }}>{name}<span style={{ color: C.dim, fontWeight: 400 }}>{list.length}</span></div>
      {list.map((r, i) => <div key={r.run} className="xd-row xd-hover" style={{ animationDelay: `${i * 40}ms`, display: "grid", gridTemplateColumns: "20px minmax(0, 1fr) 92px 52px 36px", gap: 10, alignItems: "center", height: 34, borderBottom: `1px solid ${C.border}`, fontSize: 13, margin: "0 -8px", padding: "0 8px", borderRadius: 6 }}>
        <Mark status={r.status} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.ask}>{r.ask || "(no ask)"}{" "}<span style={{ color: C.dim }}>{r.team}</span></span>
        <span title={money(r.spent_usd)} style={{ height: 4, borderRadius: 2, background: "var(--c-border)", overflow: "hidden" }}><i className="xd-bar" style={{ display: "block", height: "100%", width: `${Math.max(4, (r.spent_usd / max) * 100)}%`, background: STATUS[r.status] ?? C.dim, animationDelay: `${i * 50}ms` }} /></span>
        <span style={{ fontFamily: mono, fontSize: 11.5, color: C.muted, textAlign: "right" }}>{money(r.spent_usd)}</span><span style={{ fontFamily: mono, fontSize: 11, color: C.dim, textAlign: "right" }}>{ago(r.started, now)}</span></div>)}</div>)}
    {!runs.length && <div style={{ color: C.dim, fontSize: 12.5, padding: "6px 0" }}>No run yet. Ask the Leader.</div>}</div>;
}

function Files({ files, kinds }: { files: File[]; kinds: Record<string, number> }) {
  const rows = Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 8); const total = rows.reduce((a, r) => a + r[1], 0) || 1; const maxKb = Math.max(0.1, ...files.map((f) => f.kb));
  return <div>
    <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", gap: 2, marginBottom: 8 }} role="img" aria-label="kinds of file">{rows.map(([k, n], i) => <i key={k} className="xd-bar" title={`${k} · ${n}`} style={{ width: `${(n / total) * 100}%`, background: colorOfKind(k), animationDelay: `${i * 80}ms`, display: "block" }} />)}</div>
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: C.muted, paddingBottom: 6 }}>{rows.map(([k, n]) => <span key={k} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><i style={{ width: 8, height: 8, borderRadius: 2, background: colorOfKind(k), display: "block" }} />{k}<span style={{ color: C.dim }}>{n}</span></span>)}</div>
    {files.slice(0, 12).map((f, i) => { const ext = f.path.split(".").pop() ?? ""; return <div key={f.path} className="xd-row xd-hover" style={{ animationDelay: `${i * 30}ms`, display: "grid", gridTemplateColumns: "14px minmax(0, 1fr) 90px 54px", gap: 10, alignItems: "center", height: 30, borderBottom: `1px solid ${C.border}`, fontSize: 12.5, margin: "0 -8px", padding: "0 8px", borderRadius: 6 }}>
      <i style={{ width: 8, height: 8, borderRadius: 2, background: colorOfKind(ext), display: "block" }} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: mono, fontSize: 12 }}>{f.path}</span>
      <span style={{ height: 3, borderRadius: 2, background: "var(--c-border)", overflow: "hidden" }}><i className="xd-bar" style={{ display: "block", height: "100%", width: `${Math.max(3, (f.kb / maxKb) * 100)}%`, background: colorOfKind(ext), opacity: 0.8 }} /></span><span style={{ fontFamily: mono, fontSize: 11, color: C.dim, textAlign: "right" }}>{f.kb} KB</span></div>; })}
    {files.length > 12 && <div style={{ fontSize: 12, color: C.dim, padding: "6px 0" }}>and {files.length - 12} more</div>}
    {!files.length && <div style={{ color: C.dim, fontSize: 12.5, padding: "6px 0" }}>No files here yet.</div>}</div>;
}

function History({ commits, now }: { commits: Commit[]; now: number }) {
  if (!commits.length) return <div style={{ color: C.dim, fontSize: 12.5, padding: "6px 0" }}>No commits yet.</div>;
  return <div style={{ position: "relative" }}>{commits.slice(0, 8).map((c, i) => <div key={c.sha} className="xd-row" style={{ animationDelay: `${i * 50}ms`, display: "grid", gridTemplateColumns: "18px minmax(0, 1fr) 56px 34px", gap: 10, alignItems: "center", height: 30, fontSize: 12.5 }}>
    <span style={{ position: "relative", height: "100%", display: "grid", placeItems: "center" }}><i style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: C.border, display: i === 0 ? "none" : "block", height: "50%" }} /><i style={{ position: "absolute", top: "50%", bottom: 0, left: "50%", width: 1, background: C.border, display: i === Math.min(7, commits.length - 1) ? "none" : "block" }} /><i style={{ width: 7, height: 7, borderRadius: 4, background: i === 0 ? "#4d8dff" : C.dim, display: "block", position: "relative" }} /></span>
    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subject}</span><span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>{c.sha}</span><span style={{ fontFamily: mono, fontSize: 11, color: C.dim, textAlign: "right" }}>{ago(c.ts, now)}</span></div>)}</div>;
}

const tone = (v: number) => (v >= 80 ? "#3ecf8e" : v >= 50 ? "#f5a524" : "#f04e4e");
const bar = (pct: number, color: string, delay = 0) => <span style={{ height: 4, borderRadius: 2, background: "var(--c-border)", overflow: "hidden", display: "block" }}><i className="xd-bar" style={{ display: "block", height: "100%", width: `${Math.max(2, Math.min(100, pct))}%`, background: color, animationDelay: `${delay}ms` }} /></span>;
const short = (p: string, n = 52) => (p.length > n ? `…${p.slice(p.length - n + 1)}` : p);
const rowStyle: React.CSSProperties = { display: "grid", alignItems: "center", gap: 10, height: 30, borderBottom: `1px solid ${C.border}`, fontSize: 12.5, margin: "0 -8px", padding: "0 8px", borderRadius: 6 };

/** THE CODE ANALYSIS, IN THE SAME QUIET ROWS (the operator 2026-11-19: "it misses the components from the x-ray legacy page, adapted to the new style"): health and its axes, the laws that were hit, the hotspots, the graph smells, who wrote what. Only when the space has been indexed. */
function Health({ h, files }: { h: Health; files: number }) {
  const sm = h.report?.summary; const axes = Object.entries(sm?.axes_avg ?? {}); const score = useCountUp(sm?.health ?? 0);
  const laws = (h.report?.by_law ?? []).slice(0, 6); const maxMass = Math.max(1, ...laws.map((l) => l.mass)); const hot = (sm?.knowledge?.hotspots ?? []).slice(0, 6); const maxHot = Math.max(1, ...hot.map((x) => x.hot));
  const counts = Object.entries(h.smells?.counts ?? {}).filter(([k]) => k !== "total").sort((a, b) => b[1] - a[1]); const smellTotal = counts.reduce((a, c) => a + c[1], 0) || 1; const gods = (h.smells?.smells ?? []).filter((x) => x.kind === "god-file").slice(0, 4);
  const authors = (h.authors?.authors ?? []).slice(0, 5); const maxC = Math.max(1, ...authors.map((a) => a.commits)); const bus = h.authors?.bus_factor;
  return <>
    {sm && <Block id="health" label="Health" right={dim(`${files} files judged`)}>
      <div data-testid="xd-health" style={{ display: "grid", gridTemplateColumns: "92px minmax(0, 1fr)", gap: 18, alignItems: "center", padding: "4px 0 10px" }}>
        <div style={{ display: "grid", gap: 2 }}><span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-.03em", color: tone(sm.health ?? 0), fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{Math.round(score)}</span><span style={{ fontSize: 11.5, color: C.dim }}>of 100 · {sm.violations ?? 0} violations</span></div>
        <div style={{ display: "grid", gap: 6 }}>{axes.map(([k, v], i) => <div key={k} style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr) 28px", gap: 10, alignItems: "center", fontSize: 12 }}><span style={{ color: C.muted }}>{k}</span>{bar(v, tone(v), i * 70)}<span style={{ fontFamily: mono, fontSize: 11, color: C.dim, textAlign: "right" }}>{Math.round(v)}</span></div>)}</div></div></Block>}
    {laws.length > 0 && <Block id="laws" label="Laws hit" right={dim(`${h.report?.by_law?.length ?? 0}`)}>{laws.map((l, i) => <div key={l.law_key} className="xd-row xd-hover" style={{ ...rowStyle, animationDelay: `${i * 40}ms`, gridTemplateColumns: "minmax(0, 1fr) 90px 100px 34px" }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</span><span style={{ fontFamily: mono, fontSize: 10.5, color: C.dim }}>{l.category}</span>{bar((l.mass / maxMass) * 100, "#f5a524", i * 50)}<span style={{ fontFamily: mono, fontSize: 11, color: C.muted, textAlign: "right" }}>{l.n}</span></div>)}</Block>}
    {hot.length > 0 && <Block id="hotspots" label="Hotspots" right={dim("churn × complexity")}>{hot.map((x, i) => <div key={x.path} className="xd-row xd-hover" style={{ ...rowStyle, animationDelay: `${i * 40}ms`, gridTemplateColumns: "minmax(0, 1fr) 110px 70px" }}><span style={{ fontFamily: mono, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={x.path}>{short(x.path)}</span>{bar((x.hot / maxHot) * 100, "#ee7d4f", i * 50)}<span style={{ fontFamily: mono, fontSize: 11, color: C.dim, textAlign: "right" }}>{x.churn}× · {x.complexity}</span></div>)}</Block>}
    {counts.length > 0 && <Block id="structure" label="Structure" right={dim(`${h.smells?.file_count ?? 0} files in the graph`)}>
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", gap: 2, marginBottom: 8 }} role="img" aria-label="graph smells">{counts.map(([k, n], i) => <i key={k} className="xd-bar" title={`${k} · ${n}`} style={{ width: `${(n / smellTotal) * 100}%`, background: ["#f5a524", "#8b95a1", "#f04e4e", "#4d8dff"][i % 4], display: "block", animationDelay: `${i * 80}ms` }} />)}</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: C.muted, paddingBottom: 6 }}>{counts.map(([k, n], i) => <span key={k} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><i style={{ width: 8, height: 8, borderRadius: 2, background: ["#f5a524", "#8b95a1", "#f04e4e", "#4d8dff"][i % 4], display: "block" }} />{k}<span style={{ color: C.dim }}>{n}</span></span>)}</div>
      {gods.map((g, i) => <div key={i} className="xd-row xd-hover" style={{ ...rowStyle, animationDelay: `${i * 40}ms`, gridTemplateColumns: "64px minmax(0, 1fr)" }}><span style={{ fontFamily: mono, fontSize: 10.5, color: "#f04e4e" }}>god file</span><span style={{ fontFamily: mono, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.nodes[0]}>{short(g.nodes[0] ?? "")}</span></div>)}</Block>}
    {authors.length > 0 && <Block id="authors" label="Who wrote it" right={dim(`${h.authors?.commit_count ?? 0} commits`)}>{authors.map((a, i) => <div key={a.id} className="xd-row xd-hover" style={{ ...rowStyle, animationDelay: `${i * 40}ms`, gridTemplateColumns: "minmax(0, 1fr) 110px 52px 70px" }}><span>{a.name}</span>{bar((a.commits / maxC) * 100, "#4d8dff", i * 50)}<span style={{ fontFamily: mono, fontSize: 11, color: C.muted, textAlign: "right" }}>{a.commits}</span><span style={{ fontFamily: mono, fontSize: 11, color: C.dim, textAlign: "right" }}>{a.files} files</span></div>)}
      {bus && <div style={{ fontSize: 12, color: C.dim, padding: "6px 0" }}>{bus.solo_files} of {bus.total_files} files have one author.</div>}</Block>}
  </>;
}

export type Jump = { id: string; label: string; hint?: string };
/** The command menu (⌘K / Ctrl+K while X-ray is open): type to filter, ↑ ↓ to move, Enter to go, Esc to close. Pure list in, a choice out. */
export function filterJumps(items: Jump[], q: string): Jump[] { const t = q.trim().toLowerCase(); return t ? items.filter((i) => i.label.toLowerCase().includes(t) || i.id.includes(t)) : items; }
function JumpMenu({ items, onPick, onClose }: { items: Jump[]; onPick: (j: Jump) => void; onClose: () => void }) {
  const [q, setQ] = React.useState(""); const [at, setAt] = React.useState(0); const list = filterJumps(items, q); const cur = Math.min(at, Math.max(0, list.length - 1)); const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { input.current?.focus(); }, []);
  const key = (e: React.KeyboardEvent) => { if (e.key === "ArrowDown") { e.preventDefault(); setAt(Math.min(list.length - 1, cur + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setAt(Math.max(0, cur - 1)); } else if (e.key === "Enter") { e.preventDefault(); if (list[cur]) onPick(list[cur]); } else if (e.key === "Escape") { e.preventDefault(); onClose(); } };
  return <div data-testid="xd-jump" role="dialog" aria-label="Jump to" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "absolute", inset: 0, zIndex: 40, background: "color-mix(in srgb, var(--c-bg) 55%, transparent)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "14%" }}>
    <div style={{ width: "min(460px, calc(100% - 32px))", border: `1px solid ${C.border}`, borderRadius: 10, background: "var(--c-panel2, var(--c-panel))", overflow: "hidden" }}>
      <input ref={input} data-testid="xd-jump-input" value={q} onChange={(e) => { setQ(e.target.value); setAt(0); }} onKeyDown={key} placeholder="Jump to…" aria-label="Jump to" style={{ width: "100%", boxSizing: "border-box", border: 0, borderBottom: `1px solid ${C.border}`, background: "transparent", color: C.fg, padding: "11px 14px", fontFamily: nav, fontSize: 14, outline: "none" }} />
      <div style={{ maxHeight: 300, overflowY: "auto", padding: 4 }}>{list.map((j, i) => <button key={j.id} data-testid={`xd-jump-${j.id}`} onMouseEnter={() => setAt(i)} onClick={() => onPick(j)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: i === cur ? "color-mix(in srgb, var(--c-fg) 7%, transparent)" : "transparent", color: C.fg, border: "none", borderRadius: 6, padding: "7px 10px", cursor: "pointer", fontFamily: nav, fontSize: 13 }}><span style={{ flex: 1 }}>{j.label}</span>{j.hint && <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>{j.hint}</span>}</button>)}{!list.length && <div style={{ padding: "10px 12px", color: C.dim, fontSize: 12.5 }}>Nothing matches.</div>}</div>
    </div></div>;
}

export function XrayDashboard({ space = "", runsSpace = "", live = false, onCode }: { /** open the Code view (the full legacy parts) from the menu */ onCode?: () => void; space?: string; /** the workspace the teams live in (the open one by default) */ runsSpace?: string; live?: boolean }) {
  const [d, setD] = React.useState<Dash | null>(null); const [stars, setStars] = React.useState<string[]>(readStars); const [menu, setMenu] = React.useState(false); const root = React.useRef<HTMLDivElement>(null);
  const toggle = React.useCallback((id: string) => setStars((s) => { const n = s.includes(id) ? s.filter((x) => x !== id) : [...s, id]; try { localStorage.setItem(STAR_KEY, JSON.stringify(n)); } catch { /* private window */ } return n; }), []);
  // ⌘K / Ctrl+K opens the menu while this screen is on (it takes the key before the app's own palette sees it)
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k" && root.current && root.current.isConnected && !root.current.closest('[hidden], [style*="display: none"]')) { e.preventDefault(); e.stopPropagation(); setMenu((m) => !m); } }; window.addEventListener("keydown", k, true); return () => window.removeEventListener("keydown", k, true); }, []);
  React.useEffect(() => { let stop = false; const go = async () => { if (typeof document !== "undefined" && document.hidden) return; const r = await x2<any>(space, "dash", { runs_space: runsSpace }); if (!stop && r.ok) setD((old) => (JSON.stringify({ ...old, now: 0 }) === JSON.stringify({ ...r, now: 0 }) ? old : (r as Dash))); }; void go(); const t = setInterval(go, 8000); return () => { stop = true; clearInterval(t); }; }, [space, runsSpace]);
  const runsN = useCountUp(d?.stats.runs ?? 0), spent = useCountUp(d?.stats.spent_usd ?? 0), madeN = useCountUp(d?.stats.made ?? 0);   // hooks first: they run on every render
  if (!d) return <div style={{ padding: 18, color: C.dim, fontFamily: nav, fontSize: 13 }}>reading the workspace…</div>;
  const made = d.outputs.filter((o) => ["video", "page", "picture"].includes(o.kind) && o.from === "media"); const running = d.runs.some((r) => r.status === "running") || live; const g = growth(d).map((p) => p.n);
  const h = d.health; const jumps: Jump[] = [{ id: "made", label: "Made", hint: `${made.length}` }, { id: "runs", label: "Runs", hint: `${d.runs.length}` }, ...(h?.report?.summary ? [{ id: "health", label: "Health", hint: `${h.report.summary.health ?? ""}` }] : []), ...((h?.report?.by_law?.length ?? 0) > 0 ? [{ id: "laws", label: "Laws hit" }] : []), ...((h?.report?.summary?.knowledge?.hotspots?.length ?? 0) > 0 ? [{ id: "hotspots", label: "Hotspots" }] : []), ...(Object.keys(h?.smells?.counts ?? {}).length ? [{ id: "structure", label: "Structure" }] : []), ...((h?.authors?.authors?.length ?? 0) > 0 ? [{ id: "authors", label: "Who wrote it" }] : []), { id: "files", label: "Files", hint: `${d.files.length}` }, { id: "history", label: "History", hint: `${d.commits.length}` }, ...(onCode ? [{ id: "code", label: "Code: file review, folder review, docs…", hint: "legacy" }] : [])];
  return (
    <StarCtx.Provider value={{ stars, toggle }}>
    <div ref={root} data-testid="xray-dashboard" style={{ height: "100%", overflow: "auto", padding: "10px 24px 40px", fontFamily: nav, color: C.fg, position: "relative" }}>
      <style>{CSS}</style>
      {menu && <JumpMenu items={jumps} onClose={() => setMenu(false)} onPick={(j) => { setMenu(false); if (j.id === "code") onCode?.(); else document.getElementById(`xd-sec-${j.id}`)?.scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "start" }); }} />}
      <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0 4px", flexWrap: "wrap", order: -2 }}>
          <div style={{ display: "flex", gap: 18, alignItems: "baseline", flexWrap: "wrap", fontSize: 13, color: C.muted }}>
            <span><b data-testid="stat-runs" style={{ color: C.fg, fontWeight: 600, fontSize: 20, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{Math.round(runsN)}</b> runs</span>
            <span><b style={{ color: "#3ecf8e", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{d.stats.done ?? 0}</b> finished</span>
            {(d.stats.failed ?? 0) > 0 && <span><b style={{ color: "#f04e4e", fontWeight: 500 }}>{d.stats.failed}</b> failed</span>}
            <span><b data-testid="xd-spend" style={{ color: C.fg, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{money(spent)}</b> spent</span>
            <span><b style={{ color: C.fg, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{Math.round(madeN)}</b> made</span>
            <span><b style={{ color: C.fg, fontWeight: 500 }}>{d.files.length}</b> files</span></div>
          <span style={{ flex: 1 }} />{running && <span className="xd-live" style={{ display: "inline-flex", gap: 6, alignItems: "center", fontFamily: mono, fontSize: 11, color: "#4d8dff" }}><i style={{ width: 6, height: 6, borderRadius: 3, background: "#4d8dff", display: "block" }} />working</span>}
          <Spark data={g} /><button data-testid="xd-jump-open" onClick={() => setMenu(true)} title="Jump to a section (Ctrl+K)" style={{ display: "inline-flex", gap: 8, alignItems: "center", background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 7, padding: "3px 9px", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>Jump to<span style={{ fontFamily: mono, fontSize: 10.5, border: `1px solid ${C.border}`, borderRadius: 4, padding: "0 5px", color: C.dim }}>⌘K</span></button></div>
        <Block id="made" label="Made" right={dim(`${made.length}`)}><Media items={made} /></Block>
        <Block id="runs" label="Runs" right={dim(`${d.runs.length}`)}><Runs runs={d.runs} now={d.now} /></Block>
        {d.health && <Health h={d.health} files={d.stats.files ?? d.files.length} />}
        <Block id="files" label="Files" right={dim(`${d.files.length}`)}><Files files={d.files} kinds={d.kinds} /></Block>
        <Block id="history" label="History" right={dim(`${d.commits.length}`)}><History commits={d.commits} now={d.now} /></Block>
      </div>
    </div>
    </StarCtx.Provider>
  );
}
