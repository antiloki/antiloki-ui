// confirm / error-resolve widget — the propose→apply control. A medium/high-
// risk turn proposed an action but isn't dispatched yet; the operator presses
// "go" (or types a slug for critical) to dispatch it via POST /dispatch. When a
// dispatch error came back, the same slot renders the ErrorFork recovery
// (selectable resolutions incl. commit-from-chat) instead of a bare confirm.
import React, { useMemo, useState } from "react";
import { resolveDispatchError, fetchPendingFiles, commitPendingFiles } from "@/loki/api/dispatch";
import type { WidgetProps } from "./types";

export function ConfirmWidget({ payload, ctx }: WidgetProps) {
  const { actions, confidence } = payload ?? {};
  const turnId = ctx.turnId;
  if (ctx.error) {
    return (
      <ErrorFork
        error={ctx.error}
        confirming={!!ctx.confirming}
        onConfirmGo={() => turnId != null && ctx.onConfirm?.(turnId, "go")}
        onRephrase={() => ctx.onRephrase?.()}
        onWriteMyself={() => ctx.onWriteMyself?.()}
      />
    );
  }
  return (
    <ConfirmRow
      actions={actions ?? []}
      confidence={confidence}
      confirming={!!ctx.confirming}
      error={null}
      onConfirm={(text) => turnId != null && ctx.onConfirm?.(turnId, text)}
    />
  );
}

// Pending-confirmation control for a proposed-but-not-dispatched turn. Medium/
// high risk → a single "go" button. Critical → require the operator to type the
// expected confirmation (a slug) before dispatching. The gate re-validates
// server-side, so a wrong critical confirmation comes back as an error here.
function ConfirmRow({ actions, confidence, confirming, error, onConfirm }: {
  actions: any[];
  confidence?: number | null;
  confirming: boolean;
  error: string | null;
  onConfirm: (confirmationText: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const critical = actions.some((a) => a?.risk_tier === "critical");
  const summary = actions
    .map((a) => {
      const label = a?.args?.title || a?.args?.slug || "";
      return `${a?.action ?? "action"}${label ? ` — ${label}` : ""}`;
    })
    .join("; ");
  return (
    <div style={{
      marginTop: 4, marginLeft: 0, padding: "8px 12px", borderRadius: 8,
      background: "oklch(0.22 0.04 90)", border: "1px solid oklch(0.45 0.08 90)",
      fontFamily: '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace', fontSize: 11,
      color: "oklch(0.88 0.05 90)", display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "oklch(0.78 0.06 90)" }}>awaiting confirmation</span>
        <div style={{ flex: 1 }} />
        <ConfidenceBadge confidence={confidence} />
      </div>
      <div style={{ color: "oklch(0.94 0.02 90)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{summary}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {critical ? (
          <>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="type the slug to confirm"
              disabled={confirming}
              style={{
                flex: 1, minWidth: 160, background: "oklch(0.18 0.01 90)",
                color: "oklch(0.94 0.02 90)", border: "1px solid oklch(0.45 0.08 90)",
                borderRadius: 6, padding: "5px 8px", fontFamily: '"JetBrains Mono", monospace', fontSize: 11,
              }}
            />
            <button
              onClick={() => onConfirm(typed.trim())}
              disabled={confirming || !typed.trim()}
              style={confirmBtnStyle(confirming || !typed.trim())}
            >{confirming ? "dispatching…" : "confirm"}</button>
          </>
        ) : (
          <button
            onClick={() => onConfirm("go")}
            disabled={confirming}
            style={confirmBtnStyle(confirming)}
          >{confirming ? "dispatching…" : "go — confirm"}</button>
        )}
      </div>
      {error && <div style={{ color: "oklch(0.72 0.18 25)" }}>{error}</div>}
    </div>
  );
}

function confirmBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    background: "oklch(0.80 0.15 90)", color: "oklch(0.16 0.02 90)", border: "none",
    borderRadius: 6, padding: "5px 12px", cursor: disabled ? "wait" : "pointer",
    fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 600,
    opacity: disabled ? 0.6 : 1,
  };
}

// FEAT-INTERVIEWER-CONFIDENCE-SCREENING: how sure the AI was that this is the
// action the operator wanted. Tone-graded (green ≥0.85, amber 0.7–0.85, faded
// below). Text + color only — no icon.
function ConfidenceBadge({ confidence }: { confidence?: number | null }) {
  if (typeof confidence !== "number" || !isFinite(confidence)) return null;
  const pct = Math.round(confidence * 100);
  const color = confidence >= 0.85 ? "oklch(0.82 0.16 150)"
    : confidence >= 0.7 ? "oklch(0.84 0.14 90)"
    : "oklch(0.70 0.04 250)";
  return (
    <span title="how sure the AI was this is what you wanted" style={{
      color, fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
      border: `1px solid ${color}`, borderRadius: 4, padding: "1px 6px",
    }}>AI sure · {pct}%</span>
  );
}

