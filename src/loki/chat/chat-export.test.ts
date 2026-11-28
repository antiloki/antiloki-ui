// The export claims to be the session's persisted record "reproduced in order". That claim is the
// contract worth testing: every widget appears EXACTLY once, session-level widgets splice into the
// timeline by created_at, and the totals are summed rather than taken from any single turn.
import { describe, it, expect, vi, afterEach } from "vitest";
import { buildChatMarkdown, downloadChatMarkdown } from "./chat-export";

const build = (over: Partial<Parameters<typeof buildChatMarkdown>[0]> = {}) =>
  buildChatMarkdown({ sessionId: 1, turns: [], sessionWidgets: [], ...over });

const turn = (over: any = {}) => ({ id: 1, ts: "2026-08-01 10:00:00", user_text: "hi", content_md: "hello", ...over });
const widget = (over: any = {}) => ({ id: 1, kind: "diagram", type: "widget", turn_id: null, created_at: "2026-08-01 09:00:00", payload: { a: 1 }, ...over });

describe("the header", () => {
  it("names the session and pluralises the turn count", () => {
    expect(build({ turns: [turn()] })).toContain("# antiloki · chat session #1");
    expect(build({ turns: [turn()] })).toContain("1 turn ·");
    expect(build({ turns: [turn(), turn({ id: 2 })] })).toContain("2 turns ·");
  });

  it("SUMS cost and tokens across every turn", () => {
    const md = build({
      turns: [
        turn({ ai_cost_usd: 0.01, ai_tokens_in: 600, ai_tokens_out: 200 }),
        turn({ id: 2, ai_cost_usd: 0.02, ai_tokens_in: 600, ai_tokens_out: 900 }),
      ],
    });
    expect(md).toContain("$0.0300 total");
    expect(md).toContain("1.2k→1.1k tok"); // 1200 in, 1100 out
  });

  it("reports $0 rather than an empty total for a free session", () => {
    expect(build({ turns: [turn()] })).toContain("$0.0000 total");
  });

  it("includes the start time only when the session row carries one", () => {
    expect(build({ session: { started_at: "2026-08-01" } })).toContain("started 2026-08-01");
    expect(build({ session: null })).not.toContain("started");
  });
});

describe("pinned context", () => {
  it("always states that the session's own widgets are grounding", () => {
    expect(build()).toContain("**this session**");
  });

  it("prefers the persisted session-context row over the passed refs", () => {
    const md = build({
      refs: [{ from: "argument" }],
      sessionWidgets: [widget({ id: 5, kind: "session-context", payload_json: JSON.stringify({ refs: [{ from: "the row" }] }) })],
    });
    expect(md).toContain("the row");
    expect(md).not.toContain("argument");
  });

  it("uses the caller's label function when given one", () => {
    const md = build({ refs: [{ path: "a.ts" }], trayLabel: (r: any) => `FILE ${r.path}` });
    expect(md).toContain("- FILE a.ts");
  });

  it("takes the LAST session-context row — earlier ones are superseded", () => {
    const md = build({
      sessionWidgets: [
        widget({ id: 1, kind: "session-context", payload_json: JSON.stringify({ refs: [{ n: "old" }] }) }),
        widget({ id: 2, kind: "session-context", payload_json: JSON.stringify({ refs: [{ n: "new" }] }) }),
      ],
    });
    expect(md).toContain("new");
    expect(md).not.toContain("old");
  });
});

