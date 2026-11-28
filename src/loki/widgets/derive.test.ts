// deriveWidgets is the SINGLE place a turn row becomes its inline widgets. Everything here is a
// rule that decides what the operator sees on a turn, so each test pins a decision rather than a
// shape: which widget appears, which is suppressed, and what survives a reload.
import { describe, it, expect } from "vitest";
import { deriveWidgets } from "./derive";

const kinds = (t: any, isLast = true) => deriveWidgets(t, isLast).map((w) => w.kind);

describe("screening questionnaire", () => {
  it("renders when should_render and at least one question has options", () => {
    const t = {
      id: 1,
      clarify_questionnaire: { should_render: true, questions: [{ question_md: "which?", options: ["a", "b"] }] },
    };
    expect(kinds(t)).toContain("screening");
  });

  it("is suppressed when should_render is false, even with valid questions", () => {
    const t = {
      id: 1,
      clarify_questionnaire: { should_render: false, questions: [{ question_md: "q", options: ["a"] }] },
    };
    expect(kinds(t)).not.toContain("screening");
  });

  it("is suppressed when every question has zero options (nothing to click)", () => {
    const t = { id: 1, clarify_questionnaire: { should_render: true, questions: [{ question_md: "q", options: [] }] } };
    expect(kinds(t)).not.toContain("screening");
  });

  it("upgrades the LEGACY single-question shape {question_md, options} to a 1-question array", () => {
    // Back-compat: old rows persisted the flat shape. Dropping it would blank the widget on reload.
    const t = { id: 1, clarify_questionnaire: { should_render: true, question_md: "legacy?", options: ["x"] } };
    const w = deriveWidgets(t, true).find((x) => x.kind === "screening") as any;
    expect(w).toBeTruthy();
    expect(w.payload.q.questions).toEqual([{ question_md: "legacy?", options: ["x"] }]);
  });

  it("reads the questionnaire from the *_json string form too", () => {
    const t = {
      id: 1,
      clarify_questionnaire_json: JSON.stringify({ should_render: true, questions: [{ question_md: "q", options: ["a"] }] }),
    };
    expect(kinds(t)).toContain("screening");
  });
});

describe("confirm widget", () => {
  it("appears for an unconfirmed turn that proposed actions", () => {
    const t = { id: 2, confirmed: 0, proposed_actions_json: JSON.stringify([{ action: "x" }]) };
    expect(kinds(t)).toContain("confirm");
  });

  it("treats null/false/0 all as unconfirmed", () => {
    for (const confirmed of [0, false, null, undefined]) {
      const t = { id: 2, confirmed, proposed_actions_json: JSON.stringify([{ action: "x" }]) };
      expect(kinds(t)).toContain("confirm");
    }
  });

  it("disappears once the turn is confirmed", () => {
    const t = { id: 2, confirmed: 1, proposed_actions_json: JSON.stringify([{ action: "x" }]) };
    expect(kinds(t)).not.toContain("confirm");
  });

  it("YIELDS to a screening questionnaire — never both at once", () => {
    // Two competing prompts on one turn would ask the operator two things simultaneously.
    const t = {
      id: 2,
      confirmed: 0,
      proposed_actions_json: JSON.stringify([{ action: "x" }]),
      clarify_questionnaire: { should_render: true, questions: [{ question_md: "q", options: ["a"] }] },
    };
    const k = kinds(t);
    expect(k).toContain("screening");
    expect(k).not.toContain("confirm");
  });

  it("carries a numeric confidence through, and null when absent or non-numeric", () => {
    const base = { id: 2, confirmed: 0, proposed_actions_json: JSON.stringify([{ action: "x" }]) };
    const w1 = deriveWidgets({ ...base, classification_confidence: 0.42 }, true).find((w) => w.kind === "confirm") as any;
    expect(w1.payload.confidence).toBe(0.42);
    const w2 = deriveWidgets({ ...base, classification_confidence: "high" }, true).find((w) => w.kind === "confirm") as any;
    expect(w2.payload.confidence).toBeNull();
  });

  it("malformed proposed_actions_json degrades to no widget instead of throwing", () => {
    const t = { id: 2, confirmed: 0, proposed_actions_json: "{not json" };
    expect(() => deriveWidgets(t, true)).not.toThrow();
    expect(kinds(t)).not.toContain("confirm");
  });
});

describe("presenter view intents", () => {
  it("'inline' and 'none' produce no view widget", () => {
    for (const view_intent of ["inline", "none"]) {
      const k = kinds({ id: 3, view_intent, view_data: { a: 1 } });
      expect(k).not.toContain("board");
      expect(k).not.toContain("table");
    }
  });

  it("maps each intent to its widget kind", () => {
    expect(kinds({ id: 3, view_intent: "board", view_data: {} })).toContain("board");
    expect(kinds({ id: 3, view_intent: "table", view_data: {} })).toContain("table");
    expect(kinds({ id: 3, view_intent: "code", view_data: {} })).toContain("code");
    expect(kinds({ id: 3, view_intent: "tabs", view_data: {} })).toContain("tabs");
    expect(kinds({ id: 3, view_intent: "card_detail", view_data: { slug: "S" } })).toContain("card-detail");
  });

  it("card_detail carries only the slug", () => {
    const w = deriveWidgets({ id: 3, view_intent: "card_detail", view_data: { slug: "FEAT-X", noise: 1 } }, true)
      .find((x) => x.kind === "card-detail") as any;
    expect(w.payload).toEqual({ slug: "FEAT-X" });
  });

  it("'code' prefers dispatch_results over view_data (the raw substrate payload wins)", () => {
    const w = deriveWidgets(
      { id: 3, view_intent: "code", view_data: { from: "view" }, dispatch_results: { from: "dispatch" } },
      true,
    ).find((x) => x.kind === "code") as any;
    expect(w.payload).toEqual({ from: "dispatch" });
  });

  it("'improvements' renders summary → improvements → diagram, and skips the diagram when trivial", () => {
    const withDiagram = kinds({
      id: 3,
      view_intent: "improvements",
      view_data: { summary: "s", diagram: { nodes: [1, 2] } },
    });
    expect(withDiagram).toEqual(expect.arrayContaining(["summary", "improvements", "diagram"]));
    expect(withDiagram.indexOf("summary")).toBeLessThan(withDiagram.indexOf("improvements"));

    // A one-node diagram is noise, not a picture.
    const oneNode = kinds({ id: 3, view_intent: "improvements", view_data: { diagram: { nodes: [1] } } });
    expect(oneNode).not.toContain("diagram");
    expect(oneNode).toContain("improvements");
  });
});

