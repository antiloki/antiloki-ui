// The Heimdall flag governs which MODEL every AI call of a surface uses, so it spends money. The
// behaviours that matter: it must degrade to "global" on a BE that lacks the action (never a
// broken button), it must not double-dispatch, and a refused write must not leave the label
// claiming a mode the substrate did not accept.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiPost = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiPost: (...a: any[]) => apiPost(...a) }));

import { HeimdallFlag } from "./HeimdallFlag";

const calls = (op: string) => apiPost.mock.calls.filter((c) => c[1]?.input?.op === op);
beforeEach(() => { apiPost.mockReset(); apiPost.mockResolvedValue({ ok: true, mode: "default" }); });

describe("reading the current mode", () => {
  it("asks for THIS surface's mode on mount", async () => {
    render(<HeimdallFlag template="interviewer-chat" />);
    await waitFor(() => expect(calls("get")).toHaveLength(1));
    expect(apiPost.mock.calls[0][1]).toEqual({
      action_name: "system.heimdall.mode",
      input: { op: "get", template_base: "interviewer-chat" },
    });
  });

  it("renders the mode the substrate reports", async () => {
    apiPost.mockResolvedValue({ ok: true, mode: "rank1" });
    render(<HeimdallFlag template="t" />);
    expect(await screen.findByText("① heimdall · rank-1")).toBeTruthy();
  });

  it("stays at global on a BE that does not have the action", async () => {
    // An older BE must leave a working, honest button — not a broken one.
    apiPost.mockRejectedValue(new Error("unknown action"));
    render(<HeimdallFlag template="t" />);
    expect(await screen.findByText("⚡ heimdall · global")).toBeTruthy();
  });

  it("stays at global when the action answers not-ok", async () => {
    apiPost.mockResolvedValue({ ok: false });
    render(<HeimdallFlag template="t" />);
    expect(await screen.findByText("⚡ heimdall · global")).toBeTruthy();
  });

  it("unwraps the dispatch envelope", async () => {
    apiPost.mockResolvedValue({ result: { result: { ok: true, mode: "train" } } });
    render(<HeimdallFlag template="t" />);
    expect(await screen.findByText("⚡ heimdall · training")).toBeTruthy();
  });

  it("re-reads when the surface changes", async () => {
    const { rerender } = render(<HeimdallFlag template="a" />);
    await waitFor(() => expect(calls("get")).toHaveLength(1));
    rerender(<HeimdallFlag template="b" />);
    await waitFor(() => expect(calls("get")).toHaveLength(2));
    expect(calls("get")[1][1].input.template_base).toBe("b");
  });
});

describe("cycling", () => {
  it("goes global → rank-1 → training → global", async () => {
    apiPost.mockImplementation(async (_u: string, body: any) =>
      body.input.op === "get" ? { ok: true, mode: "default" } : { ok: true, mode: body.input.mode });

    render(<HeimdallFlag template="t" />);
    const btn = await screen.findByRole("button");

    fireEvent.click(btn);
    expect(await screen.findByText("① heimdall · rank-1")).toBeTruthy();
    fireEvent.click(btn);
    expect(await screen.findByText("⚡ heimdall · training")).toBeTruthy();
    fireEvent.click(btn);
    expect(await screen.findByText("⚡ heimdall · global")).toBeTruthy();
  });

  it("sends the NEXT mode for this template", async () => {
    render(<HeimdallFlag template="interviewer-chat" />);
    fireEvent.click(await screen.findByRole("button"));
    await waitFor(() => expect(calls("set")).toHaveLength(1));
    expect(calls("set")[0][1].input).toEqual({ op: "set", template_base: "interviewer-chat", mode: "rank1" });
  });

  it("ignores a second click while the write is in flight", async () => {
    let release!: (v: any) => void;
    apiPost.mockImplementation(async (_u: string, body: any) =>
      body.input.op === "get" ? { ok: true, mode: "default" } : new Promise((r) => { release = r; }));

    render(<HeimdallFlag template="t" />);
    const btn = await screen.findByRole("button");
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(calls("set")).toHaveLength(1);
    release({ ok: true, mode: "rank1" });
    await screen.findByText("① heimdall · rank-1");
  });

  it("shows a busy marker while writing", async () => {
    apiPost.mockImplementation(async (_u: string, body: any) =>
      body.input.op === "get" ? { ok: true, mode: "default" } : new Promise(() => {}));
    render(<HeimdallFlag template="t" />);
    fireEvent.click(await screen.findByRole("button"));
    expect(await screen.findByText("…")).toBeTruthy();
  });

  it("KEEPS the current mode when the write throws — the label must not lie", async () => {
    apiPost.mockImplementation(async (_u: string, body: any) => {
      if (body.input.op === "get") return { ok: true, mode: "rank1" };
      throw new Error("refused");
    });
    render(<HeimdallFlag template="t" />);
    const btn = await screen.findByRole("button");
    await screen.findByText("① heimdall · rank-1");
    fireEvent.click(btn);
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByText("① heimdall · rank-1")).toBeTruthy();
  });

  it("explains the cost of each mode in its tooltip", async () => {
    render(<HeimdallFlag template="t" />);
    const btn = await screen.findByRole("button");
    expect(btn.title).toContain("global cooking switch");
  });
});
