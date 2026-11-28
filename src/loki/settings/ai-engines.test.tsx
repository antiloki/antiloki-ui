// @vitest-environment jsdom
// THE SEATS SCREEN (2026-09-28): the command that repairs a seat is shown, never run. (The per-tier AiEnginesPicker tests that
// lived here went with the dead component, 2026-10-01 - nothing but this file rendered it.)
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { seatFix, ModelSwitches } from "./ai-engines";

describe("the command that repairs a seat (operator: every missing piece shows the exact command)", () => {
  const row = (o: any) => ({ key: "grok", name: "Grok", binaries: ["grok"], binary: null, installed: false,
    signed_in: null, usable: false, metered_gateway: false, blocked: null, install: "npm i -g @xai-official/grok", signin: "grok login", ...o });
  it("not installed → the install line", () => {
    expect(seatFix(row({}))).toBe("npm i -g @xai-official/grok");
  });
  it("installed but not signed in → the sign-in line, which is the whole point", () => {
    expect(seatFix(row({ installed: true, binary: "grok", signed_in: false }))).toBe("grok login");
  });
  it("a working seat needs no repair, and an older serve that sends neither says nothing", () => {
    expect(seatFix(row({ installed: true, binary: "grok", signed_in: true, usable: true }))).toBe("");
    expect(seatFix({ ...row({ installed: true, signed_in: false }), install: undefined, signin: undefined } as any)).toBe("");
  });
});

describe("a disable switch for every model of a seat (operator 2026-10-07: Heimdall must not choose disabled models)", () => {
  const models = [{ model: "composer-2.5", on: true }, { model: "cursor-grok-4.6-high", on: false }];
  it("an enabled model offers to disable itself, a disabled one is shown as off and offers to come back", () => {
    const onFlip = vi.fn();
    render(<ModelSwitches seat="cursor" models={models} busy={null} onFlip={onFlip} />);
    const on = screen.getByTestId("model-toggle-cursor-composer-2.5"), off = screen.getByTestId("model-toggle-cursor-cursor-grok-4.6-high");
    expect(on.getAttribute("data-on")).toBe("true"); expect(off.getAttribute("data-on")).toBe("false");
    expect(off.textContent).toContain("off");
    fireEvent.click(on); expect(onFlip).toHaveBeenCalledWith("cursor", "composer-2.5", false);
    fireEvent.click(off); expect(onFlip).toHaveBeenCalledWith("cursor", "cursor-grok-4.6-high", true);
  });
  it("a seat from an older serve (no model list) shows nothing", () => {
    const { container } = render(<ModelSwitches seat="grok" models={undefined} busy={null} onFlip={() => {}} />);
    expect(container.textContent).toBe("");
  });
  it("a model being saved cannot be clicked twice", () => {
    render(<ModelSwitches seat="cursor" models={models} busy="cursor:composer-2.5" onFlip={() => {}} />);
    expect((screen.getByTestId("model-toggle-cursor-composer-2.5") as HTMLButtonElement).disabled).toBe(true);
  });
});
