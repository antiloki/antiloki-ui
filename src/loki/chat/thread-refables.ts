// THE THREAD'S REFERABLE WIDGETS (operator 2026-09-20: antiChat's chrome over the agent session — "# widgets").
// antiChat's `#` lists the session's widgets; an agent pane lives in a THREAD, so its `#` lists the thread's
// other cells — the kanban, a diff, the code graph, another agent — and on send the cell's current content
// (the same deterministic DOM → article reshape the artefacts use) rides with the ask. The dock publishes
// the active thread's items here; the pane reads them. A tiny store, no context plumbing through the split.
import React from "react";

// EVERY THREAD, EVERY WIDGET (operator 2026-09-21: "# should reference any other widget's data even if the
// widget is not active"): the dock publishes every docked widget of the workspace, not just the active
// thread's — `thread` names where it lives, `onScreen` says whether it is rendered right now. An agent
// widget carries its `agentKey` (the pane's chat-<key>): its context is the agent's transcript (the serve),
// never a render. Any other off-screen widget is rendered as a GHOST (hidden, briefly) so the same
// deterministic reshape reads its data — see `ghostCell`.
export type ThreadRefable = { refId: string; label: string; kind: string; type: string; thread?: string; onScreen?: boolean; agentKey?: string };
let current: ThreadRefable[] = [];
const subs = new Set<() => void>();
export function setThreadRefables(items: ThreadRefable[]) {
  const same = items.length === current.length && items.every((x, i) => x.refId === current[i].refId && x.label === current[i].label && x.onScreen === current[i].onScreen && x.thread === current[i].thread);
  if (same) return;
  current = items;
  for (const f of subs) f();
}
export function getThreadRefables(): ThreadRefable[] { return current; }
export function useThreadRefables(): ThreadRefable[] {
  return React.useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, getThreadRefables, getThreadRefables);
}
/** The cell that renders a thread item — `data-thread-cell` is the split's own attribute. */
export function threadCellOf(refId: string): HTMLElement | null {
  try { return document.querySelector(`[data-thread-cell="${CSS.escape(refId)}"]`) as HTMLElement | null; } catch { return null; }
}
/** The `#` tokens the composer inlined (`#<refId> (<Label>)`) → their ids, in order, once each. Pure — tested. */
export function widgetTokens(text: string): { refId: string; label: string }[] {
  const out: { refId: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/#([\w.:-]+) \(([^)]*)\)/g)) { if (!seen.has(m[1])) { seen.add(m[1]); out.push({ refId: m[1], label: m[2] }); } }
  return out;
}
/** The message as the operator reads it back: a chip's token becomes `#Label`. Pure — tested. */
export function displayText(text: string): string { return text.replace(/#([\w.:-]+) \(([^)]*)\)/g, (_m, _id, label) => `#${label}`); }

// ── THE GHOST RENDER: an off-screen widget mounted hidden for one read ──
let ghostHost: ((op: "add" | "remove", refId: string) => void) | null = null;
/** the dock registers itself as the host that can mount a docked widget hidden (widget-dock.tsx) */
export function setGhostHost(f: ((op: "add" | "remove", refId: string) => void) | null) { ghostHost = f; }
export function ghostCellOf(refId: string): HTMLElement | null {
  try { return document.querySelector(`[data-ghost-cell="${CSS.escape(refId)}"]`) as HTMLElement | null; } catch { return null; }
}
/** The cell of a widget for one read: the on-screen cell when it is rendered, else a hidden mount that is
 *  waited for until its text stops growing (its data arrived), then released. `null` when nothing can render it. */
export async function ghostCell(refId: string, opts: { waitMs?: number; settleMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {}): Promise<{ el: HTMLElement; release: () => void } | null> {
  const on = threadCellOf(refId); if (on) return { el: on, release: () => {} };
  if (!ghostHost) return null;
  const waitMs = opts.waitMs ?? 5000, settleMs = opts.settleMs ?? 700;
  const now = opts.now ?? (() => Date.now()); const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  ghostHost("add", refId);
  const release = () => ghostHost?.("remove", refId);
  const t0 = now(); let last = -1, stableSince = now();
  while (now() - t0 < waitMs) {
    await sleep(120);
    const el = ghostCellOf(refId);
    if (!el) continue;
    const len = (el.textContent ?? "").length;
    if (len !== last) { last = len; stableSince = now(); }
    else if (len > 0 && now() - stableSince >= settleMs) return { el, release };
  }
  const el = ghostCellOf(refId);
  if (el) return { el, release };
  release(); return null;
}
