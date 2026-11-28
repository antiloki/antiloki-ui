import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SpecialistAvatar, mascotOf, fieldBlobs, liquidBlobs, shiftHue, glowStops, ShadowGlow, halfPixels, resetHalfPixels, polygonsOf, insideShape, specialistColor, shadowBlocks, AvatarPicker, SpecialistShadow, SpecialistTag, PIX, SHAPES, PALETTE } from "./SpecialistAvatar";
import { parseCommand } from "./commands";
import { parseLayout } from "./layout";

describe("a specialist's mascot", () => {
  it("is the specialist's own choice when valid, else from its id, always the same", () => {
    expect(mascotOf("copy-chief")).toEqual(mascotOf("copy-chief")); expect(SHAPES).toContain(mascotOf("copy-chief").shape); expect(Object.keys(PALETTE)).toContain(mascotOf("copy-chief").color);
    expect(mascotOf("x", "cat", "pink")).toEqual({ shape: "cat", color: "pink", hex: PALETTE.pink }); expect(mascotOf("x", "dragon", "neon").shape).toBe(mascotOf("x").shape); expect(specialistColor("x", "teal")).toBe(PALETTE.teal);
  });
  it("the topbar's pixelated shadow: blocks denser toward the right edge, with the avatar in the same blocks", () => {
    const blocks = shadowBlocks(40, 6, (u, v) => (u - 0.5) ** 2 + (v - 0.5) ** 2 < 0.2); const dither = blocks.filter((b) => !b[3]); const left = dither.filter((b) => b[0] < 20).length; const right = dither.filter((b) => b[0] >= 20).length;
    expect(right).toBeGreaterThan(left * 2); expect(blocks.filter((b) => b[3]).length).toBeGreaterThan(10); expect(blocks.filter((b) => b[3]).every((b) => b[0] >= 40 - 8 - 3 && b[0] <= 40 - 3)).toBe(true); expect(blocks).toEqual(shadowBlocks(40, 6, (u, v) => (u - 0.5) ** 2 + (v - 0.5) ** 2 < 0.2));
    expect(Object.keys(PIX).sort()).toEqual([...SHAPES].sort());
    const { container } = render(<SpecialistShadow id="a" />); expect(container.querySelector("canvas[data-testid=specialist-shadow]")).toBeTruthy(); expect(screen.getByTestId("specialist-shadow").style.width).toBe("50%");
    render(<SpecialistTag id="a" />); expect(screen.getByTestId("specialist-tag").querySelector(".full")?.textContent).toBe("Specialist"); render(<SpecialistTag id="b" label="Leader" />); expect(screen.getAllByTestId("specialist-tag")[1].querySelector(".full")?.textContent).toBe("Leader"); expect(screen.getAllByTestId("specialist-tag")[1].querySelector(".short")?.textContent).toBe("L");
  });
  it("while the agent runs the pixels breathe smoothly: the same blocks, their light moving in a wave, no block popping in or out", () => {
    const at = (time: number) => shadowBlocks(60, 6, () => false, time, true); const key = (b: [number, number, number, boolean]) => `${b[0]},${b[1]}`;
    const a = at(1.0), b = at(1.016); expect(a.map(key)).toEqual(b.map(key));   // the blocks themselves do not change from frame to frame
    const alphaOf = (v: [number, number, number, boolean][]) => new Map(v.map((x) => [key(x), x[2]]));
    const A = alphaOf(a), B = alphaOf(b); let step = 0; for (const [k, v] of A) step = Math.max(step, Math.abs(v - (B.get(k) ?? v))); expect(step).toBeLessThan(0.05);   // one frame later: a small, smooth change
    const C = alphaOf(at(1.6)); let swing = 0; for (const [k, v] of A) swing = Math.max(swing, Math.abs(v - (C.get(k) ?? v))); expect(swing).toBeGreaterThan(0.25);   // a little later: a visible one
  });
  it("the shadow art is a row of soft clouds: stronger toward the right edge, still when quiet, drifting and breathing smoothly while the agent runs", () => {
    const calm = fieldBlobs(200, 30, 0, false); const calm2 = fieldBlobs(200, 30, 7, false); expect(calm2).toEqual(calm);   // quiet: the same art at any time
    expect(calm[calm.length - 1].a).toBeGreaterThan(calm[0].a * 2); expect(calm.every((b) => b.r > 0 && b.a > 0)).toBe(true);
    const run = (t: number) => fieldBlobs(200, 30, t, true); const a = run(1), b = run(1.016), c = run(1.7); expect(a.length).toBe(calm.length + 1);   // + the sweeping cloud
    const step = Math.max(...a.map((x, i) => Math.abs(x.a - b[i].a) + Math.abs(x.x - b[i].x) / 200)); const swing = Math.max(...a.map((x, i) => Math.abs(x.a - c[i].a))); expect(step).toBeLessThan(0.05); expect(swing).toBeGreaterThan(0.08);
  });
  it("the clouds are iridescent: the specialist's colour and its neighbours on the wheel", () => {
    expect(shiftHue("#ff0000", 0)).toBe("#ff0000"); expect(shiftHue("#ff0000", 120)).toBe("#00ff00"); expect(shiftHue("#ff0000", -120)).toBe("#0000ff"); expect(shiftHue("#808080", 90)).toBe("#808080"); expect(shiftHue("nope", 30)).toBe("nope");
    expect(new Set(fieldBlobs(200, 30, 0, false).map((b) => b.hue)).size).toBeGreaterThan(3);
  });
  it("the liquid look: flat drops that drift (slowly when quiet, fast while the agent runs) and a tide at the bottom", () => {
    const calm = liquidBlobs(200, 30, 0, false); expect(liquidBlobs(200, 30, 0, false)).toEqual(calm); expect(calm.length).toBe(8); expect(calm.every((b) => b.r > 0)).toBe(true);
    const move = (working: boolean) => liquidBlobs(200, 30, 1.0, working).reduce((s, b, i) => s + Math.abs(b.x - liquidBlobs(200, 30, 1.4, working)[i].x), 0); expect(move(true)).toBeGreaterThan(move(false) * 2);
    expect(parseAppearance({ pixelStyle: "liquid" }).pixelStyle).toBe("liquid");
  });
  it("the shadow moves only while the agent runs, and the avatar can be chosen from the sheet", () => {
    const at = (time: number, working: boolean) => JSON.stringify(shadowBlocks(40, 6, () => false, time, working)); expect(at(0, false)).toBe(at(5, false)); expect(at(0, true)).not.toBe(at(0.4, true));
    const picks: string[][] = []; const { unmount } = render(<AvatarPicker id="a" onPick={(s, c) => picks.push([s, c])} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("avatar-shape-ghost")); fireEvent.click(screen.getByTestId("avatar-color-pink")); expect(picks).toEqual([["ghost", mascotOf("a", "ghost").color], ["ghost", "pink"]]); expect(screen.getAllByTestId(/^avatar-shape-/).length).toBe(SHAPES.length); const dlg = screen.getByTestId("avatar-picker"); expect(dlg.style.position).toBe("fixed"); expect(dlg.style.left).toBe("50%"); expect(dlg.style.top).toBe("50%"); expect(document.body.contains(dlg) && dlg.parentElement === document.body).toBe(true); unmount();
  });
  it("the avatar is half pixelized the same way every time, with no canvas: the right half is blocks fading out, the left half stays smooth", () => {
    resetHalfPixels(); const g = halfPixels("ghost"); expect(g.length).toBeGreaterThan(5); expect(g.every((p) => p.x >= 18)).toBe(true); expect(Math.min(...g.map((p) => p.a))).toBeLessThan(Math.max(...g.map((p) => p.a)));
    for (const s of SHAPES) { expect(halfPixels(s).length, s).toBeGreaterThan(3); } expect(halfPixels("nope")).toEqual([]);
    const polys = polygonsOf("M0 0 L10 0 L10 10 L0 10 z M3 3 L7 3 L7 7 L3 7 z"); expect(insideShape(polys, 1, 1)).toBe(true); expect(insideShape(polys, 5, 5)).toBe(false); expect(insideShape(polys, 20, 5)).toBe(false);
    const { container, unmount } = render(<><SpecialistAvatar id="a" shape="ghost" /><SpecialistAvatar id="a" shape="ghost" /></>); const ids = [...container.querySelectorAll("clipPath")].map((c) => c.id); expect(ids.length).toBe(2); expect(new Set(ids).size).toBe(2); unmount();   // two avatars of one specialist must not share a clip id
  });
  it("draws every shape of the sheet with two eyes, and each state moves only the face and body", () => {
    for (const s of SHAPES) { const { container, unmount } = render(<SpecialistAvatar id="a" shape={s} />); expect(container.querySelectorAll("rect.eye").length).toBe(2); expect(screen.getByTestId("specialist-avatar").getAttribute("data-shape")).toBe(s); unmount(); }
    for (const st of ["idle", "thinking", "working", "waiting", "blocked", "done"] as const) { const { container, unmount } = render(<SpecialistAvatar id="a" state={st} />); expect(container.querySelector(`svg[data-state=${st}]`)).toBeTruthy(); unmount(); }
  });
  it("is carried by an open command from the serve and survives a reload", () => {
    const c = parseCommand({ id: 1, op: "open", args: { kind: "agent", engine: "claude-code", specialist: "copy-chief", shape: "ghost", color: "pink" } }); expect(c && c.op === "open" && [c.specialist, c.specialistShape, c.specialistColor]).toEqual(["copy-chief", "ghost", "pink"]);
    const plain = parseCommand({ id: 2, op: "open", args: { kind: "agent", engine: "claude-code", specialist: "" } }); expect(plain && plain.op === "open" && plain.specialist).toBeUndefined();
    const L = { root: { type: "leaf", pane: { id: "a", kind: "engine", engine: "claude-code", specialist: { id: "copy-chief", shape: "ghost", color: "pink" } } }, focus: "a", zoom: null };
    expect((parseLayout(JSON.parse(JSON.stringify(L))) as { root: { pane: { specialist: unknown } } }).root.pane.specialist).toEqual({ id: "copy-chief", shape: "ghost", color: "pink" });
  });
});

