// @vitest-environment jsdom
// THE BRAINSTORM PANE (operator 2026-10-11): a simple chat, the options as chips, no sources line, no Ultra / Quick choice (the ask decides), everything stored in the workspace database.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, within, configure } from "@testing-library/react";

configure({ asyncUtilTimeout: 6000 });
vi.setConfig({ testTimeout: 30_000 });

const bb = vi.hoisted(() => ({ rows: [] as any[], next: 1, calls: [] as any[], plan: { ok: true, items: [1, 2, 3] } as any, knows: true }));
vi.mock("@/loki/api/client", () => ({
  unwrapResult: (r: any) => r,
  apiPost: vi.fn(async (path: string, body: any) => {
    bb.calls.push({ path, body });
    if (path.endsWith("/blackboard/read")) return { scratch: bb.rows.filter((r) => r.pane_id === body.pane_id).map((r) => ({ ...r })) };
    if (path.endsWith("/blackboard/post")) {
      if (body.op === "update") { const r = bb.rows.find((x) => x.id === body.id); if (r) r.body_md = body.body_md; return { ok: true }; }
      if (body.op === "delete") { bb.rows = bb.rows.filter((x) => x.id !== body.id); return { ok: true }; }
      // the real serve stores a kind it does not know as a plain 'note' (cockpit-blackboard-post.rs KINDS); the newer one knows the tools' kinds
      const known = ["claim", "note", "handoff", "scratch", "decision", "context", "todo", "kanban", "sketch", "plan", "swarmq", "shape", "baseplan", ...(bb.knows ? ["issue", "pref", "brainstorm", "brainstorm-chips"] : [])];
      bb.rows.push({ id: bb.next++, kind: known.includes(body.kind) ? body.kind : "note", body_md: body.body_md, pane_id: body.pane_id }); return { ok: true };
    }
    if (path.endsWith("/plan/generate")) return bb.plan;
    return null;
  }),
}));
const shapePane = vi.hoisted(() => ({ value: { id: 77, idx: 2, subagent_name: "shape", pane_kind: "ultraplan" } as any }));
vi.mock("./cockpit-panes-tools", () => ({
  BrainstormWizard: ({ sources }: any) => <div data-testid="wizard">{sources.join(",")}</div>,
  writeSessionBasePlan: vi.fn(async () => {}), useAtlas: () => [{ nodes: [] }, () => {}], atlasDirs: () => ["src", "docs", "src/deep"], sibling: () => shapePane.value,
  wizMem: () => ({ open: false }), clearWizMem: () => {},
}));
import { isBrainstormMsgRow, isBrainstormChipsRow } from "./tool-rows";
import { BrainstormPane, autoMode, intentText, chipsSummary, parseMsg, parseChips } from "./brainstorm-pane";

const pane: any = { id: 9, idx: 0 };
const planCalls = () => bb.calls.filter((c) => c.path.endsWith("/plan/generate")).map((c) => c.body);
const stored = (kind: string) => bb.rows.filter((r) => (kind === "brainstorm" ? isBrainstormMsgRow(r) : isBrainstormChipsRow(r))).map((r) => JSON.parse(r.body_md));
const mount = () => render(<BrainstormPane p={pane} panes={[]} sessionId={4} onChanged={() => {}} />);
const say = async (text: string) => { const box = await screen.findByTestId("brainstorm-input"); fireEvent.change(box, { target: { value: text } }); fireEvent.keyDown(box, { key: "Enter" }); };
beforeEach(() => { bb.rows = []; bb.next = 1; bb.calls = []; bb.knows = true; bb.plan = { ok: true, items: [1, 2, 3] }; shapePane.value = { id: 77, idx: 2, subagent_name: "shape", pane_kind: "ultraplan" }; });

