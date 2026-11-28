// The wordmark has one non-obvious rule: the collapsed rail renders a deliberate "a." monogram
// rather than letting CSS clip "antiloki." — a clipped wordmark reads as a layout bug.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Logo } from "./logo";

const logo = (props: any = {}) => render(<Logo {...props} />).container;

describe("Logo", () => {
  it("spells the wordmark with its accent dot", () => {
    expect(logo().textContent).toBe("antiloki.");
  });

  it("collapses to the 'a.' monogram, still labelled with the full name", () => {
    const c = logo({ compact: true });
    expect(c.textContent).toBe("a.");
    expect((c.firstChild as HTMLElement).getAttribute("title")).toBe("antiloki");
  });

  it("adds the ember mark only when asked", () => {
    expect(logo().textContent).not.toContain("▲");
    expect(logo({ mark: true }).textContent).toBe("▲antiloki.");
  });

  it("does not show the mark in the compact monogram — there is no room", () => {
    expect(logo({ compact: true, mark: true }).textContent).toBe("a.");
  });

  it("scales tracking with size, both full and compact", () => {
    for (const compact of [false, true]) {
      const small = (logo({ size: 12, compact }).firstChild as HTMLElement).style.letterSpacing;
      const big = (logo({ size: 32, compact }).firstChild as HTMLElement).style.letterSpacing;
      expect(parseFloat(big), String(compact)).toBeLessThan(parseFloat(small)); // tighter (more negative)
    }
  });

  it("never wraps or gets selected as text", () => {
    const el = logo().firstChild as HTMLElement;
    expect(el.style.whiteSpace).toBe("nowrap");
    expect(el.style.userSelect).toBe("none");
  });

  it("accents only the dot, not the whole word", () => {
    const c = logo();
    const accents = Array.from(c.querySelectorAll("span span")).filter((s) => s.textContent === ".");
    expect(accents).toHaveLength(1);
  });
});
