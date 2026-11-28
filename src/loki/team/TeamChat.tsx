// THE TEAM AS A CONVERSATION (the operator 2026-11-15: "the chat tab looks bad inside, it should be a conversation, like grokbot"): your ask is the first bubble on the right; each step answers on the left as plain text under its name and icon, in the order it spoke;
// a step that asks you shows its question in amber and the approval card sits at the end of the thread. The noise (a step started, a note) is hidden until you ask for every step. Read-only: nothing here edits the team.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { answerAt, stashWorkspace, workspaceState, type WorkspaceState } from "./api";
import { ApprovalCard } from "./ApprovalCard";
import { Thinking } from "./Thinking";
import { Icon } from "./icons";
import { agoWords, chatOf, iconOf, parkedAt } from "./model";
import type { Graph, Run } from "./types";

const COLOR = { handoff: "var(--c-muted)", question: "#f5b942", failed: "#f87171", answer: "#34d399", start: "var(--c-dim)", note: "var(--c-dim)" } as const;
export function TeamChat({ graph, run, onChanged }: { graph: Graph; run: Run; onChanged?: () => void }) {
  const all = React.useMemo(() => chatOf(run), [run]); const [every, setEvery] = React.useState(false); const [who, setWho] = React.useState(""); const [open, setOpen] = React.useState<number | null>(null); const [busy, setBusy] = React.useState(false); const [err, setErr] = React.useState<string | null>(null);
  const now = run.state.now_ms || Date.now(); const people = [...new Map(all.map((m) => [m.from, m.from_title] as const)).entries()];
  const shown = all.filter((m) => (every || (m.kind !== "start" && m.kind !== "note")) && (!who || m.from === who || m.to.includes(who)));
  const [ws, setWs] = React.useState<WorkspaceState | null>(null); const parked = parkedAt(graph, run); const gate = parked ? (run.park_info?.[parked] || (graph.nodes[parked] as any)?.gate || "") : "";
  // a merge gate asks the serve what in the workspace would stop the land, so the card says so (and offers to set it aside) BEFORE the click, here as in the team pane
  const atMerge = !!parked && gate === "merge"; const runId = run.id;
  React.useEffect(() => { if (!atMerge) { setWs(null); return; } let stop = false; const go = async () => { const w = await workspaceState(runId); if (!stop && w) setWs(w); }; void go(); const t = setInterval(go, 5000); return () => { stop = true; clearInterval(t); }; }, [atMerge, runId]);
  return (
    <div data-testid="team-chat" style={{ fontFamily: nav, fontSize: 13.5, color: C.fg, padding: "10px 16px 20px", display: "grid", gap: 4, maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", color: C.muted, fontSize: 12, paddingBottom: 6 }}>
        <Icon name="chat" size={14} /><span>{shown.length} of {all.length} messages</span>
        <select data-testid="chat-who" value={who} onChange={(e) => setWho(e.target.value)} aria-label="only one step" style={{ marginLeft: "auto", background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "2px 8px", fontFamily: nav, fontSize: 12 }}><option value="">everyone</option>{people.map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select>
        <button data-testid="chat-verbose" aria-pressed={every} title={every ? "hide the starts and notes" : "show every step, starts and notes too"} aria-label="show every step" onClick={() => setEvery((v) => !v)} style={{ display: "inline-flex", background: every ? "color-mix(in srgb, currentColor 12%, transparent)" : "transparent", color: every ? C.fg : C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: "3px 7px", cursor: "pointer" }}><Icon name="list" size={14} /></button>
      </div>
      {run.ask && <div data-testid="chat-ask" style={{ justifySelf: "end", maxWidth: "78%", background: "color-mix(in srgb, currentColor 9%, transparent)", borderRadius: 16, padding: "9px 14px", margin: "4px 0 10px", whiteSpace: "pre-wrap" }}>{run.ask}</div>}
      {!shown.length && <div data-testid="chat-empty" style={{ color: C.muted, padding: "8px 0" }}>{all.length ? "No message matches this filter." : "Nothing has been said yet. When the team runs, its steps answer here."}</div>}
      {shown.map((m, i) => { const mine = m.kind === "answer"; const same = i > 0 && shown[i - 1].from === m.from && !mine && shown[i - 1].kind !== "answer"; const n = graph.nodes[m.from]; const col = COLOR[m.kind];
        if (mine) return <div key={m.id} data-testid={`chat-msg-${m.id}`} data-kind={m.kind} style={{ justifySelf: "end", maxWidth: "78%", background: "color-mix(in srgb, #34d399 14%, transparent)", borderRadius: 16, padding: "9px 14px", margin: "8px 0" }}>{m.text}</div>;
        return <div key={m.id} data-testid={`chat-msg-${m.id}`} data-kind={m.kind} onClick={() => setOpen(open === m.id ? null : m.id)} style={{ display: "grid", gridTemplateColumns: "30px 1fr", gap: "2px 12px", cursor: "pointer", padding: same ? "2px 0" : "10px 0 2px" }}>
          {same ? <span /> : <span style={{ width: 30, height: 30, borderRadius: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", color: m.kind === "failed" || m.kind === "question" ? col : C.muted, background: "color-mix(in srgb, currentColor 9%, transparent)" }}><Icon name={n ? iconOf(n) : "agent"} size={16} /></span>}
          <span style={{ minWidth: 0 }}>
            {!same && <span style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 2 }}><b style={{ fontWeight: 600, fontSize: 13 }}>{m.from_title}</b>{m.kind === "question" && <span style={{ color: col, display: "inline-flex", alignSelf: "center" }}><Icon name="hand" size={13} /></span>}{m.kind === "failed" && <span style={{ color: col, display: "inline-flex", alignSelf: "center" }}><Icon name="x" size={13} /></span>}<span style={{ fontSize: 11, color: C.dim }}>{agoWords(m.t_ms, now)}</span></span>}
            <span style={{ display: "block", color: m.kind === "failed" ? col : m.kind === "start" || m.kind === "note" ? C.dim : C.fg, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</span>
            {m.kind === "handoff" && m.to.length > 0 && <span style={{ display: "inline-flex", gap: 5, alignItems: "center", marginTop: 3, fontSize: 11.5, color: C.dim }}><Icon name="chev" size={11} />{m.to.map((t) => (graph.nodes[t] as any)?.label || t).join(", ")}</span>}
            {open === m.id && <span data-testid={`chat-card-${m.id}`} style={{ display: "block", fontFamily: mono, fontSize: 11, color: C.dim, marginTop: 4 }}>step {m.from} · event {m.id} · {new Date(m.t_ms).toLocaleTimeString()}</span>}
          </span>
        </div>; })}
      <Thinking graph={graph} run={run} />
      {parked && <div style={{ marginTop: 10 }}><ApprovalCard gate={String(gate)} run={run.id} node={parked} busy={busy} error={err} workspace={ws} onStash={async () => { setBusy(true); const r = await stashWorkspace(run.id); setBusy(false); if (!r.ok) setErr(r.error ?? "could not set them aside"); else setErr(null); const w = await workspaceState(run.id); if (w) setWs(w); }} approval={(graph.nodes[parked] as any)?.approval} onAnswer={async (a) => { setBusy(true); setErr(null); const r = await answerAt(run.id, parked, a); setBusy(false); if (!r.ok) setErr(r.error ?? "it was not answered"); onChanged?.(); }} /></div>}
    </div>
  );
}
