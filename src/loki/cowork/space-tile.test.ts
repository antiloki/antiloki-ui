import { describe, it, expect } from "vitest";
import { initialOf, tileColor, glassStyle } from "./space-tile";

describe("a space's monogram tile", () => {
  it("takes the first letter or digit of the name, upper case", () => {
    expect(initialOf("ministore")).toBe("M"); expect(initialOf("  e2escratch")).toBe("E"); expect(initialOf("3d-lab")).toBe("3"); expect(initialOf("área")).toBe("Á"); expect(initialOf("--")).toBe("·"); expect(initialOf("")).toBe("·");
  });
  it("gives a name its own colour, the same every time and the same whatever the case", () => {
    expect(tileColor("ministore")).toBe(tileColor("ministore")); expect(tileColor("Ministore")).toBe(tileColor(" ministore ")); expect(tileColor("wantyos")).toMatch(/^#[0-9a-f]{6}$/i);
    expect(new Set(["ministore", "wantyos", "e2escratch", "antiloki", "alpha", "beta"].map(tileColor)).size).toBeGreaterThan(3);
  });
  it("is glass: translucent tint and a fine edge of the colour, never a gradient or a shadow, and the open one is more filled", () => {
    const a = glassStyle("ministore", false), b = glassStyle("ministore", true);
    for (const g of [a, b]) { expect(g.background).toContain("transparent"); expect(g.background).not.toContain("gradient"); expect(g.backdropFilter).toContain("blur"); expect(JSON.stringify(g)).not.toContain("shadow"); }
    expect(a.background).toContain("20%"); expect(b.background).toContain("34%"); expect(b.border).toContain("85%");
  });
});
