// The screen manifest is what the AI "sees" of the operator's screen. It rides every interviewer
// turn, so a bug here is invisible in the UI and silently wrong in the model's context: a stale
// live line, a dropped widget, or an overflow that truncates the layout away.
//
// NOTE ON ISOLATION: this module keeps process-level state (`live`). Tests that forget to clear it
// leak into each other and pass for the wrong reason, so every test starts from a clean map.
import { describe, it, expect, beforeEach } from "vitest";
import {
  reportScreenState,
  clearScreenState,
  widgetUid,
  describeWidget,
  composeScreenManifest,
  screenActionsFor,
  STAGE_ACTIONS,
} from "./screen-manifest";

const w = (over: any = {}) => ({ kind: "table", key: "k1", payload: {}, ...over }) as any;

// `live` is module-private; the only sanctioned reset is clearing each uid a test published.
const published: string[] = [];
function publish(uid: string, line: string | null) {
  reportScreenState(uid, line);
  if (line) published.push(uid);
}
beforeEach(() => {
  while (published.length) clearScreenState(published.pop()!);
});

describe("widgetUid — identity precedence", () => {
  it("prefers the durable _uid over key and kind", () => {
    expect(widgetUid(w({ payload: { _uid: "diagram-w77" }, key: "tw-77" }))).toBe("diagram-w77");
  });

  it("falls back key → kind → 'widget'", () => {
    expect(widgetUid(w({ payload: {}, key: "kk" }))).toBe("kk");
    expect(widgetUid({ kind: "board" } as any)).toBe("board");
    expect(widgetUid({} as any)).toBe("widget");
    expect(widgetUid(null as any)).toBe("widget");
  });
});

describe("reportScreenState", () => {
  it("collapses newlines into ' · ' so one widget is always ONE line", () => {
    // A multi-line live report would break the manifest's line-per-thing contract.
    publish("u1", "first\n  second\n\nthird");
    const out = composeScreenManifest({ extra: [] });
    expect(out).toContain("live · first · second · third");
    expect(out.split("\n").filter((l) => l.startsWith("live ·"))).toHaveLength(1);
  });

  it("caps a live line at 240 chars", () => {
    publish("u2", "x".repeat(500));
    const line = composeScreenManifest({}).split("\n").find((l) => l.startsWith("live ·"))!;
    expect(line.length).toBeLessThanOrEqual("live · ".length + 240);
  });

  it("null, empty and whitespace-only all CLEAR the entry (unmount path)", () => {
    for (const blank of [null, "", "   "]) {
      publish("u3", "present");
      expect(composeScreenManifest({})).toContain("present");
      reportScreenState("u3", blank as any);
      expect(composeScreenManifest({})).not.toContain("present");
    }
  });
});

describe("describeWidget — a payload-only one-liner", () => {
  it("strips the atlas-/vibe- prefix and de-hyphenates the kind", () => {
    expect(describeWidget(w({ kind: "atlas-graph", payload: {} }))).toBe("graph");
    expect(describeWidget(w({ kind: "code-sample", payload: {} }))).toBe("code sample");
  });

  it("names a vibe-pane by its pane kind rather than the widget kind", () => {
    expect(describeWidget(w({ kind: "vibe-pane", payload: { paneKind: "claude-code" } }))).toContain("pane");
  });

  it("appends the identifying fields it has", () => {
    const d = describeWidget(w({ kind: "table", payload: { slug: "FEAT-X", query: "auth" } }));
    expect(d).toContain("FEAT-X");
    expect(d).toContain('query "auth"');
  });

  it("quotes and truncates a long item title", () => {
    const d = describeWidget(w({ payload: { item: { title: "T".repeat(100) } } }));
    expect(d).toMatch(/"T{60}"/);
  });

  it("caps the whole description at 200 chars", () => {
    expect(describeWidget(w({ payload: { path: "p".repeat(400) } })).length).toBeLessThanOrEqual(200);
  });

  it("never throws on a malformed widget", () => {
    expect(() => describeWidget({} as any)).not.toThrow();
    expect(() => describeWidget({ kind: "x" } as any)).not.toThrow();
  });
});

