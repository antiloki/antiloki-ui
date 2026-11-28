/**
 * pane-chat-thread — EPIC-VIBE-CHAT-UNIFICATION M4 (reworked per operator: "the chat
 * BE capabilities... keep the terminal UI"). The pane thread renders the pane's
 * interviewer-session turns in the VIBE TERMINAL style — compact mono 🧑/🤖 lines —
 * while borrowing exactly the chat capabilities asked for: the reasoning trace
 * (TraceTrail), the AI-call badge, and the interactive widgets (screening, confirm,
 * diff, code, table, sources). Chat-only chrome stays OUT: no Studio bar, no
 * "Add to notebook" (the 'offers' widget is filtered), no chat bubbles.
 */
import React from "react";
import { C } from "@/loki/theme";
import { useChatTurns } from "@/loki/api/hooks";
import { confirmInterviewerTurn } from "@/loki/api/dispatch";
import { Markdown } from "@/loki/components/Markdown";
import { AICallChip } from "@/loki/components/AICallChip";
import { TraceTrail } from "@/loki/chat/chat-trace";
import { deriveWidgets } from "@/loki/widgets/derive";
import { WidgetHost } from "@/loki/widgets/widget-host";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';

type Note = { id: number; pane_id: number; body_md: string; created_at: string };

// chat-only chrome that must not appear in a vibe pane (operator 2026-07-07)
const PANE_WIDGET_SKIP = new Set(["offers"]);

function fmtTok(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }

function PaneTurn({ t, isLast, confirming, error, ctxHandlers }: any) {
  const human = t.user_text ?? "";
  const reply = t.presentation_md ?? t.interviewer_response_md ?? "";
  const widgets = deriveWidgets(t, !!isLast).filter((w: any) => !PANE_WIDGET_SKIP.has(w.kind));
  const ctx = { turnId: t.id, isLast, confirming, error, variant: "pane", ...ctxHandlers };
  const meta = [
    t.ai_tier, t.model_id ? String(t.model_id).split("/").pop() : null,
    t.ai_cost_usd != null ? `$${Number(t.ai_cost_usd).toFixed(4)}` : null,
    (t.ai_tokens_in != null || t.ai_tokens_out != null) ? `${fmtTok(Number(t.ai_tokens_in) || 0)}→${fmtTok(Number(t.ai_tokens_out) || 0)} tok` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 6 }}>
      {human && <div style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>🧑 {human}</div>}
      {/* the reasoning lens — the chat's collapsed "how I got here" trail (RAG · skills · AI calls) */}
      {(reply || t.ai_call_id != null) && <TraceTrail turnId={t.id} live={isLast && !reply} />}
      {reply && (
        <div style={{ display: "flex", gap: 5, alignItems: "flex-start" }}>
          <span style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, flex: "none" }}>🤖</span>
          <div style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, minWidth: 0, flex: 1 }}>
            <Markdown text={reply} compact />
          </div>
        </div>
      )}
      {(t.ai_call_id != null || meta) && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {t.ai_call_id != null && (
            <AICallChip id={t.ai_call_id} tier={(t.ai_tier as any) || "low"} model={t.model_id}
              cost={t.ai_cost_usd ?? undefined} durationMs={t.ai_duration_ms ?? undefined} />
          )}
          {meta && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{meta}</span>}
          {t.classification_confidence != null && (
            <span title="how confident the AI was in its read of this turn" style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>
              {Math.round(Number(t.classification_confidence) * 100)}% sure
            </span>
          )}
        </div>
      )}
      {widgets.map((w: any) => <WidgetHost key={w.key} widget={w} ctx={ctx} />)}
    </div>
  );
}

export function PaneChatThread({ chatSessionId, notes, busy, onSendText }: {
  chatSessionId: number;
  notes: Note[];
  busy: boolean;
  onSendText: (text: string) => void;
}) {
  const turnsQ = useChatTurns(chatSessionId, true);
  const turns: any[] = (turnsQ.data as any[]) ?? [];
  const [confirming, setConfirming] = React.useState<number | null>(null);
  const [confirmError, setConfirmError] = React.useState<{ turnId: number; msg: string } | null>(null);
  const endRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [turns.length, busy]);

  const onConfirm = async (turnId: number, confirmationText: string) => {
    if (confirming != null) return;
    setConfirming(turnId); setConfirmError(null);
    try {
      const res: any = await confirmInterviewerTurn(turnId, confirmationText);
      if (!res?.ok) setConfirmError({ turnId, msg: res?.error || "dispatch failed" });
      await (turnsQ as any).refetch?.();
    } finally { setConfirming(null); }
  };
  const ctxHandlers = {
    onConfirm,
    onPickOption: onSendText, // screening answers route back through the pane composer path
    onAsk: onSendText,
    onWriteMyself: () => { /* the pane composer is right below */ },
    onRephrase: () => { /* ditto */ },
  };

  // Receipts + handoffs that live on the blackboard, not in the chat session. The
  // 🧑/🤖 mirror notes are skipped — the turns above ARE that content.
  const events = notes.filter((n) => !n.body_md.startsWith("🧑") && !n.body_md.startsWith("🤖"));

  return (
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
      {turns.length === 0 && !busy && (
        <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>message this agent — replies carry the chat's widgets and reasoning trace, terminal style.</span>
      )}
      {turns.map((t, i) => (
        <PaneTurn key={t.id} t={t} isLast={i === turns.length - 1}
          confirming={confirming === t.id}
          error={confirmError && confirmError.turnId === t.id ? confirmError.msg : null}
          ctxHandlers={ctxHandlers} />
      ))}
      {busy && <div style={{ fontFamily: mono, fontSize: 10, color: C.warn }}>working…</div>}
      {events.length > 0 && (
        <div style={{ borderTop: `1px dashed ${C.border}`, marginTop: 4, paddingTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
          {events.map((n) => (
            <div key={n.id} style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{n.body_md}</div>
          ))}
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
