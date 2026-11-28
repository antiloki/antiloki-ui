// @vitest-environment jsdom
import * as React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const cowork = vi.hoisted(() => ({ listEngines: vi.fn(async () => [{ key: "claude-code", installed: false }]), localModels: vi.fn(async () => ({ reachable: true, base: "", models: [{ tag: "qwen3:4b" }] })) }));
vi.mock("../cowork/api", () => cowork);
import { SeatField, seatOptions } from "./SeatField";

afterEach(cleanup);
describe("a model node's seat", () => {
  it("offers only what this machine has", () => {
    expect(seatOptions(false, ["a:1"]).map((o) => o.value)).toEqual(["local:a:1"]);
    expect(seatOptions(true, []).map((o) => o.value)).toEqual(["claude-code:haiku", "claude-code:sonnet", "claude-code:opus"]);
  });
  it("is picked from a list, keeps a seat the list does not know, and can still be typed", async () => {
    const change = vi.fn(); const { rerender } = render(<SeatField value="endpoint:lfm3" onChange={change} style={{}} />);
    await waitFor(() => expect(screen.getByText("qwen3:4b")).toBeTruthy()); expect(screen.queryByText("haiku")).toBeNull();
    const box = screen.getByTestId("ins-llm-seat") as HTMLSelectElement; expect(box.value).toBe("endpoint:lfm3");
    fireEvent.change(box, { target: { value: "local:qwen3:4b" } }); expect(change).toHaveBeenLastCalledWith("local:qwen3:4b");
    rerender(<SeatField value="endpoint:lfm3" onChange={change} style={{}} />);
    fireEvent.change(screen.getByTestId("ins-llm-seat"), { target: { value: "__other__" } });
    fireEvent.change(screen.getByTestId("ins-llm-seat"), { target: { value: "endpoint:mine" } }); expect(change).toHaveBeenLastCalledWith("endpoint:mine");
  });
});
