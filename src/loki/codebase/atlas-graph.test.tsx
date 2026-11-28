// Path classification for the code graph. Every node's colour and role comes from these pure
// functions, so a regression re-paints or re-buckets the whole atlas at once — visible, but with no
// error to point at. Windows paths matter here: the substrate stores both separators.
import { describe, it, expect } from "vitest";
import { extOf, isReactExt, isTestPath, extColor, roleOfPath } from "./atlas-graph";

describe("extOf", () => {
  it("takes the last extension", () => {
    expect(extOf("src/a.ts")).toBe("ts");
    expect(extOf("src/a.test.ts")).toBe("ts");
    expect(extOf("archive.tar.gz")).toBe("gz");
  });

  it("lowercases", () => {
    expect(extOf("README.MD")).toBe("md");
  });

  it("handles BOTH path separators", () => {
    expect(extOf("src\\loki\\a.tsx")).toBe("tsx");
  });

  it("returns empty for an extensionless file", () => {
    expect(extOf("Makefile")).toBe("");
    expect(extOf("src/LICENSE")).toBe("");
  });

  it("treats a dotfile as having NO extension, not '.gitignore'", () => {
    // lastIndexOf > 0 is what makes this true — a leading dot is not an extension separator.
    expect(extOf(".gitignore")).toBe("");
    expect(extOf("src/.env")).toBe("");
  });

  it("keeps the extension of a dotfile that has one", () => {
    expect(extOf(".eslintrc.json")).toBe("json");
  });
});

describe("isTestPath", () => {
  it("recognises .test. and .spec. filenames in any language", () => {
    for (const p of ["a.test.ts", "a.spec.js", "a.test.py", "src/x/y.spec.tsx"]) {
      expect(isTestPath(p), p).toBe(true);
    }
  });

  it("recognises the conventional test directories", () => {
    for (const p of ["__tests__/a.ts", "src/tests/a.ts", "src/test/a.ts", "__mocks__/a.ts"]) {
      expect(isTestPath(p), p).toBe(true);
    }
  });

  it("works with Windows separators", () => {
    expect(isTestPath("src\\__tests__\\a.ts")).toBe(true);
  });

  it("does NOT flag ordinary source that merely contains the word", () => {
    for (const p of ["src/latest/a.ts", "src/contest.ts", "src/testing-library-setup.ts"]) {
      expect(isTestPath(p), p).toBe(false);
    }
  });

  it("is safe on empty and null", () => {
    expect(isTestPath("")).toBe(false);
    expect(isTestPath(null as any)).toBe(false);
  });
});

describe("extColor", () => {
  const parse = (c: string) => c.match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/)!.slice(1).map(Number);

  it("gives different languages different hues", () => {
    expect(parse(extColor("a.ts"))[2]).not.toBe(parse(extColor("a.py"))[2]);
  });

  it("maps every alias of a language to the same colour", () => {
    expect(extColor("a.mjs")).toBe(extColor("a.js"));
    expect(extColor("a.mts")).toBe(extColor("a.ts"));
    expect(extColor("a.yml")).toBe(extColor("a.yaml"));
  });

  it("makes a react file LIGHTER and hue-shifted so it never reads as plain ts", () => {
    const [l1, , h1] = parse(extColor("a.ts"));
    const [l2, , h2] = parse(extColor("a.tsx"));
    expect(l2).toBeGreaterThan(l1);
    expect(h2).not.toBe(h1);
  });

  it("MUTES a test file — less chroma, more lightness, so it recedes", () => {
    const [l1, c1] = parse(extColor("a.ts"));
    const [l2, c2] = parse(extColor("a.test.ts"));
    expect(c2).toBeLessThan(c1);
    expect(l2).toBeGreaterThan(l1);
  });

  it("compounds both modifiers for a react test file", () => {
    const [, cPlain] = parse(extColor("a.tsx"));
    const [, cTest] = parse(extColor("a.test.tsx"));
    expect(cTest).toBeLessThan(cPlain);
  });

  it("falls back to one neutral grey for an unknown extension", () => {
    expect(extColor("a.zzz")).toBe("oklch(0.62 0.03 250)");
    expect(extColor("Makefile")).toBe("oklch(0.62 0.03 250)");
  });

  it("keeps lightness and chroma inside the clamped range", () => {
    for (const p of ["a.ts", "a.tsx", "a.test.tsx", "a.js", "a.rb"]) {
      const [l, c] = parse(extColor(p));
      expect(l, p).toBeLessThanOrEqual(0.97);
      expect(c, p).toBeGreaterThanOrEqual(0);
    }
  });

  it("always emits a parseable oklch triple", () => {
    for (const p of ["a.ts", "a.zzz", "", "Makefile"]) expect(extColor(p)).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/);
  });
});

describe("isReactExt", () => {
  it("is true only for jsx and tsx", () => {
    expect(isReactExt("tsx")).toBe(true);
    expect(isReactExt("jsx")).toBe(true);
    expect(isReactExt("ts")).toBe(false);
    expect(isReactExt("")).toBe(false);
  });
});

describe("roleOfPath", () => {
  it("calls any component-ish directory ui", () => {
    for (const p of ["src/components/a.ts", "src/ui/a.ts", "src/views/a.ts", "src/pages/a.ts", "src/screens/a.ts"]) {
      expect(roleOfPath(p), p).toBe("ui");
    }
  });

  it("calls any framework component file ui regardless of directory", () => {
    for (const p of ["src/whatever/a.tsx", "a.jsx", "a.vue", "a.svelte"]) expect(roleOfPath(p), p).toBe("ui");
  });

  it("recognises state, data and logic directories", () => {
    expect(roleOfPath("src/stores/a.ts")).toBe("state");
    expect(roleOfPath("src/context/a.ts")).toBe("state");
    expect(roleOfPath("src/models/a.ts")).toBe("data");
    expect(roleOfPath("src/db/a.ts")).toBe("data");
    expect(roleOfPath("src/utils/a.ts")).toBe("logic");
    expect(roleOfPath("src/api/a.ts")).toBe("logic");
  });

  it("puts ui FIRST — a component inside a data directory is still ui", () => {
    expect(roleOfPath("src/models/card.tsx")).toBe("ui");
  });

  it("defaults unclassified paths to logic rather than leaving them unlabelled", () => {
    expect(roleOfPath("src/whatever/a.ts")).toBe("logic");
    expect(roleOfPath("")).toBe("logic");
  });

  it("is case-insensitive", () => {
    expect(roleOfPath("SRC/Components/A.ts")).toBe("ui");
  });
});