describe("pure", () => {
  it("lets the size of the ask choose the planner: deep for big or bold, quick for small or surgical", () => {
    expect(autoMode("add a dark mode toggle", "feature", 1, "balanced")).toBe("breakdown");
    expect(autoMode("fix the typo in the footer", "fix", 0, "balanced")).toBe("breakdown");
    expect(autoMode("x", "fix", 0, "ambitious")).toBe("ultra");                                   // a bold line the person chose wins
    expect(autoMode("rebuild the whole checkout flow across cart, payment and shipping, with a new design and tests for each step of it", "feature", 0, "balanced")).toBe("ultra");
    expect(autoMode("short", "docs", 4, "balanced")).toBe("ultra");                               // it touches a lot of the app
    expect(autoMode("short ask", "feature", 0, "balanced")).toBe("breakdown");                    // a short ask does not spread just for being a feature
    expect(autoMode("redo the whole navigation and the theme system for every screen of the app", "refactor", 0, "balanced")).toBe("ultra");
    expect(autoMode("rename one helper function", "refactor", 1, "surgical")).toBe("breakdown");
    expect(autoMode("a\nb\nc\nd", "fix", 1, "surgical")).toBe("ultra");                           // a long, multi-line ask is not surgical
  });
  it("writes the options for the planner and as one summary line", () => {
    expect(intentText("fix", new Set(["src"]), "surgical", new Set(["tests"]))).toBe("KIND: 🩹 fix\nAREAS: src\nBOLDNESS: surgical\nCONSTRAINTS: 🧪 must add tests");
    expect(intentText("feature", new Set(), "balanced", new Set())).toBe("KIND: ✨ feature\nAREAS: whole app\nBOLDNESS: balanced");
    expect(chipsSummary("fix", new Set(["src", "docs"]), "balanced", new Set(["tests", "nodeps"]))).toBe("fix · src/ docs/ · balanced · 2 musts");
  });
  it("reads stored rows, skipping what is not a message and keeping known options only", () => {
    expect(parseMsg({ body_md: JSON.stringify({ role: "you", text: "hi", chips: "fix" }) })).toEqual({ role: "you", text: "hi", tone: undefined, chips: "fix" });
    expect(parseMsg({ body_md: "x" })).toBeNull(); expect(parseMsg({ body_md: JSON.stringify({ role: "robot", text: "x" }) })).toBeNull();
    expect(parseChips({ body_md: JSON.stringify({ kind: "nonsense", bold: "ambitious", areas: ["src"], musts: ["tests", "wat"] }) })).toEqual({ kind: "feature", bold: "ambitious", areas: ["src"], musts: ["tests"] });
    expect(parseChips(undefined)).toBeNull();
  });
});

