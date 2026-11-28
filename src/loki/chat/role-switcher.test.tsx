// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { RoleSwitcher, currentRoleKeyOf, roleLabelOf, roleTitleOf, shownRoleOf, workingLine } from "./role-switcher";

const role = (o: Partial<any> = {}) => ({ key: "backender", name: "Backender", about: "the data, the rules and the endpoints", domain: "backend", general: true, under: null, ...o }) as any;

describe("the role switcher", () => {
  it("says which of the two states it is in — routed, or yours", () => {
    // TWO STATES, NEVER THREE (operator 2026-09-26: "if the user chooses a role heimdall get off, until the user
    // turns it on again"). A "pinned but still routing" state would leave nobody able to say who is in charge.
    const { unmount } = render(<RoleSwitcher roles={[role()]} current={role()} auto onPick={vi.fn()} />);
    expect(screen.getByTestId("role-switcher").textContent).toContain("Backender · routed");
    unmount();
    render(<RoleSwitcher roles={[role()]} current={role()} auto={false} onPick={vi.fn()} />);
    expect(screen.getByTestId("role-switcher").textContent).toContain("Backender · yours");
  });

  // ROUTING OWNS THE ROLE WHILE IT IS ON (operator 2026-09-28: "if heimdall router is ON we shouldnt be able to
  // change the role"). This was live in both states until they said otherwise: the reasoning was that a control you
  // cannot touch is not a control. Theirs is the stronger argument — while Heimdall routes, the role is ITS answer
  // and changes on every ask, so a pick there is something the next message silently overrides.
  it("does not open while Heimdall is routing, and says where the switch is", () => {
    const onPick = vi.fn();
    render(<RoleSwitcher roles={[role(), role({ key: "tester", name: "Tester", about: "the suite" })]} current={role()} auto onPick={onPick} />);
    fireEvent.click(screen.getByTestId("role-switcher"));
    expect(screen.queryByTestId("role-switcher-menu")).toBeNull();
    expect(screen.getByTestId("role-switcher-locked").textContent).toContain("turn ⚡ off");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("opens the moment routing is off, and picking is then just picking", () => {
    const onPick = vi.fn();
    render(<RoleSwitcher roles={[role(), role({ key: "tester", name: "Tester", about: "the suite" })]} current={role()} auto={false} onPick={onPick} />);
    fireEvent.click(screen.getByTestId("role-switcher"));
    fireEvent.click(screen.getByTestId("role-option-tester"));
    // `takeover` is false here: routing was already off, so nothing is being taken over
    expect(onPick).toHaveBeenCalledWith("tester", false);
  });

  it("picking again when it is already yours is not another takeover", () => {
    const onPick = vi.fn();
    render(<RoleSwitcher roles={[role(), role({ key: "tester", name: "Tester", about: "the suite" })]} current={role()} auto={false} onPick={onPick} />);
    fireEvent.click(screen.getByTestId("role-switcher"));
    fireEvent.click(screen.getByTestId("role-option-tester"));
    expect(onPick).toHaveBeenCalledWith("tester", false);
  });

  it("says who chose and on what, so the router never changes the worker silently", () => {
    expect(roleTitleOf(role(), true, "backend work → Backender · 34 samples")).toContain("Heimdall chose this role");
    expect(roleTitleOf(role(), true, "backend work → Backender · 34 samples")).toContain("34 samples");
    // with no reason yet it still says who is in charge and how to take over
    // the routed tooltip explains how to take over…
    expect(roleTitleOf(role(), true, null)).toContain("becomes yours");
    // …and the `yours` one says what did NOT turn off: Heimdall still picks the merge
    expect(roleTitleOf(role(), false, null)).toContain("Heimdall still picks the best");
  });

  it("has something honest to say before any role is known", () => {
    expect(roleLabelOf(null, true)).toBe("role · routed");
    expect(roleLabelOf(null, false)).toBe("pick a role");
    expect(roleTitleOf(null, false, null)).toContain("no role is set");
  });
});

// P7 — WHO IS WORKING, IN THE HEADER (operator 2026-09-26). The chameleon changes form silently unless you open
// the run log; while work runs the header answers it without a click.
describe("the working line", () => {
  const r = { key: "frontender", name: "Frontender", about: "the screens", domain: "frontend", general: true, under: null } as any;
  it("names the role and the merge doing the work", () => {
    expect(workingLine(r, { brain: "Claude", hands: "DeepSeek" }, true)).toBe("Frontender · Claude × DeepSeek");
  });
  it("says nothing at all when nothing is running", () => {
    // a header that shows a worker while idle implies work is happening — the one thing it must not do
    expect(workingLine(r, { brain: "Claude", hands: "DeepSeek" }, false)).toBeNull();
  });
  it("prints the side it knows rather than an em-dash pretending to be a pair", () => {
    expect(workingLine(r, { brain: "Claude", hands: null }, true)).toBe("Frontender · Claude");
    expect(workingLine(r, { brain: "raw", hands: "-" }, true)).toBe("Frontender", );
    expect(workingLine(r, null, true)).toBe("Frontender");
  });
  it("still answers before the role is known", () => {
    expect(workingLine(null, { brain: "Claude", hands: "DeepSeek" }, true)).toBe("routing · Claude × DeepSeek");
  });

  // operator 2026-09-29: the composer chip said Backender while the operator was working on a frontend - it was fed the role of the last
  // goal run, the header chip the live one. One rule now, for both.
  it("shows the role the serve named most recently while routing is on, and never moves a pinned one", () => {
    const mk = (key: string, name: string) => ({ key, name, about: "x" }) as any;
    const backender = mk("backend", "Backender"), frontender = mk("frontend", "Frontender");
    const all = [backender, frontender];
    expect(shownRoleOf(true, "frontend", all, backender)?.name).toBe("Frontender");      // live wins over the last goal run's role
    expect(shownRoleOf(true, null, all, backender)?.name).toBe("Backender");             // nothing live yet: the last known role
    expect(shownRoleOf(true, "gone", all, backender)?.name).toBe("Backender");           // a live role this list does not know
    expect(shownRoleOf(false, "frontend", all, backender)?.name).toBe("Backender");      // pinned: the operator's choice, nothing moves it
    expect(shownRoleOf(true, "frontend", all, null)?.name).toBe("Frontender");
  });

  // the stored pin used to beat the routed role even with routing ON, so a stale pick read "routed" for ever
  it("lets the routed role win while routing is on, and the pin only while it is off", () => {
    expect(currentRoleKeyOf(true, "tester", "frontend")).toBe("frontend");   // routing on: Heimdall's newest pick, not the leftover pin
    expect(currentRoleKeyOf(true, "tester", null)).toBe("tester");           // nothing routed yet: the last known
    expect(currentRoleKeyOf(false, "tester", "frontend")).toBe("tester");    // routing off: the operator's pick, nothing moves it
    expect(currentRoleKeyOf(false, null, "frontend")).toBe("frontend");
    expect(currentRoleKeyOf(true, null, null)).toBeNull();
  });
});
