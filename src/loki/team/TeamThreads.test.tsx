import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as api from "./api";
import { TeamThreads, better, latestMeasured, nameOk } from "./TeamThreads";

describe("team threads", () => {
  it("pure helpers: names, the better side, the newest measured version", () => {
    expect(nameOk("cursor")).toBe(true); expect(nameOk("Bad Name")).toBe(false); expect(nameOk("-x")).toBe(false);
    expect(better(0.8, 0.9, false)).toBe("b"); expect(better(0.4, 0.2, true)).toBe("b"); expect(better(null, 1, true)).toBe(""); expect(better(1, 1, true)).toBe("");
    expect(latestMeasured([{ n: 2, measured: false } as any, { n: 1, measured: true } as any])?.n).toBe(1);
  });
  it("with no threads it offers a fork; a fork makes the thread and opens it as its own team", async () => {
    let made = false;
    vi.spyOn(api, "threadList").mockImplementation(async () => (made ? [{ name: "cursor", head: "abc", engine: "cursor", team: "Demo--t-cursor" }] : []));
    vi.spyOn(api, "threadFork").mockImplementation(async () => { made = true; return { ok: true, thread: { name: "cursor", llm_left: 2 } } as any; });
    vi.spyOn(api, "threadOpen").mockResolvedValue({ ok: true, team: "Demo--t-cursor" } as any);
    const onOpen = vi.fn(); render(<TeamThreads team="Demo" onOpen={onOpen} />);
    fireEvent.click(await screen.findByTestId("thread-new")); fireEvent.change(screen.getByTestId("thread-name"), { target: { value: "cursor" } });
    fireEvent.click(screen.getByTestId("thread-engine-cursor")); fireEvent.click(screen.getByTestId("thread-make"));
    await waitFor(() => expect(api.threadFork).toHaveBeenCalledWith("Demo", "cursor", "cursor"));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("Demo--t-cursor"));
    fireEvent.click(await screen.findByTestId("thread-main")); expect(onOpen).toHaveBeenLastCalledWith("Demo");
  });
  it("a refused fork shows why", async () => {
    vi.spyOn(api, "threadList").mockResolvedValue([]); vi.spyOn(api, "threadFork").mockResolvedValue({ ok: false, error: "the team already has a thread called x" } as any);
    render(<TeamThreads team="Demo" onOpen={() => {}} />); fireEvent.click(await screen.findByTestId("thread-new")); fireEvent.change(screen.getByTestId("thread-name"), { target: { value: "x" } }); fireEvent.click(screen.getByTestId("thread-make"));
    expect((await screen.findByTestId("thread-error")).textContent).toContain("already has a thread");
  });
});
