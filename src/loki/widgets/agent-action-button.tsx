// AgentActionButton — one button that targets AN AGENT: click → if one CLI pane exists, act on it;
// if several, a small inline picker appears. The shared UI verb for feed/teach/fix/tell interactions.
import React from "react";
import { C, mono } from "@/loki/theme";
import { listAgents, type AgentPane } from "./agent-interact";
import { paneDisplay } from "./types";

export function AgentActionButton({ chatSessionId, label, title, color, act }: {
  chatSessionId: number | null | undefined;
  label: string; title: string; color?: string;
  act: (pane: AgentPane) => Promise<string | null>; // returns a short result note (or null on failure)
}) {
  const [agents, setAgents] = React.useState<AgentPane[] | null>(null); // null = picker closed
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const run = async (p: AgentPane) => {
    setBusy(true); setAgents(null);
    const r = await act(p);
    setNote(r ?? "⚠ failed");
    setBusy(false);
    setTimeout(() => setNote(null), 2500);
  };
  const open = async () => {
    if (busy) return;
    setBusy(true);
    const list = await listAgents(chatSessionId);
    setBusy(false);
    if (!list.length) { setNote("no agent panes yet"); setTimeout(() => setNote(null), 2500); return; }
    if (list.length === 1) { void run(list[0]); return; }
    setAgents(list);
  };
  const btn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, borderRadius: 5, padding: "1px 7px", cursor: "pointer", fontFamily: mono, fontSize: 9, color: color ?? C.brand, whiteSpace: "nowrap" };
  if (note) return <span style={{ fontFamily: mono, fontSize: 9, color: note.startsWith("⚠") ? C.warn : C.ok }}>{note}</span>;
  if (agents) return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {agents.map((a) => (
        <button key={a.id} onClick={(e) => { e.stopPropagation(); void run(a); }} title={`${a.name} · pane #${a.id}`} style={btn}>{paneDisplay(a.kind).glyph} #{a.id}</button>
      ))}
      <button onClick={(e) => { e.stopPropagation(); setAgents(null); }} style={{ ...btn, color: C.muted }}>✕</button>
    </span>
  );
  return <button onClick={(e) => { e.stopPropagation(); void open(); }} disabled={busy} title={title} style={btn}>{busy ? "…" : label}</button>;
}
