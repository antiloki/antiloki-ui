// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ShortcutsPopover } from "./ShortcutsPopover";
import { clearChord, resolve, setChord, type ActionId, type Overrides } from "./shortcuts";

afterEach(() => cleanup());

function Harness({ start = {} as Overrides, spy = {} as { last?: Overrides } }) {
  const [ov, setOv] = React.useState<Overrides>(start);
  spy.last = ov;
  return <ShortcutsPopover bindings={resolve(ov)} overrides={ov}
    onSet={(id: ActionId, c: string, take?: boolean) => { const r = setChord(ov, id, c, take); if (r.ok) setOv(r.overrides); return r; }}
    onClear={(id) => setOv(clearChord(ov, id))} onReset={(id) => { const n = { ...ov }; delete n[id]; setOv(n); }} onResetAll={() => setOv({})} onClose={() => {}} />;
}
const press = (id: string, init: KeyboardEventInit) => fireEvent.keyDown(screen.getByTestId(`shortcut-${id}`), init);

describe("the shortcuts editor", () => {
  it("lists every action with its chord", () => {
    render(<Harness />);
    expect(screen.getByTestId("shortcut-pane.close").textContent).toBe("W"); expect(screen.getByTestId("shortcut-move.left").textContent).toBe("Shift+H"); expect(screen.getByTestId("shortcut-pane.terminal").textContent).toBe("T");
  });
  it("click, press keys, and the action has the new chord; the old default is gone from it", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("shortcut-pane.close")); expect(screen.getByTestId("shortcut-pane.close").textContent).toBe("press keys…");
    press("pane.close", { code: "KeyX", key: "x" });
    expect(screen.getByTestId("shortcut-pane.close").textContent).toBe("X");
  });
  it("a lone modifier keeps waiting; Escape leaves it as it was; Backspace clears it", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("shortcut-pane.close")); press("pane.close", { code: "ShiftLeft", key: "Shift", shiftKey: true });
    expect(screen.getByTestId("shortcut-pane.close").textContent).toBe("press keys…");
    press("pane.close", { code: "Escape", key: "Escape" }); expect(screen.getByTestId("shortcut-pane.close").textContent).toBe("W");
    fireEvent.click(screen.getByTestId("shortcut-pane.close")); press("pane.close", { code: "Backspace", key: "Backspace" }); expect(screen.getByTestId("shortcut-pane.close").textContent).toBe("none");
  });
  it("a chord that is not allowed, or one another action holds, is refused with the reason, and can be taken", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("shortcut-pane.close")); press("pane.close", { code: "KeyC", key: "c", ctrlKey: true });
    expect(screen.getByTestId("shortcut-problem").textContent).toMatch(/plain key/); expect(screen.getByTestId("shortcut-pane.close").textContent).toBe("press keys…");
    press("pane.close", { code: "KeyZ", key: "z" });
    expect(screen.getByTestId("shortcut-problem").textContent).toContain("zoom this pane already uses Z");
    fireEvent.click(screen.getByTestId("shortcut-take"));
    expect(screen.getByTestId("shortcut-pane.close").textContent).toBe("Z"); expect(screen.getByTestId("shortcut-pane.zoom").textContent).toBe("none");
  });
  it("one action resets to its default, and restore-all puts everything back", () => {
    render(<Harness start={{ "pane.close": "X", "pane.zoom": "" }} />);
    expect(screen.getByTestId("shortcut-pane.close").textContent).toBe("X");
    fireEvent.click(screen.getByLabelText("reset close this pane")); expect(screen.getByTestId("shortcut-pane.close").textContent).toBe("W");
    expect(screen.getByTestId("shortcut-pane.zoom").textContent).toBe("none");
    fireEvent.click(screen.getByTestId("shortcuts-reset-all")); expect(screen.getByTestId("shortcut-pane.zoom").textContent).toBe("Z");
    expect((screen.getByTestId("shortcuts-reset-all") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the leader key row", () => {
  it("shows the leader, and a new one is recorded or refused with the reason", () => {
    const got: string[] = []; render(<ShortcutsPopover leader="Ctrl+Space" onLeader={(c) => { got.push(c); return c === "Ctrl+Space" || c === "Ctrl+Alt+K" ? null : "the leader needs Ctrl, Alt or Super with it"; }} bindings={resolve({})} overrides={{}} onSet={() => ({ ok: false, error: "" })} onClear={() => {}} onReset={() => {}} onResetAll={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId("leader-chord").textContent).toBe("Ctrl+Space"); fireEvent.click(screen.getByTestId("leader-chord")); fireEvent.keyDown(screen.getByTestId("leader-chord"), { code: "KeyK", key: "k" }); expect(screen.getByTestId("leader-problem").textContent).toContain("Ctrl, Alt or Super");
    fireEvent.keyDown(screen.getByTestId("leader-chord"), { code: "KeyK", key: "k", ctrlKey: true, altKey: true }); expect(screen.queryByTestId("leader-problem")).toBeNull(); expect(got).toEqual(["K", "Ctrl+Alt+K"]);
  });
});
