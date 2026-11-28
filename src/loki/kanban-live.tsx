// EPIC-PIPELINE-WATERFALL-LIVE / FEAT-PIPELINE-LIVE-CARDS-IN-KANBAN.
// 9-column kanban view of every active card, grouped by derived phase.
// Live-tail via useActiveCards (2s polling). Preserves the design from
// loki/kanban.tsx — same column layout, role colors, card visuals — but
// every datum is real.
//
// Phase → column mapping kept in one place (PHASE_TO_COL) so future
// tweaks (e.g. splitting "qa" between qa-pending and qa-retry) only
// touch this file.
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useActiveCards } from "@/loki/api/hooks";
import type { ActiveCard } from "@/loki/api/hooks";
import { setCardIntent, dispatchForceTick, dispatchHalt, cardPreflight } from "@/loki/api/dispatch";
import type { PreflightResult } from "@/loki/api/dispatch";
import { C } from "@/loki/theme";
import { LoadGate } from "@/loki/components/LoadGate";
import { isRecentlyFailing } from "@/loki/api/types";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';

const ROLES = {
  pl:     { label: "product-lead", short: "PL",  color: "oklch(0.78 0.16 50)",  bg: "oklch(0.30 0.10 50 / 0.22)",  glyph: "◆" },
  tl:     { label: "tech-lead",    short: "TL",  color: "oklch(0.78 0.13 240)", bg: "oklch(0.30 0.10 240 / 0.22)", glyph: "▲" },
  design: { label: "design-lead",  short: "DS",  color: "oklch(0.78 0.16 295)", bg: "oklch(0.30 0.10 295 / 0.22)", glyph: "■" },
  dev:    { label: "dev",          short: "DEV", color: "oklch(0.80 0.15 145)", bg: "oklch(0.30 0.10 145 / 0.22)", glyph: "●" },
  // EPIC-DRIVER-WATERFALL-REDESIGN: DEV folded into git-manager (the worktree
  // executor). 'dev' kept above for historical events; new events are git-manager.
  "git-manager": { label: "git-manager", short: "GIT", color: "oklch(0.80 0.15 145)", bg: "oklch(0.30 0.10 145 / 0.22)", glyph: "●" },
  qa:     { label: "qa",           short: "QA",  color: "oklch(0.72 0.18 25)",  bg: "oklch(0.30 0.12 25 / 0.22)",  glyph: "✕" },
} as const;

type ColumnDef = {
  id: string;
  label: string;
  role: keyof typeof ROLES | null;
  width: number;
  flex: number;
  phases: string[];   // current_phase values that map here
};

// Three phase groups, matching the operator's mental model of how a
// card moves through the substrate. Each card tile surfaces its REAL
// sub-phase as a chip so the operator knows where INSIDE the phase
// it is (e.g., "TL sign" vs "PL ratify" both inside Contract).
//
// Contract Phase    — propose, all PL gates, all TL gates, MAN audit, sandbox
// Development Phase — DEV impl + QA + retry loops (qa fail → tl amend stays
//                     here because it's still in active implementation)
// Consolidation     — MAN review + Keeper + seal/close
const COLUMNS: ColumnDef[] = [
  {
    id: "contract", label: "Contract", role: null, width: 0, flex: 1,
    phases: [
      "propose",
      "pl_session", "pl_ratify", "pl_review", "approve",
      "tl_draft", "tl_refine", "tl_plan", "tl_author", "tl_sign", "draft", "tl_ok",
      "man_audit",
      "sandbox",
    ],
  },
  {
    id: "development", label: "Development", role: null, width: 0, flex: 1,
    phases: [
      "impl_start", "impl_done", "dev",
      "qa_pass", "qa_fail",
      "tl_amend",
    ],
  },
  {
    id: "consolidation", label: "Consolidation", role: null, width: 0, flex: 1,
    phases: ["man_review", "keeper", "seal"],
  },
];

// Sub-phase → human label for the chip rendered on each card tile.
const SUBPHASE_LABEL: Record<string, string> = {
  propose:     "propose",
  pl_session:  "PL session",
  pl_ratify:   "PL ratify",
  pl_review:   "PL review",
  approve:     "approved",
  tl_draft:    "TL draft",
  tl_refine:   "TL refine",
  tl_plan:     "TL plan",
  tl_author:   "TL author",
  tl_sign:     "TL sign",
  tl_amend:    "TL amend",
  draft:       "TL draft",
  tl_ok:       "TL sign",
  man_audit:   "MAN audit",
  sandbox:     "sandbox",
  impl_start:  "git-manager impl",
  impl_done:   "git-manager done",
  dev:         "git-manager",
  qa_pass:     "QA verify",
  qa_fail:     "QA failed",
  man_review:  "MAN review",
  keeper:      "Keeper",
  seal:        "sealed",
};

