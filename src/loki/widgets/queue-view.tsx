// THE QUEUE, in the agent's side panel (operator 2026-09-29: "every agent should have its own queue ... an icon and a sidepane of the agent on the right ... tasks on queues can be
// canceled, reordered dragging, or re-prompted"). One list, top to bottom: what was done, what is being done, what is next - each with who will do it (the role and the merge the
// router chose WHEN IT WAS QUEUED, re-decided at its turn), and the checkpoint the box was in. Everything here is read from the serve; nothing in this file decides.
import React from "react";
import { C, mono } from "@/loki/theme";
import { queueList, queueOp, dropIndex, type QueueItem, type QueueSnapshot } from "./subagents";

const label: React.CSSProperties = { fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim };
const btn = (tone?: string): React.CSSProperties => ({ background: "transparent", border: `1px solid ${tone ?? C.border}`, color: tone ?? C.muted, borderRadius: 5, padding: "0 6px", cursor: "pointer", fontFamily: mono, fontSize: 10, lineHeight: "16px" });

/** the glyph and colour of an item's state */
export function itemGlyph(s: QueueItem["status"]): { g: string; tone: string } {
  switch (s) {
    case "done": return { g: "✓", tone: C.ok };
    case "failed": return { g: "✗", tone: C.bad };
    case "cancelled": return { g: "–", tone: C.dim };
    case "doing": return { g: "●", tone: C.warn };
    default: return { g: "○", tone: C.muted };
  }
}
/** how many items are not settled yet - the rail icon's badge. Pure. */
export const activeCount = (q: QueueSnapshot | null): number => (q?.items ?? []).filter((i) => i.status === "queued" || i.status === "doing").length;

/** polls the serve for this agent's queue while the pane exists */
export function useQueue(paneId: number | null | undefined, everyMs = 3000): { q: QueueSnapshot | null; refresh: () => void } {
  const [q, setQ] = React.useState<QueueSnapshot | null>(null);
  const refresh = React.useCallback(() => { if (paneId) void queueList(paneId).then((r) => { if (r) setQ(r); }); }, [paneId]);
  React.useEffect(() => { refresh(); if (!paneId) return; const t = setInterval(refresh, everyMs); return () => clearInterval(t); }, [paneId, everyMs, refresh]);
  return { q, refresh };
}

