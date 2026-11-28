/** @vitest-environment jsdom */
// THE ROLES (operator 2026-09-23): a role is a domain plus its adapter — skills, specialists, tools, packs — and it
// carries three merges, one per objective. The serve owns the list; these are the pure bits the Studio uses.
import { describe, it, expect } from "vitest";
import { byFamily, adapterLine, mergeLine, OBJECTIVES, OBJECTIVE_ABOUT, type RoleAdapter } from "./roles";
import { sideName } from "./jobs";

const role = (o: Partial<RoleAdapter>): RoleAdapter => ({
  key: "backender", name: "Backender", about: "the data and the rules", domain: "backend", general: true, under: null,
  globs: ["src/api/**"], skills: ["antiloki-xray-first"], specialists: ["correctness:types"], panes: ["atlas-graph"], packs: ["laws", "graph"], ...o,
});

describe("roles", () => {
  it("lists the general roles with their specialisations under them", () => {
    const rs = [role({}), role({ key: "backend-database", name: "Database", general: false, under: "backender" }),
                role({ key: "frontender", name: "Frontender", domain: "frontend" })];
    const fam = byFamily(rs);
    expect(fam.map((f) => f.parent.key)).toEqual(["backender", "frontender"]);
    expect(fam[0].under.map((r) => r.key)).toEqual(["backend-database"]);
    expect(fam[1].under).toEqual([]);
  });
  it("summarises the adapter — not just the models", () => {
    const line = adapterLine(role({ skills: ["a", "b"], specialists: ["x"], panes: ["p", "q"], packs: ["laws", "graph"] }));
    expect(line).toBe("2 skills · 1 specialist · 2 tools · laws · graph");
    expect(adapterLine(role({ skills: ["a"], specialists: ["x"], panes: [], packs: [] }))).toBe("1 skill · 1 specialist");
  });
  it("writes a merge as a sentence, and says so when nothing has been measured", () => {
    expect(mergeLine({ objective: "best", brain: "codex:gpt-5.6-terra@medium", hands: "opencode:opencode/deepseek-v4-flash", samples: 3 }, sideName))
      .toBe("Codex gpt-5.6-terra · medium decides · OpenCode DeepSeek v4 Flash produces · 3 samples");
    expect(mergeLine(undefined, sideName)).toBe("not measured yet");
    expect(mergeLine({ objective: "best", brain: null, hands: null, samples: 0 }, sideName)).toBe("not measured yet");
  });
  it("has three objectives and says what each is asked for", () => {
    // the three an operator is offered (2026-09-23: "Cheaper, faster and Best"); `smarter` stays in the map for
    // rows the serve stored before this, but it is not one of the three
    expect(OBJECTIVES).toEqual(["cheaper", "faster", "best"]);
    expect(OBJECTIVE_ABOUT.smarter).toMatch(/whatever it costs/);
    expect(OBJECTIVE_ABOUT.cheaper).toMatch(/80%/);
  });
});

describe("the role card", () => {
  it("shows three objectives, disables the ones nothing has measured, and hands back the one picked", async () => {
    const React = (await import("react")).default;
    const { render, screen, fireEvent } = await import("@testing-library/react");
    const { RoleCard, paneName, specialistName, skillName } = await import("./role-card");
    const picked: string[] = [];
    const r = {
      key: "frontend-designer", name: "Frontend designer", about: "type, spacing, colour and motion",
      domain: "design", general: false, under: "frontender", globs: ["src/**/*.css"],
      skills: ["antiloki-xray-first"], specialists: ["category:style"], panes: ["design-frames", "design-view:system"], packs: ["laws", "file"],
      merges: [
        { objective: "cheaper" as const, brain: "opencode:opencode/deepseek-v4-pro", hands: "opencode:opencode/deepseek-v4-flash", samples: 4 },
        { objective: "best" as const, brain: "codex:gpt-5.6-terra@medium", hands: "opencode:opencode/qwen3.6-plus", samples: 6 },
        { objective: "faster" as const, brain: null, hands: null, samples: 0 },
      ],
    };
    render(<RoleCard role={r} onPick={(o) => picked.push(o)} />);
    const card = screen.getByTestId("role-card");
    expect(card.getAttribute("data-role")).toBe("frontend-designer");
    // the adapter is on the card, in words a person reads
    expect(card.textContent).toContain("Frames");                 // a pane, named
    expect(card.textContent).toContain("category · style");        // a specialist, named
    expect(card.textContent).toContain("xray-first");              // a skill, without the shared prefix
    expect(card.textContent).toContain("not only the models");
    // the measured objectives are pickable; the unmeasured one is not
    expect((screen.getByTestId("role-objective-best") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("role-objective-faster") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("role-objective-best"));
    fireEvent.click(screen.getByTestId("role-objective-faster"));  // does nothing
    expect(picked).toEqual(["best"]);
    // and the merge reads provider + model on both sides
    expect(screen.getByTestId("role-objective-best").textContent).toContain("Codex gpt-5.6-terra · medium decides");
    expect(screen.getByTestId("role-objective-best").textContent).toContain("OpenCode Qwen 3.6 Plus produces");
    expect(paneName("design-view:system")).toBe("Design system");
    expect(specialistName("correctness:errors")).toBe("correctness · errors");
    expect(skillName("antiloki-blast-radius")).toBe("blast-radius");
  });
});
