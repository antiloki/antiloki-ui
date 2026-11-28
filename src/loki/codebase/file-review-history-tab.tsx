// FILE HISTORY REVIEW — the "history review" tab. The history is of the REVIEW (the problems over time),
// shown against the file AS IT STOOD at each snapshot. Drag the VERTICAL wheel to scrub snapshots; the
// file at that point renders with its review comments overlaid, uncommented regions COLLAPSED (like the
// review tab), and the lines that changed since the previous snapshot GLOWING (the diff animation).
import React from "react";
import { C, mono } from "@/loki/theme";
import { TokLine } from "./highlight";
import { ArcDial } from "./file-history-replay";
import { fileReviewHistoryGet, fileHistory, type FileReviewHistory, type FileReviewSnap, type ReviewComment, type FileRevision } from "@/loki/api/codebase";

const tone = (h: number | null) => (h == null ? C.dim : h >= 80 ? C.ok : h >= 50 ? C.warn : C.bad);
const sevColor = (s?: string) => (/(crit|high|error)/i.test(s ?? "") ? C.bad : /(warn|med)/i.test(s ?? "") ? C.warn : C.dim);

// lines present in `cur` that have no match in `prev` (added/changed) → the glow set, 1-based
function diffNewLines(cur: string[], prev: string[]): Set<number> {
  const counts = new Map<string, number>();
  for (const l of prev) counts.set(l, (counts.get(l) ?? 0) + 1);
  const changed = new Set<number>();
  cur.forEach((l, i) => { const c = counts.get(l) ?? 0; if (c > 0) counts.set(l, c - 1); else changed.add(i + 1); });
  return changed;
}
// collapse: show only comment lines ± context, as visible [from,to] ranges (1-based)
function visibleSegments(total: number, commentLines: number[], ctx = 3): { from: number; to: number }[] {
  const marked = new Set<number>();
  for (const l of commentLines) for (let i = l - ctx; i <= l + ctx; i++) if (i >= 1 && i <= total) marked.add(i);
  const sorted = [...marked].sort((a, b) => a - b);
  if (!sorted.length) return [];
  const segs: { from: number; to: number }[] = [];
  let start = sorted[0], prev = sorted[0];
  for (let k = 1; k < sorted.length; k++) { if (sorted[k] === prev + 1) prev = sorted[k]; else { segs.push({ from: start, to: prev }); start = prev = sorted[k]; } }
  segs.push({ from: start, to: prev });
  return segs;
}

