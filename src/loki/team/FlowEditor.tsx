// THE TEAM AS A FLOW YOU BUILD IN PLACE (approved mockup 2026-11-18, from the idea of AffectUI's Flow Builder; drawn by us): the steps in the order the team meets them, each a card with its icon, name and what it does; on every line between two steps a + that adds a step there;
// an If shows its then / else; a click selects (the inspector beside it is the same as the board's). It edits the same draft as the board, so Undo and Save are the editor's own. Pure `insertAfter` (model.ts) puts the new node on the line.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { Icon } from "./icons";
import { flowOrder, insertAfter, freshId, sublabel, titleOf } from "./model";
import type { GNode, Graph } from "./types";

export type FlowItem = { id: string; label: string; family?: string; default: unknown; ports?: string[] };
export function FlowEditor({ graph, items, selected, issues, onSelect, onChange }: { graph: Graph; items: FlowItem[]; selected: string | null; issues: string[]; onSelect: (id: string) => void; onChange: (g: Graph) => void }) {
  const [menu, setMenu] = React.useState<string | null>(null);   // the step after which the + menu is open
  React.useEffect(() => { if (menu === null) return; const off = () => setMenu(null); window.addEventListener("click", off); return () => window.removeEventListener("click", off); }, [menu]);
  const order = flowOrder(graph).filter((id) => graph.nodes[id]?.node !== "leader");
  const bad = (id: string) => issues.some((m) => m.startsWith(`${id}:`) || m.startsWith(`${id} `));
  const add = (after: string, it: FlowItem) => { const id = freshId(graph, it.id); const node = { ...(it.default as any) } as GNode; onChange(insertAfter(graph, after, id, node, it.ports?.[0] ?? "out")); onSelect(id); setMenu(null); };
  const branches = (id: string) => graph.edges.filter((e) => e.from === id && (e.port === "then" || e.port === "else") && graph.nodes[e.to]);
  return (
    <div data-testid="flow-editor" style={{ width: "min(100%, 440px)", margin: "0 auto", padding: "12px 0 6px", display: "flex", flexDirection: "column", alignItems: "stretch", fontFamily: nav }}>
      {order.map((id, i) => { const n = graph.nodes[id]; const on = selected === id; return (
        <React.Fragment key={id}>
          <div data-testid={`flow-step-${id}`} data-sel={on ? "1" : "0"} role="button" tabIndex={0} onClick={() => onSelect(id)} onKeyDown={(e) => { if (e.key === "Enter") onSelect(id); }} style={{ position: "relative", overflow: "hidden", border: `1px solid ${on ? "color-mix(in srgb, #4d8dff 60%, var(--c-border))" : "var(--c-border)"}`, borderRadius: 14, background: "var(--c-panel2, var(--c-panel))", padding: "10px 13px", cursor: "pointer" }}>
            {on && <span aria-hidden style={{ position: "absolute", inset: "0 0 auto", height: 54, background: "linear-gradient(180deg, color-mix(in srgb, #4d8dff 20%, transparent), transparent)", pointerEvents: "none" }} />}
            <div style={{ display: "flex", gap: 10, alignItems: "center", position: "relative" }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--c-panel)", display: "grid", placeItems: "center", color: C.muted, flex: "none" }}><Icon name={iconName(n)} size={15} /></span>
              <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.2 }}>{titleOf(id, n)}</div><div style={{ fontSize: 11.5, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{kind(n)}{sublabel(n) ? ` · ${sublabel(n)}` : ""}</div></div>
              {bad(id) && <span data-testid={`flow-issue-${id}`} title="this step has a problem: see Validation" style={{ width: 8, height: 8, borderRadius: 4, background: "var(--c-bad)", flex: "none" }} />}
            </div>
            {n.node === "if" && branches(id).length > 0 && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10, position: "relative" }}>{branches(id).map((e) => <div key={e.port + e.to} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 9px", fontSize: 12 }}><div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim }}>{e.port}</div>{titleOf(e.to, graph.nodes[e.to])}</div>)}</div>}
          </div>
          {i < order.length - 1 && (
            <div style={{ height: 30, position: "relative", display: "flex", justifyContent: "center" }} className="fe-line">
              <span aria-hidden style={{ width: 1, background: "var(--c-border)", height: "100%" }} />
              <button data-testid={`flow-add-${id}`} aria-label="add a step here" aria-haspopup="menu" aria-expanded={menu === id} onClick={(e) => { e.stopPropagation(); setMenu(menu === id ? null : id); }} style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 20, height: 20, borderRadius: "50%", border: `1px solid ${menu === id ? "#4d8dff" : C.border}`, background: "var(--c-panel)", color: menu === id ? "#4d8dff" : C.muted, fontSize: 13, lineHeight: "17px", padding: 0, cursor: "pointer" }}>+</button>
              {menu === id && <div role="menu" data-testid="flow-menu" onClick={(e) => e.stopPropagation()} style={{ position: "absolute", left: "calc(50% + 16px)", top: -8, zIndex: 6, background: "var(--c-panel)", border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, minWidth: 200, maxHeight: 280, overflowY: "auto" }}>
                {items.map((it) => <button key={it.id} role="menuitem" data-testid={`flow-new-${it.id}`} onClick={() => add(id, it)} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: 0, borderRadius: 7, padding: "6px 9px", fontFamily: nav, fontSize: 12.5, color: C.fg, cursor: "pointer" }}>{it.label}</button>)}
              </div>}
            </div>
          )}
        </React.Fragment>
      ); })}
      <div style={{ textAlign: "center", color: C.dim, fontSize: 12, marginTop: 12 }}>Add steps with the + on each line</div>
    </div>
  );
}
const iconName = (n: GNode): string => { switch (n.node) { case "leader": return "leader"; case "role": return n.role; case "if": return "ifelse"; case "human": return "hand"; case "deliver": return "deliver"; case "artifact": return "doc"; case "check": return "tick"; case "use_tool": return "plug"; case "loop": return "loop"; default: return "gear"; } };
const kind = (n: GNode): string => (n.node === "role" ? n.role : n.node === "use_tool" ? "tool" : n.node.replace("_", " "));
