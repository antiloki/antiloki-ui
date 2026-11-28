// SIDE QUESTIONS — a parallel mini-agent in the pane's own rail (operator 2026-09-24: "simplify, expand and
// summary buttons shouldn't run in the same agent pane, it should spawn a sidebar mini agent like a parallel
// subtask with the context and asking what button says so the user can have like a side question. Add also a
// button Side question there. The subagent opens on the sidebar right of the pane … the one that has QA, plans,
// screening, heimdall").
//
// The point is that asking "say that again, simpler" is not part of the work — it is a question ABOUT the work,
// and putting it in the transcript makes the agent's own history a mix of what it did and what it re-explained.
// A side question runs on its own, on the cheap tier, against a copy of the reply, and lands in the rail. The
// conversation is untouched: no turn is added, nothing is rewritten in place, and the agent never sees it.
import React from "react";
import { C, mono } from "@/loki/theme";
import { askEngine, ENGINE_KEYS, type EngineKey } from "@/loki/api/engine";
import { Markdown } from "@/loki/components/Markdown";

export type SideKind = "simplify" | "expand" | "summary" | "ask";
export type SideQuestion = {
  id: number; kind: SideKind; ask: string; context: string;
  answer: string | null; error?: string; ms?: number; t: number; engine: string;
};

export const SIDE_OPS: { kind: SideKind; glyph: string; label: string; hint: string }[] = [
  { kind: "simplify", glyph: "✂", label: "simplify", hint: "asked on the side: the same answer, shorter and plainer — the conversation is not touched" },
  { kind: "expand", glyph: "⤢", label: "expand", hint: "asked on the side: the same answer with more detail and examples" },
  { kind: "summary", glyph: "≡", label: "summary", hint: "asked on the side: three lines — what it did, what changed, what is left" },
  { kind: "ask", glyph: "⁇", label: "side question", hint: "ask anything about this reply without spending the agent's turn on it" },
];

/** What a side question actually says to the little engine. Pure — tested. */
export function sidePrompt(kind: SideKind, context: string, question?: string): string {
  const ask = kind === "simplify" ? "Rewrite the reply below so it says the same thing in fewer, plainer words. Keep every fact, file path, command and number; drop hedging and repetition. Markdown allowed. Reply with the rewritten text only."
    : kind === "expand" ? "Rewrite the reply below with more detail: explain the reasoning behind each step, add a short example where one helps, keep every fact, file path, command and number exact. Markdown allowed. Reply with the rewritten text only."
    : kind === "summary" ? "Summarize the reply below in at most three lines: what was done, what changed (files, commands), what is left or uncertain. Reply with the summary only."
    : context.trim()
      ? `Answer the question below about the reply that follows it. Use only what the reply says plus ordinary knowledge; if the reply does not contain the answer, say so plainly rather than guessing.\n\n--- THE QUESTION ---\n${(question ?? "").trim()}`
      // asked from the rail with no reply to hang it on — then it is simply a question, and pretending there is
      // a reply below would hand the engine an empty block and an instruction to read it
      : `${(question ?? "").trim()}`;
  if (!context.trim()) return ask;
  return `${ask}\n\n--- THE REPLY ---\n${context}`;
}
/** The card's title — what the operator asked, in their words where they typed any. Pure. */
export function sideTitle(q: SideQuestion): string {
  if (q.kind === "ask") return q.ask.trim() || "a side question";
  return SIDE_OPS.find((o) => o.kind === q.kind)?.label ?? q.kind;
}

/** The pane's side questions. Several may run at once — they are independent one-shot calls, not a conversation,
 *  so nothing here queues or cancels anybody else. */
export function useSideQuestions(engine: string) {
  const [items, setItems] = React.useState<SideQuestion[]>([]);
  const seq = React.useRef(0);
  const patch = (id: number, p: Partial<SideQuestion>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const fire = async (q: SideQuestion) => {
    try {
      // the pane's own seat when it is one the engine knows (all five + the gateway); otherwise nothing is named and the serve picks - never a fixed Claude
      const eng = (ENGINE_KEYS as readonly string[]).includes(engine) ? (engine as EngineKey) : "auto";
      const r = await askEngine(sidePrompt(q.kind, q.context, q.ask), { engine: eng, tier: "low", maxTurns: 1, timeoutMs: 120_000 });
      patch(q.id, r.ok ? { answer: r.text.trim(), ms: r.ms, error: undefined } : { answer: null, error: r.error, ms: r.ms });
    } catch (e: any) { patch(q.id, { answer: null, error: e?.message || "the side question failed" }); }
  };

  const ask = (kind: SideKind, context: string, question = "") => {
    const q: SideQuestion = { id: ++seq.current, kind, ask: question, context, answer: null, t: Date.now(), engine };
    setItems((xs) => [q, ...xs]);
    void fire(q);
    return q.id;
  };
  const retry = (id: number) => { const q = items.find((x) => x.id === id); if (!q) return; patch(id, { answer: null, error: undefined }); void fire({ ...q, answer: null }); };
  const dismiss = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));
  const running = items.filter((x) => x.answer == null && !x.error).length;
  return { items, ask, retry, dismiss, running };
}

