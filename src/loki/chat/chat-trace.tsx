// TraceTrail — the chat's reasoning lens. A collapsed "how I got here" section at the header of an answer that
// expands to the turn's trace: RAG searches, skill calls, the answer AI call (model · tokens · cost). Two modes:
//   - a FINISHED turn → lazy-fetch its runtime_events by user_goal_id on expand
//   - LIVE (in-flight) → poll events after a baseline, auto-shown
// Reuses POST /api/v1/runtime/events. Cheap: step-granularity, localhost reads; the AI calls own the clock.
import React from "react";
import { C, mono } from "@/loki/theme";
import { apiPost, apiGet } from "@/loki/api/client";

const re = (body: any) => apiPost("/api/v1/runtime/events", body, { timeoutMs: 15_000 });
const parse = (s: any) => { try { return typeof s === "string" ? JSON.parse(s) : (s || {}); } catch { return {}; } };
const short = (m: any) => String(m || "").split("/").pop();
const fromChat = (e: any) => e?.source === "chat" || String(e?.actor || "").includes("interviewer");

const aiNote = (m: any) => [m.model && short(m.model), (m.tokens_in != null || m.tokens_out != null) && `${(m.tokens_in || 0) + (m.tokens_out || 0)} tok`, m.cost_usd != null && `$${Number(m.cost_usd).toFixed(4)}`].filter(Boolean).join(" · ");
function label(e: any) {
  const m = parse(e.context_json);
  if (e.skill === "triage-start") return { icon: "◌", text: "understanding your request…", note: "connecting" };
  if (e.skill === "triage") return m.cached
    ? { icon: "⚡", text: "understood your request (cached — instant)", note: "" }
    : { icon: "🧠", text: "understood your request", note: aiNote(m) };
  if (e.skill === "rag") return { icon: "🔎", text: `searched the codebase → ${m.files ?? 0} file${m.files === 1 ? "" : "s"}`, note: m.query ? `"${m.query}"` : "" };
  if (e.skill === "rag-recall") return { icon: "🔍", text: `semantic search → ${m.hits ?? 0} hit${m.hits === 1 ? "" : "s"}`, note: m.query ? `"${m.query}"` : "" };
  if (e.skill === "docs-gather") return { icon: "📄", text: `read ${m.pages ?? 0} doc${m.pages === 1 ? "" : "s"}${m.scope ? ` · ${m.scope}` : ""}`, note: (m.files || []).map(short).slice(0, 3).join(", ") };
  if (e.skill === "improvements") return { icon: "✦", text: "analysing the real source…", note: "" };
  if (e.skill === "improvements-done") return { icon: "✦", text: `found ${m.suggestions ?? 0} improvement${m.suggestions === 1 ? "" : "s"}${m.files ? ` across ${m.files} files` : ""}`, note: aiNote(m) };
  if (e.skill === "present-start") return { icon: "✍", text: "writing the answer…", note: "" };
  if (e.skill === "present") return { icon: "✦", text: "answer ready", note: aiNote(m) };
  return { icon: e.outcome === "error" ? "✗" : "⚙", text: e.action || e.skill || "step", note: e.outcome === "error" ? "failed" : "" };
}

