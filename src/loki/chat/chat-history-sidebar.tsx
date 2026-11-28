// THE JOURNAL (2026-07-27, operator: "the journal must tell a story, an infinite and continuous
// story") — one unbroken timeline: ● NOW on top, then the chapters back through time under day
// marks. A past episode is a story beat — when it opened and why, how long it ran, what it was
// about (its consolidated snippet). Clicking one STITCHES it above the live conversation (browse,
// never a context switch); ✦ New topic is the only imposed boundary. Driven by chat-thread's
// state — props only, no lifting.
import { ContextLibraryWindow } from "@/loki/widgets/context-library";
import React from "react";
import { C, nav, mono } from "@/loki/theme";
import { fmtTokens } from "@/loki/util/tokens";
import { sumRefTokens } from "./context-wizard";
import { apiGet } from "@/loki/api/client";
import { saveTurnWidget } from "@/loki/api/dispatch";
import { EpisodeArticleWidget } from "@/loki/widgets/episode-article-widget";

// the CONTEXT BOX — its own dockable widget now (operator 2026-07-25: "everything is a widget").
export function ContextBox({ refs, refKey, trayLabel, removeRef, onOpenPicker, sessionRefables }: any) {
  const ctxRefs: any[] = Array.isArray(refs) ? refs : [];
  // THE CONTEXT LIBRARY (operator 2026-09-19): the wizard over every context on the box — the AIs'
  // memories (read-only), antiloki's, and the packs consolidated from them
  const [lib, setLib] = React.useState(false);
  const { tokens } = (refKey ? sumRefTokens(ctxRefs, refKey) : { tokens: 0 });
  const refableN: number = Array.isArray(sessionRefables) ? sessionRefables.length : 0;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, padding: "7px 9px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
        <span style={{ fontFamily: nav, fontSize: 10.5, fontWeight: 700, color: C.fg }}>◆ context</span>
        <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{ctxRefs.length ? `${ctxRefs.length} · ~${fmtTokens(tokens)} tok` : "none"}</span>
        <span style={{ flex: 1 }} />
        <button data-testid="context-library-open" onClick={() => setLib(true)} title="the context library — every context on this box (Claude · Codex · OpenCode · antiloki), consolidated into packs" style={{ background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: 0 }}>⛶ library</button>
        {lib && <ContextLibraryWindow onClose={() => setLib(false)} />}
        <button onClick={onOpenPicker} title="add context (@) — cards · docs · code · sources" style={{ background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 12, lineHeight: 1, padding: 0 }}>@</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {/* the OBLIGATORY session chip — always in context, never removable. It carries the session's
            own generated intelligence: every widget + artefact is automatically grounding for the AI. */}
        <span title={`this session is always in context — its ${refableN} generated widget${refableN === 1 ? "" : "s"} / artefact${refableN === 1 ? "" : "s"} are automatically grounding for the AI`}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, border: `1px solid ${C.brand}`, borderRadius: 10, padding: "1px 7px", background: `color-mix(in oklab, ${C.brand} 13%, ${C.bg})` }}>
          <span style={{ fontFamily: mono, fontSize: 9, color: C.brand, fontWeight: 700 }}>◆ this session</span>
          {refableN > 0 && <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>{refableN}</span>}
        </span>
        {ctxRefs.map((r: any) => { const k = refKey(r); return (
          <span key={k} title={trayLabel?.(r)} style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%", border: `1px solid ${C.border}`, borderRadius: 10, padding: "1px 4px 1px 6px", background: C.bg }}>
            <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 128 }}>{trayLabel?.(r) ?? "ref"}</span>
            <button onClick={() => removeRef?.(k)} title="remove from context" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 10, lineHeight: 1, padding: 0 }}>✕</button>
          </span>
        ); })}
        {ctxRefs.length === 0 && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted, alignSelf: "center" }}><b style={{ color: C.dim }}>@</b> to add more</span>}
      </div>
    </div>
  );
}