const snip = (s: string, n = 120) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

function Card({ q, onRetry, onDismiss }: { q: SideQuestion; onRetry: () => void; onDismiss: () => void }) {
  const [ctx, setCtx] = React.useState(false);
  const busy = q.answer == null && !q.error;
  return (
    <div data-testid="side-question" style={{ display: "flex", flexDirection: "column", gap: 5, padding: "8px 10px", borderRadius: 9, border: `1px solid ${q.error ? C.bad : C.border}`, background: `color-mix(in oklab, ${C.panel} 45%, transparent)` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: busy ? C.warn : q.error ? C.bad : C.brand }}>{busy ? "◌" : SIDE_OPS.find((o) => o.kind === q.kind)?.glyph}</span>
        <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, flex: 1, minWidth: 0, lineHeight: 1.4 }}>{sideTitle(q)}</span>
        <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, whiteSpace: "nowrap" }}>{busy ? "asking…" : q.ms != null ? `low tier · ${(q.ms / 1000).toFixed(1)}s` : ""}</span>
        <button onClick={onDismiss} title="close this side question" style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: 0 }}>✕</button>
      </div>
      <button onClick={() => setCtx((c) => !c)} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: 0, textAlign: "left" }}>
        {ctx ? "▾" : "▸"} about: {snip(q.context, 64)}
      </button>
      {ctx && <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, lineHeight: 1.5, maxHeight: 160, overflowY: "auto", borderLeft: `2px solid ${C.border}`, paddingLeft: 7, whiteSpace: "pre-wrap" }}>{q.context}</div>}
      {busy && <div style={{ height: 2, borderRadius: 2, background: `color-mix(in oklab, ${C.brand} 30%, transparent)`, animation: "lokiRailBlink 1.1s ease-in-out infinite" }} />}
      {q.error && <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: mono, fontSize: 9.5, color: C.bad }}>⚠ {q.error}
        <button data-testid="side-retry" onClick={onRetry} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "0 7px", cursor: "pointer", fontFamily: mono, fontSize: 9 }}>try again</button>
      </div>}
      {q.answer && <div style={{ fontSize: 11, color: C.fg, lineHeight: 1.55 }}><Markdown text={q.answer} compact /></div>}
    </div>
  );
}

/** The rail view. An empty rail explains itself rather than showing a blank panel. */
export function SideQuestionsRail({ items, onAsk, onRetry, onDismiss }: { items: SideQuestion[]; onAsk: (question: string) => void; onRetry: (id: number) => void; onDismiss: (id: number) => void }) {
  const [draft, setDraft] = React.useState("");
  const send = () => { const q = draft.trim(); if (!q) return; onAsk(q); setDraft(""); };
  return (
    <div data-testid="side-questions" style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input data-testid="side-ask-input" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="ask something on the side — the agent's turn is not spent"
          style={{ flex: 1, minWidth: 0, background: C.bg, border: `1px solid ${C.border}`, color: C.fg, borderRadius: 7, padding: "5px 9px", fontFamily: mono, fontSize: 10, outline: "none" }} />
        <button data-testid="side-ask-send" onClick={send} disabled={!draft.trim()} style={{ background: "transparent", border: `1px solid ${C.border}`, color: draft.trim() ? C.brand : C.dim, borderRadius: 7, padding: "0 10px", cursor: draft.trim() ? "pointer" : "default", fontFamily: mono, fontSize: 10 }}>ask</button>
      </div>
      {!items.length && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, lineHeight: 1.6 }}>
        Nothing asked yet. ✂ simplify, ⤢ expand, ≡ summary and ⁇ side question under any reply land here — a small model, on its own, with a copy of that reply. The conversation above stays exactly as it is.
      </div>}
      {items.map((q) => <Card key={q.id} q={q} onRetry={() => onRetry(q.id)} onDismiss={() => onDismiss(q.id)} />)}
    </div>
  );
}