function Row({ it, conflict, dragging, onDragStart, onDropOn, onChanged, error }: {
  it: QueueItem; conflict: number[]; dragging: boolean;
  onDragStart: (id: number) => void; onDropOn: (over: number, after: boolean) => void; onChanged: () => void; error: (m: string) => void;
}) {
  const { g, tone } = itemGlyph(it.status);
  const [edit, setEdit] = React.useState<string | null>(null);
  const queued = it.status === "queued";
  const run = async (op: "cancel" | "reprompt" | "restore", body: Record<string, unknown>) => { const r = await queueOp(op, { id: it.id, ...body }); if (!r.ok) error(r.error ?? "it did not work"); onChanged(); };
  return (
    <div data-testid={`queue-item-${it.id}`} data-status={it.status}
      draggable={queued && edit == null}
      onDragStart={(e) => { e.dataTransfer?.setData("text/plain", String(it.id)); onDragStart(it.id); }}
      onDragOver={(e) => { if (queued) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onDropOn(it.id, e.clientY > r.top + r.height / 2); }}
      style={{ border: `1px solid ${it.status === "doing" ? C.warn : C.border}`, borderRadius: 7, padding: "6px 8px", display: "flex", flexDirection: "column", gap: 3, background: C.bg, opacity: dragging ? 0.4 : it.status === "cancelled" ? 0.55 : 1, cursor: queued ? "grab" : "default" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        {queued && <span title="drag to reorder" style={{ fontFamily: mono, fontSize: 11, color: C.dim, userSelect: "none" }}>⠿</span>}
        <span style={{ fontFamily: mono, fontSize: 11, color: tone, width: 12, textAlign: "center" }}>{g}</span>
        <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, marginTop: 2 }}>#{it.id}</span>
        {edit == null
          ? <span data-testid={`queue-goal-${it.id}`} onDoubleClick={queued ? () => setEdit(it.goal) : undefined} title={it.goal} style={{ flex: 1, fontFamily: mono, fontSize: 10.5, color: it.status === "done" ? C.muted : C.fg, lineHeight: 1.45, wordBreak: "break-word" }}>{it.goal}</span>
          : <input autoFocus data-testid={`queue-edit-${it.id}`} value={edit} onChange={(e) => setEdit(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setEdit(null); if (e.key === "Enter" && edit.trim()) { const t = edit; setEdit(null); void run("reprompt", { goal: t }); } }}
              style={{ flex: 1, fontFamily: mono, fontSize: 10.5, background: C.bg, color: C.fg, border: `1px solid ${C.brand}`, borderRadius: 4, padding: "1px 4px" }} />}
        {queued && edit == null && <button data-testid={`queue-reprompt-${it.id}`} title="re-prompt: change the words, the route is decided again" onClick={() => setEdit(it.goal)} style={btn()}>✎</button>}
        {(queued || it.status === "doing") && <button data-testid={`queue-cancel-${it.id}`} title={queued ? "cancel before it starts" : "stop the run"} onClick={() => void run("cancel", {})} style={btn(C.bad)}>✕</button>}
        {(it.status === "done" || it.status === "failed") && it.cp_before && <button data-testid={`queue-undo-${it.id}`} title={`undo: put the box back to checkpoint ${it.cp_before.n}, before this ran`} onClick={() => void run("restore", {})} style={btn()}>↶</button>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", paddingLeft: queued ? 30 : 18 }}>
        {it.binding.label && <span data-testid={`queue-route-${it.id}`} title={it.binding.why || it.binding.label} style={{ fontFamily: mono, fontSize: 9, color: C.brand }}>⚡ {it.binding.label}</span>}
        {it.binding.note && <span title={it.binding.note} style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>↻ re-bound</span>}
        {it.cp_before && <span title={`the box before this item: checkpoint ${it.cp_before.n} (${it.cp_before.rev.slice(0, 8)})${it.cp_after ? ` · after: ${it.cp_after.n}` : ""}`} style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>cp {it.cp_before.n}{it.cp_after ? `→${it.cp_after.n}` : ""}</span>}
        {it.removes && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>removes</span>}
        {it.reverts && <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>undoes</span>}
        {conflict.length > 0 && <span title={`names the same file as ${conflict.map((c) => "#" + c).join(", ")}`} style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>⚠ same file as {conflict.map((c) => "#" + c).join(" ")}</span>}
      </div>
      {it.note && it.status !== "queued" && <span style={{ fontFamily: mono, fontSize: 9, color: it.status === "failed" ? C.bad : C.dim, paddingLeft: 18, lineHeight: 1.4 }}>{it.note}</span>}
    </div>
  );
}

export function QueueView({ q, refresh }: { q: QueueSnapshot | null; refresh: () => void }) {
  const [drag, setDrag] = React.useState<number | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  if (!q) return <div style={{ ...label }}>queue — loading…</div>;
  const items = q.items;
  const queued = items.filter((i) => i.status === "queued");
  const conflictsOf = (id: number) => (q.conflicts ?? []).filter((p) => p.includes(id)).map((p) => (p[0] === id ? p[1] : p[0]));
  const drop = async (over: number | null, after: boolean) => {
    if (drag == null) return; const id = drag; setDrag(null);
    const index = dropIndex(queued.map((i) => i.id), id, over, after);
    const r = await queueOp("reorder", { id, index }); if (!r.ok) setErr(r.error ?? "could not move it"); refresh();
  };
  const settled = items.filter((i) => i.status !== "queued" && i.status !== "doing");
  const doing = items.filter((i) => i.status === "doing");
  const row = (it: QueueItem) => (
    <Row key={it.id} it={it} conflict={it.status === "queued" || it.status === "doing" ? conflictsOf(it.id) : []} dragging={drag === it.id} onDragStart={setDrag}
      onDropOn={(over, after) => void drop(over, after)} onChanged={refresh} error={setErr} />
  );
  return (
    <div data-testid="queue-view" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={label}>queue · {doing.length ? "working" : queued.length ? "next up" : "idle"} · {queued.length} waiting</span>
      {err && <span data-testid="queue-error" onClick={() => setErr(null)} style={{ fontFamily: mono, fontSize: 9.5, color: C.bad, cursor: "pointer" }}>{err} ✕</span>}
      {items.length === 0 && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim, lineHeight: 1.5 }}>nothing asked yet. Each task you send is added here with the role and models Heimdall picked for it; they run one at a time, in order.</span>}
      {queued.length > 0 && <>
        <span style={label}>next</span>
        <div data-testid="queue-queued" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { if ((e.target as HTMLElement).closest?.("[data-testid^=queue-item-]")) return; e.preventDefault(); void drop(null, true); }} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {queued.map(row)}
        </div>
      </>}
      {doing.length > 0 && <><span style={label}>doing</span>{doing.map(row)}</>}
      {settled.length > 0 && <><span style={label}>done</span>{[...settled].reverse().map(row)}</>}
      {q.checkpoints.length > 0 && (
        <details style={{ marginTop: 4 }}>
          <summary style={{ ...label, cursor: "pointer" }}>checkpoints · {q.checkpoints.length}</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 4 }}>
            {q.checkpoints.map((c) => <span key={c.n} style={{ fontFamily: mono, fontSize: 9, color: C.dim }} title={c.subject}>{c.n} · {c.rev} · {c.subject.replace(/^checkpoint \d+ · /, "")}</span>)}
          </div>
        </details>
      )}
    </div>
  );
}
