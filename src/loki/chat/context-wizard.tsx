// ContextWizard — the @ button's CONTEXT CONTROL CENTER (operator 2026-07-15, iterated live):
// the StudioOverlay shell aimed at TURN context. LEFT rail = CHECKBOX TREES for every entity —
// "decompose all, we can have hundreds of them": Cards (grouped by slug prefix; rows show ONLY the
// card's #id, hover opens the pretty card window with ↗ open-in-new-tab), Knowledge docs (grouped
// by folder), Work (Contracts · Memories · AI calls · Failures groups — one box, like the code
// tree), the Studio's live-source chips (fixed catalog incl. the faculty magazines + generated
// docs), the Code & docs atlas tree, upload. Every selected item carries the ≈tokens it brings.
// RIGHT = the instrument panel: hero readouts (LOAD · COST · PIECES), a segmented composition bar
// (per-piece, kind-colored, click → inspect), and the indexed inventory where each piece carries
// its weight bar and expands to a BEAUTIFUL render — line-numbered code, colorized JSON, markdown.
// Per-piece TEXT overrides still need an envelope ref type (future slice — noted, not faked).
import { libraryCall } from "@/loki/widgets/context-library";
import React from "react";
import { createPortal } from "react-dom";
import { C, mono, nav } from "@/loki/theme";
import { apiGet, apiPost } from "@/loki/api/client";
import { useCards, useKnowledgeDocs, useContracts, useMemoryList, useAICalls } from "@/loki/api/hooks";
import { fileRead } from "@/loki/api/codebase";
import { ModelPicker } from "./chat-modes";
import { buildTree, topKids, buildTokenMap, TreeNode, Check } from "@/loki/codebase/checkbox-tree";
import { SOURCE_GROUPS } from "@/loki/widgets/studio-overlay";
import { CodeSampleWidget } from "@/loki/widgets/view-widgets";
import { Markdown } from "@/loki/components/Markdown";
import { fmtTokens } from "@/loki/util/tokens";

const estTok = (s: any) => Math.ceil(String(s ?? "").length / 4);
// list endpoints differ: some return bare arrays, ai-calls returns { rows, count } (crash report
// 2026-07-15: "(callsQ.data ?? []).slice is not a function"). Tolerate every shape.
const asArray = (d: any): any[] => (Array.isArray(d) ? d : Array.isArray(d?.rows) ? d.rows : Array.isArray(d?.items) ? d.items : []);

// fixed kind → color assignment (identity, never cycled; matches the tile glyphs below).
const KIND_COLOR: Record<string, string> = {
  code_file: C.brand, card: C.warn, knowledge: C.ok, db_row: "oklch(0.78 0.13 300)", source: "oklch(0.80 0.12 150)", attachment: C.muted,
};
function classifyRef(r: any): { glyph: string; color: string; kindLabel: string; title: string } {
  const color = KIND_COLOR[r.kind] ?? C.dim;
  if (r.kind === "card") return { glyph: "🗂", color, kindLabel: "card", title: r.slug };
  if (r.kind === "knowledge") return { glyph: "📖", color, kindLabel: "knowledge doc", title: r.label };
  if (r.kind === "db_row") return { glyph: r.table === "failures" ? "💥" : "🗃", color, kindLabel: `row · ${r.table}`, title: r.rowTitle ?? String(r.id) };
  if (r.kind === "code_file") return { glyph: "{ }", color, kindLabel: "code file", title: r.path };
  if (r.kind === "source") return { glyph: "🔌", color, kindLabel: "live source", title: r.label };
  return { glyph: "📎", color, kindLabel: "upload", title: r.label ?? "attachment" };
}

// ── measurement + preview cache (module-level; survives reopen) ─────────────
type Meas = { tokens: number | null; text: string | null; pending?: boolean };
const MEAS: Record<string, Meas> = {};

// the running token sum of a set of refs, read from the shared measurement cache (populated as the
// context wizard measures each pick). Refs the wizard hasn't measured yet count as 0 (reported separately).
export function sumRefTokens(refs: any[], refKey: (r: any) => string): { tokens: number; measured: number; total: number } {
  let tokens = 0, measured = 0;
  for (const r of refs ?? []) { const m = MEAS[refKey(r)]; if (m && m.tokens != null) { tokens += m.tokens; measured++; } }
  return { tokens, measured, total: (refs ?? []).length };
}
const CARD_INFO: Record<string, any> = {};

const chipStyle = (on: boolean, color: string): React.CSSProperties => ({
  fontFamily: mono, fontSize: 9.5, padding: "2px 7px", borderRadius: 10, cursor: "pointer",
  border: `1px solid ${on ? color : C.border}`, background: on ? `color-mix(in oklab, ${color} 12%, transparent)` : "transparent",
  color: on ? color : C.muted, maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
});
const groupHead: React.CSSProperties = { fontFamily: mono, fontSize: 8, color: C.dim, marginBottom: 5, opacity: 0.7 };
const listBox: React.CSSProperties = { border: `1px solid ${C.border}`, borderRadius: 6, background: C.bg, maxHeight: 190, overflow: "auto", padding: "4px 5px" };