import { setSpecialistLook as everywhere } from "./layout";
describe("one specialist in two panes", () => {
  it("changing the avatar in one changes it in every pane of that specialist, and leaves the others alone", () => {
    const L = { root: { type: "split", dir: "row", sizes: [1, 1, 1], children: [{ type: "leaf", pane: { id: "a", kind: "engine", engine: "claude-code", specialist: { id: "cc" } } }, { type: "leaf", pane: { id: "b", kind: "engine", engine: "claude-code", specialist: { id: "cc" } } }, { type: "leaf", pane: { id: "c", kind: "engine", engine: "claude-code", specialist: { id: "other" } } }] }, focus: "a", zoom: null } as never;
    const out = everywhere(L, "cc", "cat", "pink") as { root: { children: { pane: { specialist: { id: string; shape?: string; color?: string } } }[] } };
    expect(out.root.children.map((c) => [c.pane.specialist.shape, c.pane.specialist.color])).toEqual([["cat", "pink"], ["cat", "pink"], [undefined, undefined]]);
  });
});

import { parseAppearance } from "./appearance";
import { LookContext } from "./use-appearance";
describe("the three looks of the pixel effects", () => {
  it("are pixelated (the default), shadow and minimal, and anything else is pixelated", () => {
    expect(parseAppearance({}).pixelStyle).toBe("pixel"); expect(parseAppearance({ pixelStyle: "shadow" }).pixelStyle).toBe("shadow"); expect(parseAppearance({ pixelStyle: "minimal" }).pixelStyle).toBe("minimal"); expect(parseAppearance({ pixelStyle: "neon" }).pixelStyle).toBe("pixel");
  });
});