// Sub-phase → role color (PL purple, TL cyan, MAN amber, DEV green,
// QA red, KEEP mauve). Keeps the role identity visible on each card
// even though the column is the broader phase group.
const SUBPHASE_ROLE: Record<string, keyof typeof ROLES | "MAN" | "KEEP"> = {
  propose:     "pl",
  pl_session:  "pl",
  pl_ratify:   "pl",
  pl_review:   "pl",
  approve:     "pl",
  tl_draft:    "tl",
  tl_refine:   "tl",
  tl_plan:     "tl",
  tl_author:   "tl",
  tl_sign:     "tl",
  tl_amend:    "tl",
  draft:       "tl",
  tl_ok:       "tl",
  sandbox:     "tl",
  man_audit:   "MAN",
  impl_start:  "git-manager",
  impl_done:   "git-manager",
  dev:         "git-manager",
  qa_pass:     "qa",
  qa_fail:     "qa",
  man_review:  "MAN",
  keeper:      "KEEP",
  seal:        "KEEP",
};

const EXTRA_ROLE_COLOR: Record<string, string> = {
  MAN:  "oklch(0.78 0.15 60)",
  KEEP: "oklch(0.74 0.10 280)",
};

function roleColorFor(subphase: string | null): string {
  if (!subphase) return C.muted;
  const r = SUBPHASE_ROLE[subphase];
  if (!r) return C.muted;
  if (r in ROLES) return ROLES[r as keyof typeof ROLES].color;
  return EXTRA_ROLE_COLOR[r] ?? C.muted;
}

function columnForPhase(phase: string | null): string {
  if (!phase) return "contract";
  for (const c of COLUMNS) if (c.phases.includes(phase)) return c.id;
  return "contract";
}

export function KanbanPipelineLive() {
  const q = useActiveCards();
  const cards: ActiveCard[] = Array.isArray(q.data) ? q.data : [];

  const byColumn = React.useMemo(() => {
    const m: Record<string, ActiveCard[]> = {};
    for (const col of COLUMNS) m[col.id] = [];
    for (const c of cards) m[columnForPhase(c.current_phase)].push(c);
    return m;
  }, [cards]);

  return (
    <LoadGate queries={[q]} label="pipeline">
      <div style={{
        width: "100%", height: "100%",
        background: C.bg, color: C.fg,
        fontFamily: '-apple-system, system-ui, sans-serif',
        fontSize: 13, letterSpacing: -0.1,
        display: "grid",
        gridTemplateRows: "44px 1fr",
        overflow: "hidden",
      }}>
        <TopBar cards={cards} loading={q.loading && cards.length === 0} error={!!q.error} />
        <div style={{
          display: "flex", gap: 8, padding: "12px 14px",
          overflow: "hidden", minHeight: 0,
        }}>
          {COLUMNS.map((col) => (
            <Column key={col.id} col={col} cards={byColumn[col.id]} />
          ))}
        </div>
      </div>
    </LoadGate>
  );
}

function TopBar({ cards, loading, error }: { cards: ActiveCard[]; loading: boolean; error: boolean }) {
  return (
    <div style={{
      borderBottom: `1px solid ${C.border}`,
      background: C.bg,
      display: "flex", alignItems: "center",
      padding: "0 14px", gap: 14,
      fontSize: 12, color: C.dim,
    }}>
      <span style={{ fontFamily: mono, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>
        operations · pipeline
      </span>
      <span style={{ flex: 1 }} />
      {loading && <span style={{ color: C.muted }}>loading…</span>}
      {error && !loading && <span style={{ color: C.bad }}>error loading /api/v1/cards-active</span>}
      {!loading && !error && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 11 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: C.ok }} />
          <span style={{ color: C.fg }}>{cards.length}</span>
          <span style={{ color: C.muted }}>active</span>
          <span style={{ color: C.muted }}>· polled every 2s</span>
        </span>
      )}
    </div>
  );
}

const COLUMN_TOP_BORDER: Record<string, string> = {
  contract:      "oklch(0.78 0.13 240)",  // TL cyan — dominant role
  development:   C.ok,                    // DEV green
  consolidation: "oklch(0.74 0.10 280)",  // KEEP mauve
};

