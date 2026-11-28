// The palette is how the operator reaches the read-only widgets the presenter's view_intent enum
// can't emit. A parse bug makes a slash command silently fall through and get SENT to the
// interviewer as chat — costing a model call for something that was meant to be $0 and local.
import { describe, it, expect } from "vitest";
import { parseWidgetCommand, WIDGET_COMMANDS } from "./palette";

describe("the documented list and the parser agree", () => {
  // This is the test that actually matters: the hint list is the UI's menu. A command advertised
  // there but unhandled here is a dead menu entry that quietly becomes a paid chat turn.
  it("every advertised command parses to a widget", () => {
    const dead = WIDGET_COMMANDS.map((c) => c.cmd)
      .map((spec) => {
        // "/card <slug>" and "/pipeline [slug]" — supply a value for required args
        const [cmd, arg] = spec.split(" ");
        const text = arg?.startsWith("<") ? `${cmd} sample` : cmd;
        return { spec, widget: parseWidgetCommand(text) };
      })
      .filter((r) => r.widget === null)
      .map((r) => r.spec);
    expect(dead).toEqual([]);
  });

  it("every advertised command has a hint (the menu never shows a blank row)", () => {
    for (const c of WIDGET_COMMANDS) expect(c.hint.trim().length).toBeGreaterThan(0);
  });
});

describe("parsing", () => {
  it("returns null for ordinary chat so the turn still reaches the interviewer", () => {
    expect(parseWidgetCommand("what is the board?")).toBeNull();
    expect(parseWidgetCommand("")).toBeNull();
    expect(parseWidgetCommand("/")).toBeNull();
    expect(parseWidgetCommand("/nonsense")).toBeNull();
  });

  it("is case-insensitive and tolerates surrounding whitespace", () => {
    expect(parseWidgetCommand("  /BOARD  ")!.kind).toBe("board");
  });

  it("maps the alias /driver-queue to the same widget as /queue", () => {
    expect(parseWidgetCommand("/driver-queue")!.kind).toBe("driver-queue");
    expect(parseWidgetCommand("/queue")!.kind).toBe("driver-queue");
  });
});

describe("required vs optional arguments", () => {
  it("commands that NEED an argument refuse without one", () => {
    // Without a slug there is nothing to show; falling through to chat is the right behaviour.
    expect(parseWidgetCommand("/card")).toBeNull();
    expect(parseWidgetCommand("/review")).toBeNull();
  });

  it("commands with an OPTIONAL argument return an empty payload when it is absent", () => {
    expect(parseWidgetCommand("/pipeline")!.payload).toEqual({});
    expect(parseWidgetCommand("/audit")!.payload).toEqual({});
    expect(parseWidgetCommand("/memory")!.payload).toEqual({});
  });

  it("carries the argument into the payload under the field each widget expects", () => {
    expect(parseWidgetCommand("/card FEAT-X")!.payload).toEqual({ slug: "FEAT-X" });
    expect(parseWidgetCommand("/pipeline FEAT-X")!.payload).toEqual({ slug: "FEAT-X" });
    expect(parseWidgetCommand("/audit card:9")!.payload).toEqual({ entity_id: "card:9" });
    expect(parseWidgetCommand("/memory auth flow")!.payload).toEqual({ query: "auth flow" });
    expect(parseWidgetCommand("/review src/a.ts")!.payload).toEqual({ path: "src/a.ts" });
    expect(parseWidgetCommand("/design src/loki")!.payload).toEqual({ dir: "src/loki" });
  });

  it("keeps a multi-word argument intact rather than taking only the first word", () => {
    expect(parseWidgetCommand("/memory the audit chain")!.payload).toEqual({ query: "the audit chain" });
  });
});

describe("keys", () => {
  it("two summons of the same command get distinct keys", async () => {
    // Same key twice means React reuses the node and the second summon appears to do nothing.
    const a = parseWidgetCommand("/board")!.key;
    await new Promise((r) => setTimeout(r, 2));
    expect(parseWidgetCommand("/board")!.key).not.toBe(a);
  });

  it("the key names the command it came from", () => {
    expect(parseWidgetCommand("/xray")!.key).toMatch(/^palette-xray-\d+$/);
  });
});