describe("sources", () => {
  it("renders when sources_json holds a non-empty array", () => {
    expect(kinds({ id: 4, sources_json: JSON.stringify([{ path: "a.ts" }]) })).toContain("sources");
  });

  it("is skipped for an empty array or malformed JSON", () => {
    expect(kinds({ id: 4, sources_json: "[]" })).not.toContain("sources");
    expect(kinds({ id: 4, sources_json: "{bad" })).not.toContain("sources");
  });
});

describe("persisted studio widgets", () => {
  it("re-renders a persisted widget with a durable _uid of '<kind>-w<row id>'", () => {
    const t = { id: 5, studio_widgets: [{ id: 77, kind: "diagram", type: "widget", payload_json: JSON.stringify({ a: 1 }) }] };
    const w = deriveWidgets(t, true).find((x) => x.key === "tw-77") as any;
    expect(w.kind).toBe("diagram");
    expect(w.payload).toEqual({ a: 1, _uid: "diagram-w77" });
  });

  it("routes type='artifact' to the artifact renderer regardless of kind", () => {
    const t = { id: 5, studio_widgets: [{ id: 78, kind: "anything", type: "artifact", payload: { x: 1 } }] };
    expect(deriveWidgets(t, true).find((x) => x.key === "tw-78")!.kind).toBe("artifact");
  });

  it("NEVER renders 'session-context' — it is session state, not a widget", () => {
    const t = { id: 5, studio_widgets: [{ id: 79, kind: "session-context", type: "widget", payload: { pinned: [] } }] };
    expect(deriveWidgets(t, true).some((w) => w.key === "tw-79")).toBe(false);
  });

  it("skips a widget whose payload is missing or unparseable", () => {
    const t = {
      id: 5,
      studio_widgets: [
        { id: 80, kind: "x", type: "widget", payload_json: "{bad" },
        { id: 81, kind: "x", type: "widget" },
      ],
    };
    expect(deriveWidgets(t, true).filter((w) => String(w.key).startsWith("tw-"))).toHaveLength(0);
  });

  it("sanitises non-word characters out of the _uid family", () => {
    const t = { id: 5, studio_widgets: [{ id: 82, kind: "code sample/v2", type: "widget", payload: { a: 1 } }] };
    const w = deriveWidgets(t, true).find((x) => x.key === "tw-82") as any;
    expect(w.payload._uid).toBe("code-sample-v2-w82");
  });

  it("wraps a non-object payload rather than spreading a primitive", () => {
    const t = { id: 5, studio_widgets: [{ id: 83, kind: "x", type: "widget", payload_json: JSON.stringify("hello") }] };
    const w = deriveWidgets(t, true).find((x) => x.key === "tw-83") as any;
    expect(w.payload).toEqual({ value: "hello", _uid: "x-w83" });
  });
});

describe("the response action row", () => {
  it("appears under any replied turn and carries the conversation as widget scope", () => {
    const t = { id: 6, user_text: "explain auth", interviewer_response_md: "auth works like…" };
    const w = deriveWidgets(t, true).find((x) => x.kind === "offers") as any;
    expect(w.payload.context).toEqual({ request: "explain auth", response: "auth works like…" });
    expect(w.payload.offers).toEqual([]);
  });

  it("falls back through content_md and presentation_md for the reply text", () => {
    expect(kinds({ id: 6, content_md: "c" })).toContain("offers");
    expect(kinds({ id: 6, presentation_md: "p" })).toContain("offers");
  });

  it("does NOT appear on a turn with no reply yet", () => {
    expect(kinds({ id: 6, user_text: "asked" })).not.toContain("offers");
  });

  it("passes persisted offers through, from object or *_json form", () => {
    const fromJson = deriveWidgets(
      { id: 6, content_md: "c", offered_widgets_json: JSON.stringify([{ kind: "diagram" }]) },
      true,
    ).find((x) => x.kind === "offers") as any;
    expect(fromJson.payload.offers).toEqual([{ kind: "diagram" }]);

    const nonArray = deriveWidgets({ id: 6, content_md: "c", offered_widgets: { not: "an array" } }, true)
      .find((x) => x.kind === "offers") as any;
    expect(nonArray.payload.offers).toEqual([]);
  });
});

describe("keys", () => {
  it("every widget key is unique within a turn (React would drop duplicates)", () => {
    const t = {
      id: 9,
      confirmed: 0,
      proposed_actions_json: JSON.stringify([{ action: "a" }]),
      view_intent: "table",
      view_data: {},
      sources_json: JSON.stringify([{ path: "p" }]),
      content_md: "reply",
      studio_widgets: [{ id: 1, kind: "k", type: "widget", payload: { a: 1 } }],
    };
    const keys = deriveWidgets(t, true).map((w) => w.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
