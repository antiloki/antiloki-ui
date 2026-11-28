// ULTRA REVIEW (operator 2026-09-19: "add ultra review tab"): the deep review of the repository by the
// operator's own coding-CLI subscription. One run = the engine reads the riskiest files the X-ray
// names (and whatever else it decides to open — it works in the workspace root, read-only), verifies
// each concern against the code, and answers ≤ 12 findings as JSON: severity · file · line · title ·
// what it saw · the fix · confidence. Findings are kept per workspace (the last run), are draggable
// into the chat as context, and can be handed to an agent thread as a task. Deterministic around the
// one non-deterministic step: the prompt is built from the brief, the parse is strict.
import React from "react";
import { C, mono, nav } from "@/loki/theme";
import { askEngine, type TemplateAsk, pinnedEngine, type AskEngine } from "@/loki/api/engine";
import { useSeats, offered, seatName } from "@/loki/api/seats";
import { startContextDrag } from "@/loki/shell/drag-context";
import { noteTimeline } from "@/loki/widgets/agents-timeline";

export type Finding = { severity: "critical" | "high" | "medium" | "low"; file: string; line: number | null; title: string; detail: string; fix: string; confidence: number };
export type UltraRun = { at: string; engine: AskEngine; ms: number; findings: Finding[]; summary: string; brief_lines: number };

const KEY = (ws: string) => `antiloki:ultra:${ws}`;
export function readRun(ws: string): UltraRun | null { try { const v = localStorage.getItem(KEY(ws)); return v ? JSON.parse(v) : null; } catch { return null; } }
export function writeRun(ws: string, r: UltraRun | null) { try { if (r) localStorage.setItem(KEY(ws), JSON.stringify(r)); else localStorage.removeItem(KEY(ws)); } catch { /* private mode */ } }

/** THE PROMPT — the brief is the map, the engine does the reading. Pure, tested. */
/** the ultra review's catalog call (template `xray.ultra_review` on the serve — Settings › Prompts edits the text): the brief and the optional focus */
export function ultraAsk(brief: string, focus?: string): TemplateAsk {
  return { template: "xray.ultra_review", vars: { brief, focus: focus?.trim() || "" } };
}
const SEV = ["critical", "high", "medium", "low"] as const;
/** the engine's JSON → findings, strictly shaped and sorted; junk dropped. Pure, tested. */
export function parseFindings(j: any): { summary: string; findings: Finding[] } {
  const arr: any[] = Array.isArray(j?.findings) ? j.findings : Array.isArray(j) ? j : [];
  const findings: Finding[] = arr.filter((f) => f && typeof f.file === "string" && typeof f.title === "string").map((f) => ({
    severity: (SEV as readonly string[]).includes(String(f.severity)) ? f.severity : "medium",
    file: String(f.file).replace(/^\.\//, ""), line: Number.isFinite(Number(f.line)) && f.line !== null ? Number(f.line) : null,
    title: String(f.title).slice(0, 160), detail: String(f.detail ?? "").slice(0, 1200), fix: String(f.fix ?? "").slice(0, 1200),
    confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0.5)),
  })).sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity) || b.confidence - a.confidence).slice(0, 12);
  return { summary: String(j?.summary ?? "").slice(0, 600), findings };
}
export const findingText = (f: Finding) => `[${f.severity}] ${f.file}${f.line != null ? `:${f.line}` : ""} — ${f.title}\n${f.detail}\nFix: ${f.fix}`;
const tone = (s: Finding["severity"]) => (s === "critical" || s === "high" ? C.bad : s === "medium" ? C.warn : C.muted);

/** the engine's map: the X-ray brief, then the survey's worst units when a survey ran — pure */
export function engineMap(brief: string, worst?: string): string { return worst?.trim() ? `${brief}\n\n=== ULTRA SURVEY · WORST UNITS (start here) ===\n${worst.trim()}` : brief; }

