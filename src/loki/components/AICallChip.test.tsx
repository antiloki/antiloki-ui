// This chip is the only way into an AI call's detail from inside a dense row, so two things must
// hold: clicking it must NOT also trigger the row's own click (it sits inside clickable table rows),
// and the provider-agnostic tier must map onto the cognition vocabulary the rest of the UI speaks.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const setAiCallId = vi.fn();
vi.mock("@/loki/shell/slug-context", () => ({ useShell: () => ({ setAiCallId }) }));

import { AICallChip } from "./AICallChip";

beforeEach(() => setAiCallId.mockReset());

describe("AICallChip", () => {
  it("opens that call's detail when clicked", () => {
    render(<AICallChip id={77} tier="mid" />);
    fireEvent.click(screen.getByRole("button"));
    expect(setAiCallId).toHaveBeenCalledWith(77);
  });

  it("does not let the click reach the row underneath it", () => {
    const rowClick = vi.fn();
    render(<div onClick={rowClick}><AICallChip id={1} tier="low" /></div>);
    fireEvent.click(screen.getByRole("button"));
    expect(setAiCallId).toHaveBeenCalled();
    expect(rowClick).not.toHaveBeenCalled();
  });

  it("maps each tier onto the cognition vocabulary", () => {
    for (const [tier, label] of [["low", "script"], ["mid", "narrow-AI"], ["high", "broad-AI"]] as const) {
      const { unmount } = render(<AICallChip id={1} tier={tier} />);
      expect(screen.getByText(label), tier).toBeTruthy();
      unmount();
    }
  });

  it("falls back to narrow for a tier it does not recognise, instead of rendering blank", () => {
    render(<AICallChip id={1} tier={"unknown" as any} />);
    expect(screen.getByText("narrow-AI")).toBeTruthy();
  });

  it("renders milliseconds as seconds for a human", () => {
    render(<AICallChip id={1} tier="high" model="m" durationMs={1234} />);
    expect(screen.getByRole("button").textContent).toBeTruthy();
    expect(screen.getByText("broad-AI").parentElement!.getAttribute("title")).toContain("1.23s");
  });

  it("omits latency entirely when the call has none recorded", () => {
    render(<AICallChip id={1} tier="high" model="m" />);
    expect(screen.getByText("broad-AI").parentElement!.getAttribute("title")).not.toMatch(/\ds\b/);
  });

  it("names the call it opens, so the target is clear before clicking", () => {
    render(<AICallChip id={99} tier="low" />);
    expect(screen.getByRole("button").getAttribute("title")).toBe("View AI call #99");
  });
});
