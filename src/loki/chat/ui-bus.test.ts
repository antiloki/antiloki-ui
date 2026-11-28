// The UI command bus is what lets the interviewer DRIVE the app. It is therefore a security
// boundary: the AI proposes verbs, this decides what actually happens. Every test below pins a
// containment rule — the whitelist, the cap, the clamp, the "one bad command never blocks the
// rest" guarantee — because a regression here means the model can navigate or act where it should
// not, and nothing in the UI would look wrong.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeUiCommands, describeUiCommand, consumePendingIdeView } from "./ui-bus";

let events: CustomEvent[] = [];
let navigate: ReturnType<typeof vi.fn>;
let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  events = [];
  window.addEventListener("antiloki:ui", (e) => events.push(e as CustomEvent));
  navigate = vi.fn();
  (window as any).__lokiRouter = { navigate };
  assign = vi.fn();
  // jsdom refuses real navigation; stub the fallback path so we can assert on it.
  Object.defineProperty(window, "location", { value: { assign }, writable: true, configurable: true });
  consumePendingIdeView(); // drain anything a previous test parked
});

afterEach(() => {
  events = [];
  delete (window as any).__lokiRouter;
  vi.restoreAllMocks();
});

const detailOf = (verb: string) => events.find((e) => (e.detail as any).verb === verb)?.detail as any;

