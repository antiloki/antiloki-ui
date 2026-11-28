// <Term> is how jargon becomes learnable in place. The behaviour that matters: an unknown term must
// degrade to plain text (never an empty span where a word should be), the tooltip must open on both
// hover and tap (operators use this on a laptop and a tablet), and it must not swallow the custom
// label a caller passed.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// The router isn't mounted in a unit test; Link only needs to render its label and target here.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}));

import { Term } from "./term";
import { GLOSSARY } from "@/loki/mock/glossary";

// The term appears twice once the tooltip is open (the trigger and the tooltip's header); the
// trigger is the first one and the only one that carries the dotted underline.
const label = (name: string) => screen.getAllByText(GLOSSARY[name].term)[0];

describe("an unknown term", () => {
  it("renders as plain text with no tooltip affordance", () => {
    const { container } = render(<Term name="not-a-term" />);
    expect(container.textContent).toBe("not-a-term");
    expect(container.querySelector("span")).toBeNull();
  });

  it("renders the caller's own label when one was given", () => {
    const { container } = render(<Term name="not-a-term">custom words</Term>);
    expect(container.textContent).toBe("custom words");
  });
});

describe("a known term", () => {
  it("labels itself with the glossary term and marks itself as explainable", () => {
    render(<Term name="drift" />);
    const el = label("drift");
    expect(el.style.textDecoration).toContain("dotted");
    expect(el.style.cursor).toBe("help");
  });

  it("keeps a custom label instead of overwriting it with the term", () => {
    render(<Term name="drift">drift detected</Term>);
    expect(screen.getByText("drift detected")).toBeTruthy();
  });

  it("shows nothing until asked", () => {
    render(<Term name="drift" />);
    expect(screen.queryByText(GLOSSARY.drift.short)).toBeNull();
  });

  it("opens on hover and closes when the pointer leaves", () => {
    render(<Term name="drift" />);
    fireEvent.mouseEnter(label("drift"));
    expect(screen.getByText(GLOSSARY.drift.short)).toBeTruthy();
    fireEvent.mouseLeave(label("drift"));
    expect(screen.queryByText(GLOSSARY.drift.short)).toBeNull();
  });

  it("toggles on click, so a tap works where there is no hover", () => {
    render(<Term name="drift" />);
    fireEvent.click(label("drift"));
    expect(screen.getByText(GLOSSARY.drift.short)).toBeTruthy();
    fireEvent.click(label("drift"));
    expect(screen.queryByText(GLOSSARY.drift.short)).toBeNull();
  });

  it("shows both the one-liner and the full explanation", () => {
    render(<Term name="contract" />);
    fireEvent.click(label("contract"));
    expect(screen.getByText(GLOSSARY.contract.short)).toBeTruthy();
    expect(screen.getByText(GLOSSARY.contract.long)).toBeTruthy();
  });

  it("closes as soon as the pointer leaves the trigger, even when it was opened by click", () => {
    // Characterisation: the tooltip is a SIBLING of the trigger, so crossing into it fires the
    // trigger's mouseleave and the panel unmounts before its own mouseenter can hold it open. That
    // makes the tooltip's link row reachable only by keyboard/tap, not by moving the mouse into it.
    render(<Term name="drift" />);
    fireEvent.click(label("drift"));
    expect(screen.getByText(GLOSSARY.drift.short)).toBeTruthy();
    fireEvent.mouseLeave(label("drift"));
    expect(screen.queryByText(GLOSSARY.drift.short)).toBeNull();
  });

  it("keeps the tooltip open while the pointer is inside it", () => {
    render(<Term name="drift" />);
    fireEvent.click(label("drift"));
    const tip = screen.getByText(GLOSSARY.drift.short).parentElement!;
    fireEvent.mouseEnter(tip);
    expect(screen.getByText(GLOSSARY.drift.short)).toBeTruthy();
    fireEvent.mouseLeave(tip);
    expect(screen.queryByText(GLOSSARY.drift.short)).toBeNull();
  });

  it("offers the entry's links as real navigation targets", () => {
    render(<Term name="drift" />);
    fireEvent.click(label("drift"));
    const link = screen.getByText(/open board/);
    expect(link.getAttribute("href")).toBe("/operations");
  });

  it("renders no link row for an entry that has none", () => {
    render(<Term name="bypass" />);
    fireEvent.click(label("bypass"));
    expect(screen.queryByRole("link")).toBeNull();
  });
});