// ── pretty renders (operator: "any chunk of code, AST, json — render it beautifully") ─────────
const JSON_COLORS = { key: "oklch(0.78 0.13 300)", str: "oklch(0.80 0.12 150)", num: "oklch(0.82 0.10 65)", lit: C.brand };
function jsonSpans(ln: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b(?:true|false|null)\b/g;
  let i = 0; let k = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(ln))) {
    if (m.index > i) out.push(<span key={k++} style={{ color: C.dim }}>{ln.slice(i, m.index)}</span>);
    const color = m[1] != null ? (m[2] ? JSON_COLORS.key : JSON_COLORS.str) : /^(true|false|null)$/.test(m[0]) ? JSON_COLORS.lit : JSON_COLORS.num;
    out.push(<span key={k++} style={{ color }}>{m[0]}</span>);
    i = m.index + m[0].length;
  }
  if (i < ln.length) out.push(<span key={k++} style={{ color: C.dim }}>{ln.slice(i)}</span>);
  return out;
}
function PrettyJson({ text }: { text: string }) {
  const pretty = React.useMemo(() => { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } }, [text]);
  const lines = pretty.replace(/\n$/, "").split("\n");
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", background: C.bg }}>
      <div style={{ maxHeight: 280, overflow: "auto", padding: "4px 0" }}>
        {lines.map((ln, k) => (
          <div key={k} style={{ display: "flex", alignItems: "flex-start", minHeight: 17 }}>
            <span style={{ width: 30, flexShrink: 0, textAlign: "right", padding: "1px 8px 0 0", color: C.muted, fontSize: 9.5, fontFamily: mono, userSelect: "none" }}>{k + 1}</span>
            <code style={{ flex: 1, fontFamily: mono, fontSize: 10.5, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.55, paddingRight: 10 }}>{jsonSpans(ln)}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
const looksJson = (s: string) => { const t = s.trim(); return (t.startsWith("{") || t.startsWith("[")) && (() => { try { JSON.parse(t); return true; } catch { return false; } })(); };
function PrettyPreview({ r, text }: { r: any; text: string }) {
  if (!text.trim()) return <span style={{ fontFamily: mono, fontSize: 9.5, color: C.warn }}>this piece resolves server-side at turn time — nothing to preview yet.</span>;
  if (r.kind === "code_file") return <CodeSampleWidget payload={{ code: text, file: r.path }} ctx={{}} />;
  if (looksJson(text)) return <PrettyJson text={text} />;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, padding: "8px 12px", maxHeight: 280, overflow: "auto" }}>
      <Markdown text={text} compact />
    </div>
  );
}

// ── hover detail windows — rows show ONLY an #id (operator 2026-07-15 ×3: cards, then the work
// rows too); everything human lives in the hover window, with ↗ open-in-new-tab where a screen
// exists. One generic rect-tracked portal window; cards fetch their info lazily on first hover. ──
function useHoverRect() {
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const closeT = React.useRef<any>(null);
  const enter = (e: React.MouseEvent, onFirst?: () => void) => {
    clearTimeout(closeT.current);
    setRect((e.currentTarget as HTMLElement).getBoundingClientRect());
    onFirst?.();
  };
  const leave = () => { closeT.current = setTimeout(() => setRect(null), 180); };
  const hold = () => clearTimeout(closeT.current);
  const refresh = () => setRect((r) => (r ? DOMRect.fromRect(r) : r));
  return { rect, enter, leave, hold, refresh };
}
function HoverWin({ rect, hold, leave, heading, sub, body, openUrl, loading }: {
  rect: DOMRect | null; hold: () => void; leave: () => void;
  heading: string; sub?: string | null; body?: string | null; openUrl?: string | null; loading?: boolean;
}) {
  if (!rect) return null;
  return createPortal(
    <div onMouseEnter={hold} onMouseLeave={leave}
      style={{ position: "fixed", left: Math.min(rect.right + 10, window.innerWidth - 340), top: Math.max(10, Math.min(rect.top - 10, window.innerHeight - 220)), width: 320, zIndex: 90, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 14px 44px rgba(0,0,0,0.55)", padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: mono, fontSize: 10.5, color: C.brand, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{heading}</span>
        {openUrl && (
          <button onClick={() => window.open(openUrl, "_blank")} title="open in a new tab"
            style={{ fontFamily: mono, fontSize: 9.5, border: `1px solid ${C.brand}`, color: C.brand, background: "transparent", borderRadius: 6, padding: "2px 8px", cursor: "pointer", flexShrink: 0 }}>↗ open</button>
        )}
      </div>
      {loading ? <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>loading…</span> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {sub && <div style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{sub}</div>}
          {body && <div style={{ fontSize: 10.5, color: C.dim, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "pre-wrap" }}>{body}</div>}
        </div>
      )}
    </div>,
    document.body,
  );
}

// ── the generic checkbox row + group (the code-tree grammar applied to flat entities) ─────────
function CheckRow({ on, label, tok, title, onToggle, onEnter, onLeave }: {
  on: boolean; label: string; tok: string; title?: string; onToggle: () => void;
  onEnter?: (e: React.MouseEvent) => void; onLeave?: () => void;
}) {
  return (
    <div onMouseEnter={onEnter} onMouseLeave={onLeave} style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: 12, minHeight: 17 }}>
      <span onClick={onToggle} style={{ cursor: "pointer", display: "grid", placeItems: "center" }}><Check on={on} /></span>
      <span onClick={onToggle} title={title ?? label} style={{ fontFamily: mono, fontSize: 10.5, color: on ? C.fg : C.dim, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{label}</span>
      {tok && <span style={{ fontFamily: mono, fontSize: 8, color: C.muted, opacity: 0.8, flexShrink: 0 }}>{tok}</span>}
    </div>
  );
}
function CheckGroup({ label, count, open, onToggle, children }: { label: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, minHeight: 17 }}>
        <span onClick={onToggle} style={{ width: 10, cursor: "pointer", color: C.dim, fontSize: 9, textAlign: "center" }}>{open ? "▾" : "▸"}</span>
        <span onClick={onToggle} style={{ fontFamily: mono, fontSize: 10.5, color: C.brand, cursor: "pointer", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}/</span>
        <span style={{ fontFamily: mono, fontSize: 8, color: C.muted, opacity: 0.7, flexShrink: 0 }}>{count}</span>
      </div>
      {open && children}
    </div>
  );
}

