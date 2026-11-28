// CHAT EXPORT (operator 2026-07-25): the COMPLETE session as one markdown document — every turn (your
// input + the AI's reply), every AI call's telemetry, the screening questions, the dispatched actions,
// and every widget/artefact WITH its data — all in chronological order, showing the conversation's flow.
// Deterministic: built from the session's persisted rows (turns + session widget store), no DOM scraping.

const parse = (s: any) => { try { return typeof s === "string" ? JSON.parse(s) : s; } catch { return null; } };
const money = (n: any) => (n != null ? `$${Number(n).toFixed(4)}` : null);
const tok = (n: any) => (n == null ? "0" : Number(n) >= 1000 ? `${(Number(n) / 1000).toFixed(1)}k` : String(n));
const uidOf = (w: any) => `${String(w.kind).replace(/[^\w]+/g, "-")}-w${w.id}`;

function widgetBlock(w: any, heading = "####"): string[] {
  const L: string[] = [];
  const payload = parse(w.payload_json) ?? w.payload ?? null;
  if (w.type === "artifact") {
    const item = payload?.item ?? {};
    L.push(`${heading} ◆ artefact — ${item.title ?? "untitled"} · \`#${uidOf(w)}\``, "");
    if (item.article) L.push(`_A deterministic **${item.article}** article — stored as a RECIPE; its figures regenerate from the substrate on open ($0, always current)._`, "");
    if (item.body_md) L.push(String(item.body_md).trim(), "");
  } else {
    L.push(`${heading} ◳ widget — ${w.kind} · \`#${uidOf(w)}\``, "");
    const pj = payload && typeof payload === "object" ? { ...payload } : payload;
    if (pj && typeof pj === "object") delete (pj as any)._uid;
    const s = pj == null || (typeof pj === "object" && !Object.keys(pj).length) ? null : JSON.stringify(pj, null, 2);
    if (s) L.push("```json", s, "```", "");
    else L.push(`_(self-fetching — renders its data live from the substrate)_`, "");
  }
  return L;
}

