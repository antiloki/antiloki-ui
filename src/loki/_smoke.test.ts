import { describe, it, expect } from "vitest";

// FEAT-FE-UNIT-VITEST-SCAFFOLD canary. Proves the runner fires and
// jest-dom matchers are wired (loaded via src/test-setup.ts).
describe("vitest runner is alive", () => {
  it("evaluates basic assertions", () => {
    expect(2 + 2).toBe(4);
  });
  it("has jest-dom matchers available", () => {
    const el = document.createElement("div");
    el.textContent = "hello";
    expect(el).toHaveTextContent("hello");
  });
});