describe("composeScreenManifest", () => {
  it("puts the dock order first, and shows an em dash when the queue is empty", () => {
    expect(composeScreenManifest({ stage: ["a", "b"] }).split("\n")[0]).toBe(
      "layout — ONE dock, in order: [a · b]",
    );
    expect(composeScreenManifest({ stage: [] })).toContain("[—]");
  });

  it("renders the zone layout with an em dash per empty zone", () => {
    const out = composeScreenManifest({ zones: { left: ["x"], center: [], right: [] } });
    expect(out).toContain("left[x]");
    expect(out).toContain("center[—]");
    expect(out).toContain("right[—]");
  });

  it("a docked widget prefers its LIVE line over the payload description", () => {
    // The live line is the widget's own current state; the payload description is a fallback.
    publish("diagram-w1", "3 nodes selected");
    const out = composeScreenManifest({
      docked: [{ zone: "center", w: w({ kind: "atlas-graph", payload: { _uid: "diagram-w1" } }) }],
    });
    expect(out).toContain("docked(center) #diagram-w1 — 3 nodes selected");
    expect(out).not.toContain("— graph");
  });

  it("falls back to describeWidget when nothing published a live line", () => {
    const out = composeScreenManifest({ docked: [{ zone: "left", w: w({ kind: "atlas-graph", payload: { _uid: "g2" } }) }] });
    expect(out).toContain("docked(left) #g2 — graph");
  });

  it("caps the instruments rail at 14 and reports how many were dropped", () => {
    // Silent truncation would tell the AI the rail is smaller than it is.
    const many = Array.from({ length: 20 }, (_, i) => w({ kind: "table", key: `w${i}`, payload: { _uid: `u${i}` } }));
    const out = composeScreenManifest({ instruments: many });
    expect(out).toContain("instruments rail (20):");
    expect(out).toContain("… +6 more");
    expect(out.split("\n").filter((l) => l.trim().startsWith("#u")).length).toBe(14);
  });

  it("omits the rail entirely when there are no instruments", () => {
    expect(composeScreenManifest({ instruments: [] })).not.toContain("instruments rail");
  });

  it("emits live lines only for uids NOT already listed as docked or instruments", () => {
    // Otherwise the same widget appears twice and the model double-counts the screen.
    publish("shown", "docked line");
    publish("orphan", "an agent pane");
    const out = composeScreenManifest({
      docked: [{ zone: "center", w: w({ payload: { _uid: "shown" } }) }],
    });
    expect(out).toContain("docked(center) #shown — docked line");
    expect(out).toContain("live · an agent pane");
    expect(out.match(/shown/g)).toHaveLength(1);
  });

  it("skips a null docked entry instead of throwing", () => {
    expect(() => composeScreenManifest({ docked: [{ zone: "left", w: null as any }] })).not.toThrow();
  });

  it("hard-caps the whole manifest at 20000 chars (raised from 6000 for the screen pages, 2026-09-19)", () => {
    for (let i = 0; i < 200; i++) publish(`big${i}`, "y".repeat(200));
    expect(composeScreenManifest({}).length).toBeLessThanOrEqual(20000);
  });

  it("appends extra lines verbatim, last", () => {
    const out = composeScreenManifest({ stage: ["a"], extra: ["custom line"] });
    expect(out.endsWith("custom line")).toBe(true);
  });
});

describe("screenActionsFor — the local verb tier", () => {
  it("the stage (/) publishes the dock verbs", () => {
    expect(screenActionsFor("/")).toBe(STAGE_ACTIONS);
    expect(STAGE_ACTIONS.join("\n")).toContain("open_widget #uid");
  });

  it("the atlas and design screens publish the IDE verbs", () => {
    for (const p of ["/operations/atlas", "/operations/design", "/operations/atlas/deep"]) {
      expect(screenActionsFor(p).join("\n")).toContain("open_ide_view");
    }
  });

  it("an unknown screen publishes NO local verbs — the prompt then forbids them", () => {
    const out = screenActionsFor("/somewhere/else").join("\n");
    expect(out).toContain("none published");
    expect(out).not.toContain("open_widget");
  });
});

// SCREEN PAGES (2026-09-19): a screen with a lot of deterministic content — the X-ray brief, the open
// file's dossier — publishes a markdown page; pages ride AFTER the one-liners, capped, cleared on unmount.
import { reportScreenPage, screenPages, PAGE_CAP, MANIFEST_CAP } from "./screen-manifest";
describe("screen pages — the X-ray brief and the file dossier ride the manifest", () => {
  beforeEach(() => { for (const [uid] of screenPages()) clearScreenState(uid); });

  it("a page lands under a '## page · <uid>' heading, after the live lines", () => {
    publish("l1", "a live line");
    reportScreenPage("xray", "X-ray — open tab: Overview\nverdict: 412 files · health 16");
    const out = composeScreenManifest({});
    expect(out.indexOf("live · a live line")).toBeLessThan(out.indexOf("## page · xray"));
    expect(out).toContain("verdict: 412 files · health 16");
    clearScreenState("xray");
  });

  it("clearScreenState removes the page too (one unmount path for lines and pages)", () => {
    reportScreenPage("xray-file", "file a.ts — health 81");
    expect(screenPages().map(([u]) => u)).toContain("xray-file");
    clearScreenState("xray-file");
    expect(composeScreenManifest({})).not.toContain("xray-file");
  });

  it("null / blank clears; a page is capped at PAGE_CAP and the manifest at MANIFEST_CAP", () => {
    reportScreenPage("p", "x".repeat(PAGE_CAP + 500));
    expect(screenPages()[0][1].length).toBe(PAGE_CAP);
    reportScreenPage("q", "y".repeat(PAGE_CAP)); reportScreenPage("r", "z".repeat(PAGE_CAP));
    expect(composeScreenManifest({}).length).toBeLessThanOrEqual(MANIFEST_CAP);
    reportScreenPage("p", "   "); reportScreenPage("q", null);
    expect(screenPages().map(([u]) => u)).toEqual(["r"]);
    clearScreenState("r");
  });
});
