// THE LEDGER OF A RUN (the operator 2026-11-15, from AffectUI's Agent Ledger: "a kind of view"): everything the steps changed, one row per step: the files it touched, what was put back because it was outside its scope, the documents it made, its cost.
// Flat, Linear-like. (Undo per row waits for per-step commits: the rows say what changed, they cannot yet take it back.)
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { Icon } from "./icons";
import { agoWords, iconOf, ledgerOf, money } from "./model";
import type { Run } from "./types";

const AMBER = "#f5b942"; const RED = "#f87171";
const chip = (t: string, color?: string): React.ReactNode => <span key={t} style={{ fontFamily: mono, fontSize: 11, color: color ?? C.fg, background: `color-mix(in srgb, ${color ?? "currentColor"} ${color ? 12 : 7}%, transparent)`, border: `1px solid color-mix(in srgb, ${color ?? "currentColor"} ${color ? 35 : 14}%, transparent)`, borderRadius: 5, padding: "0 6px", whiteSpace: "nowrap", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{t}</span>;
export function LedgerView({ run, onSelect }: { run: Run; onSelect?: (id: string) => void }) {
  const l = React.useMemo(() => ledgerOf(run), [run]); const now = run.state.now_ms || Date.now();
  if (!l.rows.length) return <div data-testid="ledger-empty" style={{ padding: 16, color: C.muted, fontFamily: nav, fontSize: 13 }}>Nothing has changed yet. When a step writes files or makes a document, it is listed here.</div>;
  return (
    <div data-testid="ledger" style={{ margin: "14px 16px 18px", border: `1px solid ${C.border}`, borderRadius: 14, background: C.panel, fontFamily: nav, fontSize: 13, color: C.fg, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "baseline", padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}><b style={{ fontWeight: 600 }}>Ledger</b><span data-testid="ledger-totals" style={{ color: C.muted }}>{l.files} file{l.files === 1 ? "" : "s"} changed{l.put_back ? ` · ${l.put_back} put back` : ""} · {l.rows.length} step{l.rows.length === 1 ? "" : "s"}</span></div>
      {l.rows.map((r) => <div key={r.node} data-testid={`ledger-row-${r.node}`} onClick={() => onSelect?.(r.node)} style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 10, padding: "10px 16px", borderBottom: `1px solid color-mix(in srgb, currentColor 5%, transparent)`, cursor: onSelect ? "pointer" : "default" }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", color: r.failed ? RED : C.muted, background: `color-mix(in srgb, ${r.failed ? RED : "currentColor"} 10%, transparent)`, border: `1px solid ${C.border}` }}><Icon name={iconOf(run.graph.nodes[r.node])} size={14} /></span>
        <span style={{ minWidth: 0, display: "grid", gap: 5 }}>
          <span style={{ fontWeight: 500 }}>{r.title}</span>
          {r.files.length > 0 && <span data-testid={`ledger-files-${r.node}`} style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{r.files.slice(0, 8).map((f) => chip(f))}{r.files.length > 8 && <span style={{ color: C.dim, fontSize: 11 }}>+{r.files.length - 8}</span>}</span>}
          {r.artifacts.length > 0 && <span style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}><span style={{ color: C.dim, fontSize: 11 }}>made</span>{r.artifacts.map((f) => chip(f))}</span>}
          {r.put_back.length > 0 && <span data-testid={`ledger-putback-${r.node}`} style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}><span style={{ color: AMBER, fontSize: 11 }}>put back (outside its scope)</span>{r.put_back.map((f) => chip(f, AMBER))}</span>}
        </span>
        <span style={{ textAlign: "right", fontFamily: mono, fontSize: 11.5, color: C.muted }}>{money(r.cost)}<span style={{ display: "block", color: C.dim }}>{agoWords(r.at_ms, now)}</span></span>
      </div>)}
    </div>
  );
}
