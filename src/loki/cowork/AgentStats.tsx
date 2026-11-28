// WHAT THE AGENT IS USING, IN ITS OWN PANE'S TOP BAR (operator 2026-11-18: "the info about the current agent, tokens, model etc., should be on the top bar of the agent pane, not the bottom bar"): the numbers the bottom bar used to show for the focused pane,
// now on every agent pane, each its own. READ from the pane (usage.json, hook files, transcript); a field the engine did not report is a dash, never a guess.
import * as React from "react";
import { C, mono } from "@/loki/theme";
import { fmtTokens, money } from "./strip-model";
import type { PaneUsage } from "./api";

const mmss = (ms: number): string => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
/** The words of the stats, in order, for a pane's usage. Pure over the usage and the clock. */
export function statParts(usage: PaneUsage | null, now: number): { key: string; text: string; tone?: "fg" | "warn" | "brand"; title?: string }[] {
  if (!usage) return [];
  const out: { key: string; text: string; tone?: "fg" | "warn" | "brand"; title?: string }[] = [];
  if (usage.blocked) out.push({ key: "state", text: "needs you", tone: "warn" });
  else if (usage.working) { const el = usage.run ? now - Date.parse(usage.run.startedT) : null; out.push({ key: "state", text: `running${el !== null && Number.isFinite(el) ? ` ${mmss(el)}` : ""}`, tone: "brand" }); }
  if (usage.route) out.push({ key: "route", text: `routed as ${usage.route}` });
  if (!usage.known) { out.push({ key: "none", text: "numbers: —", title: usage.reason }); return out; }
  const u = usage.run;
  out.push({ key: "tok", text: `in ${fmtTokens(u?.tokensIn)} · out ${fmtTokens(u?.tokensOut)}` });
  out.push({ key: "ctx", text: `ctx ${usage.contextPct !== null ? `${Math.round(usage.contextPct)}%` : "—"}` });
  for (const l of usage.limits) out.push({ key: `lim-${l.label}`, text: `${l.label} ${l.used_pct !== null ? `${Math.round(l.used_pct)}%` : "—"}` });
  if (u?.cost !== undefined) out.push({ key: "cost", text: `run ${u.costSource === "engine" ? "" : "≈ "}${money(u.cost)}`, tone: "fg" });
  if (usage.sessionCost !== null) out.push({ key: "session", text: `session ${money(usage.sessionCost)}`, tone: "fg" });
  return out;
}
export function AgentStats({ usage, now }: { usage: PaneUsage | null; now: number }) {
  const parts = statParts(usage, now); if (parts.length === 0) return null;
  return <span data-testid="agent-stats" style={{ display: "inline-flex", alignItems: "center", gap: 10, fontFamily: mono, fontSize: 10.5, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", minWidth: 0 }}>
    {parts.map((p) => <span key={p.key} title={p.title} style={{ color: p.tone === "warn" ? C.warn : p.tone === "brand" ? C.brand : p.tone === "fg" ? C.fg : C.muted }}>{p.text}</span>)}
  </span>;
}
