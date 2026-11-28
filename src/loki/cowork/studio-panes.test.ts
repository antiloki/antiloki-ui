import { describe, it, expect } from "vitest";
import { MENU_ORDER, STUDIO_GROUPS, STUDIO_KEYS, STUDIO_MENU, STUDIO_PANE_LIST, studioByGroup, studioPane } from "./studio-panes";
import { WIDGET_REGISTRY } from "@/loki/widgets/registry";
import { VIBE_PANES } from "@/loki/widgets/studio-overlay";

describe("the Studio as panes", () => {
  it("every key is unique, every pane has a group, a glyph and a hint, and the groups are the ones the menu draws", () => {
    expect(new Set(STUDIO_KEYS).size).toBe(STUDIO_KEYS.length);
    for (const p of STUDIO_PANE_LIST) { expect(STUDIO_GROUPS, p.key).toContain(p.group); expect(p.glyph && p.hint && p.label, p.key).toBeTruthy(); }
    expect(studioByGroup().map((g) => g.group)).toEqual(["Tools", "Design", "Codebase", "Skills"]); expect(studioByGroup().every((g) => g.panes.length > 0)).toBe(true);
  });
  it("a widget pane names a widget the registry really has, and a session pane a kind the Studio really opens", () => {
    for (const p of STUDIO_PANE_LIST.filter((x) => x.via === "widget")) expect(Object.keys(WIDGET_REGISTRY), p.key).toContain(p.widget);
    const studioPaneKinds = VIBE_PANES.map((w) => w.kind);
    for (const p of STUDIO_PANE_LIST.filter((x) => x.via === "session")) expect(studioPaneKinds, p.key).toContain(p.paneKind);
  });
  it("the menu is six things, in the order asked for: Sagas, Notes, Preview, Diff, Skills, Frames; the rest stay openable by name and are not in the menu", () => {
    expect(STUDIO_MENU.map((p) => p.label)).toEqual(["Sagas", "Notes", "Preview", "Diff", "Skills", "Frames"]);
    expect(STUDIO_MENU.map((p) => p.key)).toEqual(["sagas", "notes", "preview", "shared-diff", "skillshare", "frames"]);
    expect(STUDIO_PANE_LIST.filter((p) => p.menu).map((p) => p.key).sort()).toEqual([...MENU_ORDER].sort());
    // what is not in the menu is still a pane an agent can open by name
    for (const k of ["xray", "code-graph", "system-design", "authors", "constitution", "code", "git-graph", "design-system", "design-canvas", "brainstorm", "diff", "skill-library"]) { expect(STUDIO_KEYS, k).toContain(k); expect(studioPane(k)?.menu, k).toBeFalsy(); }
  });
  it("the old Issues pane is the sagas now: it opens as one, and is not in the menu", () => { expect(studioPane("issues")?.via).toBe("sagas"); expect(studioPane("sagas")?.via).toBe("sagas"); expect(studioPane("issues")?.menu).toBeFalsy(); });
  it("finds a pane by key, and skillshare is there", () => { expect(studioPane("xray")?.widget).toBe("atlas-xray"); expect(studioPane("nope")).toBeNull(); expect(studioPane(undefined)).toBeNull(); expect(studioPane("skillshare")?.via).toBe("skillshare"); expect(STUDIO_PANE_LIST.length).toBeGreaterThanOrEqual(17); expect(studioPane("shared-diff")?.label).toBe("Diff"); expect(studioPane("skillshare")?.label).toBe("Skills"); });
});

describe("the X-ray submenu", () => {
  it("offers only views the embed page draws, each once, and none that needs a path", async () => {
    const { readFileSync } = await import("node:fs"); const src = readFileSync("src/loki/codebase/xray-embed.tsx", "utf8");
    const { XRAY_MENU } = await import("./studio-panes");
    const views = XRAY_MENU.map((x) => x.view); expect(new Set(views).size).toBe(views.length);
    for (const v of views) expect(src, `the embed has no case for ${v}`).toContain(`case "${v}":`);
    for (const needs of ["file", "folder", "code", "ast", "file-diagram", "source"]) expect(views).not.toContain(needs);
  });
});
