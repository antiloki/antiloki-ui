// WHAT THE RUN SAYS ABOUT ITSELF, in the reasoning bar (the operator 2026-11-18: "add this info to the reasoning bar at the bottom left and drop it from the top bar"): how it ended or where it is, what it cost of its cap, how many agents and tools the team has, and what is working, waiting or done now.
import * as React from "react";
import { C, nav } from "@/loki/theme";
import { Icon } from "./icons";
import { graphCounts } from "./AgentGraph";
import { counts, money, statusWords } from "./model";
import type { Graph, Run } from "./types";

export function RunFacts({ graph, run }: { graph: Graph; run: Run | null }) {
  const status = run?.state.status; const kinds = React.useMemo(() => graphCounts(graph), [graph]); const c = counts(graph, run);
  const tone = status?.status === "blocked" ? "var(--c-bad)" : status?.status === "done" ? "var(--c-ok, #34d399)" : C.fg;
  const dot = (n: number, color: string, icon: string, word: string) => n > 0 && <span title={word} style={{ display: "inline-flex", gap: 3, alignItems: "center", color }}><Icon name={icon} size={12} />{n}<span className="sr-only"> {word}</span></span>;
  return (
    <span data-testid="run-facts" style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontFamily: nav, fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>
      <span data-testid="run-status" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: tone }}><Icon name={!run ? "clock" : status?.status === "blocked" || status?.status === "stopped" ? "x" : status?.status === "done" ? "tick" : status?.status === "paused" ? "pause" : "spark"} size={13} />{run ? statusWords(status) : "not running"}</span>
      <span title={`spent of the cap${run ? ` · run ${run.id}` : ""}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="coin" size={13} />{money(run?.state.spent_usd)} <span style={{ color: C.dim }}>/ {money(run?.budget_usd ?? graph.budget_usd)}</span></span>
      <span data-testid="graph-kinds"><b style={{ color: C.fg, fontWeight: 500 }}>{kinds.agents}</b> agents · <b style={{ color: C.fg, fontWeight: 500 }}>{kinds.tools}</b> tools</span>
      <span data-testid="run-counts" style={{ display: "inline-flex", gap: 8 }}>{dot(c.working, "#60a5fa", "spark", "working")}{dot(c.waiting, "#f5b942", "hand", "waiting")}{dot(c.done, "#34d399", "tick", "done")}{dot(c.failed, "#f87171", "x", "failed")}</span>
    </span>
  );
}
