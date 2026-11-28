import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as client from "@/loki/api/client";
import { ClosedAvatar, nameOfRow, oneState, summary } from "./ClosedAvatar";

const row = (state: any, id = 1): any => ({ pane_id: id, name: `a${id}`, role: "builder", kind: "claude", state });
describe("the one avatar", () => {
  it("shows the busiest state: a gate first, then waiting, working, idle, asleep; nothing when nothing runs", () => {
    expect(oneState([row("work")], 1)).toBe("wait"); expect(oneState([row("wait"), row("work", 2)], 0)).toBe("wait"); expect(oneState([row("sleep"), row("work", 2)], 0)).toBe("work");
    expect(oneState([row("idle")], 0)).toBe("idle"); expect(oneState([row("sleep")], 0)).toBe("sleep"); expect(oneState([], 0)).toBeNull();
  });
  it("draws nothing until antiloki answers; one a. mark, a click lists the agents, a drag moves the window, ✕ closes the icon only", async () => {
    const get = vi.spyOn(client, "apiGet").mockRejectedValueOnce(new Error("not yet")); vi.spyOn(client, "apiPost").mockResolvedValue({ runs: [] } as any);
    const a = render(<ClosedAvatar pollMs={100000} />); await waitFor(() => expect(get).toHaveBeenCalled()); expect(a.container.textContent).toBe(""); a.unmount();
    get.mockResolvedValue({ enabled: true, minutes: 30, agents: [row("work"), row("sleep", 2)], live: 1, asleep: 1 } as any);
    const main = { show: vi.fn(), unminimize: vi.fn(), setFocus: vi.fn() }; const mine = { startDragging: vi.fn(), hide: vi.fn() };
    (window as any).__TAURI__ = { window: { getCurrentWindow: () => mine, Window: { getByLabel: async () => main } } };
    render(<ClosedAvatar pollMs={100000} />); expect((await screen.findAllByTestId("closed-mark")).length).toBe(1); const face = screen.getByTestId("closed-avatar-face"); expect(face.textContent).toBe("a.");
    fireEvent.pointerDown(face, { button: 0, screenX: 0, screenY: 0 }); fireEvent.pointerMove(face, { screenX: 40, screenY: 10 }); fireEvent.click(face); await waitFor(() => expect(mine.startDragging).toHaveBeenCalled()); expect(screen.queryByTestId("closed-avatar-list")).toBeNull();
    fireEvent.pointerDown(face, { button: 0, screenX: 0, screenY: 0 }); fireEvent.pointerUp(face); fireEvent.click(face);
    expect(screen.getByTestId("closed-avatar-list").textContent).toContain("a1"); expect(screen.getByTestId("closed-avatar-quiet").textContent).toContain("1 more agent"); expect(screen.getByTestId("closed-avatar-head").textContent).toContain("1 working");
    fireEvent.click(screen.getByTestId("closed-avatar-open")); await waitFor(() => expect(main.show).toHaveBeenCalled()); expect(main.setFocus).toHaveBeenCalled();
    mine.hide.mockClear(); fireEvent.click(screen.getByTestId("closed-mark-close")); await waitFor(() => expect(mine.hide).toHaveBeenCalled()); expect(screen.queryByTestId("closed-avatar-list")).toBeNull();
    delete (window as any).__TAURI__;
  });
  it("keeps the mark where it is when the window changes size", async () => { const { keepCorner } = await import("./desktop-mark"); expect(keepCorner(100, 200, 80, 80, 300, 400)).toEqual({ x: 0, y: 0 }); expect(keepCorner(900, 700, 80, 80, 300, 400)).toEqual({ x: 680, y: 380 }); });
});

describe("the list is short and plain", () => {
  it("names an agent by its name or role, never a bare pane number, and sums the state in one line", () => {
    expect(nameOfRow({ pane_id: 7, name: "", role: "", kind: "", state: "idle" } as any)).toBe("Agent"); expect(nameOfRow({ pane_id: 7, name: "", role: "writer", kind: "", state: "idle" } as any)).toBe("Writer"); expect(nameOfRow(row("work"))).toBe("a1");
    expect(summary([row("work"), row("work", 2), row("wait", 3)], 1)).toBe("2 working · 1 waiting · 1 to decide"); expect(summary([row("idle")], 0)).toBe("all quiet");
  });
});
