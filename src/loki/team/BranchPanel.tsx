// BRANCHES IN THE EDITOR (operator 2026-11-21: "node creation, a blank node that can be anything, also branch creation"): the library of branches (reusable groups of nodes, written as strict YAML in `.antiloki/branches/`), a button to add one to this team as a clone, and a way to SAVE the selected node, with or without everything after it, as a new branch. The serve already had the operations (`branch_list`, `branch_use`, `branch_export`); this is their screen.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { teamOp, getTeam } from "./api";
import type { Graph } from "./types";

export type BranchRow = { name: string; version?: string; description?: string; valid?: boolean; examples?: number; examples_pass?: boolean; file?: string; error?: string };
/** The node and every node reachable from it along the wires, in the order found. Pure. */
export function withEverythingAfter(g: Graph, id: string): string[] {
  const seen: string[] = []; const q = [id]; while (q.length) { const n = q.shift()!; if (seen.includes(n) || !g.nodes[n]) continue; seen.push(n); for (const e of g.edges) if (e.from === n) q.push(e.to); } return seen;
}
/** A branch's name as the library wants it: lower case, digits and dashes. Pure. */
export const branchName = (raw: string) => raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

const btn: React.CSSProperties = { fontFamily: nav, fontSize: 12, background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 7, padding: "3px 10px", cursor: "pointer" };
export function BranchPanel({ team, graph, selected, onGraph }: { team: string; graph: Graph; selected: string | null; onGraph: (g: Graph) => void }) {
  const [rows, setRows] = React.useState<BranchRow[] | null>(null); const [name, setName] = React.useState(""); const [after, setAfter] = React.useState(true); const [msg, setMsg] = React.useState<{ text: string; bad?: boolean } | null>(null); const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async () => { const r = await teamOp<{ branches: BranchRow[] }>("branch_list", {}); setRows(r?.ok && Array.isArray((r as any)?.branches) ? (r as any).branches : []); }, []);
  React.useEffect(() => { void load(); }, [load]);
  const nm = branchName(name); const ids = selected ? (after ? withEverythingAfter(graph, selected) : [selected]) : [];
  const save = async () => {
    setBusy(true); setMsg(null);
    const r: any = await teamOp("branch_export", { team, nodes: ids, meta: { name: nm, version: "1.0.0", description: `${ids.length} node${ids.length === 1 ? "" : "s"} from ${team}`, license: "proprietary" } });
    setBusy(false); if (r?.ok) { setMsg({ text: `Saved the branch “${nm}” (${ids.length} node${ids.length === 1 ? "" : "s"}). It is in the library now.` }); setName(""); void load(); } else setMsg({ text: String(r?.error ?? "the branch was not saved"), bad: true });
  };
  const use = async (b: BranchRow) => {
    setBusy(true); setMsg(null); const r: any = await teamOp("branch_use", { team, name: b.name, mode: "clone", prefix: branchName(b.name) });
    if (!r?.ok) { setBusy(false); setMsg({ text: String(r?.error ?? "the branch was not added"), bad: true }); return; }
    const t = await getTeam(team); setBusy(false); if (t?.graph) { onGraph(t.graph); setMsg({ text: `Added “${b.name}” to this team as its own copy.` }); } else setMsg({ text: "added, but the team could not be reloaded: open it again", bad: true });
  };
  return (
    <div data-testid="branch-panel" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, marginTop: 12, fontFamily: nav, fontSize: 12.5 }}>
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}` }}><b>Branches</b> <span style={{ color: C.muted, fontSize: 11.5 }}>reusable groups of nodes</span></div>
      <div style={{ padding: "8px 14px", display: "grid", gap: 6 }}>
        {rows === null && <span style={{ color: C.muted }}>looking…</span>}
        {rows?.length === 0 && <span data-testid="branch-none" style={{ color: C.muted }}>No branch in the library yet. Select a node and save it as one.</span>}
        {(rows ?? []).map((b) => <div key={b.name ?? b.file} data-testid={`branch-${b.name ?? b.file}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.description ?? b.error}>{b.name ?? b.file}{b.version ? <span style={{ color: C.dim }}> v{b.version}</span> : null}{b.valid === false ? <span style={{ color: C.bad }}> · {b.error ?? "not valid"}</span> : null}</span>
          <button data-testid={`branch-use-${b.name}`} disabled={busy || b.valid === false} title={b.valid === false ? "this file is not a valid branch" : "add a copy of it to this team"} onClick={() => void use(b)} style={{ ...btn, opacity: busy || b.valid === false ? 0.5 : 1 }}>Add</button></div>)}
      </div>
      <div style={{ padding: "8px 14px 10px", borderTop: `1px solid ${C.border}`, display: "grid", gap: 6 }}>
        <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: C.muted }}>Save as a branch</span>
        <input data-testid="branch-name" aria-label="branch name" value={name} onChange={(e) => setName(e.target.value)} placeholder="name, e.g. fetch-and-check" style={{ background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 8px", fontFamily: mono, fontSize: 12 }} />
        <label style={{ display: "flex", gap: 6, alignItems: "center", color: C.muted }}><input data-testid="branch-after" type="checkbox" checked={after} onChange={(e) => setAfter(e.target.checked)} /> with everything after it</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button data-testid="branch-save" disabled={busy || !selected || !nm} title={!selected ? "Select a node on the board first" : !nm ? "Give it a name" : ""} onClick={() => void save()} style={{ ...btn, opacity: busy || !selected || !nm ? 0.5 : 1 }}>Save {ids.length > 0 ? `${ids.length} node${ids.length === 1 ? "" : "s"}` : "selection"}</button>
          {!selected && <span style={{ color: C.muted, fontSize: 11.5 }}>Select a node on the board first.</span>}
        </div>
        {msg && <div data-testid="branch-msg" role="status" style={{ color: msg.bad ? "var(--c-bad)" : "var(--c-ok)" }}>{msg.text}</div>}
      </div>
    </div>);
}
