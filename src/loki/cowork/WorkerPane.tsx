// THE BODY OF A TEMPORARY WORKER PANE (RFC 0007 §17.4). A worker's output is collected whole by the backend, so this is the run's own record of the task: who is doing
// it (the merge: the pane is the brain, this is the hands), its events as they come, then what it did (tools, files, tokens, cost) and the verifier's verdict.
// Read-only and never typed into: it is not a terminal. The frame around it only closes, and closing it dismisses it.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { fmtTokens, money } from "./strip-model";
import { isFailed, isWorking, statusLine, type WorkerTask } from "./workers";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

export function WorkerPane({ w, now, parentTitle }: { w: WorkerTask; now: number; parentTitle: string }) {
  const failed = isFailed(w); const working = isWorking(w);
  const tone = failed ? C.bad : working ? C.brand : C.ok;
  const label: React.CSSProperties = { fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 };
  const line: React.CSSProperties = { fontFamily: mono, fontSize: 11.5, color: C.fg, lineHeight: 1.5, overflowWrap: "anywhere" };
  return (
    <div data-testid={`worker-${w.key}`} data-state={failed ? "failed" : working ? "working" : "done"} style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10, fontFamily: nav, fontSize: 12.5, color: C.fg }}>
      <div>
        <div style={{ color: C.fg, fontWeight: 600, lineHeight: 1.4 }}>{w.title || `task ${w.task}`}</div>
        <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>
          {w.merge ? `${w.merge} · ` : ""}{parentTitle} decides, {w.engine ?? "the worker"} produces · run #{w.runId} · {w.task}{w.attempts > 1 ? ` · attempt ${w.attempts}` : ""}
        </div>
      </div>
      <div data-testid="worker-status" style={{ display: "flex", alignItems: "center", gap: 8, color: tone, fontWeight: 600 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: tone, boxShadow: working ? `0 0 0 3px ${tone}33` : "none" }} />
        {statusLine(w, now)}
      </div>
      {w.why && <div style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.5 }}>{clip(w.why, 220)}</div>}
      {w.events.length > 0 && (
        <div>
          <div style={label}>record</div>
          {w.events.slice(-6).map((e, i) => <div key={i} style={{ ...line, color: e.kind === "fallback" || e.kind === "reject" || e.kind === "fail" ? C.warn : C.fg }}><span style={{ color: C.muted }}>{e.kind}</span> {clip(e.text, 160)}</div>)}
        </div>
      )}
      {!working && (
        <>
          {w.tools.length > 0 && <div><div style={label}>{w.tools.length} tool call{w.tools.length === 1 ? "" : "s"}</div>{w.tools.slice(0, 5).map((t, i) => <div key={i} style={line}>{t.name} <span style={{ color: C.muted }}>{clip(t.target, 80)}</span></div>)}</div>}
          {w.changed.length > 0 && <div><div style={label}>changed</div>{w.changed.slice(0, 8).map((f) => <div key={f} style={line}>{f}</div>)}</div>}
          <div data-testid="worker-numbers" style={{ ...line, color: C.muted }}>
            in {fmtTokens(w.tokensIn)} · out {fmtTokens(w.tokensOut)} · {w.cost !== undefined && w.cost > 0 ? money(w.cost) : "cost —"}
          </div>
          {w.verdict && <div data-testid="worker-verdict" style={{ ...line, color: w.verdict.passed ? C.ok : C.bad }}>verifier: {w.verdict.passed ? "PASS" : "FAIL"}{w.verdict.reasons.length ? ` — ${clip(w.verdict.reasons.join("; "), 200)}` : ""}</div>}
          {failed && w.error && <div data-testid="worker-error" style={{ ...line, color: C.bad }}>{clip(w.error, 300)}</div>}
          {w.report && <div><div style={label}>report</div><div style={{ ...line, color: C.muted, whiteSpace: "pre-wrap" }}>{clip(w.report, 400)}</div></div>}
          {failed && <div style={{ color: C.muted, fontSize: 11.5 }}>This pane stays until you close it.</div>}
        </>
      )}
    </div>
  );
}
