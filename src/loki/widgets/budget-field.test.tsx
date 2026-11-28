// Grokbot QA round 2, item 9: the budget box must keep what is typed ("clearing snaps to 1000, digits append, 150000 became 1000000").
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { BudgetField } from "./cockpit-pane-body";

function Host({ onValue }: { onValue: (n: number) => void }) {
  const [v, setV] = React.useState(1_000_000);
  return <BudgetField value={v} onChange={(n) => { setV(n); onValue(n); }} />;
}
const box = () => screen.getByTestId("budget-chars") as HTMLInputElement;

describe("the budget box", () => {
  it("clearing it and typing 150000 gives exactly 150000", () => {
    const seen = vi.fn();
    render(<Host onValue={seen} />);
    fireEvent.change(box(), { target: { value: "" } });
    expect(box().value).toBe("");                                    // it does not snap back to 1000
    let typed = "";
    for (const ch of "150000") { typed += ch; fireEvent.change(box(), { target: { value: typed } }); expect(box().value).toBe(typed); }
    expect(seen).toHaveBeenLastCalledWith(150000);
  });
  it("a value under 1000 is not passed up, and is tidied to 1000 when the box loses focus", () => {
    const seen = vi.fn();
    render(<Host onValue={seen} />);
    fireEvent.change(box(), { target: { value: "50" } });
    expect(box().value).toBe("50");
    expect(seen).not.toHaveBeenCalled();
    fireEvent.blur(box());
    expect(box().value).toBe("1000");
    expect(seen).toHaveBeenLastCalledWith(1000);
  });
  it("an empty box tidies to 1000 on blur", () => {
    render(<Host onValue={() => {}} />);
    fireEvent.change(box(), { target: { value: "" } });
    fireEvent.blur(box());
    expect(box().value).toBe("1000");
  });
});