describe("the shadow look is a coloured glow, not liquid", () => {
  it("its colours are the specialist's and its neighbours on the wheel; it turns slowly and faster while the agent runs", () => {
    const s = glowStops("#2a6df4"); expect(s.length).toBe(4); expect(s[0]).toBe("#2a6df4"); expect(new Set(s).size).toBe(4);
    const { container, rerender } = render(<ShadowGlow hex="#2a6df4" />); const layer = () => container.querySelector(".sg-layer") as HTMLElement; expect(layer().style.animation).toContain("sg-turn 11s"); expect(layer().style.background || layer().style.backgroundImage).toContain("conic-gradient");
    rerender(<ShadowGlow hex="#2a6df4" working />); expect(layer().style.animation).toContain("sg-turn 3.6s"); expect(layer().style.animation).toContain("sg-pulse"); expect(container.querySelector("canvas")).toBeNull();
  });
});

describe("the minimal look draws the avatar as a line", () => {
  it("transparent body, coloured outline and eyes", () => {
    const { container } = render(<LookContext.Provider value={{ ap: { pixelStyle: "minimal" } } as never}><SpecialistAvatar id="a" shape="ghost" color="pink" /></LookContext.Provider>);
    const body = container.querySelector(".body") as SVGGElement; expect(body.getAttribute("fill")).toBe("none"); expect(body.getAttribute("stroke")).toBe("#ea3d8c"); expect((container.querySelector(".eyes") as SVGGElement).getAttribute("fill")).toBe("#ea3d8c");
  });
});
