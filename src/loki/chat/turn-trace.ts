// THE STACK TRACE OF A TURN (operator 2026-09-25: "It should at least show my prompt sent and some info like
// stack trace of the gates, like heimdall deciding, routing, than wich AI was chose, than what is doing, than
// the actual logs from the AI chosen, then the final result").
//
// Everything below already arrives in the pane: the ask, the routing verdict, the model note, the tool calls,
// the gate results, the audit and the result. What was missing is that nobody put them in order and showed
// them as one sequence — so a turn looked like a prompt followed by silence followed by an answer.
//
// DERIVED, NOT COLLECTED. This reads the turns that are already there rather than adding a second event
// stream, so the trace cannot drift from the transcript it describes: if a stage is not in the log, it does not
// appear here, and nothing here is invented to fill a gap. Pure — tested.

export type TraceLine = { glyph: string; text: string; detail?: string; tone?: "ok" | "warn" | "bad" | "dim"; ms?: number };

type Turnish = {
  user?: { t: number; text: string; pending?: boolean };
  tools: { name: string; error?: boolean }[];
  replies: { t: number; model?: string; streaming?: boolean }[];
  notes: { t: number; text: string; tone?: string }[];
  result?: { t: number; cost: number; ms: number; turns: number; error?: string };
};

/** `1.4s` · `410ms` · `2m 05s`. Pure. */
export function dur(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")}s`;
}

/** THE TOOL VERBS A PERSON RECOGNISES. An agent's tool names are its own (`Edit`, `str_replace_editor`,
 *  `mcp__antiloki__…`); what the operator wants to know is whether the turn READ, WROTE, SEARCHED or RAN something.
 *  Anything unrecognised keeps its own name rather than being forced into a bucket — a verb nobody can check is worse
 *  than a name nobody recognises. Pure. */
export function verbOf(tool: string): string {
  const t = tool.toLowerCase().replace(/^mcp__[a-z0-9_]+__/, "");
  if (/(^|_)(read|view|open|cat)/.test(t)) return "read";
  if (/(^|_)(edit|write|patch|replace|create|multiedit)/.test(t)) return "wrote";
  if (/(^|_)(grep|glob|search|find|ls|list)/.test(t)) return "searched";
  if (/(^|_)(bash|shell|run|exec|terminal)/.test(t)) return "ran";
  return tool.replace(/^mcp__[a-z0-9_]+__/, "");
}

/** ONE LINE FOR A WHOLE TURN (operator's queue: "read instead of watch — one line per turn … the full trace folded").
 *
 *  `read ×3 · wrote ×2 · ran ×1 · test 18 passed · 1.4s · $0.02`. Built from the same turns the trace reads, so it can
 *  never claim a stage the log does not have: a turn with no tools says nothing about tools, a turn with no gate says
 *  nothing about gates, and a turn that failed says FAILED rather than showing a tidy summary of a broken run.
 *
 *  "" when there is nothing yet to summarise, so the caller renders the live view instead of an empty line. Pure. */