// one card row = #id + the lazy-fetched card hover window (its own component: one hook per row).
function CardRow({ card, on, tok, onToggle }: { card: any; on: boolean; tok: string; onToggle: () => void }) {
  const h = useHoverRect();
  const c = CARD_INFO[card.slug];
  let body: any = null;
  try { body = c?.body_json ? (typeof c.body_json === "string" ? JSON.parse(c.body_json) : c.body_json) : null; } catch { body = null; }
  const enter = (e: React.MouseEvent) => h.enter(e, () => {
    if (!CARD_INFO[card.slug]) void apiGet(`/api/v1/cards/${card.slug}`).then((r: any) => { if (r) { CARD_INFO[card.slug] = r; h.refresh(); } }).catch(() => {});
  });
  return (
    <>
      <CheckRow on={on} label={`#${card.id ?? card.slug}`} tok={tok} title={card.slug} onToggle={onToggle} onEnter={enter} onLeave={h.leave} />
      <HoverWin rect={h.rect} hold={h.hold} leave={h.leave} loading={!c}
        heading={card.slug} openUrl={`/contracts/${card.slug}`}
        sub={c ? [c.status, body?.kind, body?.size ? `size ${body.size}` : null, c.score != null ? `score ${c.score}` : null].filter(Boolean).join(" · ") : null}
        body={c ? [c.title, body?.why].filter(Boolean).join("\n") : null} />
    </>
  );
}

// one work row = #id + a hover window built from the list row's own fields (no extra fetch).
function WorkRow({ row, on, tok, onToggle }: { row: any; on: boolean; tok: string; onToggle: () => void }) {
  const h = useHoverRect();
  return (
    <>
      <CheckRow on={on} label={row.idLabel} tok={tok} title={row.heading} onToggle={onToggle} onEnter={(e) => h.enter(e)} onLeave={h.leave} />
      <HoverWin rect={h.rect} hold={h.hold} leave={h.leave} heading={row.heading} sub={row.sub} body={row.body} openUrl={row.openUrl} />
    </>
  );
}

