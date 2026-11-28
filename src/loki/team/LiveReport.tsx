// THE RUN'S REPORT, WRITTEN IN FRONT OF YOU (approved mockup 2026-11-18, from the idea of AffectUI's Agent Cursors; drawn by us): what each step reported, as a document in the order the steps ran; a step that is still working has a named cursor at the end of its part with what it costs so far,
// and the files the run makes are listed beside it as they appear. New words are typed in as they arrive (not for words already there when the page opens). Pure `reportOf` builds the sections from the run.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { chatOf, ledgerOf, money, nodeState, titleOf } from "./model";
import type { Run } from "./types";

export type Section = { node: string; title: string; text: string; working: boolean; cost: number };
const PALETTE = ["#4d8dff", "#3ecf8e", "#f5a524", "#e08fd0", "#2dd4bf", "#ee7d4f"];
export const colorOf = (i: number) => PALETTE[i % PALETTE.length];
/** The report's sections in the order the steps first spoke: the latest words of each step, whether it is still working, what it has cost. Pure over the run. */
export function reportOf(run: Run): Section[] {
  const order: string[] = []; const last = new Map<string, string>();
  for (const m of chatOf(run)) { if (!["handoff", "note", "failed", "question"].includes(m.kind)) continue; if (!last.has(m.from)) order.push(m.from); if (m.text.trim()) last.set(m.from, m.text.trim()); else if (!last.has(m.from)) last.set(m.from, ""); }
  for (const id of Object.keys(run.state.active ?? {})) if (run.graph.nodes[id] && run.graph.nodes[id].node !== "leader" && !order.includes(id)) { order.push(id); last.set(id, ""); }
  return order.filter((id) => run.graph.nodes[id]).map((id) => ({ node: id, title: titleOf(id, run.graph.nodes[id]), text: last.get(id) ?? "", working: nodeState(run.graph, run, id) === "working", cost: run.state.node_cost?.[id] ?? 0 }));
}
/** The characters of `text` shown so far: it types in only what is new after the first paint (`animate`), `rate` characters a tick. */
function useTyped(text: string, animate: boolean, rate = 4): string {
  const first = React.useRef(true); const [n, setN] = React.useState(() => (animate ? 0 : text.length));
  React.useEffect(() => { if (first.current) { first.current = false; setN(text.length); return; } if (!animate) { setN(text.length); return; } const t = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(t), x) : Math.min(text.length, x + rate))), 40); return () => clearInterval(t); }, [text, animate, rate]);
  return text.slice(0, Math.min(n, text.length));
}
function Part({ s, i, animate, last }: { s: Section; i: number; animate: boolean; last: boolean }) {
  const shown = useTyped(s.text, animate && s.working); const c = colorOf(i);
  return (
    <div data-testid={`report-part-${s.node}`} style={{ display: "grid", gridTemplateColumns: "26px minmax(0, 1fr)", columnGap: 12 }}>
      <div aria-hidden style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span style={{ width: 22, height: 22, borderRadius: 999, border: `1.5px solid ${c}`, background: `color-mix(in srgb, ${c} 14%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: 10.5, color: c, boxShadow: s.working ? `0 0 0 4px color-mix(in srgb, ${c} 18%, transparent)` : "none" }}>{i + 1}</span>
        {!last && <span style={{ flex: 1, width: 1, background: C.border, marginTop: 4 }} />}
      </div>
      <div style={{ paddingBottom: last ? 0 : 18, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}><b style={{ fontSize: 13, fontWeight: 600 }}>{s.title}</b>{s.working ? <span style={{ fontSize: 11, color: c, border: `1px solid color-mix(in srgb, ${c} 45%, transparent)`, borderRadius: 999, padding: "0 8px" }}>writing · {money(s.cost)}</span> : s.cost > 0 && <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>{money(s.cost)}</span>}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.65, whiteSpace: "pre-wrap", color: C.fg, minHeight: s.working ? "1.6em" : 0, background: "var(--c-bg)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 13px" }}>{shown}{s.working && <span data-testid={`report-cursor-${s.node}`} style={{ display: "inline-block", width: 2, height: "1.1em", verticalAlign: "-3px", background: c, marginLeft: 1, animation: "tg-blink .9s steps(2,jump-none) infinite" }} />}</div>
      </div>
    </div>
  );
}
export function LiveReport({ run }: { run: Run }) {
  const parts = React.useMemo(() => reportOf(run), [run]); const arts = React.useMemo(() => ledgerOf(run).rows.flatMap((r) => r.artifacts.map((a) => ({ name: a, node: r.node, working: nodeState(run.graph, run, r.node) === "working" }))), [run]);
  if (!parts.length) return <div data-testid="report-empty" style={{ padding: 16, color: C.muted, fontFamily: nav, fontSize: 13 }}>Nothing reported yet. As the steps work, their words appear here.</div>;
  const writing = parts.filter((p) => p.working).length;
  return (
    <div data-testid="live-report" style={{ margin: "14px 16px 18px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 190px", gap: 14, fontFamily: nav, color: C.fg }}>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, background: "var(--c-panel2, var(--c-panel))", padding: "16px 20px", minWidth: 0 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 10 }}><b style={{ fontSize: 17, letterSpacing: "-.01em" }}>{run.ask?.trim() || "Run report"}</b><span data-testid="report-state" style={{ color: C.muted, fontSize: 12.5 }}>{writing ? `${writing} writing` : "done"}</span></div>
        {parts.map((p, i) => <Part key={p.node} s={p} i={i} animate={!!run.live} last={i === parts.length - 1} />)}
      </div>
      <div><div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 6 }}>Files made</div>
        {arts.length === 0 && <div style={{ color: C.dim, fontSize: 12 }}>none yet</div>}
        {arts.map((a) => <div key={a.name} data-testid={`report-file-${a.name}`} style={{ display: "flex", gap: 8, alignItems: "center", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, marginBottom: 6 }}><i style={{ width: 7, height: 7, borderRadius: 4, background: a.working ? "#4d8dff" : "#3ecf8e", flex: "none" }} /><span style={{ fontFamily: mono, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{a.name}</span><span style={{ color: C.dim, fontSize: 11 }}>{a.working ? "writing" : "ready"}</span></div>)}</div>
    </div>
  );
}