export function UltraReview({ workspace, brief, worst, onOpenFile }: { workspace: string; brief: string; worst?: string; onOpenFile: (path: string, line?: number) => void }) {
  const [run, setRun] = React.useState<UltraRun | null>(() => readRun(workspace));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [focus, setFocus] = React.useState("");
  // the operator's pin, else AUTO - the serve picks the seat Heimdall plans on; never a fixed Claude (2026-10-01)
  const [engine, setEngine] = React.useState<AskEngine>(pinnedEngine() ?? "auto");
  const seats = useSeats();
  const start = async () => {
    setBusy(true); setErr(null);
    const t = Date.now();
    const r = await askEngine(ultraAsk(engineMap(brief, worst), focus), { json: true, engine, timeoutMs: 900_000, maxTurns: 60, tier: "high" }); // a deep read: many files, many tool turns
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    const { summary, findings } = parseFindings(r.json ?? {});
    const next: UltraRun = { at: new Date().toISOString(), engine, ms: Date.now() - t, findings, summary, brief_lines: brief.split("\n").length };
    writeRun(workspace, next); setRun(next);
    noteTimeline("saved", `ultra review · ${findings.length} finding${findings.length === 1 ? "" : "s"} · ${engine}`);
  };
  const toAgent = (f: Finding) => {
    window.dispatchEvent(new CustomEvent("antiloki:agent-card", { detail: { engine: engine === "auto" ? seats?.defaultKey ?? undefined : engine, ask: `Fix this finding from antiloki's ultra review, then run the relevant tests:\n\n${findingText(f)}`, scope: [f.file], thread: "new" } }));
  };
  const btn = (primary = false): React.CSSProperties => ({ background: primary ? C.brand : "transparent", border: `1px solid ${primary ? C.brand : C.border}`, color: primary ? C.bg : C.muted, borderRadius: 7, padding: "5px 12px", cursor: busy ? "wait" : "pointer", fontFamily: mono, fontSize: 11, fontWeight: primary ? 700 : 400 });
  return (
    <div data-testid="ultra-review" style={{ padding: "6px 0 20px", fontFamily: nav }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <select data-testid="ultra-engine" value={engine} onChange={(e) => setEngine(e.target.value as AskEngine)} disabled={busy} style={{ ...btn(), padding: "4px 8px" }}>
          <option value="auto">Auto{seats?.defaultKey ? ` · ${seatName(seats, seats.defaultKey)}` : ""}</option>
          {offered(seats, engine === "auto" ? null : engine).map((k) => <option key={k} value={k}>{seatName(seats, k)}</option>)}
        </select>
        <input data-testid="ultra-focus" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="focus (optional) — e.g. the reconciler, error handling, the auth flow" disabled={busy}
          style={{ flex: 1, minWidth: 220, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, color: C.fg, padding: "5px 9px", fontFamily: mono, fontSize: 11 }} />
        <button data-testid="ultra-run" onClick={() => void start()} disabled={busy} style={btn(true)}>{busy ? "◆ reviewing… (minutes)" : run ? "◆ run again" : "◆ run the ultra review"}</button>
      </div>
      <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginBottom: 12, lineHeight: 1.5 }}>
        Your subscription engine reads the riskiest files the X-ray names{worst ? " — and the survey's worst units above first" : ""}, verifies each concern against the code, and reports at most 12 findings. Read-only. A run takes minutes; the result stays here until the next run.
      </div>
      {err && <div data-testid="ultra-error" style={{ fontFamily: mono, fontSize: 11, color: C.bad, marginBottom: 10 }}>✗ {err}</div>}
      {busy && <div data-testid="ultra-busy" style={{ fontFamily: mono, fontSize: 11, color: C.brand, marginBottom: 10 }}>◆ the engine is reading the repository…</div>}
      {run && !busy && (
        <div data-testid="ultra-result">
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}>
            <b style={{ fontSize: 13 }}>{run.findings.length} finding{run.findings.length === 1 ? "" : "s"}</b>
            <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{run.engine} · {Math.round(run.ms / 1000)}s · {new Date(run.at).toLocaleString()}</span>
            <span style={{ flex: 1 }} />
            <button onClick={() => { writeRun(workspace, null); setRun(null); }} style={btn()}>clear</button>
          </div>
          {run.summary && <p data-testid="ultra-summary" style={{ fontSize: 12.5, color: C.muted, margin: "0 0 12px", lineHeight: 1.55 }}>{run.summary}</p>}
          {run.findings.length === 0 && <div style={{ fontFamily: mono, fontSize: 11, color: C.ok }}>✓ nothing the engine would flag beyond what the rules already say</div>}
          {run.findings.map((f, i) => (
            <div key={i} data-testid={`ultra-finding-${i}`} draggable onDragStart={(e) => startContextDrag(e, { title: `Ultra review — ${f.title}`, text: findingText(f), kind: "ultra-finding" })}
              style={{ display: "grid", gridTemplateColumns: "76px 1fr auto", gap: "2px 12px", alignItems: "start", padding: "9px 0", borderTop: `1px solid ${C.border}`, cursor: "grab" }}>
              <span style={{ fontFamily: mono, fontSize: 9.5, color: tone(f.severity), textTransform: "uppercase", letterSpacing: 1, paddingTop: 3 }}>{f.severity}<br /><span style={{ color: C.dim, letterSpacing: 0, textTransform: "none" }}>{Math.round(f.confidence * 100)}% sure</span></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.fg }}>{f.title}</div>
                <button onClick={() => onOpenFile(f.file, f.line ?? undefined)} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: mono, fontSize: 10.5, color: C.brand }}>{f.file}{f.line != null ? `:${f.line}` : ""} ↗</button>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{f.detail}</div>
                {f.fix && <div style={{ fontSize: 12, color: C.fg, marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap" }}><span style={{ color: C.ok }}>fix · </span>{f.fix}</div>}
              </div>
              <button data-testid={`ultra-agent-${i}`} onClick={() => toAgent(f)} title="hand it to an agent thread as a task" style={btn()}>→ agent</button>
            </div>
          ))}
        </div>
      )}
      {!run && !busy && !err && <div style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>no run yet</div>}
    </div>
  );
}