// ── one piece of the inventory (controlled expansion so the composition bar can drive it) ────
function Piece({ idx, r, refKeyStr, open, onToggleOpen, tok, share, text, onRemove, onReplace }: {
  idx: number; r: any; refKeyStr: string; open: boolean; onToggleOpen: () => void;
  tok: number | null; share: number; text: string | null;
  onRemove: () => void; onReplace: () => void;
}) {
  const info = classifyRef(r);
  return (
    <div id={`ctx-piece-${refKeyStr}`} style={{ border: `1px solid ${open ? info.color : C.border}`, borderRadius: 10, background: C.panel, overflow: "hidden" }}>
      <div onClick={onToggleOpen} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 11px", cursor: "pointer" }}>
        <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, width: 22, flexShrink: 0 }}>#{String(idx + 1).padStart(2, "0")}</span>
        <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 12, lineHeight: 1, background: `color-mix(in oklab, ${info.color} 16%, ${C.bg})`, border: `1px solid color-mix(in oklab, ${info.color} 42%, ${C.border})`, color: info.color, fontFamily: mono }}>{info.glyph}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={info.title}>{info.title}</div>
          <div style={{ fontFamily: mono, fontSize: 8.5, color: info.color }}>
            {info.kindLabel}
            {tok != null ? ` · ≈${fmtTokens(tok)} tok` : " · live at turn time"}
            {tok != null && share > 0 ? ` · ${Math.round(share * 100)}%` : ""}
          </div>
        </div>
        <div title={tok != null ? `${Math.round(share * 100)}% of the measured context load` : "measures at turn time"}
          style={{ width: 74, height: 4, borderRadius: 2, background: `color-mix(in oklab, ${C.border} 60%, transparent)`, flexShrink: 0, overflow: "hidden" }}>
          <div style={{ width: `${Math.max(tok != null && share > 0 ? share * 100 : 0, tok != null ? 2 : 0)}%`, height: "100%", background: info.color }} />
        </div>
        <button onClick={(e) => { e.stopPropagation(); onReplace(); }} title="replace — re-aim the rail at this piece's kind (pick a substitute, then remove this one)"
          style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 11, padding: 0 }}>✎</button>
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} title="remove from the turn's context"
          style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 11px" }}>
          <div style={{ fontFamily: mono, fontSize: 8, color: info.color, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5 }}>resolved preview · what the model will see</div>
          {text == null
            ? <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>resolving…</span>
            : <PrettyPreview r={r} text={text} />}
        </div>
      )}
    </div>
  );
}