describe.each([true, false])("the pane (the serve knows the brainstorm kinds: %s)", (knows) => {
  beforeEach(() => { bb.knows = knows; });
  it("is a chat with the options as chips (no drawing, no scrolling), and no sources line, no Ultra or Quick buttons", async () => {
    mount();
    const brain = await screen.findByTestId("chips");
    expect(brain.querySelector("svg")).toBeNull();                                                  // no drawing behind the chips
    expect(getComputedStyle(brain).overflowY).not.toMatch(/auto|scroll/);                           // and no scrolling box: every chip is shown in full
    for (const id of ["chip-kind-feature", "chip-kind-docs", "chip-area-all", "chip-area-src", "chip-bold-balanced", "chip-must-tests"]) expect(within(brain).getByTestId(id), id).toBeTruthy();
    expect(screen.queryByTestId("chip-area-src/deep")).toBeNull();                                // only top-level folders
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/sources|ultra|quick/i);
    // the chips sit at the centre of the empty pane, not at its top: auto margins on the block that holds them
    const center = screen.getByTestId("brainstorm-center"); expect(center.style.margin).toBe("auto 0px"); expect(center.contains(brain)).toBe(true); expect(center.contains(screen.getByTestId("brainstorm-empty"))).toBe(true);
    expect(screen.getByTestId("brainstorm-input").getAttribute("placeholder")).toBeTruthy();
    expect((screen.getByTestId("brainstorm-send") as HTMLButtonElement).disabled).toBe(true);     // nothing to send yet
  });
  it("sends the ask with the chosen options, picks the planner by itself and answers in the conversation", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("chip-kind-fix")); fireEvent.click(screen.getByTestId("chip-area-src")); fireEvent.click(screen.getByTestId("chip-bold-surgical")); fireEvent.click(screen.getByTestId("chip-must-tests"));
    await say("fix the login redirect");
    await waitFor(() => expect(planCalls().length).toBe(1));
    expect(planCalls()[0]).toMatchObject({ session_id: 4, pane_id: 77, mode: "breakdown" });
    expect(planCalls()[0].ambition).toBe("fix the login redirect\nKIND: 🩹 fix\nAREAS: src\nBOLDNESS: surgical\nCONSTRAINTS: 🧪 must add tests");
    expect(screen.getByTestId("msg-you").textContent).toContain("fix the login redirect");
    await waitFor(() => expect(screen.getAllByTestId("msg-brain").at(-1)!.textContent).toContain("I sliced it quickly: 3 slices. It is on the shape pane (#3)"));
    expect(screen.getByTestId("chips-summary").textContent).toContain("fix · src/ · surgical");   // the options fold into one line once talking
    expect(screen.queryByTestId("brainstorm-center")).toBeNull();
    expect((screen.getByTestId("brainstorm-input") as HTMLTextAreaElement).value).toBe("");
  });
  it("uses the deep planner for a bold ask", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("chip-bold-ambitious"));
    await say("rebuild the checkout");
    await waitFor(() => expect(planCalls()[0]?.mode).toBe("ultra"));
    await waitFor(() => expect(screen.getAllByTestId("msg-brain").at(-1)!.textContent).toContain("in depth"));
  });
  it("says so when the planner fails, or when there is no shape pane", async () => {
    bb.plan = { ok: false, error: "the planner is busy" };
    mount(); await say("do a thing");
    await waitFor(() => expect(screen.getAllByTestId("msg-brain").at(-1)!.getAttribute("data-tone")).toBe("warn")); expect(screen.getAllByTestId("msg-brain").at(-1)!.textContent).toContain("the planner is busy");
  });
  it("without a shape pane it asks for one and calls nothing", async () => {
    shapePane.value = null; mount(); await say("do a thing");
    await waitFor(() => expect(screen.getAllByTestId("msg-brain").at(-1)!.textContent).toContain("no shape pane")); expect(planCalls()).toEqual([]);
  });
  it("keeps the conversation and the chosen options in the database, and brings them back", async () => {
    const first = mount();
    fireEvent.click(await screen.findByTestId("chip-kind-docs")); fireEvent.click(screen.getByTestId("chip-bold-ambitious"));
    await say("document the api");
    await waitFor(() => expect(stored("brainstorm").length).toBe(2));                              // your message and the answer, one row each; "thinking…" is not kept
    expect(stored("brainstorm").map((m) => m.role)).toEqual(["you", "brain"]);
    await waitFor(() => expect(stored("brainstorm-chips")).toEqual([{ kind: "docs", areas: [], bold: "ambitious", musts: [] }]));
    first.unmount();
    mount();
    await waitFor(() => expect(screen.getAllByTestId("msg-you").length).toBe(1));
    expect(screen.getByTestId("msg-you").textContent).toContain("document the api"); expect(screen.getAllByTestId("msg-brain").length).toBe(1);
    expect(screen.getByTestId("chips-summary").textContent).toContain("docs");                    // the options came back too
    expect(stored("brainstorm-chips").length).toBe(1);                                              // updated in place, never duplicated
  });
  it("a new conversation removes the saved messages and brings the brain back, keeping the options", async () => {
    mount(); fireEvent.click(await screen.findByTestId("chip-kind-perf"));
    await say("make it faster"); await waitFor(() => expect(stored("brainstorm").length).toBe(2));
    fireEvent.click(screen.getByTestId("brainstorm-new"));
    await waitFor(() => expect(stored("brainstorm")).toEqual([]));
    await screen.findByTestId("chips"); expect(screen.queryByTestId("msg-you")).toBeNull();
    expect(screen.getByTestId("chip-kind-perf").getAttribute("aria-pressed")).toBe("true");
  });
  it("the explore button opens the idea wizard with the default context, nothing to pick", async () => {
    mount(); fireEvent.click(await screen.findByTestId("brainstorm-explore"));
    expect((await screen.findByTestId("wizard")).textContent).toBe("mission,shared,digest");
  });
});