describe("navigate — the destination whitelist", () => {
  it("navigates to an allowed route via the app router", () => {
    const done = executeUiCommands([{ verb: "navigate", to: "/operations/pulls" }]);
    expect(navigate).toHaveBeenCalledWith({ to: "/operations/pulls" });
    expect(done).toEqual(["navigate /operations/pulls"]);
  });

  it("REFUSES a route that is not on the whitelist", () => {
    const done = executeUiCommands([{ verb: "navigate", to: "/settings/../etc" }]);
    expect(navigate).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(done).toEqual([]);
  });

  it("refuses an external URL outright", () => {
    executeUiCommands([{ verb: "navigate", to: "https://evil.example.com" }]);
    expect(navigate).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("refuses a non-string destination", () => {
    executeUiCommands([{ verb: "navigate", to: { toString: () => "/" } as any }]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("falls back to location.assign when the router is not mounted", () => {
    delete (window as any).__lokiRouter;
    executeUiCommands([{ verb: "navigate", to: "/" }]);
    expect(assign).toHaveBeenCalledWith("/");
  });
});

describe("containment", () => {
  it("executes at most 5 commands, dropping the rest", () => {
    const cmds = Array.from({ length: 12 }, (_, i) => ({ verb: "open_widget", uid: `u${i}` }));
    const done = executeUiCommands(cmds);
    expect(done).toHaveLength(5);
  });

  it("one unknown verb never blocks the commands after it", () => {
    const done = executeUiCommands([
      { verb: "definitely_not_a_verb" },
      { verb: "open_widget", uid: "u1" },
    ]);
    expect(done).toEqual(["open #u1"]);
  });

  it("a throwing command is swallowed and the next one still runs", () => {
    const done = executeUiCommands([
      // a getter that explodes when the verb is read mid-loop
      Object.defineProperty({}, "verb", { get() { throw new Error("boom"); } }),
      { verb: "close_all_widgets" },
    ] as any);
    expect(done).toEqual(["destroy all docked widgets"]);
  });

  it("ignores a non-array payload entirely", () => {
    expect(executeUiCommands(null)).toEqual([]);
    expect(executeUiCommands({ verb: "navigate", to: "/" })).toEqual([]);
    expect(executeUiCommands("navigate")).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("widget verbs travel as window events", () => {
  it("open_widget strips a leading '#' from the uid", () => {
    executeUiCommands([{ verb: "open_widget", uid: "#diagram-w7" }]);
    expect(detailOf("open_widget").uid).toBe("diagram-w7");
  });

  it("dock defaults to the right side and only accepts 'left' as an override", () => {
    executeUiCommands([{ verb: "dock", uid: "a" }]);
    expect(detailOf("dock").side).toBe("right");

    events = [];
    executeUiCommands([{ verb: "dock", uid: "a", side: "left" }]);
    expect(detailOf("dock").side).toBe("left");

    events = [];
    executeUiCommands([{ verb: "dock", uid: "a", side: "sideways" as any }]);
    expect(detailOf("dock").side).toBe("right");
  });

  it("dock_move CLAMPS the position into 1..40 and rounds it", () => {
    for (const [input, expected] of [[0, 1], [-5, 1], [999, 40], [3.7, 4], ["x", 1]] as const) {
      events = [];
      executeUiCommands([{ verb: "dock_move", uid: "a", pos: input as any }]);
      expect(detailOf("dock_move").pos).toBe(expected);
    }
  });

  it("summon requires a slash command and truncates a long one", () => {
    executeUiCommands([{ verb: "summon", command: "graph" }]);
    expect(events).toHaveLength(0); // no leading slash → refused

    executeUiCommands([{ verb: "summon", command: "/" + "x".repeat(300) }]);
    expect(detailOf("summon").command.length).toBe(120);
  });

  it("verbs that need a uid do nothing without one", () => {
    executeUiCommands([{ verb: "open_widget" }, { verb: "dock" }, { verb: "close_widget" }]);
    expect(events).toHaveLength(0);
  });
});

describe("open_ide_view", () => {
  it("parks a whitelisted view for an IDE that is not mounted yet, and consumes it ONCE", () => {
    executeUiCommands([{ verb: "open_ide_view", view: "graph", path: "src/a.ts" }]);
    expect(consumePendingIdeView()).toEqual({ view: "graph", path: "src/a.ts" });
    // second read must be empty — otherwise the IDE re-opens the same view on every mount
    expect(consumePendingIdeView()).toBeNull();
  });

  it("drops an unrecognised view but keeps the path (the IDE falls back to files)", () => {
    executeUiCommands([{ verb: "open_ide_view", view: "wormhole", path: "src/a.ts" }]);
    expect(consumePendingIdeView()).toEqual({ view: undefined, path: "src/a.ts" });
  });

  it("truncates an over-long path", () => {
    executeUiCommands([{ verb: "open_ide_view", view: "docs", path: "p".repeat(500) }]);
    expect(consumePendingIdeView()!.path!.length).toBe(300);
  });

  it("navigates to the atlas so the IDE actually mounts", () => {
    executeUiCommands([{ verb: "open_ide_view", view: "docs" }]);
    expect(navigate).toHaveBeenCalledWith({ to: "/operations/atlas" });
  });
});

describe("describeUiCommand — the confirmation line the operator reads", () => {
  it("renders one human sentence per verb", () => {
    expect(describeUiCommand({ verb: "navigate", to: "/kanban" })).toBe("go to /kanban");
    expect(describeUiCommand({ verb: "open_widget", uid: "#w1" })).toBe("open #w1 fullscreen");
    expect(describeUiCommand({ verb: "close_widget", uid: "w1" })).toBe("close #w1");
    expect(describeUiCommand({ verb: "summon", command: "/graph" })).toContain("$0, deterministic");
    expect(describeUiCommand({ verb: "dock", uid: "w1" })).toContain("end of the queue");
    expect(describeUiCommand({ verb: "close_all_widgets" })).toContain("DESTROY".toLowerCase());
  });

  it("normalises a '#'-prefixed uid so the operator never sees '##'", () => {
    expect(describeUiCommand({ verb: "open_widget", uid: "#a" })).not.toContain("##");
  });

  it("dock_move defaults to position 1 when pos is absent or unparseable", () => {
    expect(describeUiCommand({ verb: "dock_move", uid: "a" })).toContain("position 1");
    expect(describeUiCommand({ verb: "dock_move", uid: "a", pos: "x" as any })).toContain("position 1");
  });

  it("an unknown verb degrades to the raw verb rather than throwing", () => {
    expect(describeUiCommand({ verb: "mystery" })).toBe("mystery");
  });
});