describe("the conversation", () => {
  it("numbers turns from 1 and renders both sides", () => {
    const md = build({ turns: [turn({ user_text: "question one" }), turn({ id: 2, user_text: "question two" })] });
    expect(md).toContain("### 1 · you");
    expect(md).toContain("### 2 · you");
    expect(md).toContain("question one");
  });

  it("marks an empty prompt rather than leaving a blank section", () => {
    expect(build({ turns: [turn({ user_text: "" })] })).toContain("_(empty)_");
  });

  it("prefers presentation_md, then interviewer_response_md, then content_md", () => {
    expect(build({ turns: [turn({ presentation_md: "P", interviewer_response_md: "I", content_md: "C" })] })).toContain("P");
    expect(build({ turns: [turn({ interviewer_response_md: "I", content_md: "C" })] })).toContain("I");
    expect(build({ turns: [turn({ content_md: "C" })] })).toContain("C");
  });

  it("renders the telemetry bits it has and omits the ones it doesn't", () => {
    const md = build({ turns: [turn({ classified_kind: "build", classification_confidence: 0.87, ai_tier: "high", model_id: "m-1", ai_duration_ms: 1200 })] });
    expect(md).toContain("kind **build**");
    expect(md).toContain("87% sure");
    expect(md).toContain("tier high");
    expect(md).toContain("1200ms");
    expect(build({ turns: [turn()] })).toContain("### interviewer\n");
  });

  it("lists the screening questions with their options", () => {
    const md = build({
      turns: [turn({ clarify_questionnaire_json: JSON.stringify({ questions: [{ question_md: "which?", options: ["a", { label: "b" }] }] }) })],
    });
    expect(md).toContain("**screening:**");
    expect(md).toContain("- which? — a · b");
  });

  it("marks proposed actions as confirmed only when they were", () => {
    const actions = JSON.stringify([{ action: "card.add" }]);
    expect(build({ turns: [turn({ proposed_actions_json: actions, confirmed: 1 })] })).toContain("proposed actions (confirmed):");
    expect(build({ turns: [turn({ proposed_actions_json: actions })] })).toContain("proposed actions:**");
  });

  it("renders every AI call behind a turn as a table row", () => {
    const md = build({
      turns: [turn({ ai_telemetry_json: JSON.stringify([
        { phase: "triage", model_id: "m1", tier: "low", tokens_in: 100, tokens_out: 50, cost_usd: 0.001, duration_ms: 90 },
        { phase: "presenter", model_id: "m2" },
      ]) })],
    });
    expect(md).toContain("**AI calls (2):**");
    expect(md).toContain("| triage | `m1` | low | 100→50 | $0.0010 | 90ms |");
    expect(md).toContain("| presenter | `m2` | — | 0→0 | — | — |");
  });

  it("survives malformed JSON in every optional column", () => {
    expect(() =>
      build({ turns: [turn({ clarify_questionnaire_json: "{bad", proposed_actions_json: "{bad", ai_telemetry_json: "{bad" })] }),
    ).not.toThrow();
  });
});

describe("widgets", () => {
  it("renders a widget's payload as JSON, with the internal _uid removed", () => {
    const md = build({ turns: [turn({ studio_widgets: [widget({ id: 7, payload: { a: 1, _uid: "diagram-w7" } })] })] });
    expect(md).toContain("◳ widget — diagram · `#diagram-w7`");
    expect(md).toContain('"a": 1');
    expect(md).not.toContain('"_uid"');
  });

  it("labels a self-fetching widget instead of printing an empty object", () => {
    const md = build({ turns: [turn({ studio_widgets: [widget({ id: 7, payload: {} })] })] });
    expect(md).toContain("_(self-fetching");
    expect(md).not.toContain("```json");
  });

  it("renders an artefact with its title and body, not as JSON", () => {
    const md = build({
      turns: [turn({ studio_widgets: [widget({ id: 8, type: "artifact", payload: { item: { title: "The Brief", body_md: "the body" } } })] })],
    });
    expect(md).toContain("◆ artefact — The Brief");
    expect(md).toContain("the body");
    expect(md).not.toContain("```json");
  });

  it("explains a recipe-backed article", () => {
    const md = build({ turns: [turn({ studio_widgets: [widget({ id: 8, type: "artifact", payload: { item: { title: "T", article: "xray" } } })] })] });
    expect(md).toContain("**xray** article");
    expect(md).toContain("$0, always current");
  });

  it("names an untitled artefact rather than printing 'undefined'", () => {
    const md = build({ turns: [turn({ studio_widgets: [widget({ id: 8, type: "artifact", payload: {} })] })] });
    expect(md).toContain("artefact — untitled");
  });

  it("reads payload_json as well as payload", () => {
    const md = build({ turns: [turn({ studio_widgets: [widget({ id: 7, payload: undefined, payload_json: JSON.stringify({ z: 9 }) })] })] });
    expect(md).toContain('"z": 9');
  });
});