function Column({ col, cards }: { col: ColumnDef; cards: ActiveCard[] }) {
  // Column header lists the substrate gates this column accepts so the
  // operator sees what's inside it at a glance.
  const subPhases = col.phases.map((p) => SUBPHASE_LABEL[p] ?? p);
  const uniqueSubs = [...new Set(subPhases)];
  return (
    <div style={{
      flex: col.flex || `0 0 ${col.width}px`,
      width: col.width || undefined,
      minWidth: col.width || 0,
      background: C.panel,
      border: `1px solid ${C.border}`,
      borderTop: `2px solid ${COLUMN_TOP_BORDER[col.id] ?? C.border}`,
      borderRadius: 6,
      display: "flex", flexDirection: "column",
      minHeight: 0, overflow: "hidden",
    }}>
      <div style={{
        padding: "10px 12px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column", gap: 4,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase", fontWeight: 600,
            color: C.fg, flex: 1,
          }}>{col.label}</span>
          <span style={{
            fontSize: 11, padding: "1px 7px", borderRadius: 3,
            background: cards.length > 0 ? C.panel2 : "transparent",
            color: cards.length > 0 ? C.fg : C.muted,
            fontFamily: mono, fontWeight: 500,
          }}>{cards.length}</span>
        </div>
        <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, lineHeight: 1.4 }}>
          {uniqueSubs.join(" · ")}
        </div>
      </div>
      <div style={{
        flex: 1, padding: 8, overflow: "auto",
        display: "flex", flexDirection: "column", gap: 8, minHeight: 0,
      }}>
        {cards.map((c) => <CardTile key={c.slug} card={c} />)}
        {cards.length === 0 && (
          <div style={{ flex: 1, minHeight: 40, color: C.muted, fontSize: 11, fontStyle: "italic", textAlign: "center", paddingTop: 12 }}>
            no cards in this phase
          </div>
        )}
      </div>
    </div>
  );
}