export function buildChatMarkdown(args: {
  sessionId: number;
  session?: any | null;
  turns: any[];
  sessionWidgets: any[];
  refs?: any[];
  trayLabel?: (r: any) => string;
}): string {
  const { sessionId, session, turns, sessionWidgets, refs = [], trayLabel } = args;
  const L: string[] = [];
  let cost = 0, tin = 0, tout = 0;
  for (const t of turns) { cost += Number(t.ai_cost_usd) || 0; tin += Number(t.ai_tokens_in) || 0; tout += Number(t.ai_tokens_out) || 0; }

  L.push(`# antiloki · chat session #${sessionId}`, "");
  const meta = [
    session?.started_at ? `started ${session.started_at}` : null,
    `${turns.length} turn${turns.length === 1 ? "" : "s"}`,
    `${money(cost) ?? "$0"} total`,
    `${tok(tin)}→${tok(tout)} tok`,
    `exported ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
  ].filter(Boolean).join(" · ");
  L.push(`_${meta}_`, "");

  // the pinned context — what grounded the whole session
  const ctxRow = [...sessionWidgets].reverse().find((w) => w.kind === "session-context");
  const ctx = parse(ctxRow?.payload_json);
  const ctxRefs: any[] = Array.isArray(ctx?.refs) ? ctx.refs : refs;
  L.push(`## pinned context`, "");
  L.push(`- **this session** — every widget/artefact below is automatically grounding for the AI`);
  for (const r of ctxRefs) L.push(`- ${trayLabel ? trayLabel(r) : JSON.stringify(r)}`);
  L.push("");

  // chronological flow: session-level widgets (no turn) splice in by created_at; turn-anchored ones
  // render under their turn. Everything appears exactly once, in the order it happened.
  const loose = sessionWidgets
    .filter((w) => w.turn_id == null && w.kind !== "session-context")
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || a.id - b.id);
  let li = 0;
  const emitLoose = (before: string | null) => {
    while (li < loose.length && (before == null || String(loose[li].created_at ?? "") <= before)) {
      L.push(...widgetBlock(loose[li], "###")); li++;
    }
  };

  L.push(`---`, "", `## the conversation`, "");
  turns.forEach((t, i) => {
    emitLoose(String(t.ts ?? ""));
    // — you —
    L.push(`### ${i + 1} · you${t.ts ? ` · ${t.ts}` : ""}`, "");
    L.push(String(t.user_text ?? "").trim() || "_(empty)_", "");
    // — the AI —
    const reply = t.presentation_md ?? t.interviewer_response_md ?? t.content_md ?? "";
    const bits = [
      t.classified_kind ? `kind **${t.classified_kind}**` : null,
      t.classification_confidence != null ? `${Math.round(Number(t.classification_confidence) * 100)}% sure` : null,
      t.ai_tier ? `tier ${t.ai_tier}` : null,
      t.model_id ? `\`${t.model_id}\`` : null,
      money(t.ai_cost_usd),
      (t.ai_tokens_in != null || t.ai_tokens_out != null) ? `${tok(t.ai_tokens_in)}→${tok(t.ai_tokens_out)} tok` : null,
      t.ai_duration_ms != null ? `${t.ai_duration_ms}ms` : null,
    ].filter(Boolean).join(" · ");
    L.push(`### interviewer${bits ? ` — ${bits}` : ""}`, "");
    if (reply) L.push(String(reply).trim(), "");
    // screening (the chip questions)
    const q = parse(t.clarify_questionnaire_json);
    if (Array.isArray(q?.questions) && q.questions.length) {
      L.push(`**screening:**`);
      for (const qq of q.questions) L.push(`- ${qq.question_md ?? qq.question}${Array.isArray(qq.options) ? ` — ${qq.options.map((o: any) => o.label ?? o).join(" · ")}` : ""}`);
      L.push("");
    }
    // proposed / dispatched actions
    const plan = parse(t.proposed_actions_json);
    if (Array.isArray(plan) && plan.length) {
      L.push(`**proposed actions${t.confirmed ? " (confirmed)" : ""}:** ${plan.map((a: any) => `\`${a.action ?? a.action_name ?? a}\``).join(" · ")}`, "");
    }
    // every AI call behind this turn (triage · capabilities · presenter)
    const tel = parse(t.ai_telemetry_json);
    if (Array.isArray(tel) && tel.length) {
      L.push(`**AI calls (${tel.length}):**`, "", `| phase | model | tier | tokens | cost | time |`, `| --- | --- | --- | --- | --- | --- |`);
      for (const c of tel) L.push(`| ${c.phase ?? "?"} | \`${c.model_id ?? "?"}\` | ${c.tier ?? "—"} | ${tok(c.tokens_in)}→${tok(c.tokens_out)} | ${money(c.cost_usd) ?? "—"} | ${c.duration_ms != null ? `${c.duration_ms}ms` : "—"} |`);
      L.push("");
    }
    if (t.view_intent && t.view_intent !== "inline" && t.view_intent !== "none") L.push(`**view:** ${t.view_intent}`, "");
    // the widgets/artefacts born on this turn — with their data
    const tws = [
      ...(Array.isArray(t.studio_widgets) ? t.studio_widgets : []),
      ...sessionWidgets.filter((w) => w.turn_id === t.id),
    ].filter((w, x, arr) => w.kind !== "session-context" && arr.findIndex((y) => y.id === w.id) === x);
    for (const w of tws) L.push(...widgetBlock(w));
    L.push(`---`, "");
  });
  emitLoose(null); // anything created after the last turn

  L.push(`_— exported from antiloki · the flow above is the session's persisted record (turns + widget store), reproduced in order._`);
  return L.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function downloadChatMarkdown(md: string, sessionId: number) {
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `chat-session-${sessionId}.md`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}