// ── THE AUDIT (operator 2026-09-16: "the reasoning should be the audit, like a stack trace") ──────
// A finished turn renders as FRAMES: `#n  +offset  step  duration` with the actor and outcome, the
// AI call as a frame with its prompt · provider/model · tier · tokens · cost · outcome, and — when a
// coding CLI answered (cli:<engine>) — the CLI's own frames under it: the tools it ran (Read, Grep,
// shell …) in the workspace root. Pure `buildFrames` for the test; the component only fetches.
export type Frame = { n: number; offsetMs: number | null; durMs: number | null; icon: string; text: string; note: string; meta: string; error?: boolean; depth: number; kind: "step" | "call" | "cli" | "tool" | "end" };
const tsMs = (s: any): number | null => { if (!s) return null; const v = Date.parse(String(s).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(s)) ? "" : "Z")); return Number.isFinite(v) ? v : null; };
const fmtMs = (ms: number | null | undefined) => (ms == null ? "" : ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s` : `${Math.round(ms)} ms`);
const fmtOff = (ms: number | null) => (ms == null ? "" : `+${(ms / 1000).toFixed(3)}s`);
const nTok = (n: any) => (n == null ? null : Number(n).toLocaleString("en-US"));

export function buildFrames(turn: any, events: any[], call: any | null, cliTraces: any[]): Frame[] {
  const evs = events.slice().sort((a: any, b: any) => (a.id || 0) - (b.id || 0));
  const t0 = tsMs(turn?.ts) ?? tsMs(evs[0]?.ts) ?? null;
  const out: Frame[] = [];
  let n = 0;
  const push = (f: Omit<Frame, "n">) => out.push({ n: ++n, ...f });
  push({ offsetMs: 0, durMs: null, icon: "◆", text: `turn #${turn?.id ?? "?"}`, note: turn?.user_text ? `"${String(turn.user_text).slice(0, 60)}${String(turn.user_text).length > 60 ? "…" : ""}"` : "", meta: [turn?.session_id != null && `session #${turn.session_id}`, turn?.model_id && `pinned ${turn.model_id}`].filter(Boolean).join(" · "), depth: 0, kind: "step" });
  let prevTs: number | null = t0;
  let callPlaced = false;
  for (const e of evs) {
    const L = label(e);
    const ts = tsMs(e.ts);
    const m = parse(e.context_json);
    const dur = e.duration_ms != null ? Number(e.duration_ms) : ts != null && prevTs != null ? ts - prevTs : null;
    push({ offsetMs: ts != null && t0 != null ? ts - t0 : null, durMs: dur && dur > 0 ? dur : null, icon: L.icon, text: L.text, note: L.note, meta: [e.actor, e.source && e.source !== "chat" && e.source, m.kind && `classified ${m.kind}`, e.outcome && e.outcome !== "success" && e.outcome !== "ok" && e.outcome].filter(Boolean).join(" · "), error: e.outcome === "error", depth: 1, kind: "step" });
    if (ts != null) prevTs = ts;
    // the AI call sits under the step that spent it (the triage/present step carrying a model)
    if (call && !callPlaced && (m.model || m.tokens_in != null)) { placeCall(); }
  }
  if (call && !callPlaced) placeCall();
  function placeCall() {
    callPlaced = true;
    const c = call.call ?? call;
    const cTs = tsMs(c.ts);
    const dur = Number(c.duration_ms) || null;
    const start = cTs != null && dur != null ? cTs - dur : cTs;
    push({ offsetMs: start != null && t0 != null ? start - t0 : null, durMs: dur, icon: "⟶", text: `ai-call #${c.id}`, note: `${c.prompt_name ?? "prompt"}${c.prompt_version != null ? ` v${c.prompt_version}` : ""}`, meta: [`${c.provider ?? "?"}/${short(c.model_id)}`, [c.tier, c.temperature].filter(Boolean).join("/"), c.tokens_in != null || c.tokens_out != null ? `${nTok(c.tokens_in) ?? 0}→${nTok(c.tokens_out) ?? 0} tok` : null, c.cost_usd != null ? `$${Number(c.cost_usd).toFixed(4)}` : null, c.cached ? "cached" : null, c.outcome].filter(Boolean).join(" · "), error: c.outcome && c.outcome !== "success", depth: 2, kind: "call" });
    // the CLI's own frames — the trace whose window overlaps the call's
    if (c.provider === "cli" && start != null) {
      const tr = cliTraces.find((x: any) => x.engine === c.model_id && x.ended >= start - 5_000 && x.started <= (cTs ?? start) + 5_000) ?? null;
      if (tr) {
        const bin = cliBinOf(tr.engine);
        push({ offsetMs: t0 != null ? tr.started - t0 : null, durMs: tr.ms, icon: "▸", text: bin, note: `root ${tr.cwd}`, meta: [tr.tools?.length ? `${tr.tools.length} tool${tr.tools.length === 1 ? "" : "s"}` : "no tools", tr.tokensIn != null ? `${nTok(tr.tokensIn)}→${nTok(tr.tokensOut ?? 0)} tok` : null, tr.cost != null ? `$${Number(tr.cost).toFixed(4)}` : null, tr.ok ? "ok" : tr.error ?? "failed"].filter(Boolean).join(" · "), error: !tr.ok, depth: 3, kind: "cli" });
        for (const tool of tr.tools ?? []) push({ offsetMs: null, durMs: null, icon: "·", text: tool.name, note: tool.target, meta: "", depth: 4, kind: "tool" });
      } else {
        push({ offsetMs: null, durMs: null, icon: "▸", text: `${short(c.model_id)} headless`, note: "no CLI trace kept for this call (the engine restarted since, or the call predates the audit)", meta: "", depth: 3, kind: "cli" });
      }
    }
  }
  const total = turn?.ai_duration_ms != null ? Number(turn.ai_duration_ms) : prevTs != null && t0 != null ? prevTs - t0 : null;
  push({ offsetMs: total, durMs: null, icon: "↳", text: "done", note: [turn?.classified_kind && `classified ${turn.classified_kind}`, turn?.classification_confidence != null && `${Math.round(Number(turn.classification_confidence) * 100)}% sure`].filter(Boolean).join(" · "), meta: [turn?.ai_tokens_in != null || turn?.ai_tokens_out != null ? `${nTok(turn?.ai_tokens_in) ?? 0}→${nTok(turn?.ai_tokens_out) ?? 0} tok` : null, turn?.ai_cost_usd != null ? `$${Number(turn.ai_cost_usd).toFixed(4)}` : null, total != null ? fmtMs(total) : null].filter(Boolean).join(" · "), depth: 0, kind: "end" });
  return out;
}

