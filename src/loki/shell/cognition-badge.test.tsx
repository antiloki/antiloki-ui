// The badge answers "what did this cost to think?" at a glance. The three kinds must stay visually
// and textually distinct — script (free, deterministic) reading the same as broad (a frontier call)
// would hide exactly the thing the operator is scanning for.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CognitionBadge, type CognitionKind } from "./cognition-badge";

const KINDS: CognitionKind[] = ["script", "narrow", "broad"];

describe("the three cognition kinds", () => {
  it("each gets its own label and colour", () => {
    const labels = new Set<string>();
    const colours = new Set<string>();
    for (const kind of KINDS) {
      const { container, unmount } = render(<CognitionBadge kind={kind} />);
      const el = container.firstChild as HTMLElement;
      labels.add(el.textContent!);
      colours.add(el.style.color);
      unmount();
    }
    expect(labels.size).toBe(3);
    expect(colours.size).toBe(3);
  });

  it("says in the tooltip what the tier actually means", () => {
    render(<CognitionBadge kind="script" />);
    expect(screen.getByText("script").parentElement!.getAttribute("title")).toContain("zero LLM tokens");
    render(<CognitionBadge kind="broad" />);
    expect(screen.getByText("broad-AI").parentElement!.getAttribute("title")).toContain("expensive");
  });

  it("names narrow-AI as a tuned model, not as 'mid'", () => {
    render(<CognitionBadge kind="narrow" />);
    expect(screen.getByText("narrow-AI")).toBeTruthy();
  });
});

describe("the detail line", () => {
  const badge = () => screen.getByText(/script|narrow-AI|broad-AI/).parentElement as HTMLElement;

  it("shows model, cost and latency inline when there is room", () => {
    render(<CognitionBadge kind="broad" detail="llama-3.2-3b" cost={0.0123} latency="1.20s" />);
    expect(badge().textContent).toContain("llama-3.2-3b");
    expect(badge().textContent).toContain("$0.012");
    expect(badge().textContent).toContain("1.20s");
  });

  it("hides all of it in compact mode but keeps it in the tooltip", () => {
    render(<CognitionBadge kind="broad" detail="llama-3.2-3b" cost={0.0123} latency="1.20s" compact />);
    expect(badge().textContent).not.toContain("llama-3.2-3b");
    const tip = badge().getAttribute("title")!;
    expect(tip).toContain("llama-3.2-3b");
    expect(tip).toContain("$0.0123");
    expect(tip).toContain("1.20s");
  });

  it("shows a zero cost rather than hiding it — free is information", () => {
    render(<CognitionBadge kind="script" cost={0} />);
    expect(badge().textContent).toContain("$0.000");
  });

  it("omits cost and latency entirely when they are unknown", () => {
    render(<CognitionBadge kind="script" />);
    expect(badge().textContent).toBe("script");
    expect(badge().getAttribute("title")).not.toContain("$");
  });

  it("stays on one line so it never breaks a table row", () => {
    render(<CognitionBadge kind="narrow" detail="a-very-long-model-identifier-here" />);
    expect(badge().style.whiteSpace).toBe("nowrap");
  });
});
