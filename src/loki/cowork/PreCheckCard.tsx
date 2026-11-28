// THE PRE-CHECK CARD (RFC 0007 §5.5, board v3): temporary, floating over the terminal, semi-transparent. It exists only while there is
// something to settle: open questions (the screening widget: answers as chips, the first is the default), a suggested route, or a note that
// the check was skipped. It never takes keyboard focus from the terminal; Escape dismisses it.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { canSend, openQuestions, type State, type Action } from "./precheck";

export function PreCheckCard({ state, tier, ms, dispatch, onSend, sendLabel = "Send", where = "before the terminal" }: { state: Extract<State, { phase: "ready" }>; tier: string; ms: number | null; dispatch: (a: Action) => void; onSend: () => void; sendLabel?: string; where?: string }) {
  // ESCAPE IS THE CARD'S WHILE IT IS UP, even with the terminal focused: xterm swallows the key before the window sees it (the card could not be closed from the keyboard), and
  // an Escape that reached the agent would interrupt it. So it is taken in the capture phase and stopped there: it dismisses the card and goes no further.
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); dispatch({ type: "dismiss" }); } }; window.addEventListener("keydown", k, true); return () => window.removeEventListener("keydown", k, true); }, [dispatch]);
  const v = state.verdict;
  const chip = (on: boolean): React.CSSProperties => ({ fontFamily: nav, fontSize: 11.5, padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: `1px solid ${on ? C.brand : C.border}`, background: on ? `color-mix(in oklab, ${C.brand} 22%, ${C.panel2})` : C.panel2, color: C.fg });
  return (
    <div role="dialog" aria-label="Heimdall pre-check" data-testid="precheck-card"
      style={{ position: "absolute", left: 14, right: 14, bottom: 14, zIndex: 20, padding: "12px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: `color-mix(in oklab, ${C.panel2} 84%, transparent)`, backdropFilter: "blur(6px)", boxShadow: "0 14px 36px -12px rgba(0,0,0,.65)", display: "flex", flexDirection: "column", gap: 8, fontFamily: nav, fontSize: 12.5, color: C.fg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.muted }}>
        <span style={{ color: C.ok, fontWeight: 600 }}>heimdall pre-check</span>
        <span>{tier}{ms !== null ? ` · ${ms} ms` : ""} · {where}</span>
        <div style={{ flex: 1 }} />
        <button aria-label="dismiss the pre-check" onClick={() => dispatch({ type: "dismiss" })} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono }}>✕</button>
      </div>
      {v.verdict === "skipped" && <div data-testid="precheck-skipped" style={{ color: C.warn }}>The pre-check was skipped: {v.reason}. You can still send.</div>}
      {v.verdict === "route" && <div data-testid="precheck-route" style={{ color: C.fg }}>Heimdall suggests {v.route.label ?? v.route.engine ?? v.route.pane ?? "another pane"} for this work.</div>}
      {v.verdict === "ask" && v.questions.map((q) => {
        const answered = state.answers[q.id]; const deferred = state.deferred.includes(q.id);
        return (
          <div key={q.id} data-testid={`question-${q.id}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ color: answered || deferred ? C.muted : C.warn, lineHeight: 1.5 }}>{q.text}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {q.options.map((o, i) => <button key={o} data-testid={`answer-${q.id}-${i}`} aria-pressed={answered === o} onClick={() => dispatch({ type: "answer", id: q.id, option: o })} style={chip(answered === o)}>{o}</button>)}
              <button data-testid={`defer-${q.id}`} aria-pressed={deferred} onClick={() => dispatch({ type: "defer", id: q.id })} style={{ ...chip(deferred), color: C.muted }}>answer later</button>
            </div>
          </div>
        );
      })}
      {v.notes.length > 0 && <div style={{ color: C.muted, fontSize: 11 }}>{v.notes.join(" · ")}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {v.verdict === "ask" && openQuestions(state).length > 0 && <span style={{ color: C.muted, fontSize: 11 }}>{openQuestions(state).length} to settle</span>}
        <div style={{ flex: 1 }} />
        <button data-testid="precheck-send" disabled={!canSend(state)} onClick={onSend} style={{ fontFamily: nav, fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 6, border: "none", cursor: canSend(state) ? "pointer" : "default", background: canSend(state) ? C.brand : C.border, color: canSend(state) ? C.bg : C.muted }}>{sendLabel}</button>
      </div>
    </div>
  );
}
