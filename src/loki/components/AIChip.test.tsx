// The chip's entire purpose is provenance: it marks text as an AI CLAIM rather than a canonical DB
// value. If the tooltip loses that wording — or the source attribution — the operator can no longer
// tell an AI-written goal from the card's own status column, which is the confusion the chip exists
// to prevent (FEAT-FE-RENDERS-FROM-DB-AUDIT).
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AIChip } from "./AIChip";

const chip = () => screen.getByText("AI");

describe("AIChip", () => {
  it("always reads 'AI' — the marker itself is never parameterised", () => {
    render(<AIChip />);
    expect(chip()).toBeTruthy();
  });

  it("explains that the text may not match the canonical row", () => {
    render(<AIChip />);
    const tip = chip().getAttribute("title")!;
    expect(tip).toContain("AI claim");
    expect(tip).toContain("canonical DB row");
  });

  it("appends the emitting source when one is known", () => {
    render(<AIChip source="tl-contract-draft.goal_md @ v3" />);
    const tip = chip().getAttribute("title")!;
    expect(tip).toContain("Source: tl-contract-draft.goal_md @ v3");
    expect(tip).toContain("AI claim"); // the warning survives alongside the attribution
  });

  it("lets a caller replace the tooltip entirely", () => {
    render(<AIChip title="custom explanation" source="ignored" />);
    expect(chip().getAttribute("title")).toBe("custom explanation");
  });

  it("renders smaller inline than in a panel, without changing what it says", () => {
    const { unmount } = render(<AIChip />);
    const inlineSize = chip().style.fontSize;
    unmount();
    render(<AIChip variant="panel" />);
    expect(parseFloat(chip().style.fontSize)).toBeGreaterThan(parseFloat(inlineSize));
  });

  it("is not selectable, so copying a field does not drag the badge into the text", () => {
    render(<AIChip />);
    expect(chip().style.userSelect).toBe("none");
  });
});