/** the command a trace's engine runs as, said as that engine's own (it used to call every engine but Claude and Codex "opencode run"). Pure - tested. */
export function cliBinOf(engine: unknown): string {
  const e = String(engine ?? "");
  const known: Record<string, string> = { "claude-code": "claude -p", codex: "codex exec", opencode: "opencode run", gemini: "agy", grok: "grok -p", cursor: "cursor-agent -p" };
  return known[e] ?? (e || "a CLI");
}

function Frames({ frames }: { frames: Frame[] }) {
  return (
    <div data-testid="audit-frames" style={{ display: "flex", flexDirection: "column", gap: 1, padding: "6px 0 2px", fontFamily: mono, fontSize: 10, lineHeight: 1.5, overflowX: "auto" }}>
      {frames.map((f) => (
        <div key={f.n} style={{ display: "flex", gap: 8, alignItems: "baseline", whiteSpace: "nowrap", paddingLeft: f.depth * 14, color: f.error ? C.bad : f.kind === "tool" ? C.muted : C.dim }}>
          <span style={{ width: 22, textAlign: "right", color: C.muted, flexShrink: 0 }}>{f.kind === "tool" ? "" : `#${f.n}`}</span>
          <span style={{ width: 62, color: C.muted, flexShrink: 0 }}>{fmtOff(f.offsetMs)}</span>
          <span style={{ width: 12, flexShrink: 0 }}>{f.icon}</span>
          <span style={{ color: f.error ? C.bad : f.kind === "call" || f.kind === "cli" ? C.fg : f.kind === "tool" ? C.fg : C.dim, fontWeight: f.kind === "call" ? 600 : 400 }}>{f.text}</span>
          {f.durMs != null && <span style={{ color: C.muted }}>{fmtMs(f.durMs)}</span>}
          {f.note && <span style={{ color: C.muted, opacity: 0.85 }}>{f.note}</span>}
          {f.meta && <span style={{ color: C.dim, opacity: 0.8 }}>{f.meta}</span>}
        </div>
      ))}
    </div>
  );
}

function Steps({ events }: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 2px 2px" }}>
      {events.map((e: any, i: number) => { const L = label(e); return (
        <div key={e.id ?? i} style={{ display: "flex", gap: 7, alignItems: "baseline", fontFamily: mono, fontSize: 10.5 }}>
          <span style={{ width: 14, flexShrink: 0 }}>{L.icon}</span>
          <span style={{ color: e.outcome === "error" ? C.bad : C.dim }}>{L.text}</span>
          {L.note && <span style={{ color: C.muted, opacity: 0.85 }}>{L.note}</span>}
        </div>
      ); })}
    </div>
  );
}