function CardTile({ card }: { card: ActiveCard; role?: any }) {
  const elapsed = card.last_event_ts ? humanElapsed(card.last_event_ts) : "—";
  const sub = card.current_phase;
  const subColor = roleColorFor(sub);
  const subLabel = sub ? (SUBPHASE_LABEL[sub] ?? sub) : "no events";
  // FEAT-CARD-AWAITING-CHILDREN-STATUS: parents waiting for decomposed
  // children get a distinct tile treatment so the operator instantly
  // sees they aren't being actively worked on — just gating on children.
  const isAwaiting = card.status === "awaiting_children";
  // FIX-BLOCKED-CARDS-INVISIBLE (2026-06-11): a blocked card (driver
  // escalated to the human) is the most attention-worthy tile on the
  // board — red border + a loud chip, never invisible.
  const isBlocked = card.status === "blocked";
  return (
    <Link to="/" style={{
      textAlign: "left",
      background: isBlocked
        ? `color-mix(in oklab, ${C.bad} 12%, ${C.panel2})`
        : isAwaiting
        ? `color-mix(in oklab, ${C.warn} 10%, ${C.panel2})`
        : C.panel2,
      border: `1px solid ${isBlocked ? C.bad : isAwaiting ? `color-mix(in oklab, ${C.warn} 50%, ${C.border})` : C.border}`,
      borderLeft: `3px solid ${isBlocked ? C.bad : isAwaiting ? C.warn : subColor}`,
      borderRadius: 5,
      padding: "7px 9px",
      textDecoration: "none",
      color: C.fg,
      display: "block",
      opacity: isAwaiting ? 0.92 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
        {/* Sub-phase chip — the operator's primary "where exactly?"
            signal. Colored by role (PL/TL/MAN/DEV/QA/KEEP).
            Awaiting-children parents show a dedicated AWAITING chip
            instead since their sub-phase is meaningless (they're
            gated on children, not on a specific role). */}
        {isBlocked ? (
          <span style={{
            fontSize: 9, padding: "1px 6px", borderRadius: 3, fontWeight: 700,
            background: `color-mix(in oklab, ${C.bad} 18%, transparent)`,
            border: `1px solid ${C.bad}`, color: C.bad,
            fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.4,
          }}>⛔ blocked — needs you</span>
        ) : isRecentlyFailing(card) ? (
          <span title={card.last_failure_kind ?? "stage failure"} style={{
            fontSize: 9, padding: "1px 6px", borderRadius: 3, fontWeight: 700,
            background: `color-mix(in oklab, ${C.warn} 16%, transparent)`,
            border: `1px solid ${C.warn}`, color: C.warn,
            fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.4,
          }}>⚠ failing</span>
        ) : isAwaiting ? (
          <span style={{
            fontSize: 9, padding: "1px 6px", borderRadius: 3,
            background: "transparent", border: `1px solid ${C.warn}`, color: C.warn,
            fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.4,
          }}>awaiting children</span>
        ) : (
          <span style={{
            fontSize: 9, padding: "1px 6px", borderRadius: 3,
            background: "transparent", border: `1px solid ${subColor}`, color: subColor,
            fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.4,
          }}>{subLabel}</span>
        )}
        {card.size && (
          <span style={{
            fontSize: 9, padding: "1px 4px", borderRadius: 3,
            background: C.bg, color: C.dim, fontFamily: mono,
          }}>{card.size}</span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: mono, fontSize: 10.5, color: C.brand, fontWeight: 600 }}>
          #{card.id}
        </span>
        <TileRunButton slug={card.slug} intent={card.driver_intent} />
      </div>
      <div style={{ fontSize: 11.5, color: C.fg, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis",
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, marginBottom: 4 }}>
        {card.title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9.5, color: C.muted, fontFamily: mono }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{card.slug}</span>
        <span>{elapsed}</span>
      </div>
    </Link>
  );
}

// Per-tile RUN ↔ PAUSE. RUN is GATED (FEAT-CARD-RUN-PREFLIGHT): clicking ▶
// first runs the preflight (dependency block-check + field-completeness + PL
// accuracy score). Only when the gate passes (ok=true) do we set
// driver_intent=play + force a tick. When it fails it's a HARD block — the
// card is NOT played and the blockers are shown inline so the operator knows
// exactly what to fix. PAUSE is ungated (just flips intent back). The tile is
// a <Link>, so clicks must be stopped from bubbling into navigation. The
// kanban's 2s poll refreshes the intent state — no manual refetch needed.
function TileRunButton({ slug, intent }: { slug: string; intent: string | null }) {
  const playing = intent === "play";
  const [busy, setBusy] = React.useState(false);
  const [blocked, setBlocked] = React.useState<PreflightResult | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    setBlocked(null);
    setErr(null);
    try {
      if (playing) {
        await setCardIntent(slug, "pause");
        return;
      }
      const pre = await cardPreflight(slug);
      if (!pre) { setErr("preflight failed — try again"); return; }
      if (!pre.ok) { setBlocked(pre); return; } // HARD block — do not play
      // Clear the driver halt before playing — a manual pause (or a prior
      // pause-all) writes .antiloki/run/driver-halt, which makes EVERY tick
      // return halt_requested. Without this, RUN sets intent=play + force-ticks
      // but the loop is still halted, so the card silently never runs. The
      // waterfall RUN already does this; the preflight buttons did not.
      await dispatchHalt(false);
      const r = await setCardIntent(slug, "play");
      if (r) await dispatchForceTick();
    } catch (e: any) {
      setErr(e?.message || "preflight failed");
    } finally { setBusy(false); }
  };

  const color = playing ? C.warn : C.ok;
  const showPopover = blocked != null || err != null;
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={onClick}
        disabled={busy}
        title={playing
          ? "Pause — driver skips this card on the next tick"
          : "Run — preflight (deps + fields + accuracy) then add to driver"}
        aria-label={playing ? "pause card" : "run card"}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 18, height: 18, padding: 0, borderRadius: 4,
          background: `color-mix(in oklab, ${color} 12%, transparent)`,
          border: `1px solid ${color}`, color,
          cursor: busy ? "wait" : "pointer",
          fontSize: 9, fontFamily: mono, lineHeight: 1,
          opacity: busy ? 0.5 : 1,
        }}
      >
        {busy ? "…" : playing ? "⏸" : "▶"}
      </button>
      {showPopover && (
        <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBlocked(null); setErr(null); }} />
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 70,
            background: C.panel, border: `1px solid ${C.bad}`, borderRadius: 8,
            padding: "10px 12px", minWidth: 260, maxWidth: 360,
            boxShadow: "0 6px 24px rgba(0,0,0,0.4)", whiteSpace: "normal",
          }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.bad, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              run blocked
            </div>
            {err && <div style={{ fontSize: 12, color: C.fg }}>{err}</div>}
            {blocked && (
              <>
                {blocked.accuracy_score != null && (
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: mono, marginBottom: 6 }}>
                    accuracy {blocked.accuracy_score}/100 · gate ≥{blocked.accuracy_min}
                  </div>
                )}
                <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
                  {blocked.blockers.map((b, i) => (
                    <li key={i} style={{ fontSize: 11.5, color: C.fg, lineHeight: 1.35 }}>{b.message}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </span>
      )}
    </span>
  );
}

function humanElapsed(ts: string): string {
  try {
    const then = new Date(ts).getTime();
    const diff = Math.max(0, Date.now() - then);
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return ts; }
}