export function oneLine(x: Turnish): string {
  const parts: string[] = [];
  if (x.tools.length) {
    const by = new Map<string, number>();
    for (const t of x.tools) { const v = verbOf(t.name); by.set(v, (by.get(v) ?? 0) + 1); }
    for (const [verb, n] of [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) parts.push(`${verb} ×${n}`);
    const bad = x.tools.filter((t) => t.error).length;
    if (bad) parts.push(`${bad} failed`);
  }
  // the gates speak for themselves — their own note is already a sentence a person can read
  for (const n of x.notes) {
    const gate = /^(test|build|lint|laws|QA)\b.*/i.exec(n.text.trim());
    if (gate) parts.push(gate[0].split("—")[0].trim().slice(0, 40));
  }
  if (x.result) {
    if (x.result.error) return ["failed", ...parts].join(" · ");
    const money = x.result.cost > 0 ? `$${x.result.cost < 0.01 ? x.result.cost.toFixed(4) : x.result.cost.toFixed(2)}` : "";
    parts.push(...[dur(x.result.ms), money].filter(Boolean));
  }
  return parts.join(" · ");
}

/**
 * One turn as an ordered trace. `routeLine` is the router's verdict as the pane already renders it; `sending`
 * says a reply has not arrived yet, which is what turns "routed" into "routing…".
 */
export function traceOf(x: Turnish, routeLine?: string | null, sending = false): TraceLine[] {
  const out: TraceLine[] = [];
  if (!x.user) return out;

  // 1 · THE ASK. `pending` means the serve has not echoed it back, which is a real state and not an error:
  // on the routed door that echo only comes once a model has been picked and started.
  out.push({ glyph: "›", text: "you asked", detail: x.user.text.split("\n")[0].slice(0, 90), tone: "dim" });

  // 2 · THE ROUTER. Its verdict already carries the tier, the shape and the confidence with its provenance.
  if (routeLine) out.push({ glyph: "⚡", text: "heimdall routed it", detail: routeLine.replace(/^⚡\s*/, "") });
  else if (sending) out.push({ glyph: "⚡", text: "heimdall is reading the ask…", tone: "dim" });

  // 3 · WHICH MODEL ANSWERED. The pane emits a `model → x` note; the first reply's own model is the fallback,
  // because a resumed session does not re-announce it.
  const modelNote = x.notes.find((n) => n.text.startsWith("model → "));
  const model = modelNote?.text.replace("model → ", "") || x.replies.find((r) => r.model)?.model;
  if (model) out.push({ glyph: "◆", text: "answered by", detail: model });

  // 4 · WHAT IT DID. Tool calls, named, with failures counted separately — "12 calls" hides that three of them
  // failed, and the failures are the interesting half.
  if (x.tools.length) {
    const bad = x.tools.filter((t) => t.error).length;
    const names = [...new Set(x.tools.map((t) => t.name))].slice(0, 4).join(" · ");
    out.push({ glyph: "⚙", text: `${x.tools.length} tool call${x.tools.length === 1 ? "" : "s"}`, detail: names, tone: bad ? "warn" : undefined });
    if (bad) out.push({ glyph: "⚙", text: `${bad} of them failed`, tone: "warn" });
  }

  // 4b · DID THE LAST ANSWER HOLD. Shown before the gates because it is about the PREVIOUS turn, and an
  // operator scanning a trace should meet that before the verdicts on this one.
  const reask = x.notes.find((n) => n.text.startsWith("asked again"));
  if (reask) out.push({ glyph: "↻", text: reask.text, tone: "warn" });

  // 5 · THE GATES AND THE JUDGE, in the order the serve ran them. These notes are already written by the
  // gates and the QA gate; the trace only stops them being scattered among the tool output.
  for (const n of x.notes) {
    if (n.text.startsWith("model → ") || n.text.startsWith("asked again")) continue;
    const gate = /^(test|build|lint|QA)\b/i.exec(n.text.trim());
    if (gate) out.push({ glyph: n.tone === "bad" ? "✗" : n.tone === "warn" ? "–" : "✓", text: n.text, tone: n.tone as TraceLine["tone"] });
  }

  // 6 · THE RESULT, priced and timed. An error says so instead of being a successful-looking last line.
  if (x.result) {
    const r = x.result;
    out.push({
      glyph: r.error ? "✗" : "✓",
      text: r.error ? "failed" : "done",
      detail: [dur(r.ms), r.cost > 0 ? `$${r.cost < 0.01 ? r.cost.toFixed(4) : r.cost.toFixed(2)}` : ""].filter(Boolean).join(" · "),
      tone: r.error ? "bad" : "ok",
      ms: r.ms,
    });
  } else if (sending || x.replies.some((r) => r.streaming)) {
    out.push({ glyph: "…", text: "working", tone: "dim" });
  }
  return out;
}