// ── the journal's clock: SQLite CURRENT_TIMESTAMP is UTC without a zone — pin it before parsing.
const parseTs = (ts: any): Date => {
  let x = String(ts ?? "").trim().replace(" ", "T");
  if (x && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(x)) x += "Z";
  return new Date(x);
};
const dayLabel = (ts: any): string => {
  const d = parseTs(ts);
  if (!Number.isFinite(d.getTime())) return "sometime";
  const mid = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((mid(new Date()) - mid(d)) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};
const hm = (ts: any): string => {
  const d = parseTs(ts);
  return Number.isFinite(d.getTime()) ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
};
const ago = (ts: any): string => {
  const t = parseTs(ts).getTime();
  if (!Number.isFinite(t)) return "";
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

// episode rows fetched lazily, cached for the app's lifetime — a chapter, once closed, doesn't
// change. Each entry: { meta (reason · from_session_id · prior_md — HOW it opened) , report (the
// ⛨ sentinel's deterministic summary of WHAT WAS DONE — written at the boundary) }.
const EP_META: Map<number, { meta: any; report: any } | undefined | null> = new Map();
async function fetchEpisode(i: number): Promise<{ meta: any; report: any } | null> {
  try {
    const rows: any[] | null = await apiGet(`/api/v1/sessions/${i}/widgets`);
    let m: any = null, r: any = null;
    let widgets = 0, artifacts = 0;
    const kinds = new Map<string, number>();
    for (const w of rows ?? []) { // asc → last wins (the sentinel's row supersedes the FE's)
      if (w?.kind === "episode-meta") { m = w; continue; }
      if (w?.kind === "episode-report") { r = w; continue; }
      if (w?.kind === "session-context") continue;
      if (w?.type === "artifact") artifacts += 1;
      else { widgets += 1; kinds.set(String(w?.kind), (kinds.get(String(w?.kind)) ?? 0) + 1); }
    }
    const parse = (x: any) => { try { return x ? JSON.parse(x.payload_json ?? "null") : null; } catch { return null; } };
    const meta = parse(m);
    let report = parse(r);
    if (!report) {
      // BACKFILL (operator 2026-07-27: "where is the story?"): chapters older than the episode
      // engine never had a boundary run for them — derive the sentinel report ONCE from their
      // own turns, render it now, and write it home so every future reader finds the chapter
      // already consolidated. Deterministic arithmetic, $0.
      const eturns: any[] | null = await apiGet(`/api/v1/sessions/${i}/turns`);
      if (Array.isArray(eturns)) {
        let cost = 0, dispatched = 0;
        const models = new Set<string>();
        let story: string | null = null;
        for (const t of eturns) {
          cost += Number(t?.ai_cost_usd ?? 0) || 0;
          const md = String(t?.model_id ?? "").split("/").pop();
          if (md) models.add(md);
          try { const d = JSON.parse(t?.dispatched_action_ids_json ?? "null"); if (Array.isArray(d) && d.length) dispatched += 1; } catch { /* old row */ }
          if (!story && String(t?.user_text ?? "").trim()) story = String(t.user_text).replace(/\s+/g, " ").trim().slice(0, 96);
        }
        const widget_kinds = [...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => (n > 1 ? `${k} ×${n}` : k));
        report = { turns: eturns.length, cost_usd: Math.round(cost * 10000) / 10000, models: [...models].slice(0, 3), widgets, widget_kinds, artifacts, dispatched, story, backfilled: true };
        void saveTurnWidget({ session_id: i, turn_id: null, type: "widget", kind: "episode-report", payload: report }).catch(() => { /* best-effort */ });
      }
    }
    return { meta, report };
  } catch { return null; }
}
function useEpisodeMetas(ids: number[]) {
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    let on = true;
    const missing = ids.filter((i) => Number.isFinite(i) && !EP_META.has(i)).slice(0, 16);
    if (!missing.length) return;
    for (const i of missing) EP_META.set(i, undefined); // in-flight marker — never refetch
    void Promise.all(missing.map(async (i) => { EP_META.set(i, await fetchEpisode(i)); })).then(() => { if (on) bump(); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);
  // ⛨ the sentinel's authored report lands AFTER rotation (background call) — re-read that ONE
  // chapter when its signal fires, so the headline/narrative appear without a reload.
  React.useEffect(() => {
    let on = true;
    const h = (e: any) => {
      const id = Number(e?.detail?.id);
      if (!Number.isFinite(id)) return;
      EP_META.delete(id);
      void fetchEpisode(id).then((v) => { EP_META.set(id, v); if (on) bump(); });
    };
    window.addEventListener("antiloki:episode-report", h as any);
    return () => { on = false; window.removeEventListener("antiloki:episode-report", h as any); };
  }, []);
}

export function ChatHistorySidebar({ sessions, activeId, liveTurnCount, liveFlags, onSelect, onNew, busy, refs, refKey, trayLabel, removeRef, onOpenPicker, sessionRefables, hideContext, frameless }: any) {
  const list = Array.isArray(sessions) ? sessions : [];
  useEpisodeMetas(list.map((s: any) => Number(s.id)));
  // a beat unfolds its RECORD below itself (operator 2026-07-27: "open below its episode with
  // animation") — one open at a time; once opened it stays mounted, so the collapse animates and
  // reopening is instant (the record is a compile render; its data is already in component state).
  const [expandedId, setExpandedId] = React.useState<number | null>(null);
  const openedRef = React.useRef<Set<number>>(new Set());
  const metaOf = (id: number | null | undefined) => (id == null ? null : (EP_META.get(Number(id))?.meta ?? null));
  const reportOf = (id: number | null | undefined) => (id == null ? null : (EP_META.get(Number(id))?.report ?? null));
  // the one-line story of episode X lives in the snapshot of the episode that FOLLOWED it —
  // joined precisely by from_session_id (the boundary's own receipt).
  const storyOf = (id: number): string | null => {
    for (const v of EP_META.values()) {
      const meta = v?.meta;
      if (meta && Number(meta.from_session_id) === Number(id) && typeof meta.prior_md === "string") {
        const line = meta.prior_md.split("\n").find((l: string) => l.startsWith("- you: "));
        if (line) return line.slice(7, 7 + 96);
      }
    }
    return null;
  };
  // ⛨ the sentinel line — pure arithmetic today; the sentinel agent's authored reports land in the
  // same row later and render here unchanged.
  const sentinelLine = (id: number): string | null => {
    const r = reportOf(id);
    if (!r) return null;
    const bits: string[] = [`${r.turns ?? 0} turns`];
    if (r.cost_usd) bits.push(`$${r.cost_usd}`);
    if (r.widgets) bits.push(`${r.widgets} widget${r.widgets === 1 ? "" : "s"}${Array.isArray(r.widget_kinds) && r.widget_kinds.length ? ` (${r.widget_kinds.join(", ")})` : ""}`);
    if (r.artifacts) bits.push(`${r.artifacts} artefact${r.artifacts === 1 ? "" : "s"}`);
    if (r.dispatched) bits.push(`${r.dispatched} dispatch${r.dispatched === 1 ? "" : "es"}`);
    if (Array.isArray(r.flags) && r.flags.length) bits.push(`⚑ ${r.flags.length} flag${r.flags.length === 1 ? "" : "s"}`);
    return bits.join(" · ");
  };
  const live = list.find((s: any) => s.id === activeId) ?? null;
  const past = list.filter((s: any) => s.id !== activeId);
  let lastDay = "";
  return (
    <aside style={frameless
      ? { display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }
      : { width: 240, flexShrink: 0, background: C.bg, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "12px 12px 8px" }}>
        <button
          onClick={onNew}
          disabled={busy}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = C.fg)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = C.dim)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 8,
            padding: "7px 8px", borderRadius: 6, border: "none",
            background: "transparent", color: C.dim, cursor: busy ? "wait" : "pointer",
            fontFamily: nav, fontSize: 13, fontStyle: "italic", opacity: busy ? 0.6 : 1,
            transition: "color .12s",
          }}
        ><span style={{ color: C.brand, fontSize: 15, lineHeight: 1, fontStyle: "normal" }}>✦</span> New topic</button>
      </div>

      {/* CONTEXT BOX — its own dockable widget now; rendered here only when not docked elsewhere */}
      {refKey && !hideContext && (
        <div style={{ padding: "0 12px 8px", flexShrink: 0 }}>
          <ContextBox refs={refs} refKey={refKey} trayLabel={trayLabel} removeRef={removeRef} onOpenPicker={onOpenPicker} sessionRefables={sessionRefables} />
        </div>
      )}

      {/* THE STORY — one unbroken line from NOW back through every chapter. */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 10px 12px", minHeight: 0 }}>
        {list.length === 0 && activeId == null ? (
          <div style={{ padding: "10px 8px", color: C.muted, fontSize: 12, fontFamily: nav, fontStyle: "italic" }}>the story begins with your first message.</div>
        ) : (
          <div style={{ position: "relative", paddingLeft: 20 }}>
            {/* the continuous thread of time */}
            <span style={{ position: "absolute", left: 7, top: 8, bottom: 6, width: 1, background: C.border }} />

            {/* ● NOW — the live beat */}
            <div style={{ position: "relative", marginBottom: 14 }}>
              <span style={{ position: "absolute", left: -18, top: 2, width: 11, height: 11, borderRadius: "50%", background: C.bg, border: `2px solid ${C.brand}`, animation: "lokiLivePulse 2.4s ease-in-out infinite" }} />
              <div style={{ fontFamily: mono, fontSize: 10.5, color: C.brand, fontWeight: 700, letterSpacing: 0.6 }}>
                now{live ? ` — episode #${live.id}` : activeId != null ? ` — episode #${activeId}` : " — a fresh episode"}
              </div>
              {/* the count comes from the THREAD's loaded turns — the sessions row lags refetches
                  (operator 2026-07-27: "0 turns is a lie"). */}
              <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, marginTop: 2 }}>
                {(() => {
                  const n = Number.isFinite(liveTurnCount) ? Number(liveTurnCount) : (live?.turn_count ?? 0);
                  return `${n} turn${n === 1 ? "" : "s"} · ${live ? `started ${ago(live.started_at)}` : "just opened"}`;
                })()}
              </div>
              {metaOf(activeId)?.reason && (
                <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, marginTop: 2 }}>opened — {String(metaOf(activeId).reason)}</div>
              )}
              {/* ⛨ the live watch — deterministic flags, printed thresholds */}
              {Array.isArray(liveFlags) && liveFlags.map((f: any, i: number) => (
                <div key={i} style={{ fontFamily: mono, fontSize: 9, color: f.sev === "warn" ? C.warn : C.muted, marginTop: 2 }}>⚑ {String(f.text)}</div>
              ))}
            </div>

            {/* the chapters, back through time */}
            {past.map((s: any) => {
              const day = dayLabel(s.started_at);
              const sep = day !== lastDay ? (lastDay = day) : null;
              const m = metaOf(s.id);
              // the story: the successor's snapshot when a boundary wrote one; the chapter's own
              // report line otherwise (backfilled chapters carry it themselves).
              const story = storyOf(s.id) ?? (reportOf(s.id)?.story ?? null);
              const range = `${hm(s.started_at)}${s.last_active_at && hm(s.last_active_at) !== hm(s.started_at) ? `–${hm(s.last_active_at)}` : ""}`;
              return (
                <React.Fragment key={s.id}>
                  {sep && <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: 1.4, margin: "10px 0 7px" }}>{sep}</div>}
                  {/* CHATS (2026-09-21): with `onSelect` the row REOPENS the chat (a past session, like ChatGPT); the record
                      then folds from the small link on the right. Without it (Threads' timeline) the row is the fold. */}
                  <button onClick={() => { const eid = Number(s.id); if (onSelect) { onSelect(eid); return; } openedRef.current.add(eid); setExpandedId((v) => (v === eid ? null : eid)); }} title={onSelect ? `episode #${s.id} — open this chat` : `episode #${s.id} — its record unfolds below (compiled on the spot)`}
                    style={{ position: "relative", display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: "1px 4px 11px 0", color: C.dim, transition: "color .12s" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = C.fg)}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = C.dim)}>
                    <span style={{ position: "absolute", left: -16, top: 5, width: 7, height: 7, borderRadius: "50%", background: C.bg, border: `1.5px solid ${C.border}` }} />
                    <span style={{ display: "block", fontFamily: mono, fontSize: 10.5, color: Number(s.id) === Number(activeId) ? C.fg : "inherit", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: onSelect ? 54 : 0 }}>
                      ✦ episode #{s.id}<span style={{ color: C.muted }}> · {range} · {s.turn_count ?? 0} turns</span>
                      {onSelect && <span role="button" title="its record unfolds below (compiled on the spot)" onClick={(e) => { e.stopPropagation(); const eid = Number(s.id); openedRef.current.add(eid); setExpandedId((v) => (v === eid ? null : eid)); }}
                        style={{ position: "absolute", right: 4, top: 2, fontFamily: mono, fontSize: 9, color: C.muted, padding: "0 2px" }}>{expandedId === Number(s.id) ? "▴ record" : "▾ record"}</span>}
                    </span>
                    {m?.reason && <span style={{ display: "block", fontFamily: mono, fontSize: 9, color: C.muted, marginTop: 2 }}>opened — {String(m.reason)}</span>}
                    {sentinelLine(s.id) && <span style={{ display: "block", fontFamily: mono, fontSize: 9, color: C.dim, marginTop: 2 }}>⛨ {sentinelLine(s.id)}</span>}
                    {reportOf(s.id)?.headline
                      ? <span style={{ display: "block", fontFamily: nav, fontSize: 10.5, color: C.fg, fontStyle: "italic", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>“{String(reportOf(s.id).headline)}”</span>
                      : story && <span style={{ display: "block", fontFamily: nav, fontSize: 10.5, color: C.muted, fontStyle: "italic", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>“{story}”</span>}
                  </button>
                  {/* the record — grid-rows 0fr→1fr is the unfold animation */}
                  <div style={{ display: "grid", gridTemplateRows: expandedId === Number(s.id) ? "1fr" : "0fr", transition: "grid-template-rows .38s cubic-bezier(.25,.9,.3,1)" }}>
                    <div style={{ overflow: "hidden", minHeight: 0 }}>
                      {openedRef.current.has(Number(s.id)) && (
                        <div style={{ padding: "0 2px 12px" }}>
                          <EpisodeArticleWidget payload={{ session_id: Number(s.id) }} ctx={{} as any} />
                        </div>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

// the live beat's pulse — injected once.
if (typeof document !== "undefined" && !document.getElementById("loki-journal-anim")) {
  const st = document.createElement("style");
  st.id = "loki-journal-anim";
  st.textContent = "@keyframes lokiLivePulse{0%,100%{opacity:1}50%{opacity:.38}}";
  document.head.appendChild(st);
}
