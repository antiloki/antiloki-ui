// THE COMPOSER IS A NAMED FIELD AND TELLS YOU WHY NOTHING HAPPENED (QA report A11Y-001 + BUG-002, 2026-10-06).
// The ask box is a contentEditable role="textbox"; axe's aria-input-field-name failed it because it had no name. And an empty or blocked send
// returned in silence - the hint is the one line that says why.
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MentionInput } from "./mention-input";

const props = () => ({
  value: "", onChange: () => {}, onEnter: () => {}, editorRef: { current: null } as React.MutableRefObject<HTMLDivElement | null>,
  refs: [], refKey: (r: any) => String(r), trayLabel: (r: any) => String(r), sessionRefables: [],
});

describe("MentionInput", () => {
  it("has an accessible name: the placeholder's first sentence by default", () => {
    render(<MentionInput {...props()} placeholder="Message antiloki…  Heimdall routes it first (@ context · # widget · ! episode)" />);
    expect(screen.getByRole("textbox", { name: "Message antiloki…" })).toBeTruthy();
  });
  it("takes an explicit name, and falls back to 'Message' with no placeholder", () => {
    const { unmount } = render(<MentionInput {...props()} ariaLabel="Ask the agent" placeholder="anything" />);
    expect(screen.getByRole("textbox", { name: "Ask the agent" })).toBeTruthy();
    unmount();
    render(<MentionInput {...props()} />);
    expect(screen.getByRole("textbox", { name: "Message" })).toBeTruthy();
  });
  it("shows the hint as a status line above the field, and nothing when there is none", () => {
    const { rerender } = render(<MentionInput {...props()} hint={null} />);
    expect(screen.queryByTestId("composer-hint")).toBeNull();
    rerender(<MentionInput {...props()} hint="Write something first — an empty message is not sent." />);
    const h = screen.getByTestId("composer-hint");
    expect(h.getAttribute("role")).toBe("status");
    expect(h.textContent).toContain("empty message is not sent");
  });

  it("draws the placeholder in the field's own grid cell, so it wraps at the field's width and the field grows to it (operator 2026-10-11)", () => {
    render(<MentionInput {...props()} placeholder="Message antiloki…  Heimdall routes it first (@ context · # widget · ! episode)" />);
    const ph = screen.getByTestId("composer-placeholder"), field = screen.getByRole("textbox");
    expect(ph.style.position).not.toBe("absolute");           // an absolute overlay has no right edge to wrap against and no height to give the field
    expect(ph.style.gridArea).toBe(field.style.gridArea);      // the same cell: the row is as tall as the taller of the two
    expect(ph.style.whiteSpace).toBe("pre-wrap"); expect(ph.style.minWidth).toBe("0px");
  });
});
