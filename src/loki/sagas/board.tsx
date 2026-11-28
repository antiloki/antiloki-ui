// THE SAGAS BOARD (operator 2026-11-10): the same sagas as the list, as cards in columns by status. Dragging a card does what the move means to the saga's episodes (model.ts `boardMove`), says what it will do while the card is over a
// column, and refuses with the reason when it cannot. The page lists every workspace's sagas (a card says which one it is in); the pane is the open workspace's.
import * as React from "react";
import { C } from "@/loki/theme";
import { Faces } from "./model-icon";
import { StatusIcon, font } from "./parts";
import { ago, boardMove, columnOf, fmtUsd, progress, STATUS_WORD, visibleColumns, type Saga, type Status } from "./model";

export function Board({ sagas, showWs, onOpen, onMove }: { sagas: Saga[]; showWs: boolean; onOpen: (s: Saga) => void; onMove: (s: Saga, to: Status) => Promise<string | null> }) {
  const [drag, setDrag] = React.useState<Saga | null>(null); const [over, setOver] = React.useState<Status | null>(null); const [note, setNote] = React.useState<{ text: string; bad?: boolean } | null>(null);
  React.useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 4500); return () => clearTimeout(t); }, [note]);
  const cols = visibleColumns(sagas);
  // RIGHT-CLICK DRAG PANS THE BOARD in both directions (the operator 2026-11-22: see all the columns): the row scrolls sideways, the page up and down
  const rowRef = React.useRef<HTMLDivElement>(null); const pan = React.useRef<{ x: number; y: number; sl: number; st: number; scroller: HTMLElement | null } | null>(null);
  const scrollerOf = (el: HTMLElement | null): HTMLElement | null => { let n = el?.parentElement ?? null; while (n) { const oy = getComputedStyle(n).overflowY; if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n; n = n.parentElement; } return null; };
  React.useEffect(() => { const mv = (e: MouseEvent) => { const p = pan.current; if (!p) return; if (rowRef.current) rowRef.current.scrollLeft = p.sl - (e.clientX - p.x); if (p.scroller) p.scroller.scrollTop = p.st - (e.clientY - p.y); }; const up = () => { pan.current = null; document.body.style.cursor = ""; }; window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up); return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); }; }, []);
  const verdict = (to: Status) => (drag ? boardMove(drag.status, to, drag.rollup.episodes - drag.rollup.canceled > 0) : null);
  const drop = async (to: Status) => {
    const s = drag; setDrag(null); setOver(null); if (!s) return;
    const v = boardMove(s.status, to, s.rollup.episodes - s.rollup.canceled > 0);
    if (!v.ok) { setNote({ text: v.why, bad: true }); return; }
    const err = await onMove(s, to); setNote(err ? { text: err, bad: true } : { text: `${s.title}: ${v.says}` });
  };
  return (
    <div data-testid="saga-board" onContextMenu={(e) => e.preventDefault()} onMouseDown={(e) => { if (e.button !== 2) return; const sc = scrollerOf(rowRef.current); pan.current = { x: e.clientX, y: e.clientY, sl: rowRef.current?.scrollLeft ?? 0, st: sc?.scrollTop ?? 0, scroller: sc }; document.body.style.cursor = "grabbing"; }} style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: font, width: "100%" }}>
      {note && <div role="status" data-testid="board-note" style={{ fontSize: 12.5, color: note.bad ? C.bad : C.ok }}>{note.text}</div>}
      <div ref={rowRef} data-testid="saga-board-row" style={{ display: "flex", gap: 12, alignItems: "flex-start", overflowX: "auto", paddingBottom: 8 }}>
        {cols.map((st) => {
          const items = columnOf(sagas, st); const v = over === st ? verdict(st) : null;
          return (
            <section key={st} data-testid={`board-col-${st}`} data-over={over === st ? (v?.ok ? "ok" : "no") : ""}
              onDragOver={(e) => { if (!drag) return; e.preventDefault(); e.dataTransfer.dropEffect = verdict(st)?.ok ? "move" : "none"; if (over !== st) setOver(st); }}
              onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver((o) => (o === st ? null : o)); }}
              onDrop={(e) => { e.preventDefault(); void drop(st); }}
              style={{ flex: "1 1 280px", minWidth: 260, background: v ? (v.ok ? `color-mix(in srgb, ${C.ok} 8%, transparent)` : `color-mix(in srgb, ${C.bad} 7%, transparent)`) : "transparent", border: `1px solid ${v ? (v.ok ? C.ok : C.bad) : C.border}`, borderRadius: 10, padding: 8, display: "flex", flexDirection: "column", gap: 8, minHeight: 120 }}>
              <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px", color: C.dim, fontSize: 13 }}>
                <StatusIcon status={st} size={14} /> {STATUS_WORD[st]} <span style={{ color: C.muted }}>{items.length}</span>
                <span style={{ flex: 1 }} />{v && <span data-testid="board-hint" style={{ fontSize: 11, color: v.ok ? C.ok : C.bad, textAlign: "right" }}>{v.ok ? v.says : v.why}</span>}
              </header>
              {items.length === 0 && <div style={{ color: C.muted, fontSize: 12, padding: "6px 6px 10px" }}>nothing here</div>}
              {items.map((s) => (
                <article key={`${s.workspace ?? ""}:${s.id}`} data-testid={`board-card-${s.id}`} data-ws={s.workspace ?? ""} data-status={s.status} draggable
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(s.id)); e.dataTransfer.effectAllowed = "move"; setDrag(s); }} onDragEnd={() => { setDrag(null); setOver(null); }}
                  onClick={() => onOpen(s)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(s); }}
                  style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 10px", cursor: "grab", display: "flex", flexDirection: "column", gap: 7, opacity: drag?.id === s.id && drag.workspace === s.workspace ? 0.45 : 1 }}>
                  <div style={{ fontSize: 13.5, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const }}>{s.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.muted }}>
                    <Faces agents={s.rollup.agents} />
                    <span data-testid={`board-progress-${s.id}`}>{progress(s.rollup)}</span>
                    <span>{fmtUsd(s.rollup.usd)}</span>
                    <span style={{ flex: 1 }} />
                    {(s.meta?.kind === "team" || s.meta?.kind === "crew") && <span title="run by a team" style={{ color: C.brand }}>team</span>}
                    {s.meta?.kind === "episode" && <span title="an agent's episode" style={{ color: C.ok }}>episode</span>}
                    <span>{ago(s.updated_ms)}</span>
                  </div>
                  {showWs && s.workspace && <span data-testid="board-ws-chip" style={{ alignSelf: "flex-start", fontSize: 10.5, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: "0 7px" }}>{s.workspace}</span>}
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
