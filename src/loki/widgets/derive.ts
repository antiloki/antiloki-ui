import type { Widget } from "./types";

function safeParse(s: any): any {
  if (s == null) return null;
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return null; }
}

// deriveWidgets — the single place a turn row becomes its inline widgets,
// replacing the ad-hoc branching that used to live in the drawer's Turn render.
// Persisted fields (proposed_actions_json, clarify_questionnaire) drive the
// interactive control widgets and survive reload; the presenter's live
// view_intent/view_data (only present on the just-sent turn, never persisted on
// interviewer_turns) drive the read widgets.
export function deriveWidgets(t: any, isLast: boolean): Widget[] {
  const widgets: Widget[] = [];

  // Batched screening (≤3 questions). Rendered on PAST turns too so it doesn't vanish when answered —
  // the widget disables itself when it isn't the last turn (via ctx.isLast).
  let questionnaire = t.clarify_questionnaire ?? null;
  if (!questionnaire) questionnaire = safeParse(t.clarify_questionnaire_json);
  // Back-compat: the old single-question shape {question_md, options} → wrap as a 1-question array.
  if (questionnaire && !Array.isArray(questionnaire.questions) && questionnaire.question_md) {
    questionnaire = { ...questionnaire, questions: [{ question_md: questionnaire.question_md, options: questionnaire.options ?? [] }] };
  }
  const hasQ = questionnaire?.should_render
    && Array.isArray(questionnaire?.questions) && questionnaire.questions.length > 0
    && questionnaire.questions.some((q: any) => Array.isArray(q?.options) && q.options.length > 0);
  if (hasQ) {
    widgets.push({ kind: "screening", key: `screening-${t.id}`, payload: { q: questionnaire } });
  }

  const proposed = safeParse(t.proposed_actions_json) ?? [];
  const needsConfirm = (t.confirmed === 0 || t.confirmed === false || t.confirmed == null)
    && Array.isArray(proposed) && proposed.length > 0;
  if (!hasQ && needsConfirm) {
    widgets.push({
      kind: "confirm",
      key: `confirm-${t.id}`,
      payload: {
        actions: proposed,
        confidence: typeof t.classification_confidence === "number" ? t.classification_confidence : null,
      },
    });
  }

  // Live presenter view widgets (ephemeral). view_data may be an inline object
  // or a *_json string; dispatch_results is the raw substrate payload.
  const viewIntent = t.view_intent;
  if (viewIntent && viewIntent !== "inline" && viewIntent !== "none") {
    const viewData = t.view_data ?? safeParse(t.view_data_json);
    const dispatchResults = t.dispatch_results ?? safeParse(t.dispatch_results_json);
    if (viewIntent === "board") {
      widgets.push({ kind: "board", key: `board-${t.id}`, payload: viewData ?? dispatchResults });
    } else if (viewIntent === "card_detail") {
      widgets.push({ kind: "card-detail", key: `card-${t.id}`, payload: { slug: viewData?.slug } });
    } else if (viewIntent === "table") {
      widgets.push({ kind: "table", key: `table-${t.id}`, payload: viewData });
    } else if (viewIntent === "code") {
      widgets.push({ kind: "code", key: `code-${t.id}`, payload: dispatchResults ?? viewData });
    } else if (viewIntent === "tabs") {
      // a response's widget QUEUE → tabs (session #19): view_data.tabs = [{label, kind, payload | split}],
      // each tab a distinct widget (answer · code-sample · diff · graph); a split tab renders one twice.
      widgets.push({ kind: "tabs", key: `tabs-${t.id}`, payload: viewData ?? dispatchResults });
    } else if (viewIntent === "improvements") {
      // a vertical ARTICLE: an Overview summary card → the improvements list (each point = prose + its
      // before/after) → an optional architecture diagram below. Nothing hides behind a 'suggestions' tab.
      if (viewData?.summary) widgets.push({ kind: "summary", key: `sum-${t.id}`, payload: { summary: viewData.summary } });
      widgets.push({ kind: "improvements", key: `imp-${t.id}`, payload: viewData });
      if (viewData?.diagram?.nodes?.length > 1) widgets.push({ kind: "diagram", key: `diag-${t.id}`, payload: { diagram: viewData.diagram } });
    }
  }

  // c1: the grounding sources (files/docs the answer used) → a collapsible "Sources" list under the answer.
  const srcs = safeParse(t.sources_json);
  if (Array.isArray(srcs) && srcs.length) widgets.push({ kind: "sources", key: `sources-${t.id}`, payload: { sources: srcs } });

  // STUDIO RESULT DURABILITY (operator 2026-07-15): widgets/artifacts generated in the Studio are
  // persisted onto the turn (interviewer_turn_widgets) and re-render here on reload. Artifacts use
  // the 'artifact' renderer; widgets their own kind (unknown kinds degrade to nothing in WidgetHost).
  for (const w of Array.isArray(t.studio_widgets) ? t.studio_widgets : []) {
    // 'session-context' is the session's pinned @ context persisted on the turn — it's state, not a
    // widget, so the chat restores it directly and it never renders here (or in the widgets rail).
    if (w.kind === "session-context") continue;
    const payload = safeParse(w.payload_json) ?? w.payload ?? null;
    if (!payload) continue;
    // _uid = family + identity ("<kind>-w<row id>") — the widget's durable name in the session.
    const uid = `${String(w.kind).replace(/[^\w]+/g, "-")}-w${w.id}`;
    widgets.push({ kind: w.type === "artifact" ? "artifact" : w.kind, key: `tw-${w.id}`, payload: { ...(typeof payload === "object" && payload !== null ? payload : { value: payload }), _uid: uid } });
  }

  // The RESPONSE ACTION ROW (operator 2026-07-15) renders under EVERY replied turn: ✂ Simplify ·
  // ⤢ Expand · ◇ Propose + the persisted deterministic offers as ⊞ Studio suggestions (a suggestion
  // opens the Studio preselected — it never generates by itself).
  const reply = t.interviewer_response_md ?? t.content_md ?? t.presentation_md ?? "";
  const offered = t.offered_widgets ?? safeParse(t.offered_widgets_json);
  if (reply) {
    widgets.push({ kind: "offers", key: `offers-${t.id}`, payload: {
      offers: Array.isArray(offered) ? offered : [],
      // The conversation (this turn's request + answer) is the DEFAULT scope for generated widgets
      // (diagram / code / improvements) — so a diagram after "explain auth" diagrams the auth flow.
      context: { request: t.user_text ?? "", response: reply },
    } });
  }

  return widgets;
}