// FEAT-INTERVIEWER-ERROR-RESOLVE: a dispatch failed (git code-drift blocking
// card.add, or a law denial). Instead of a raw error, offer ~3 selectable
// resolutions. The git-drift path opens a commit-from-chat panel: list the
// pending files, confirm a message, commit ONLY those files, then re-confirm
// the original turn ("go"). The commit is a real, normal commit — it does NOT
// bypass the law.
function ErrorFork({ error, confirming, onConfirmGo, onRephrase, onWriteMyself }: {
  error: string;
  confirming: boolean;
  onConfirmGo: () => void;
  onRephrase: () => void;
  onWriteMyself: () => void;
}) {
  const res = useMemo(() => resolveDispatchError(error), [error]);
  const [dismissed, setDismissed] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [files, setFiles] = useState<string[] | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [message, setMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  const openCommitPanel = async () => {
    setCommitOpen(true);
    setPanelError(null);
    setLoadingFiles(true);
    try {
      const pending = await fetchPendingFiles();
      setFiles(pending?.files ?? []);
      if (!message.trim()) setMessage("commit pending code before card.add");
    } catch (e: any) {
      setPanelError(e?.message || "could not list pending files");
    } finally {
      setLoadingFiles(false);
    }
  };

  const doCommit = async () => {
    if (!files || files.length === 0 || !message.trim() || committing) return;
    setCommitting(true);
    setPanelError(null);
    try {
      const r = await commitPendingFiles(files, message.trim());
      if (!r.ok) { setPanelError(r.error || "commit failed"); return; }
      setCommitOpen(false);
      onConfirmGo(); // drift is gone — retry the original turn
    } finally {
      setCommitting(false);
    }
  };

  const onAlt = (kind: string) => {
    switch (kind) {
      case "commit_pending": return openCommitPanel();
      case "retry": return onConfirmGo();
      case "rephrase": return onRephrase();
      case "write_myself": return onWriteMyself();
      case "guidance": return setDismissed(true);
    }
  };

  if (dismissed) return null;

  return (
    <div style={{
      marginTop: 4, padding: "10px 12px", borderRadius: 8,
      background: "oklch(0.22 0.05 25)", border: "1px solid oklch(0.45 0.10 25)",
      fontFamily: '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace', fontSize: 11,
      color: "oklch(0.88 0.05 25)", display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ color: "oklch(0.94 0.03 25)", whiteSpace: "pre-wrap", wordBreak: "break-word", fontWeight: 600 }}>
        {res.message_md}
      </div>
      {!commitOpen ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {res.alternatives.map((a) => (
            <button
              key={a.key}
              disabled={confirming}
              onClick={() => onAlt(a.action_kind)}
              title={a.hint}
              style={{
                width: "100%", textAlign: "left",
                background: a.action_kind === "commit_pending" ? "oklch(0.30 0.06 25)" : "transparent",
                color: "oklch(0.90 0.04 25)", border: "1px solid oklch(0.45 0.08 25)",
                borderRadius: 6, padding: "7px 10px", cursor: confirming ? "wait" : "pointer",
                fontFamily: '"JetBrains Mono", monospace', fontSize: 11, opacity: confirming ? 0.6 : 1,
              }}
            >
              <span style={{ color: "oklch(0.66 0.06 25)", marginRight: 6 }}>{a.key}</span>
              {a.label}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ color: "oklch(0.78 0.04 25)" }}>
            {loadingFiles ? "listing pending files…" : `commits ${files?.length ?? 0} file${files?.length === 1 ? "" : "s"} (only these)`}
          </div>
          {files && files.length > 0 && (
            <div style={{
              maxHeight: 200, overflowY: "auto", overflowX: "auto",
              background: "oklch(0.18 0.02 25)",
              border: "1px solid oklch(0.40 0.06 25)", borderRadius: 6, padding: "8px 10px",
              color: "oklch(0.84 0.02 25)", display: "flex", flexDirection: "column", gap: 4,
              fontSize: 11, lineHeight: 1.5,
            }}>
              {files.map((f) => (
                <span key={f} title={f} style={{ whiteSpace: "nowrap" }}>{f}</span>
              ))}
            </div>
          )}
          {files && files.length === 0 && !loadingFiles && (
            <div style={{ color: "oklch(0.78 0.04 25)" }}>no pending files — try retry instead.</div>
          )}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="commit message"
            rows={2}
            disabled={committing}
            style={{
              background: "oklch(0.18 0.02 25)", color: "oklch(0.92 0.02 25)",
              border: "1px solid oklch(0.40 0.06 25)", borderRadius: 6, padding: "6px 8px",
              fontFamily: '"JetBrains Mono", monospace', fontSize: 11, resize: "vertical",
            }}
          />
          {panelError && <div style={{ color: "oklch(0.78 0.18 25)" }}>{panelError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={doCommit}
              disabled={committing || !files || files.length === 0 || !message.trim()}
              style={{
                background: "oklch(0.72 0.14 150)", color: "oklch(0.16 0.02 150)", border: "none",
                borderRadius: 6, padding: "6px 12px",
                cursor: committing ? "wait" : "pointer", fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11, fontWeight: 600,
                opacity: committing || !files || files.length === 0 || !message.trim() ? 0.6 : 1,
              }}
            >{committing ? "committing…" : "commit & create card"}</button>
            <button
              onClick={() => setCommitOpen(false)}
              disabled={committing}
              style={{
                background: "transparent", color: "oklch(0.78 0.04 25)",
                border: "1px solid oklch(0.45 0.08 25)", borderRadius: 6, padding: "6px 12px",
                cursor: "pointer", fontFamily: '"JetBrains Mono", monospace', fontSize: 11,
              }}
            >cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
