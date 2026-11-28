// The glossary is the app's shared vocabulary — <Term name="drift"/> looks entries up by KEY, and a
// key with no entry renders as plain text, so a typo'd or renamed key degrades into a silently
// missing tooltip. These invariants are what keep that from happening quietly.
import { describe, it, expect } from "vitest";
import { GLOSSARY } from "./glossary";

const entries = Object.entries(GLOSSARY);

describe("every glossary entry is complete", () => {
  it.each(entries)("%s", (_key, e) => {
    expect(e.term.trim().length).toBeGreaterThan(0);
    expect(e.short.trim().length).toBeGreaterThan(0);
    expect(e.long.trim().length).toBeGreaterThan(0);
  });

  it("keeps the short form short enough for a tooltip header", () => {
    for (const [k, e] of entries) expect(e.short.length, k).toBeLessThanOrEqual(120);
  });

  it("writes the long form as a sentence, not a fragment", () => {
    for (const [k, e] of entries) expect(e.long.length, k).toBeGreaterThanOrEqual(20);
  });
});

describe("lookup keys", () => {
  it("has no duplicate display terms among the primary entries", () => {
    // Legacy aliases are keyed differently on purpose; the displayed terms must still be distinct.
    const terms = entries.map(([, e]) => e.term.toLowerCase());
    expect(new Set(terms).size).toBe(terms.length);
  });

  it("uses keys that are safe to write inline in JSX", () => {
    for (const [k] of entries) expect(k, k).toMatch(/^[a-z_]+$/);
  });

  it("covers the vocabulary the screens actually use", () => {
    for (const k of ["drive", "slug", "contract", "card", "drift", "signal", "blocker", "microtask", "epic"]) {
      expect(GLOSSARY[k], k).toBeTruthy();
    }
  });
});

describe("links", () => {
  it("point at in-app routes, never off-site", () => {
    for (const [k, e] of entries) {
      for (const l of e.links ?? []) {
        expect(l.to, k).toMatch(/^\//);
        expect(l.label.trim().length, k).toBeGreaterThan(0);
      }
    }
  });
});