// the hand-drawn ("excalidraw-like") leader arrow — a quadratic curve + arrowhead, ported from the
// review tab (atlas-decorators) so the history review draws its comments the SAME way: a card in the
// margin with an arrow curving back to the flagged line.
function SArrow({ x1, y1, x2, y2, tone }: { x1: number; y1: number; x2: number; y2: number; tone: string }) {
  const mx = (x1 + x2) / 2 + (y2 - y1) * 0.15, my = (y1 + y2) / 2 - (x2 - x1) * 0.08;
  const ang = Math.atan2(y2 - my, x2 - mx);
  return (
    <g stroke={tone} fill="none" strokeWidth={1.2} strokeLinecap="round">
      <path d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`} />
      <path d={`M ${x2 - 7 * Math.cos(ang - 0.45)} ${y2 - 7 * Math.sin(ang - 0.45)} L ${x2} ${y2} L ${x2 - 7 * Math.cos(ang + 0.45)} ${y2 - 7 * Math.sin(ang + 0.45)}`} />
    </g>
  );
}

// the horizontal scrub wheel is ArcDial (imported from file-history-replay — the one the replay uses).

// DETERMINISTIC per-revision review — git revisions carry no judge violations, so we flag the same kinds
// of things the review tab shows (debt markers, debug leftovers, swallowed errors, weak types, eval) from
// the revision's CONTENT. Content-only + deterministic; the authoritative review is still the judge (snapshots).
function detectReview(content: string): ReviewComment[] {
  const out: ReviewComment[] = [];
  content.split("\n").forEach((ln, i) => {
    const n = i + 1, t = ln.trim();
    if (out.length >= 60) return;
    if (/\b(TODO|FIXME|HACK|XXX)\b/.test(ln)) out.push({ line: n, law_key: "DEBT_MARKER", severity: "warn", evidence: t.slice(0, 90) });
    else if (/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(ln)) out.push({ line: n, law_key: "SWALLOWED_ERROR", severity: "high", evidence: "empty catch — the error is silently dropped" });
    else if (/\b(console\.(log|debug|error)|debugger)\b/.test(ln)) out.push({ line: n, law_key: "DEBUG_LEFTOVER", severity: "warn", evidence: t.slice(0, 90) });
    else if (/\beval\s*\(/.test(ln)) out.push({ line: n, law_key: "EVAL_RISK", severity: "high", evidence: t.slice(0, 90) });
    else if (/:\s*any\b/.test(ln)) out.push({ line: n, law_key: "WEAK_TYPE", severity: "low", evidence: t.slice(0, 90) });
  });
  return out;
}

function Comment({ v }: { v: ReviewComment }) {
  return (
    <div style={{ margin: "2px 0 3px 44px", padding: "4px 8px", background: C.panel2, borderLeft: `2px solid ${sevColor(v.severity)}`, borderRadius: "0 5px 5px 0", fontFamily: mono, fontSize: 9, lineHeight: 1.5 }}>
      <span style={{ color: sevColor(v.severity), fontWeight: 700 }}>§ {v.law_key}</span>
      {v.evidence && <span style={{ color: C.muted }}> — {v.evidence}</span>}
    </div>
  );
}

type Snap = FileReviewSnap & { _subject?: string; _author?: string };
export function FileReviewHistoryTab({ path }: { path: string }) {
  const [hist, setHist] = React.useState<FileReviewHistory | null>(null);
  const [unavail, setUnavail] = React.useState<{ kind: string; detail?: string } | null>(null);
  const [sel, setSel] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [mode, setMode] = React.useState<"snap" | "git">("snap"); // git = scrub the file's own commits
  const [gitRevs, setGitRevs] = React.useState<FileRevision[] | null>(null);
  const [gitLoading, setGitLoading] = React.useState(false);
  React.useEffect(() => {
    let a = true; setLoading(true); setUnavail(null);
    void fileReviewHistoryGet({ path }).then((r) => {
      if (!a) return;
      if (r && "unavailable" in r) { setUnavail({ kind: r.unavailable, detail: r.detail }); setHist(null); }
      else { setHist(r); if (mode === "snap") setSel(r && r.snapshots.length ? r.snapshots.length - 1 : 0); }
      setLoading(false);
    });
    return () => { a = false; };
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  // "rebuild from git" — this file's own commits (git show per revision). Always available: no judge pass needed.
  const [gitErr, setGitErr] = React.useState<{ path: string; reason: string } | null>(null);
  const loadGit = React.useCallback(() => {
    setGitLoading(true); setGitErr(null);
    void fileHistory({ path, limit: 60 }).then((h) => {
      const revs = h?.revisions ?? [];
      setGitRevs(revs); setMode("git"); setSel(revs.length ? revs.length - 1 : 0);
      if (!revs.length) setGitErr({ path, reason: h == null ? "couldn't reach the git-history endpoint — the code.file.history action may not be live; restart the BE" : (h.error || "the endpoint returned no revisions") });
      setGitLoading(false);
    });
  }, [path]);
  const gitSnaps: Snap[] = React.useMemo(() => {
    let prevKeys: Set<string> | null = null;
    return (gitRevs ?? []).map((r, i) => {
      // the REAL per-revision review comes from the BE (code.file.history now runs the canonical
      // code-signals-detect on each revision's content). Fall back to the shallow FE scan only if the
      // running BE predates that (no r.violations) — a restart upgrades every wheel point to the real review.
      const violations = r.violations ?? detectReview(r.content);
      const keys = new Set(violations.map((v) => `${v.law_key}@${v.line}`));
      const added = prevKeys ? [...keys].filter((k) => !prevKeys!.has(k)) : [];
      const fixed = prevKeys ? [...prevKeys].filter((k) => !keys.has(k)) : [];
      prevKeys = keys;
      return { id: i, at: r.date, health: null, score: null, axes: {}, violations, added, fixed, sha: r.short, content: r.content, lines: r.lines, _subject: r.subject, _author: r.author };
    });
  }, [gitRevs]);
  // draggable comment cards (the review-tab behaviour): id → pixel offset; the arrow re-anchors so it
  // keeps pointing at its line as the card moves. Reset the layout whenever the shown revision changes.
  const [cardPos, setCardPos] = React.useState<Record<string, { dx: number; dy: number }>>({});
  const cardPosRef = React.useRef(cardPos); cardPosRef.current = cardPos;
  React.useEffect(() => { setCardPos({}); }, [path, sel, mode]);
  const startCardDrag = React.useCallback((id: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const base = cardPosRef.current[id] ?? { dx: 0, dy: 0 };
    const move = (ev: MouseEvent) => setCardPos((mm) => ({ ...mm, [id]: { dx: base.dx + (ev.clientX - sx), dy: base.dy + (ev.clientY - sy) } }));
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  }, []);
  const GitBtn = () => <button onClick={loadGit} disabled={gitLoading} title="rebuild THIS file's history from its own git commits — scrub the revisions + diffs, no full-codebase rebuild"
    style={{ fontFamily: mono, fontSize: 9, background: "transparent", border: `1px solid ${mode === "git" ? C.brand : C.border}`, color: mode === "git" ? C.brand : C.dim, borderRadius: 5, padding: "2px 8px", cursor: gitLoading ? "wait" : "pointer", whiteSpace: "nowrap" }}>{gitLoading ? "reading git…" : "⟳ from git commits"}</button>;

  if (mode === "snap") {
    if (loading) return <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, padding: 12 }}>reading the review ledger…</div>;
    if (unavail) return <div style={{ fontFamily: mono, fontSize: 10, color: C.warn, padding: 12, lineHeight: 1.7 }}>
      {unavail.kind === "not_wired" ? <>The review-history endpoint isn&apos;t live in the running BE.<br /><span style={{ color: C.dim }}>Restart the BE (it re-seeds new actions on boot) — or scrub this file&apos;s own git history instead:</span></>
        : <>The review-history action errored{unavail.detail ? `: ${unavail.detail}` : ""}.<br /><span style={{ color: C.dim }}>Restart the BE to re-seed it — or scrub this file&apos;s own git history instead:</span></>}
      <div style={{ marginTop: 8 }}><GitBtn /></div></div>;
    if (!(hist?.snapshots?.length)) return <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, padding: 12, lineHeight: 1.7 }}>No review snapshots for this file yet.<br /><span style={{ color: C.dim }}>The review is scored by the rebuild&apos;s judge pass. No snapshots? Rebuild just THIS file&apos;s history from its commits — revisions + diffs, right now:</span><div style={{ marginTop: 8 }}><GitBtn /></div></div>;
  }
  if (mode === "git" && gitLoading) return <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, padding: 12 }}>reading this file&apos;s git commits…</div>;
  if (mode === "git" && !gitSnaps.length) return <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, padding: 12, lineHeight: 1.7 }}>
    <span style={{ color: C.warn }}>No git revisions returned for this file.</span><br />
    tried path: <code style={{ color: C.fg }}>{gitErr?.path || path || "(empty path!)"}</code><br />
    <span style={{ color: C.dim }}>reason: {gitErr?.reason ?? "unknown"}</span>
    <div style={{ marginTop: 8 }}><button onClick={() => { setGitErr(null); setMode("snap"); }} style={{ fontFamily: mono, fontSize: 9, background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 5, padding: "2px 8px", cursor: "pointer" }}>← back to review snapshots</button></div>
  </div>;

  const snaps: Snap[] = mode === "git" ? gitSnaps : ((hist?.snapshots ?? []) as Snap[]);

  const cur = snaps[Math.min(sel, snaps.length - 1)];
  const prev = sel > 0 ? snaps[sel - 1] : null;
  const commentLines = [...new Set(cur.violations.map((v) => v.line).filter((l): l is number => l != null))].sort((a, b) => a - b);
  const commentSet = new Set(commentLines);
  const byLine = new Map<number, ReviewComment[]>();
  for (const v of cur.violations) { if (v.line == null) continue; const arr = byLine.get(v.line) ?? []; arr.push(v); byLine.set(v.line, arr); }

  const lines = (cur.content ?? "").split("\n");
  const total = lines.length;
  const changed = (cur.content && prev?.content) ? diffNewLines(lines, prev.content.split("\n")) : new Set<number>();
  // collapse to the REVIEW comments (both modes now have them); fall back to the changed lines if none
  const anchor = commentLines.length ? commentLines : [...changed].sort((a, b) => a - b);
  const segs = cur.content ? (anchor.length ? visibleSegments(total, anchor, 3) : [{ from: 1, to: Math.min(total, 50) }]) : [];

  const rowH = 17, MW = 190;

  // one code line at a FIXED height so the margin arrows can anchor to a line's y
  const CodeLine = ({ ln }: { ln: number }) => {
    const glow = changed.has(ln), commented = commentSet.has(ln);
    return (
      <div style={{ display: "flex", fontFamily: mono, fontSize: 10, height: rowH, lineHeight: `${rowH}px`, background: glow ? `color-mix(in oklab, ${C.ok} 14%, transparent)` : commented ? `color-mix(in oklab, ${C.warn} 8%, transparent)` : undefined }}>
        <span style={{ width: 38, flexShrink: 0, textAlign: "right", paddingRight: 6, color: glow ? C.ok : commented ? C.warn : C.dim, userSelect: "none" }}>{ln}</span>
        <code style={{ whiteSpace: "pre", overflow: "hidden" }}><TokLine text={lines[ln - 1] ?? ""} /></code>
      </div>
    );
  };

  // each reviewed region is a HUNK: the code on the left, a right margin of comment cards — each card an
  // arrow curving back to its line(s), grouped by law_key, stacked so they don't overlap, draggable.
  const hunks = segs.map((seg, si) => {
    const gapN = seg.from - (si === 0 ? 1 : segs[si - 1].to + 1);
    const groups: { key: string; v: ReviewComment; lines: number[] }[] = [];
    for (let ln = seg.from; ln <= seg.to; ln++) for (const v of (byLine.get(ln) ?? [])) {
      let g = groups.find((x) => x.key === v.law_key); if (!g) { g = { key: v.law_key, v, lines: [] }; groups.push(g); }
      if (!g.lines.includes(ln)) g.lines.push(ln);
    }
    const yTop = (ln: number) => (ln - seg.from) * rowH;
    let lastBottom = 0;
    const placed = groups.map((g) => { const est = 40 + (g.v.evidence ? 18 : 0); const y = Math.max(yTop(g.lines[0]), lastBottom + (lastBottom ? 8 : 0)); lastBottom = y + est; return { ...g, y }; });
    const codeH = (seg.to - seg.from + 1) * rowH;
    return (
      <div key={si}>
        {gapN > 0 && <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, padding: "3px 0 3px 40px", borderTop: `1px dashed ${C.border}`, borderBottom: `1px dashed ${C.border}`, margin: "2px 0" }}>⋯ {gapN} line{gapN === 1 ? "" : "s"}</div>}
        <div style={{ display: "grid", gridTemplateColumns: `minmax(0,1fr) ${MW}px`, columnGap: 20, padding: "2px 0" }}>
          <div style={{ minWidth: 0 }}>{Array.from({ length: seg.to - seg.from + 1 }, (_, k) => <CodeLine key={seg.from + k} ln={seg.from + k} />)}</div>
          <div style={{ position: "relative", minHeight: Math.max(codeH, lastBottom) }}>
            {placed.map((g, gi) => {
              const tone = sevColor(g.v.severity);
              const cid = `${seg.from}:${g.key}`; const off = cardPos[cid] ?? { dx: 0, dy: 0 };
              const moved = off.dx !== 0 || off.dy !== 0;
              return (
                <div key={g.key} style={{ position: "absolute", top: g.y, left: 0, right: 0 }}>
                  {/* the arrow origin follows the dragged card; the tip stays anchored to the code line */}
                  <svg style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, overflow: "visible", pointerEvents: "none" }}>
                    {g.lines.map((ln) => <SArrow key={ln} x1={8 + off.dx} y1={13 + off.dy} x2={-22} y2={yTop(ln) + rowH / 2 - g.y} tone={moved ? C.brand : C.dim} />)}
                  </svg>
                  <div onMouseDown={(e) => startCardDrag(cid, e)} title="drag to reposition — the arrow keeps pointing at its line"
                    style={{ position: "relative", border: `1px solid ${moved ? `color-mix(in oklab, ${C.brand} 45%, ${C.border})` : C.border}`, borderRadius: 9, background: C.panel2, padding: "5px 9px", cursor: "grab", transform: `translate(${off.dx}px, ${off.dy}px) rotate(${gi % 2 ? 0.4 : -0.4}deg)`, boxShadow: moved ? "0 3px 12px oklch(0 0 0 / 0.4)" : "none" }}>
                    <span style={{ position: "absolute", top: 1, right: 4, fontFamily: mono, fontSize: 7, color: C.dim, opacity: 0.6, userSelect: "none", pointerEvents: "none" }}>⠿</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: mono, fontSize: 7, color: tone, border: `1px solid ${tone}`, borderRadius: 8, padding: "0 4px" }}>§</span>
                      <b style={{ fontFamily: mono, fontSize: 9, color: C.fg }}>{g.v.law_key}</b>
                      <span style={{ fontFamily: mono, fontSize: 7, color: tone }}>{g.v.severity}{g.lines.length > 1 ? ` ×${g.lines.length}` : ""}</span>
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, marginTop: 1 }}>{g.lines.map((l) => `L${l}`).join(" · ")}</div>
                    {g.v.evidence && <div style={{ fontFamily: mono, fontSize: 8, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>{g.v.evidence}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  });

  const codeView = !cur.content
    ? (<div style={{ padding: "8px 12px" }}>{cur.violations.length ? cur.violations.map((v, i) => <Comment key={i} v={v} />) : <span style={{ fontFamily: mono, fontSize: 10, color: C.ok }}>✓ no problems at this snapshot</span>}
        <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginTop: 8, paddingLeft: 44 }}>file body at this point unavailable (needs git history) — comments shown above</div></div>)
    : !commentLines.length
    ? (<><div style={{ fontFamily: mono, fontSize: 9.5, color: C.ok, padding: "2px 12px 6px 40px" }}>✓ clean review at this snapshot — file head:</div><div style={{ padding: "0 6px" }}>{segs.map((seg, si) => <div key={si}>{Array.from({ length: seg.to - seg.from + 1 }, (_, k) => <CodeLine key={seg.from + k} ln={seg.from + k} />)}</div>)}</div></>)
    : <div style={{ padding: "2px 6px" }}>{hunks}</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 168px", gap: 12, minWidth: 0 }}>
      {/* the file at THIS snapshot, collapsed to the reviewed regions */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          {mode === "snap"
            ? <b style={{ fontFamily: mono, fontSize: 18, color: tone(cur.health), fontVariantNumeric: "tabular-nums" }}>{cur.health ?? "—"}</b>
            : <b style={{ fontFamily: mono, fontSize: 12, color: C.fg }}>⎇ {cur.sha}</b>}
          <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{String(cur.at).slice(0, 10)}{mode === "snap" && cur.sha ? ` · ${cur.sha}` : ""} · {mode === "git" ? "revision" : "snapshot"} {sel + 1}/{snaps.length}</span>
          {mode === "git" && cur._author && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{cur._author}</span>}
          {mode === "git" && cur._subject && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>{cur._subject}</span>}
          {cur.violations.length > 0 && <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>{cur.violations.length} problem{cur.violations.length === 1 ? "" : "s"}</span>}
          {mode === "snap" && snaps.length > 1 && ((cur as any).engineering_version !== (snaps[snaps.length - 1] as any).engineering_version || (cur as any).constitution_hash !== (snaps[snaps.length - 1] as any).constitution_hash) && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>⟲ judged by an earlier instrument/laws — not comparable to the latest</span>}
          {mode === "git" && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }} title="git log --follow: the file's whole ancestry, renames included — the change axis counts only commits on the current path in the recent window">{snaps.length} revisions, renames followed</span>}
          {mode === "git" && changed.size > 0 && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{changed.size} line{changed.size === 1 ? "" : "s"} changed</span>}
          {cur.added.length > 0 && <span style={{ fontFamily: mono, fontSize: 9, color: C.bad }} title={cur.added.join(", ")}>+{cur.added.length} new</span>}
          {cur.fixed.length > 0 && <span style={{ fontFamily: mono, fontSize: 9, color: C.ok }} title={cur.fixed.join(", ")}>✓{cur.fixed.length} fixed</span>}
          <span style={{ flex: 1 }} />
          {mode === "git"
            ? <button onClick={() => setMode("snap")} title="back to the review-snapshot timeline" style={{ fontFamily: mono, fontSize: 9, background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 5, padding: "2px 8px", cursor: "pointer" }}>← snapshots</button>
            : <GitBtn />}
        </div>
        <div style={{ maxHeight: "62vh", overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 0" }}>
          {codeView}
        </div>
      </div>
      {/* the vertical wheel + the snapshot rail */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, borderLeft: `1px solid ${C.border}`, paddingLeft: 10 }}>
        <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>{mode === "git" ? "scrub commits" : "scrub the review"}</span>
        <ArcDial count={snaps.length} index={sel} onChange={setSel} size={150} />
        {snaps.length < 2
          ? <span style={{ fontFamily: mono, fontSize: 8, color: C.warn, textAlign: "center", lineHeight: 1.5 }}>only 1 snapshot — the wheel scrubs once there are ≥2 (rebuild again)</span>
          : <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, textAlign: "center" }}>drag up/down or scroll · or click a date below</span>}
        <div style={{ width: "100%", maxHeight: 210, overflow: "auto" }}>
          {snaps.map((s, i) => {
            // THE SEAM: a health step across a change of instrument or laws is the ruler moving, not
            // the file — the wheel draws a divider and hollows the earlier points so 66 → 80 at the
            // same commit is never read as an improvement
            const prev = snaps[i - 1] as any; const cur2 = s as any;
            const seam = mode === "snap" && i > 0 && (prev?.engineering_version !== cur2?.engineering_version || prev?.constitution_hash !== cur2?.constitution_hash);
            const latest = snaps[snaps.length - 1] as any;
            const sameRuler = mode !== "snap" || (cur2?.engineering_version === latest?.engineering_version && cur2?.constitution_hash === latest?.constitution_hash);
            const seamWhy = seam ? (prev?.engineering_version !== cur2?.engineering_version ? `instrument ${prev?.engineering_version ?? "pre-versioned"} → ${cur2?.engineering_version ?? "?"}` : "the laws changed") : "";
            return (
              <React.Fragment key={s.id}>
                {seam && <div title={`${seamWhy} — earlier points are not comparable to later ones`} style={{ fontFamily: mono, fontSize: 7, color: C.dim, borderTop: `1px dashed ${C.border}`, margin: "3px 0 1px", padding: "1px 5px 0" }}>⟲ {seamWhy}</div>}
                <div onClick={() => setSel(i)} title={`${String(s.at).slice(0, 10)} · health ${s.health} · ${s.violations.length} problems${sameRuler ? "" : " · earlier instrument/laws — not comparable to the latest"}`}
                  style={{ display: "flex", justifyContent: "space-between", gap: 6, padding: "2px 5px", borderRadius: 4, cursor: "pointer", background: i === sel ? C.panel2 : "transparent", fontFamily: mono, fontSize: 9, opacity: sameRuler ? 1 : 0.55 }}>
                  <span style={{ color: i === sel ? C.fg : C.dim }}>{String(s.at).slice(5, 10)}</span>
                  <span style={{ display: "flex", gap: 5 }}>
                    {s.violations.length > 0 && <span style={{ color: C.warn }}>{s.violations.length}⚠</span>}
                    <span style={{ color: tone(s.health), fontVariantNumeric: "tabular-nums", textDecoration: sameRuler ? "none" : "underline dotted" }}>{s.health ?? "—"}</span>
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
