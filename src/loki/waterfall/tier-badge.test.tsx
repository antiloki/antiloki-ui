// TierBadge honesty change: a missing tier is UNRECORDED metadata for a known
// AI call, not a non-AI step. The badge must mark it ("AI ?", dim) instead of
// vanishing — the regression being guarded is that TierBadge used to render
// null when tier was null/undefined, so absence was indistinguishable from a
// non-AI step. See shared.tsx (export function TierBadge).
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TierBadge } from "./shared";

describe("TierBadge", () => {
  it("renders the tier when one is recorded (AI high)", () => {
    render(<TierBadge tier="high" />);
    expect(screen.getByText(/AI\s*high/i)).toBeInTheDocument();
  });

  it("marks an AI call with no recorded tier as 'AI ?' instead of vanishing", () => {
    const { container } = render(<TierBadge />);
    // The regression: it used to render null, leaving an empty container.
    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByText(/AI\s*\?/)).toBeInTheDocument();
  });

  it("titles the unrecorded-tier badge so absence is distinguishable", () => {
    render(<TierBadge tier={null} />);
    const badge = screen.getByText(/AI\s*\?/);
    expect(badge).toHaveAttribute("title", "AI call — tier not recorded");
  });
});
