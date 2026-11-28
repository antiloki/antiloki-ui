// THE STORY OF A TURN (operator 2026-09-24). The fixture is a REAL run — blueprint #75, nine modules filled on
// OpenCode under a Claude plan — pulled straight from the story endpoint, so what the test asserts is what an
// operator actually sees rather than a shape invented to make the test pass.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
vi.mock("@/loki/api/client", () => ({ apiGet: vi.fn(async () => ({ result: { story: null } })) }));
const goalOpStrictMock = vi.fn(async () => ({ ok: true }));
vi.mock("@/loki/widgets/subagents", async (orig) => ({ ...(await orig<any>()), goalOpStrict: (...a: any[]) => (goalOpStrictMock as any)(...a) }));
import { WorkStory, foldStages, foldLabel, planBullets, confidenceLine, type Story, type StoryStage } from "./work-story";
import fixture from "./work-story.fixture.json";

const story = fixture as unknown as Story;
const stage = (o: Partial<StoryStage>): StoryStage => ({ key: "k", title: "t", kind: "gate", who: "w", machine: true, ok: true, went_right: true, red_is_good: false, detail: "", ms: 1000, cost: 0, tokens: 0, ...o });

describe("the stage list stays a story, not a log", () => {
  it("folds a run of passing checks into one line but never folds a failure", () => {
    const g = foldStages([
      stage({ key: "contract", kind: "plan", title: "Agreed what to build" }),
      stage({ key: "gate", kind: "gate", title: "Proved the tests fail on empty files", ok: false, red_is_good: true }),
      stage({ key: "check:t1", kind: "gate", title: "Checked a.ts", ms: 3000 }),
      stage({ key: "check:t2", kind: "gate", title: "Checked b.ts", ms: 4000 }),
      stage({ key: "check:t3", kind: "gate", title: "Checked c.ts", ms: 2000 }),
      stage({ key: "check:t4", kind: "gate", title: "Checked d.ts", went_right: false }),
      stage({ key: "check:t4", kind: "gate", title: "Checked d.ts again", ms: 5000 }),
    ]);
    expect(g.map((x) => x.stage.title)).toEqual([
      "Agreed what to build",
      "Proved the tests fail on empty files",   // red IS the point here — never folded away
      "Checked a.ts",                            // …and the three that follow fold into it
      "Checked d.ts",                            // the failure keeps its own line
      "Checked d.ts again",
    ]);
    expect(foldLabel(g[2])).toBe("3 checks passed · 9 s");
    expect(foldLabel(g[1])).toBeNull();          // the red gate stands alone
    expect(foldLabel(g[3])).toBeNull();          // the one that went wrong keeps its own line
    expect(foldLabel(g[0])).toBeNull();          // a lone stage is never "1 checks passed"
  });
});

describe("what the X-ray gave the workers", () => {
  it("names the skills and the specialists that went into the briefs, and says nothing when there were none", () => {
    const s = story as any;
    const withX = { ...s, summary: { ...s.summary, xray: { ...s.summary.xray, skills: ["tdd-first"], specialists: ["security-reviewer"] } } } as Story;
    const a = render(<WorkStory story={withX} startOpen />);
    expect(a.container.textContent).toContain("x-ray");
    expect(a.container.textContent).toContain("tdd-first"); expect(a.container.textContent).toContain("security-reviewer");
    a.unmount();
    const without = { ...s, summary: { ...s.summary, xray: { ...s.summary.xray, skills: [], specialists: [] } } } as Story;
    const b = render(<WorkStory story={without} startOpen />);
    expect(b.container.textContent).not.toContain("tdd-first");
  });
});

describe("the real run, rendered", () => {
  it("names who worked, what the router did, the gates, and the closing numbers", () => {
    render(<WorkStory story={story} />);
    // COLLAPSED BY DEFAULT, even with a failed judge (operator 2026-09-28) — the headline and its "!" are what show
    expect(screen.getByTestId("work-story").textContent).toContain("Done, but a gate says look again");
    expect(screen.queryByTestId("story-who")).toBeNull();
    fireEvent.click(screen.getByTestId("work-story").firstChild as Element);

    // WHO: two houses, each with its job in plain words
    const who = screen.getByTestId("story-who").textContent ?? "";
    expect(who).toContain("Claude");
    expect(who).toContain("decided the plan");
    expect(who).toContain("OpenCode");
    expect(who).toContain("wrote the code, one file at a time");

    // THE ROUTER, in its own words
    expect(screen.getByTestId("story-router").textContent).toContain("Heimdall sent this to the low tier");

    // STAGES in English, with the machine steps marked as machines
    const stages = screen.getByTestId("story-stages").textContent ?? "";
    expect(stages).toContain("Checked the tools were installed");
    expect(stages).toContain("the package manager");
    expect(stages).toContain("Agreed what to build");
    // the red gate is SUPPOSED to fail — it must not read as a failure
    expect(stages).toContain("Proved the tests fail on empty files");
    expect(stages).toContain("as intended");
    // and the nine per-file checks are folded away rather than printed one by one
    expect(stages).toContain("checks passed");

    // GATES, each labelled by what kind of authority it is
    const gates = screen.getAllByTestId("story-gate").map((e) => e.textContent ?? "");
    expect(gates.length).toBe(3);
    expect(gates.join(" ")).toContain("a machine, not an opinion");
    expect(gates.join(" ")).toContain("a model's judgement");
    expect(gates.join(" ")).toContain("Before the change");

    // THE CLOSING SUMMARY — every item the operator listed
    const sum = screen.getByTestId("story-summary").textContent ?? "";
    expect(sum).toMatch(/14\/15/);                      // stages completed
    expect(sum).toContain("9 written");                  // files written
    expect(sum).toContain("363k");                       // tokens used
    expect(sum).toContain("16 min 35 s");                // time used
    expect(sum).toContain("$2.75");                      // saved by the router
    expect(sum).toContain("read ×52");                   // tools accessed
    expect(sum).toContain("no raw frontier run of this shape has been measured yet"); // honest about the time baseline

    fireEvent.click(screen.getByTestId("story-files"));
    expect(screen.getByTestId("story-summary").textContent).toContain("src/orders/api.ts");
  });

  it("a clean run costs one line until you ask for more", () => {
    const clean: Story = { ...story, status: "done", gates: story.gates.map((g) => ({ ...g, passed: true })) };
    render(<WorkStory story={clean} />);
    expect(screen.queryByTestId("story-summary")).toBeNull();
    fireEvent.click(screen.getByTestId("work-story").firstChild as Element);
    expect(screen.getByTestId("story-summary")).toBeTruthy();
  });
});

