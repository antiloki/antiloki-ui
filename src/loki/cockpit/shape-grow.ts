// shape-grow — the ONE place a shape tree is grown from an artifact (operator
// 2026-07-15: "if it has the plan it should just automatically generate all
// when forged"). Extracted so BOTH the 🧩 shape pane's grow button AND the
// intent pane's ✨ forge can call it — no circular import (this module imports
// nothing from the panes). Calls shapetree mode, assembles the tree, and
// writes the pane's 'shape' blackboard row (update-in-place).
import { apiPost, unwrapResult as unwrap } from "@/loki/api/client";

const uid = () => Math.random().toString(36).slice(2, 8);

export type Alt = { title: string; why: string };
// weight = the operator's conviction in this microtask (0–100, compared against
// siblings in the control center); files = the paths it would touch (drives the
// derived blast radius). Both optional — older shape rows predate them.
export type TNode = { id: string; title: string; detail: string; alts: Alt[]; chosen: number | null; weight?: number; files?: string[] };
export type TBranch = { key: string; title: string; nodes: TNode[] };
// planted = built by hand on the canvas (operator 2026-07-26: no template, no AI) — the auto-grow
// effect must never regrow over it, including after a reload (which is why it lives on the row).
export type Tree = { title: string; artifact_md: string; branches: TBranch[]; context: TNode[]; phases: Array<{ title: string; refs: string[] }>; planted?: boolean };

export { uid };

export async function growShapeTree(sessionId: number, paneId: number, artifact: string): Promise<{ ok: boolean; error?: string; tree?: Tree; rowId?: number }> {
  const art = String(artifact ?? "").trim();
  if (!art) return { ok: false, error: "no artifact to grow from" };
  const d = unwrap(await apiPost("/api/v1/cockpit/plan/generate", { session_id: sessionId, pane_id: paneId, ambition: art, mode: "shapetree" }, { timeoutMs: 300000 }).catch(() => null));
  if (!d?.ok) return { ok: false, error: d?.error ?? "the tree did not grow (is the BE restarted?)" };
  // the shared context docs (RFCs, faculty briefs, notes) become the context branch
  const docs = unwrap(await apiPost("/api/v1/cockpit/blackboard/read", { session_id: sessionId }, { timeoutMs: 20000 }).catch(() => null));
  const ctxNodes: TNode[] = (docs?.context_docs ?? []).slice(0, 6).map((c2: any) => ({ id: uid(), title: String(c2.body_md ?? "").split("\n")[0].slice(0, 70) || "context doc", detail: "shared context — every agent reads this", alts: [], chosen: null }));
  const tree: Tree = {
    title: (art.split("\n")[0] || "the plan").slice(0, 90),
    artifact_md: art,
    branches: (d.branches ?? []).map((b: any) => ({ ...b, nodes: (b.nodes ?? []).map((n: any) => ({ ...n, id: uid() })) })),
    context: ctxNodes,
    phases: d.phases ?? [],
  };
  // write the pane's shape row — update the latest, else insert
  const mine = unwrap(await apiPost("/api/v1/cockpit/blackboard/read", { session_id: sessionId, pane_id: paneId }, { timeoutMs: 20000 }).catch(() => null));
  const existing = ([...((mine?.scratch ?? []) as any[])].reverse()).find((rr: any) => rr.kind === "shape");
  const body = JSON.stringify(tree).slice(0, 19500);
  let rowId = existing?.id as number | undefined;
  if (rowId) await apiPost("/api/v1/cockpit/blackboard/post", { op: "update", id: rowId, body_md: body }, { timeoutMs: 20000 }).catch(() => null);
  else { const r = unwrap(await apiPost("/api/v1/cockpit/blackboard/post", { session_id: sessionId, pane_id: paneId, kind: "shape", body_md: body }, { timeoutMs: 20000 }).catch(() => null)); rowId = r?.id; }
  return { ok: true, tree, rowId };
}
