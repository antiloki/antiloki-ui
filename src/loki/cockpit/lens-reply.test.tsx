// A SPECIALIST'S REPLY IS A VERDICT, NOT A PAYLOAD (2026-09-24). The chat was printing a lens's JSON object
// verbatim — a wall of braces in the middle of the screen, and the first thing anyone sees. What is pinned here is
// mostly the REFUSAL to render: anything that is not recognisably a lens has to fall through to the ordinary
// markdown path, because half a card is worse than the raw text.
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { parseLens, confidenceWord, LensReply } from "./lens-reply";

const colors = { fg: "#fff", dim: "#888", muted: "#aaa", border: "#333", panel: "#111", accent: "#7c5cf0", bad: "#f66", warn: "#ea0", ok: "#3b6", mono: "mono", font: "sans" };
const VERDICT = JSON.stringify({
  summary: { level: "observation", title: "Clean, fully-typed static data module", headline: "products.ts has no any." },
  theory: null,
  cards: [
    { type: "discovery", severity: "info", title: "All six TS laws pass cleanly", body: "Product is a fully-typed export.", confidence: 0.95 },
    { type: "risk", severity: "info", title: "Compliance is easy here", body: "The file has no branching logic.", confidence: 0.7 },
  ],
  evidence: [{ kind: "law", id: "ts-no-any" }, { kind: "file", id: "src/cart.ts" }],
  actions: [],
  expected_pushback: "A maintainer will note there is nothing to fix here.",
  lesson: null,
});

describe("what counts as a verdict", () => {
  it("reads the shape a lens answers with", () => {
    const l = parseLens(VERDICT)!;
    expect(l.title).toMatch(/Clean, fully-typed/);
    expect(l.cards).toHaveLength(2);
    expect(l.cards[1].confidence).toBe(0.7);
    expect(l.evidence.map((e) => e.id)).toEqual(["ts-no-any", "src/cart.ts"]);
    expect(l.pushback).toMatch(/nothing to fix/);
  });

  it("refuses anything it cannot be sure of, so prose stays prose", () => {
    expect(parseLens("The file looks fine to me.")).toBeNull();
    expect(parseLens("")).toBeNull();
    expect(parseLens("{ not json")).toBeNull();
    expect(parseLens("[1,2,3]")).toBeNull();
    expect(parseLens('{"hello":"world"}')).toBeNull();        // json, but not a lens
    expect(parseLens('{"cards":[]}')).toBeNull();             // no summary and no card is not a verdict
  });

  it("takes a lens that has cards but no summary", () => {
    expect(parseLens('{"cards":[{"title":"one"}]}')?.cards).toHaveLength(1);
  });

  it("says how sure it is in words", () => {
    expect(confidenceWord(0.95)).toBe("certain");
    expect(confidenceWord(0.8)).toBe("confident");
    expect(confidenceWord(0.6)).toBe("likely");
    expect(confidenceWord(0.2)).toBe("a guess");
    expect(confidenceWord(undefined)).toBe("");
  });
});

describe("the verdict on screen", () => {
  it("shows the headline, every card and the evidence — and no braces", () => {
    render(<LensReply lens={parseLens(VERDICT)!} raw={VERDICT} colors={colors} />);
    const el = screen.getByTestId("lens-reply");
    expect(el.textContent).toContain("Clean, fully-typed static data module");
    expect(el.textContent).toContain("All six TS laws pass cleanly");
    expect(el.textContent).toContain("Compliance is easy here");
    expect(el.textContent).toContain("src/cart.ts");
    expect(el.textContent).not.toContain('{"summary"');
    expect(screen.getAllByTestId(/^lens-card-/)).toHaveLength(2);
  });

  it("says plainly when there is nothing to change", () => {
    render(<LensReply lens={parseLens(VERDICT)!} raw={VERDICT} colors={colors} />);
    expect(screen.getByTestId("lens-reply").textContent).toContain("nothing to change");
  });

  it("keeps the raw object one click away — a verdict you cannot audit is worth less", () => {
    render(<LensReply lens={parseLens(VERDICT)!} raw={VERDICT} colors={colors} />);
    expect(screen.queryByTestId("lens-raw-body")).toBeNull();
    fireEvent.click(screen.getByTestId("lens-raw"));
    expect(screen.getByTestId("lens-raw-body").textContent).toBe(VERDICT);
    fireEvent.click(screen.getByTestId("lens-raw"));
    expect(screen.queryByTestId("lens-raw-body")).toBeNull();
  });
});
