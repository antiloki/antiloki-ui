// THE TEMPORARY WORKER PANES (RFC 0007 §17.4): when the agent in a terminal pane delegates (`antiloki_delegate`), the backend plans it, picks the worker by the
// benchmarks (the merge), runs it headless under the pane's scope, verifies and joins. None of that is the screen's. The screen only READS the pane's runs
// (`GET cowork/workers`) and opens a pane for each task while its worker works, then closes it. A worker's output is collected whole, so the pane is a live
// view of the run's own record (who, on what, its events, then tools, files, tokens, cost and verdict), not a scrolling terminal.
//
// Pure: parsing what the serve sends, which tasks show now, and where their panes go. The panes are derived on every render and never saved in the layout.
import { secs } from "./strip-model";
import { splitPane, leaves, normalize, type Layout, type Node, type PaneRef } from "./layout";

export type WorkerTask = {
  key: string; runId: number; task: string; title: string; status: string; runStatus: string; attempts: number;
  engine: string | null; model: string | null; brain: string | null; merge: string | null; why: string | null;
  started: number | null; ended: number | null;
  tools: { name: string; target: string }[]; tokensIn?: number; tokensOut?: number; cost?: number;
  changed: string[]; verdict: { passed: boolean; reasons: string[] } | null; error: string | null; report: string;
  events: { t: number; kind: string; text: string }[];
};
/** How long a task that passed keeps its pane (the strip's own run summary stays 6 s; a pane has more to read). */
export const HOLD_MS = 8000;

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** What the serve sent, defensively: anything that is not a task with a run and an id is dropped. */
export function parseWorkers(raw: unknown): WorkerTask[] {
  const r: any = raw && typeof raw === "object" && (raw as any).result && !("workers" in (raw as any)) ? (raw as any).result : raw;
  const list = Array.isArray(r?.workers) ? r.workers : [];
  const out: WorkerTask[] = [];
  for (const w of list) {
    const runId = num(w?.run_id); const task = str(w?.task);
    if (runId === undefined || !task) continue;
    const v = w.verdict && typeof w.verdict === "object" ? { passed: w.verdict.passed === true, reasons: (Array.isArray(w.verdict.reasons) ? w.verdict.reasons : []).filter((x: unknown) => typeof x === "string") as string[] } : null;
    out.push({
      key: `${runId}:${task}`, runId, task, title: String(w.title ?? ""), status: String(w.status ?? ""), runStatus: String(w.run_status ?? ""), attempts: num(w.attempts) ?? 1,
      engine: str(w.engine), model: str(w.model), brain: str(w.brain), merge: str(w.merge), why: str(w.why),
      started: num(w.started) ?? null, ended: num(w.ended) ?? null,
      tools: (Array.isArray(w.tools) ? w.tools : []).filter((t: any) => t && typeof t.name === "string").map((t: any) => ({ name: t.name as string, target: String(t.target ?? "") })),
      tokensIn: num(w.tokens_in), tokensOut: num(w.tokens_out), cost: num(w.cost),
      changed: (Array.isArray(w.changed) ? w.changed : []).filter((f: unknown) => typeof f === "string") as string[],
      verdict: v, error: str(w.error), report: typeof w.report === "string" ? w.report : "",
      events: (Array.isArray(w.events) ? w.events : []).filter((e: any) => e && typeof e.text === "string").map((e: any) => ({ t: num(e.t) ?? 0, kind: String(e.kind ?? ""), text: e.text as string })),
    });
  }
  return out;
}

export const isWorking = (w: WorkerTask): boolean => w.status === "running" || w.status === "verifying";
export const isFailed = (w: WorkerTask): boolean => w.status === "failed" || w.status === "blocked" || (w.status === "done" && w.verdict?.passed === false);

/** The tasks that have a pane now: the ones working, the ones that passed for `holdMs` after they ended, and every one that failed until the person dismisses it
 *  (a failure is never hidden by a timer). `now` and `ended` are epoch milliseconds. */
export function visibleWorkers(ws: WorkerTask[], dismissed: ReadonlySet<string>, now: number, holdMs = HOLD_MS): WorkerTask[] {
  return ws.filter((w) => {
    if (dismissed.has(w.key)) return false;
    if (isWorking(w) || isFailed(w)) return true;
    return w.status === "done" && (w.ended === null || now - w.ended < holdMs);
  });
}

/** `cursor · composer-2.5`, the pane's title: who is doing the work. */
export const workerTitle = (w: WorkerTask): string => [w.engine ?? "worker", w.model].filter(Boolean).join(" · ");

const refOf = (w: WorkerTask): PaneRef => ({ id: `worker-${w.key}`, kind: "worker", worker: w.key, title: workerTitle(w) });

/** The layout with each parent's workers split in beside it: the first below the parent, the rest to its right, so a parent's workers sit in a row under it.
 *  Focus and zoom stay where the person put them; the result is for drawing only and is never saved. A pane that would pass the cap is simply not drawn. */
export function withWorkers(base: Layout, byParent: ReadonlyArray<{ parentId: string; workers: WorkerTask[] }>): Layout {
  let l = base;
  for (const { parentId, workers } of byParent) {
    let anchor = parentId;
    workers.forEach((w, i) => {
      const next = splitPane(l, anchor, i === 0 ? "below" : "right", refOf(w));
      if (next === l) return;
      l = next; anchor = refOf(w).id;
    });
    if (workers.length) l = keepParentLarge(l, parentId, workers[0]);
  }
  return { ...l, focus: base.focus, zoom: base.zoom };
}

/** Give the parent most of the room: the split that holds it and its first worker is 70 / 30. */
function keepParentLarge(l: Layout, parentId: string, first: WorkerTask): Layout {
  const wid = refOf(first).id;
  const walk = (n: Node): Node => {
    if (n.type === "leaf") return n;
    // the parent is a leaf of this split and the NEXT child holds its first worker (alone, or the first of a row of workers)
    const pi = n.children.findIndex((c) => c.type === "leaf" && c.pane.id === parentId);
    const wi = pi >= 0 && n.children[pi + 1] && leaves(n.children[pi + 1]).some((p) => p.id === wid) ? pi + 1 : -1;
    if (pi >= 0 && wi === pi + 1 && n.dir === "col") {
      const sizes = n.sizes.slice(); const pair = sizes[pi] + sizes[wi];
      sizes[pi] = pair * 0.7; sizes[wi] = pair * 0.3;
      return { ...n, sizes: normalize(sizes) };
    }
    return { ...n, children: n.children.map(walk) };
  };
  return l.root ? { ...l, root: walk(l.root) } : l;
}

export const workerPanes = (l: Layout): PaneRef[] => leaves(l.root).filter((p) => p.kind === "worker");

/** One plain line for where the task is: "working 4.2 s", "checking", "passed in 3.0 s", "failed". */
export function statusLine(w: WorkerTask, now: number): string {
  if (w.status === "running") return `working ${w.started ? secs(Math.max(0, now - w.started)) : ""}`.trim();
  if (w.status === "verifying") return "checking the result";
  const took = w.started && w.ended ? ` in ${secs(Math.max(0, w.ended - w.started))}` : "";
  if (isFailed(w)) return `${w.status === "blocked" ? "blocked" : "did not pass"}${took}`;
  return `passed${took}`;
}

