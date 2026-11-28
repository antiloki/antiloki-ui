// @vitest-environment jsdom
// THE FACES (2026-09-23): a flat single-colour shape per slug — circle · egg · square · hex · drop · arch · triangle —
// with two white slit eyes and nothing else; the mood is motion and eye shape, never a drawn mouth.
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { ChibiFace, shapeOf, colorOf, pathOf, hashOf, PALETTE, faceIcon, parseFaceIcon, badgeOf, assignColors, assignAgentColors, agentColor, MAIN_COLOR } from "./chibi-face";

describe("the faces", () => {
  it("keeps a shape and a colour per slug, from seven shapes and the reference palette", () => {
    expect(shapeOf("outreach")).toBe(shapeOf("outreach")); expect(colorOf("outreach")).toBe(colorOf("outreach"));
    expect(new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n"].map(shapeOf)).size).toBeGreaterThan(3);
    for (const s of ["circle", "egg", "square", "hex", "drop", "arch", "triangle"] as const) expect(pathOf(s).startsWith("M")).toBe(true);
    expect(PALETTE.includes(colorOf("x") as any)).toBe(true); expect(hashOf("x")).not.toBe(hashOf("y"));
  });
  it("draws one flat shape, two white slit eyes, no mouth, no outline", () => {
    render(<><ChibiFace slug="a" mood="needs" /><ChibiFace slug="b" mood="failed" /><ChibiFace slug="c" mood="working" /></>);
    const a = screen.getByTestId("chibi-a");
    expect(a.querySelectorAll("path").length).toBe(1);                       // the body only
    expect(a.querySelector("path")!.getAttribute("stroke")).toBeNull();      // no outline
    expect(a.querySelectorAll("rect.eye").length).toBe(2);                   // two slits
    expect(Number(a.querySelector("rect.eye")!.getAttribute("height"))).toBe(7);        // tall when it needs you
    expect(Number(screen.getByTestId("chibi-b").querySelector("rect.eye")!.getAttribute("height"))).toBeLessThan(2); // dashes when failed
    expect(screen.getByTestId("chibi-c").getAttribute("data-mood")).toBe("working");
  });
});

describe("a face as an icon (2026-09-23)", () => {
  it("round-trips shape and colour; anything else is an emoji badge; a face has no badge", () => {
    expect(parseFaceIcon(faceIcon("hex", "#4d6bfe"))).toEqual({ shape: "hex", color: "#4d6bfe" });
    expect(parseFaceIcon("face:blob:#000")).toBeNull(); expect(parseFaceIcon("face:hex:red")).toBeNull(); expect(parseFaceIcon("🤖")).toBeNull(); expect(parseFaceIcon("")).toBeNull();
    expect(badgeOf("🤖")).toBe("🤖"); expect(badgeOf(faceIcon("egg", "#7c5cf0"))).toBeUndefined(); expect(badgeOf("")).toBeUndefined();
  });
  it("a chosen shape wins over the slug's — and nothing is drawn on top of the face (2026-09-23)", () => {
    const { container } = render(<ChibiFace slug="x" shape="triangle" color="#123456" />);
    expect(container.querySelector("path")?.getAttribute("d")).toBe(pathOf("triangle"));
    expect(container.querySelector("path")?.getAttribute("fill")).toBe("#123456");
    // the avatar is a face and only a face: no badge, no stamp, nothing overlapping it
    expect(container.querySelectorAll("svg").length).toBe(1);
    expect(container.querySelector("[data-testid^='stamp']")).toBeNull();
  });
});

describe("each agent its own colour (operator 2026-09-30)", () => {
  it("gives a roster distinct colours, the same ones every time, and never the engine's one colour to everybody", () => {
    const slugs = ["main", "cheeky-double", "outreach", "ministore-qa", "docs", "frontender"];
    const a = assignColors(slugs), b = assignColors([...slugs].reverse());
    expect(a).toEqual(b);                                             // the same roster, the same colours, whatever the order it arrives in
    expect(new Set(Object.values(a)).size).toBe(slugs.length);         // six agents, six colours
    for (const c of Object.values(a)) expect((PALETTE as readonly string[]).includes(c)).toBe(true);
  });
  it("lets a roster bigger than the palette go round again instead of failing", () => {
    const many = Array.from({ length: PALETTE.length + 3 }, (_, i) => `agent-${i}`);
    const c = assignColors(many); expect(Object.keys(c).length).toBe(many.length);
  });
  it("is what a face wears once the roster is known, and a stranger falls back to its own hash colour", () => {
    assignAgentColors(["a", "b", "c"]);
    expect(new Set(["a", "b", "c"].map(agentColor)).size).toBe(3);
    expect(agentColor("not-on-the-roster")).toBe(colorOf("not-on-the-roster"));
  });
});

describe("each fork its own colour (operator 2026-10-09)", () => {
  it("never wears its parent's colour and two forks of one agent are told apart", async () => {
    const { assignForkColors, PALETTE } = await import("./chibi-face");
    const parent = PALETTE[2];
    const ids = [41, 42, 43, 44, 45, 46];
    const c = assignForkColors(parent, ids);
    for (const id of ids) expect(c[id]).not.toBe(parent);
    expect(new Set(ids.map((i) => c[i])).size).toBe(ids.length);                 // six siblings, six colours
    expect(assignForkColors(parent, [43, 41, 42])).toEqual({ 41: c[41], 42: c[42], 43: c[43] });   // order of the list does not matter
  });
  it("is deterministic, and keeps working with more forks than the palette has colours", async () => {
    const { assignForkColors, PALETTE } = await import("./chibi-face");
    expect(assignForkColors(PALETTE[0], [7])).toEqual(assignForkColors(PALETTE[0], [7]));
    const many = assignForkColors(PALETTE[0], Array.from({ length: PALETTE.length + 5 }, (_, i) => i + 1));
    expect(Object.keys(many)).toHaveLength(PALETTE.length + 5);
    for (const v of Object.values(many)) expect(PALETTE).toContain(v);
  });
});

describe("the main agent is yellow (operator 2026-10-11)", () => {
  it("wears the yellow whatever the roster, and nobody else is nudged onto it", () => {
    expect(colorOf("main")).toBe(MAIN_COLOR); expect(MAIN_COLOR).toBe("#e6b31e");
    const slugs = ["main", "cheeky-double", "outreach", "ministore-qa", "docs", "frontender", "a", "b", "c", "d", "e"];
    const a = assignColors(slugs);
    expect(a.main).toBe(MAIN_COLOR);
    for (const s of slugs.filter((x) => x !== "main")) expect(a[s], s).not.toBe(MAIN_COLOR);
    assignAgentColors(["main", "x"]); expect(agentColor("main")).toBe(MAIN_COLOR);
  });
});
