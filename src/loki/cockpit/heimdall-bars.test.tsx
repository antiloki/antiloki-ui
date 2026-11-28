// THE BARS MEAN WHAT THEY SAY (operator 2026-09-22: "you should test those configurations if they mean what they
// are claiming"). Three things are load-bearing and were each wrong at some point today:
//   1. the bars are NOT always on screen — they open from the heimdall chip and close on Escape or a click away;
//   2. the super-bar's FASTER · BALANCED · PRECISER really writes both axes (it is a preset, not a label);
//   3. moving an axis by hand leaves the super-bar reading CUSTOM, not lying about a preset it is no longer on.
// The MODELS axis is proved on the serve side (cli::the_models_bar_moves_every_role_one_rung_and_stops_at_the_ends);
// what this file proves is that the control sends the stop the operator sees.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HeimdallBars, HeimdallChip, LinkBanner, SUPER_STOPS, type DialState } from "./agent-chat-pane";

const mid: DialState = { position: 1, context: 1, cost: 1 };

describe("the heimdall bars", () => {
  it("FASTER · BALANCED · PRECISER each write BOTH axes to the stops they name", () => {
    const seen: DialState[] = [];
    render(<HeimdallBars dial={mid} onChange={(d) => seen.push(d)} />);
    const sup = screen.getByLabelText("heimdall");
    fireEvent.keyDown(sup, { key: "ArrowLeft" });   // BALANCED → FASTER
    fireEvent.keyDown(sup, { key: "ArrowRight" });  // BALANCED → PRECISER
    expect(seen).toEqual([
      { position: 0, context: SUPER_STOPS[0].context, cost: SUPER_STOPS[0].cost },
      { position: 2, context: SUPER_STOPS[2].context, cost: SUPER_STOPS[2].cost },
    ]);
    // and the presets are the ones the labels promise: FASTER is MIN + CHEAPER, PRECISER is MAX + SMARTER
    expect([SUPER_STOPS[0].context, SUPER_STOPS[0].cost]).toEqual([0, 0]);
    expect([SUPER_STOPS[2].context, SUPER_STOPS[2].cost]).toEqual([2, 2]);
  });

  it("an axis moved by hand drops the super-bar to CUSTOM, and a stop that matches a preset picks it back up", () => {
    const seen: DialState[] = [];
    const { rerender } = render(<HeimdallBars dial={mid} onChange={(d) => seen.push(d)} />);
    fireEvent.click(screen.getByTestId("heimdall-advanced"));
    fireEvent.keyDown(screen.getByLabelText("effort"), { key: "ArrowRight" }); // BALANCED → SMARTER, context stays BALANCED
    expect(seen[0]).toEqual({ position: null, context: 1, cost: 2 });
    rerender(<HeimdallBars dial={seen[0]} onChange={(d) => seen.push(d)} />);
    expect(screen.getByLabelText("heimdall")).toHaveAttribute("aria-valuetext", "CUSTOM");
    fireEvent.keyDown(screen.getByLabelText("context"), { key: "ArrowRight" }); // now MAX + SMARTER = the PRECISER preset
    expect(seen[1]).toEqual({ position: 2, context: 2, cost: 2 });
  });

  it("each bar reads its own stop back to the operator", () => {
    render(<HeimdallBars dial={{ position: 0, context: 0, cost: 0 }} onChange={() => {}} />);
    expect(screen.getByLabelText("heimdall")).toHaveAttribute("aria-valuetext", "FASTER");
    fireEvent.click(screen.getByTestId("heimdall-advanced"));
    expect(screen.getByLabelText("context")).toHaveAttribute("aria-valuetext", "MIN");
    expect(screen.getByLabelText("effort")).toHaveAttribute("aria-valuetext", "CHEAPER");
    // the context axis reads MIN · BALANCED · MAX (2026-09-22: the middle is "balanced", not "scope")
    render(<HeimdallBars dial={{ position: 1, context: 1, cost: 1 }} onChange={() => {}} />);
    fireEvent.click(screen.getAllByTestId("heimdall-advanced")[1]);
    expect(screen.getAllByLabelText("context")[1]).toHaveAttribute("aria-valuetext", "BALANCED");
  });

  it("are not on screen until the heimdall WORD is clicked — and the menu carries the three states and QA", () => {
    const onMode = vi.fn(); const onQa = vi.fn();
    const onRoles = vi.fn(); const onSubagents = vi.fn();
    render(<HeimdallChip menu={{ dial: mid, onChange: () => {}, mode: "auto", onMode, qa: false, onQa, onRoles, subagents: true, onSubagents }}><span>⚡ heimdall</span></HeimdallChip>);
    expect(screen.queryByTestId("heimdall-bars")).toBeNull();       // the composer strip stays a strip
    fireEvent.click(screen.getByText("⚡ heimdall"));                 // the WORD opens it, not a little arrow
    expect(screen.getByTestId("heimdall-menu")).toBeTruthy();
    expect(screen.getByTestId("heimdall-bars")).toBeTruthy();
    // Heimdall itself is a switch; AUTO is a button beside it; QA and sub-agents are switches of the same menu
    expect(screen.getByTestId("heimdall-switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("heimdall-mode-auto")).toHaveAttribute("data-on", "1");
    expect(screen.getByTestId("heimdall-subagents")).toHaveAttribute("data-on", "1");
    fireEvent.click(screen.getByTestId("heimdall-mode-auto"));       // AUTO off = ON: the bars become the operator's
    expect(onMode).toHaveBeenCalledWith("on");
    fireEvent.click(screen.getByTestId("heimdall-switch"));          // the switch is heimdall itself
    expect(onMode).toHaveBeenCalledWith("off");
    fireEvent.click(screen.getByTestId("heimdall-subagents"));
    expect(onSubagents).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("heimdall-qa"));
    expect(onQa).toHaveBeenCalled();
    // THE BATON (2026-09-26): ON by default, unlike QA — QA spends a judge's call on every run, while ROLES only
    // decides which measured winner a job was going to route to anyway.
    expect(screen.getByTestId("heimdall-roles")).toHaveAttribute("data-on", "1");
    fireEvent.click(screen.getByTestId("heimdall-roles"));
    expect(onRoles).toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("heimdall-bars")).toBeNull();
  });

  it("on AUTO the effort bar still moves — and moving it takes the models back (Heimdall goes to ON)", () => {
    const onMode = vi.fn(); const onChange = vi.fn();
    render(<HeimdallChip menu={{ dial: mid, onChange, mode: "auto", onMode }}><span>⚡ heimdall</span></HeimdallChip>);
    fireEvent.click(screen.getByText("⚡ heimdall"));
    fireEvent.click(screen.getByTestId("heimdall-advanced"));
    fireEvent.keyDown(screen.getByLabelText("effort"), { key: "ArrowRight" });
    expect(onMode).toHaveBeenCalledWith("on");
    expect(onChange).toHaveBeenCalledWith({ position: null, context: 1, cost: 2 });
    // the context bar is the operator's in every mode — moving it does NOT change what Heimdall is doing
    onMode.mockClear();
    fireEvent.keyDown(screen.getByLabelText("context"), { key: "ArrowLeft" });
    expect(onMode).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith({ position: null, context: 0, cost: 1 });
  });

  it("closes on Escape — the popover is not a permanent fixture of the composer", () => {
    const onClose = vi.fn();
    render(<HeimdallBars dial={mid} onChange={() => {}} onClose={onClose} />);
    fireEvent.keyDown(screen.getByTestId("heimdall-bars"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

const Harness = ({ colors }: { colors?: any }) => (
  <HeimdallChip menu={{ dial: mid, onChange: () => {}, mode: "auto", onMode: () => {}, ...(colors ? { colors } : {}) }}><span>⚡ heimdall</span></HeimdallChip>
);
describe("the menu fits the screen and wears the agent's theme (2026-09-23)", () => {
  it("opens as a portal on the body — a narrow pane that clips its overflow cannot cut it", () => {
    const { container } = render(<Harness colors={{ accent: "#2ec9a0", track: "#222", knob: "#fff", panel: "#151f1b", border: "#233530", fg: "#e2efe9" }} />);
    fireEvent.click(screen.getByTestId("heimdall-open"));
    const menu = screen.getByTestId("heimdall-menu");
    expect(container.contains(menu)).toBe(false);      // not inside the pane's subtree…
    expect(document.body.contains(menu)).toBe(true);    // …it lives on the body
    expect(menu.style.position).toBe("fixed");
    expect(Number(menu.style.zIndex)).toBeGreaterThan(100);
    expect(menu.style.overflowY).toBe("auto");          // a short window scrolls it instead of cutting it
    expect(parseFloat(menu.style.left)).toBeGreaterThanOrEqual(8); // clamped inside the viewport
  });
  it("takes the pane theme's surface, not antiChat's", () => {
    render(<Harness colors={{ accent: "#2ec9a0", track: "#222", knob: "#fff", panel: "#151f1b", border: "#233530", fg: "#e2efe9" }} />);
    fireEvent.click(screen.getByTestId("heimdall-open"));
    const menu = screen.getByTestId("heimdall-menu");
    expect(menu.style.background).toBe("rgb(21, 31, 27)");
    expect(menu.style.color).toBe("rgb(226, 239, 233)");
    expect(menu.style.border).toContain("rgb(35, 53, 48)");
  });
  it("a click inside the menu does not close it — the portal is still 'inside'", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("heimdall-open"));
    fireEvent.mouseDown(screen.getByTestId("heimdall-menu"));
    expect(screen.queryByTestId("heimdall-menu")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("heimdall-menu")).toBeNull();
  });
});

describe("the chip's wrapper is not a second button (QA report A11Y-003, axe nested-interactive)", () => {
  it("the switch inside is the control; the wrapper carries no button role, no tab stop, no aria-expanded", () => {
    render(<HeimdallChip menu={{ dial: mid, onChange: () => {}, mode: "auto", onMode: () => {} }}><button role="switch" aria-checked="true" data-testid="inner-switch">⚡ heimdall</button></HeimdallChip>);
    const wrap = screen.getByTestId("heimdall-open");
    expect(wrap.getAttribute("role")).toBeNull();
    expect(wrap.getAttribute("tabindex")).toBeNull();
    expect(wrap.hasAttribute("aria-expanded")).toBe(false);
    // clicking the real control (what Enter and Space on it fire) still opens the menu, once - not toggled twice
    fireEvent.click(screen.getByTestId("inner-switch"));
    expect(screen.queryByTestId("heimdall-menu")).not.toBeNull();
    fireEvent.click(screen.getByTestId("inner-switch"));
    expect(screen.queryByTestId("heimdall-menu")).toBeNull();
  });
});

describe("the link banner reassures (QA report BUG-007)", () => {
  it("says the work is still on this machine while antiloki is not answering, and nothing when the link is up", () => {
    const { rerender, container } = render(<LinkBanner link="down" />);
    const text = screen.getByTestId("agent-link").textContent ?? "";
    expect(text).toContain("antiloki is not answering — reconnecting");
    expect(text).toContain("your work is still on this machine");
    rerender(<LinkBanner link="up" />);
    expect(container.querySelector("[data-testid=agent-link]")).toBeNull();
  });
});