export function TraceTrail({ turnId, live, baselineId, turn }: { turnId?: number; live?: boolean; baselineId?: number; turn?: any }) {
  const [open, setOpen] = React.useState(false);
  const [events, setEvents] = React.useState<any[]>([]);
  const [call, setCall] = React.useState<any | null>(null);
  const [cliTraces, setCliTraces] = React.useState<any[]>([]);

  // LIVE: poll the events after the baseline while the turn is in flight. ACCUMULATE (never shrink) so the list
  // stays put until the answer is ready — a transient empty/error poll leaves what's there.
  React.useEffect(() => {
    if (!live) return;
    let alive = true;
    setEvents([]);
    let baseline: number | null = null; // captured on the FIRST tick (the send flow is untouched — no coupling)
    const tick = async () => {
      try {
        if (baseline == null) {
          const d: any = await re({ limit: 1 });
          baseline = (d?.result?.events ?? d?.events ?? [])[0]?.id ?? 0;
          return; // the baseline tick doesn't render
        }
        const d: any = await re({ after_id: baseline, limit: 40 });
        const ev = (d?.result?.events ?? d?.events ?? []).filter(fromChat);
        if (!alive || !ev.length) return; // keep the existing list on an empty poll
        setEvents((prev: any[]) => {
          const seen = new Set(prev.map((e: any) => e.id));
          const merged = [...prev, ...ev.filter((e: any) => !seen.has(e.id))];
          return merged.sort((a: any, b: any) => (a.id || 0) - (b.id || 0)); // chronological, grows only
        });
      } catch { /* keep what we have */ }
    };
    tick(); const h = setInterval(tick, 900);
    return () => { alive = false; clearInterval(h); };
  }, [live]);

  // FINISHED: the ENTIRE turn trace by user_goal_id (every step — RAG, skills, AI call), chronological,
  // plus the AI call's own row and — for a CLI engine — the CLI's trace, so the audit has every frame.
  const loadTurn = async () => {
    try { const d: any = await re({ user_goal_id: turnId, limit: 100 }); const ev = (d?.result?.events ?? d?.events ?? []).slice().reverse(); setEvents(ev); } catch { /* */ }
    const callId = turn?.ai_call_id;
    if (callId != null) {
      try {
        const c: any = await apiGet(`/api/v1/ai-calls/${callId}`, { timeoutMs: 15_000 });
        const row = c?.result?.call ?? c?.call ?? null;
        if (row) {
          setCall(row);
          if (row.provider === "cli") {
            const end = tsMs(row.ts); const since = end != null ? end - (Number(row.duration_ms) || 0) - 60_000 : 0;
            try { const tr: any = await apiGet(`/api/v1/cli-llm/traces?since=${since}`, { timeoutMs: 15_000 }); setCliTraces(tr?.result?.traces ?? tr?.traces ?? []); } catch { /* none */ }
          }
        }
      } catch { /* the frames still render without the call row */ }
    }
  };
  const toggle = () => { const n = !open; setOpen(n); if (n && !live && !events.length && turnId) loadTurn(); };

  if (live) {
    return (
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>⚙ thinking{events.length ? "" : "…"}</div>
        {events.length > 0 && <Steps events={events} />}
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 6 }}>
      <button onClick={toggle} title="the audit of this turn — every step with its offset and duration, the AI call, and the tools the engine ran" style={{ fontFamily: mono, fontSize: 10, color: C.muted, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
        {open ? "▾" : "▸"} reasoning · audit
      </button>
      {open && (events.length || call ? <Frames frames={buildFrames(turn ?? { id: turnId }, events, call, cliTraces)} /> : <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, padding: "4px 2px" }}>no trace recorded.</div>)}
    </div>
  );
}

// Capture the latest runtime_events id as a baseline (call before sending; the LIVE trail polls events after it).
export async function captureTraceBaseline(): Promise<number> {
  try { const d: any = await re({ limit: 1 }); const ev = d?.result?.events ?? d?.events ?? []; return ev[0]?.id ?? 0; } catch { return 0; }
}