describe("Heimdall's plan is a section of the stats detail, not a message (operator 2026-10-09)", () => {
  const GOAL = "Goal: fix the nav bar so the Log in button sits left of the avatar.\n\nAcceptance:\n- the button renders\n- the tests pass\n* the avatar keeps its size";
  it("bullets: the first line without the Goal: label, the acceptance lines, and the steps when there are several", () => {
    const b = planBullets({ goal: GOAL, tasks: [{ id: "t1", title: "move the button", status: "done" }, { id: "t2", title: "update the tests", status: "done" }] });
    expect(b.headline).toBe("fix the nav bar so the Log in button sits left of the avatar.");
    expect(b.bullets).toEqual(["the button renders", "the tests pass", "the avatar keeps its size"]);
    expect(b.steps).toEqual(["move the button", "update the tests"]);
  });
  it("one step is not a list, a long first line is cut, and an empty goal has nothing to show", () => {
    expect(planBullets({ goal: "do it\n- a", tasks: [{ id: "t1", title: "do it", status: "done" }] }).steps).toEqual([]);
    expect(planBullets({ goal: "x".repeat(300), tasks: [] }).headline.length).toBe(161);
    expect(planBullets({ goal: "", tasks: [] })).toEqual({ headline: "", bullets: [], steps: [] });
  });
  it("is hidden while the details are collapsed, and says it is an interpretation once opened", () => {
    const plan = { goal: GOAL, tasks: [{ id: "t1", title: "move the button", status: "done" }] };
    const a = render(<WorkStory story={story} plan={plan} />);
    expect(screen.queryByTestId("story-plan")).toBeNull();
    a.unmount();
    render(<WorkStory story={story} plan={plan} startOpen />);
    const sec = screen.getByTestId("story-plan");
    expect(sec.textContent).toContain("Heimdall's plan");
    expect(sec.textContent).toContain("an interpretation, not your message");
    expect(screen.getByTestId("story-plan-bullets").textContent).toContain("the tests pass");
    expect(screen.getByTestId("story-plan-full").textContent).toContain("Acceptance:");              // the whole rewrite is there, folded
  });
});

describe("confidence after the result (QA is optional)", () => {
  const conf = (level: "high" | "medium" | "low", suggest_qa: boolean, qa_ran = false) => ({ level, reasons: ["the compiler or the project's tests passed on the changed files", "it passed on the first attempt"], qa_ran, suggest_qa });

  it("the line says the level and the strongest reason, with every reason in the tooltip; nothing without a reading", () => {
    const l = confidenceLine(conf("high", true))!;
    expect(l.text).toBe("confidence: high — the compiler or the project's tests passed on the changed files");
    expect(l.tone).toBe("ok"); expect(l.title).toContain("first attempt");
    expect(confidenceLine(conf("medium", true))!.tone).toBe("warn"); expect(confidenceLine(conf("low", true))!.tone).toBe("bad");
    expect(confidenceLine(null)).toBeNull(); expect(confidenceLine(undefined)).toBeNull();
  });

  it("a finished run without QA shows its confidence and the run-QA button; the button asks the serve for QA on that run", async () => {
    goalOpStrictMock.mockClear();
    render(<WorkStory story={{ ...story, status: "done", confidence: conf("medium", true) } as Story} />);
    expect(screen.getByTestId("confidence-line").textContent).toContain("confidence: medium");
    fireEvent.click(screen.getByTestId("run-qa"));
    await screen.findByTestId("run-qa-msg");
    expect(goalOpStrictMock).toHaveBeenCalledWith("qa", { id: story.run });
  });

  it("no button once QA has run, and nothing is shown for a run that is not done or has no reading", () => {
    const a = render(<WorkStory story={{ ...story, status: "done", confidence: conf("high", false, true) } as Story} />);
    expect(screen.getByTestId("confidence-line")).toBeTruthy(); expect(screen.queryByTestId("run-qa")).toBeNull();
    a.unmount();
    const b = render(<WorkStory story={{ ...story, status: "running", confidence: conf("high", true) } as Story} />);
    expect(screen.queryByTestId("confidence")).toBeNull();
    b.unmount();
    render(<WorkStory story={{ ...story, status: "done", confidence: null } as Story} />);
    expect(screen.queryByTestId("confidence")).toBeNull();
  });
});