describe("chronology and de-duplication — the export's core claim", () => {
  it("renders a widget attached to a turn EXACTLY once, even if it arrives from both sources", () => {
    // studio_widgets and sessionWidgets overlap in the real payload; a naive concat prints it twice.
    const w = widget({ id: 42, turn_id: 1, kind: "table" });
    const md = build({ turns: [turn({ id: 1, studio_widgets: [w] })], sessionWidgets: [w] });
    expect(md.match(/#table-w42/g)).toHaveLength(1);
  });

  it("splices a session-level widget BEFORE the turn it predates", () => {
    const md = build({
      turns: [turn({ id: 1, ts: "2026-08-01 10:00:00" })],
      sessionWidgets: [widget({ id: 5, kind: "board", created_at: "2026-08-01 09:00:00" })],
    });
    expect(md.indexOf("#board-w5")).toBeLessThan(md.indexOf("### 1 · you"));
  });

  it("emits a widget created AFTER the last turn at the very end", () => {
    const md = build({
      turns: [turn({ id: 1, ts: "2026-08-01 10:00:00" })],
      sessionWidgets: [widget({ id: 5, kind: "board", created_at: "2026-08-01 23:00:00" })],
    });
    expect(md.indexOf("#board-w5")).toBeGreaterThan(md.indexOf("### 1 · you"));
  });

  it("orders same-timestamp widgets by id so the output is stable", () => {
    const md = build({
      sessionWidgets: [
        widget({ id: 9, kind: "b", created_at: "2026-08-01 09:00:00" }),
        widget({ id: 2, kind: "a", created_at: "2026-08-01 09:00:00" }),
      ],
    });
    expect(md.indexOf("#a-w2")).toBeLessThan(md.indexOf("#b-w9"));
  });

  it("NEVER renders session-context as a widget block", () => {
    const md = build({ sessionWidgets: [widget({ id: 3, kind: "session-context", payload: { refs: [] } })] });
    expect(md).not.toContain("#session-context-w3");
  });

  it("sanitises non-word characters out of the uid", () => {
    const md = build({ sessionWidgets: [widget({ id: 4, kind: "code sample/v2" })] });
    expect(md).toContain("#code-sample-v2-w4");
  });
});

describe("the document itself", () => {
  it("collapses runs of blank lines and ends with exactly one newline", () => {
    const md = build({ turns: [turn()] });
    expect(md).not.toMatch(/\n{3,}/);
    expect(md.endsWith("\n")).toBe(true);
    expect(md.endsWith("\n\n")).toBe(false);
  });

  it("carries the provenance footer", () => {
    expect(build()).toContain("exported from antiloki");
  });

  it("produces a valid document for a session with no turns at all", () => {
    const md = build();
    expect(md).toContain("# antiloki · chat session #1");
    expect(md).toContain("0 turns");
  });
});

describe("downloadChatMarkdown", () => {
  afterEach(() => vi.restoreAllMocks());

  it("names the file after the session and revokes the object URL afterwards", () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    (URL as any).createObjectURL = vi.fn(() => "blob:x");
    (URL as any).revokeObjectURL = revoke;
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadChatMarkdown("# md", 42);
    const a = document.querySelector('a[download="chat-session-42.md"]');
    expect(a).not.toBeNull();
    expect(click).toHaveBeenCalled();

    // The URL must be released, or the blob leaks for the life of the tab.
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:x");
    expect(document.querySelector('a[download="chat-session-42.md"]')).toBeNull();
    vi.useRealTimers();
  });
});