export function ContextWizard({ refs, refKey, trayLabel, addRef, removeRef, uploading, onUploadClick, onClose, model, setModel }: {
  refs: any[];
  refKey: (r: any) => string;
  trayLabel: (r: any) => string;
  addRef: (r: any) => void;
  removeRef: (key: string) => void;
  uploading: boolean;
  onUploadClick: () => void;
  onClose: () => void;
  // the composer's per-turn model pin — shown as the ANSWERING AI tile, changeable within a tier.
  model: string | null;
  setModel: (m: string | null) => void;
}) {
  const [filter, setFilter] = React.useState("");
  const [, setBump] = React.useState(0);
  const bump = React.useCallback(() => setBump((n) => n + 1), []);
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(new Set());
  const [codePaths, setCodePaths] = React.useState<string[] | null>(null);
  const [fileTokens, setFileTokens] = React.useState<Record<string, number> | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [failures, setFailures] = React.useState<any[]>([]);

  const cardsQ = useCards();
  const docsQ = useKnowledgeDocs(true);
  const contractsQ = useContracts();
  const memsQ = useMemoryList({ limit: 200 });
  const callsQ = useAICalls({ limit: 50 }, 300_000);
  React.useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  React.useEffect(() => {
    (async () => {
      try {
        const r: any = await apiPost("/api/v1/codebase/get", { origin: "atlas", limit: 6000, with_tokens: true, types: ["file"] }, { timeoutMs: 30000 });
        const d = r?.result ?? r;
        const ps = (d?.nodes || []).filter((n: any) => n.type === "file").map((n: any) => String(n.path)).filter(Boolean);
        setCodePaths([...new Set<string>(ps)].sort());
        setFileTokens(d?.file_tokens || null);
      } catch { setCodePaths([]); }
    })();
    (async () => {
      // only error_event rows are referencable (the envelope resolves them against memory.error_events).
      try {
        const r: any = await apiGet(`/api/v1/failures/feed?days=30&limit=200`);
        const d = r?.result ?? r;
        setFailures(asArray(d?.rows ?? d).filter((f: any) => f.kind === "error_event"));
      } catch { setFailures([]); }
    })();
  }, []);

  const tokMap = React.useMemo(() => buildTokenMap(fileTokens), [fileTokens]);

  // ── measure a ref (tokens it brings) — fired on select; rows + totals read MEAS ────────────
  const listRow = {
    doc: (id: number) => asArray(docsQ.data).find((d: any) => d.id === id),
    contract: (slug: string) => asArray(contractsQ.data).find((c: any) => c.slug === slug),
    memory: (id: string) => asArray(memsQ.data).find((m: any) => String(m.id) === String(id)),
    failure: (id: string) => failures.find((f: any) => String(f.ref_id) === String(id)),
  };
  const measure = React.useCallback((r: any) => {
    const key = refKey(r);
    if (MEAS[key]?.pending || MEAS[key]?.tokens != null || MEAS[key]?.text != null) return;
    const done = (tokens: number | null, text: string | null) => { MEAS[key] = { tokens, text }; bump(); };
    if (r.kind === "code_file") { done(tokMap?.[r.path] ?? null, null); return; }
    if (r.kind === "knowledge") { const d = listRow.doc(r.docId); done(estTok(d?.summary ?? d?.vault_path), String(d?.summary ?? "")); return; }
    if (r.kind === "db_row" && r.table === "contracts") { const c = listRow.contract(String(r.id)); const t = [c?.title, c?.briefing_md].filter(Boolean).join("\n"); done(t ? estTok(t) : null, t || null); return; }
    if (r.kind === "db_row" && r.table === "memories") { const m = listRow.memory(String(r.id)); const t = [m?.title, m?.summary_md, m?.body_md].filter(Boolean).join("\n"); done(t ? estTok(t) : null, t || null); return; }
    if (r.kind === "db_row" && r.table === "failures") { const f = listRow.failure(String(r.id)); const t = [f?.title, f?.pattern_key].filter(Boolean).join("\n"); done(t ? estTok(t) : null, t || null); return; }
    if (r.kind === "card") {
      MEAS[key] = { tokens: null, text: null, pending: true }; bump();
      void apiGet(`/api/v1/cards/${r.slug}`).then((c: any) => {
        CARD_INFO[r.slug] = c ?? CARD_INFO[r.slug];
        const body = c?.body_json ? (typeof c.body_json === "string" ? c.body_json : JSON.stringify(c.body_json)) : "";
        const text = JSON.stringify({ slug: c?.slug, title: c?.title, status: c?.status, body: (() => { try { return JSON.parse(body); } catch { return body; } })() }, null, 2);
        done(estTok(text), text);
      }).catch(() => done(null, null));
      return;
    }
    if (r.kind === "source") {
      MEAS[key] = { tokens: null, text: null, pending: true }; bump();
      void apiPost("/api/v1/cockpit/context-preview", { kind: r.source }, { timeoutMs: 30000 }).then((res: any) => {
        const d = res?.result ?? res;
        const text = String(d?.text ?? "");
        done(text ? estTok(text) : null, text || String(d?.note ?? ""));
      }).catch(() => done(null, null));
      return;
    }
    done(null, ""); // ai_calls rows + uploads resolve server-side at turn time — "" shows that, never hangs
  }, [refKey, tokMap, docsQ.data, contractsQ.data, memsQ.data, failures, bump]);

  React.useEffect(() => { for (const r of refs) measure(r); }, [refs, measure]);

  const selected = React.useMemo(() => new Set(refs.map((r) => refKey(r))), [refs, refKey]);
  const [libPacks, setLibPacks] = React.useState<{ slug: string; name: string; bytes?: number }[] | null>(null);
  React.useEffect(() => { let alive = true; void libraryCall({ op: "packs" }).then((d) => { if (alive) setLibPacks(d?.ok && Array.isArray(d.packs) ? d.packs : []); }); return () => { alive = false; }; }, []);
  const isOn = (r: any) => selected.has(refKey(r));
  const toggle = (r: any) => { if (isOn(r)) removeRef(refKey(r)); else { addRef(r); measure(r); } };
  const tokOfRow = (r: any) => {
    if (!isOn(r)) return "";
    const m = MEAS[refKey(r)];
    if (m?.pending) return "…";
    return m?.tokens != null ? `~${fmtTokens(m.tokens)}` : "live";
  };

  const needle = filter.trim().toLowerCase();
  const groupOpen = (g: string) => !!needle || openGroups.has(g);
  const flipGroup = (g: string) => setOpenGroups((s) => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n; });

  // ── grouped entity lists (the code-tree grammar for flat rows) ─────────────
  const cardGroups = React.useMemo(() => {
    const all = asArray(cardsQ.data).filter((c: any) => !needle || String(c.slug).toLowerCase().includes(needle) || String(c.id ?? "").includes(needle));
    const by = new Map<string, any[]>();
    for (const c of all.slice(0, 400)) { const g = String(c.slug).split("-")[0] || "OTHER"; const l = by.get(g) ?? []; l.push(c); by.set(g, l); }
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cardsQ.data, needle]);
  const docGroups = React.useMemo(() => {
    const all = asArray(docsQ.data).filter((d: any) => !needle || String(d.vault_path).toLowerCase().includes(needle) || String(d.summary ?? "").toLowerCase().includes(needle));
    const by = new Map<string, any[]>();
    for (const d of all.slice(0, 400)) { const parts = String(d.vault_path).split("/"); const g = parts.length > 1 ? parts[0] : "(root)"; const l = by.get(g) ?? []; l.push(d); by.set(g, l); }
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [docsQ.data, needle]);
  // Work rows: #id-only labels; every human detail lives in the hover window (operator ×3).
  const workGroups = React.useMemo(() => {
    const match = (s: any) => !needle || String(s ?? "").toLowerCase().includes(needle);
    return [
      { key: "contracts", label: "Contracts", rows: asArray(contractsQ.data).filter((c: any) => match(c.slug) || match(c.title) || match(String(c.id ?? ""))).slice(0, 200).map((c: any) => ({
        ref: { kind: "db_row", table: "contracts", id: c.slug, label: `contracts#${c.slug}` },
        idLabel: `#${c.id ?? c.slug}`, heading: c.slug, sub: c.status ?? null, body: [c.title, c.briefing_md ? String(c.briefing_md).slice(0, 300) : null].filter(Boolean).join("\n"), openUrl: `/contracts/${c.slug}`,
      })) },
      { key: "memories", label: "Memories", rows: asArray(memsQ.data).filter((m: any) => match(m.title) || match(String(m.id))).slice(0, 200).map((m: any) => ({
        ref: { kind: "db_row", table: "memories", id: String(m.id), label: `memories#${m.id}` },
        idLabel: `#${m.id}`, heading: String(m.title ?? `memory #${m.id}`), sub: [m.type, m.added_at].filter(Boolean).join(" · ") || null, body: m.summary_md ?? null, openUrl: null,
      })) },
      { key: "ai_calls", label: "AI calls", rows: asArray(callsQ.data).filter((a: any) => match(String(a.id)) || match(a.model_id)).slice(0, 100).map((a: any) => ({
        ref: { kind: "db_row", table: "ai_calls", id: String(a.id), label: `ai_calls#${a.id}` },
        idLabel: `#${a.id}`, heading: `ai call #${a.id}`, sub: [a.model_id, a.outcome, a.tier].filter(Boolean).join(" · ") || null, body: a.prompt_name ?? a.template_name ?? null, openUrl: null,
      })) },
      { key: "failures", label: "Failures", rows: failures.filter((f: any) => match(f.title) || match(f.pattern_key) || match(String(f.ref_id))).slice(0, 200).map((f: any) => ({
        ref: { kind: "db_row", table: "failures", id: String(f.ref_id), label: `failures#${f.ref_id}`, rowTitle: f.title },
        idLabel: `#${f.ref_id}`, heading: String(f.pattern_key ?? "error event"), sub: f.ts ?? null, body: f.title ?? null, openUrl: null,
      })) },
    ];
  }, [contractsQ.data, memsQ.data, callsQ.data, failures, needle]);

  // Code & docs tree — files toggle a code_file ref; folders expand (a folder isn't a readable ref).
  const filePathSet = React.useMemo(() => new Set(codePaths ?? []), [codePaths]);
  const shown = (codePaths || []).filter((p) => !needle || p.toLowerCase().includes(needle));
  const tree = React.useMemo(() => buildTree(shown.slice(0, 4000)), [shown.join("|")]);
  const tok = React.useCallback((p: string) => tokMap?.[p] ?? null, [tokMap]);
  const checkedFiles = React.useMemo(() => new Set(refs.filter((r) => r.kind === "code_file").map((r) => r.path)), [refs]);
  const togglePath = (p: string) => {
    if (filePathSet.has(p)) toggle({ kind: "code_file", path: p });
    else setExpanded((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  };
  const toggleExp = (p: string) => setExpanded((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const replaceAim = (r: any) => {
    const stem = r.kind === "code_file" ? String(r.path).split("/").pop() : r.kind === "card" ? String(r.slug).split("-")[0] : r.kind === "knowledge" ? String(r.label).split("/").pop() : "";
    setFilter(String(stem ?? "").slice(0, 24));
  };

  const openPiece = (key: string, r: any) => {
    const next = openKey === key ? null : key;
    setOpenKey(next);
    if (next && r.kind === "code_file" && MEAS[key]?.text == null) {
      MEAS[key] = { ...(MEAS[key] ?? { tokens: tokMap?.[r.path] ?? null, text: null }), pending: true }; bump();
      void fileRead({ path: r.path, max_bytes: 12000 }).then((f: any) => {
        const content = String(f?.content ?? f?.result?.content ?? "");
        MEAS[key] = { tokens: MEAS[key]?.tokens ?? (content ? estTok(content) : null), text: content }; bump();
      }).catch(() => { MEAS[key] = { tokens: MEAS[key]?.tokens ?? null, text: "" }; bump(); });
    }
  };

  // ── totals + composition ────────────────────────────────────────────────
  const tokOf = (r: any) => MEAS[refKey(r)]?.tokens ?? null;
  const sumTok = refs.reduce((t, r) => t + (tokOf(r) ?? 0), 0);
  const liveN = refs.filter((r) => tokOf(r) == null).length;
  const counts: Record<string, number> = {};
  for (const r of refs) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  const glyphCounts = [["🗂", counts.card], ["📖", counts.knowledge], ["🗃", counts.db_row], ["{ }", counts.code_file], ["🔌", counts.source], ["📎", counts.attachment]]
    .filter(([, n]) => n) as [string, number][];

  const tile = (label: string, big: string, sub: React.ReactNode, tint: string) => (
    <div style={{ flex: 1, minWidth: 0, border: `1px solid ${C.border}`, borderLeft: `3px solid ${tint}`, borderRadius: 10, background: C.panel, padding: "9px 12px" }}>
      <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 19, fontWeight: 700, color: C.fg, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{big}</div>
      <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
    </div>
  );

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(960px, 93vw)", height: "min(780px, 88vh)", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 70px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: nav, fontSize: 16, fontWeight: 700, color: C.fg }}>@ Context</span>
          <span style={{ fontFamily: mono, fontSize: 11, color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>the session context control center — every piece rides the next message</span>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 6, width: 26, height: 26, cursor: "pointer", fontSize: 14 }}>×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "216px 1fr" }}>
          {/* pickers rail — checkbox trees for every entity (the code-tree grammar) */}
          <div style={{ borderRight: `1px solid ${C.border}`, overflow: "auto", padding: "12px 12px" }}>
            <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Add context</div>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter everything…"
              style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, color: C.fg, fontFamily: mono, fontSize: 9.5, padding: "3px 6px", marginBottom: 10 }} />

            <div style={{ marginBottom: 12 }}>
              <div style={groupHead}>Cards · rows are #id — hover for the card</div>
              <div style={listBox}>
                {cardGroups.length === 0 && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{asArray(cardsQ.data).length ? "no match" : "none"}</span>}
                {cardGroups.map(([g, cards]) => (
                  <CheckGroup key={g} label={g} count={cards.length} open={groupOpen(`cards:${g}`)} onToggle={() => flipGroup(`cards:${g}`)}>
                    {cards.map((c: any) => { const r = { kind: "card", slug: c.slug }; return (
                      <CardRow key={c.slug} card={c} on={isOn(r)} tok={tokOfRow(r)} onToggle={() => toggle(r)} />
                    ); })}
                  </CheckGroup>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={groupHead}>Knowledge docs</div>
              <div style={listBox}>
                {docsQ.loading && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>loading…</span>}
                {!docsQ.loading && docGroups.length === 0 && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{asArray(docsQ.data).length ? "no match" : "none"}</span>}
                {docGroups.map(([g, docs]) => (
                  <CheckGroup key={g} label={g} count={docs.length} open={groupOpen(`docs:${g}`)} onToggle={() => flipGroup(`docs:${g}`)}>
                    {docs.map((d: any) => { const r = { kind: "knowledge", docId: d.id, label: d.vault_path }; return (
                      <CheckRow key={d.id} on={isOn(r)} label={String(d.vault_path).split("/").pop() ?? d.vault_path} tok={tokOfRow(r)} title={d.summary ?? d.vault_path} onToggle={() => toggle(r)} />
                    ); })}
                  </CheckGroup>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={groupHead}>Work · contracts, memories, calls, failures</div>
              <div style={listBox}>
                {workGroups.map((g) => (
                  <CheckGroup key={g.key} label={g.label} count={g.rows.length} open={groupOpen(`work:${g.key}`)} onToggle={() => flipGroup(`work:${g.key}`)}>
                    {g.rows.length === 0 && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, paddingLeft: 12 }}>none</span>}
                    {g.rows.map((row: any) => (
                      <WorkRow key={refKey(row.ref)} row={row} on={isOn(row.ref)} tok={tokOfRow(row.ref)} onToggle={() => toggle(row.ref)} />
                    ))}
                  </CheckGroup>
                ))}
              </div>
            </div>

            {/* THE CONTEXT PACKS (2026-09-20): consolidated in the context library — a pack rides whole (`pack:<slug>`) */}
            {(libPacks?.length ?? 0) > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={groupHead}>Context packs</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(libPacks ?? []).map((p) => { const r = { kind: "source", source: `pack:${p.slug}`, label: p.name }; return (
                    <button key={p.slug} data-testid={`ctx-pack-${p.slug}`} onClick={() => toggle(r)} title={isOn(r) ? "in context — click to remove" : `add the context pack "${p.name}" (~${Math.round((p.bytes ?? 0) / 4)} tok) to this turn`} style={chipStyle(isOn(r), KIND_COLOR.source)}>{isOn(r) ? "✓ " : ""}◆ {p.name}</button>
                  ); })}
                </div>
              </div>
            )}
            {/* the Studio's live-source catalog — a fixed chip set (same groups, same gather) */}
            <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Live sources</div>
            {SOURCE_GROUPS.map((g) => (
              <div key={g.group} style={{ marginBottom: 12 }}>
                <div style={groupHead}>{g.group}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {g.items.map(([k, label]) => { const r = { kind: "source", source: k, label }; return (
                    <button key={k} onClick={() => toggle(r)} title={isOn(r) ? "in context — click to remove" : `add the live ${label} source to this turn`} style={chipStyle(isOn(r), KIND_COLOR.source)}>{isOn(r) ? "✓ " : "+ "}{label}{isOn(r) && tokOfRow(r) ? ` · ${tokOfRow(r)}` : ""}</button>
                  ); })}
                </div>
              </div>
            ))}

            <div style={{ marginBottom: 12 }}>
              <div style={{ ...groupHead, display: "flex" }}>
                <span style={{ flex: 1 }}>Code &amp; docs</span>{checkedFiles.size > 0 && <span>{checkedFiles.size} sel</span>}
              </div>
              <div style={listBox}>
                {codePaths === null ? <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>loading atlas…</span>
                  : !codePaths.length ? <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>atlas empty — rebuild it in Code.</span>
                  : topKids(tree).map((k: any) => <TreeNode key={k.path} node={k} depth={0} checked={checkedFiles} onToggle={togglePath} expanded={expanded} toggleExp={toggleExp} forceOpen={!!needle} ancestorChecked={false} token={tok} />)}
              </div>
            </div>

            <div>
              <div style={groupHead}>Upload</div>
              <button onClick={onUploadClick} disabled={uploading} title="upload a file from disk as grounding" style={{ ...chipStyle(false, KIND_COLOR.attachment), width: "100%" }}>
                {uploading ? "uploading…" : "+ 📎 upload a file"}
              </button>
            </div>
          </div>

          {/* INSTRUMENT PANEL — hero readouts · composition bar · the indexed inventory */}
          <div style={{ overflow: "auto", padding: "14px 16px" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {tile("Context load", `≈${fmtTokens(sumTok)} tok`, liveN ? `${liveN} live piece${liveN === 1 ? "" : "s"} measure at turn time` : "everything measured", C.brand)}
              {/* the ANSWERING AI (operator 2026-07-15: cost estimate out; show the model, changeable
                  within a tier) — the same per-turn pin the composer's picker sets. */}
              <div style={{ flex: 1, minWidth: 0, border: `1px solid ${C.border}`, borderLeft: `3px solid oklch(0.82 0.10 65)`, borderRadius: 10, background: C.panel, padding: "9px 12px" }}>
                <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Answering AI</div>
                <div style={{ fontFamily: mono, fontSize: 15, fontWeight: 700, color: C.fg, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {model ? String(model).split("/").pop() : "auto · tier router"}
                </div>
                <div style={{ marginTop: 3 }}><ModelPicker model={model} setModel={setModel} /></div>
              </div>
              {tile("Pieces", String(refs.length), glyphCounts.length ? glyphCounts.map(([g, n]) => `${g} ${n}`).join("  ") : "empty — feed it from the rail", "oklch(0.80 0.12 150)")}
            </div>

            {sumTok > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 2, height: 12, borderRadius: 6, overflow: "hidden" }}>
                  {refs.map((r) => {
                    const t = tokOf(r);
                    if (t == null || t <= 0) return null;
                    const info = classifyRef(r);
                    const key = refKey(r);
                    return (
                      <div key={key} onClick={() => { openPiece(key, r); document.getElementById(`ctx-piece-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                        title={`${info.title} · ≈${fmtTokens(t)} tok — click to inspect`}
                        style={{ flexGrow: t, flexBasis: 0, minWidth: 5, background: info.color, cursor: "pointer", opacity: openKey === key ? 1 : 0.82 }} />
                    );
                  })}
                </div>
                <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, marginTop: 3 }}>composition of the measured load · click a segment to inspect{liveN ? ` · ${liveN} live piece${liveN === 1 ? "" : "s"} not shown` : ""}</div>
              </div>
            )}

            <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Selected context · in depth</div>
            {refs.length === 0 && (
              <div style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: "26px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>🎛</div>
                <div style={{ fontFamily: mono, fontSize: 10.5, color: C.muted }}>nothing on the board — feed the turn from the rail: cards, knowledge, work rows, live sources, code files.</div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {refs.map((r: any, i: number) => {
                const key = refKey(r);
                const t = tokOf(r);
                return (
                  <Piece key={key} idx={i} r={r} refKeyStr={key} open={openKey === key} onToggleOpen={() => openPiece(key, r)}
                    tok={t} share={sumTok > 0 && t != null ? t / sumTok : 0}
                    text={MEAS[key]?.pending ? null : (MEAS[key]?.text ?? "")}
                    onRemove={() => removeRef(key)} onReplace={() => replaceAim(r)} />
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>checkboxes toggle · selected rows carry their ≈tokens · ✎ re-aims the rail · live sources resolve by the same gather the turn embeds</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose}
            style={{ fontFamily: mono, fontSize: 11.5, borderRadius: 7, padding: "7px 18px", cursor: "pointer", border: `1px solid ${C.brand}`, background: `color-mix(in oklab, ${C.brand} 14%, transparent)`, color: C.brand, fontWeight: 700 }}>Done{refs.length ? ` · ${refs.length}` : ""}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
