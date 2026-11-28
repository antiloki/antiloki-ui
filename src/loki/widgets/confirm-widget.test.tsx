// This widget is the gate between "the AI proposed something" and "the substrate did it". Two
// properties are safety-critical: a CRITICAL action must not be dispatchable without the operator
// typing its slug, and the commit-from-chat recovery must commit only the listed pending files —
// it resolves the drift law, it must never look like a way around it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const resolveDispatchError = vi.fn();
const fetchPendingFiles = vi.fn();
const commitPendingFiles = vi.fn();
vi.mock("@/loki/api/dispatch", () => ({
  resolveDispatchError: (...a: any[]) => resolveDispatchError(...a),
  fetchPendingFiles: (...a: any[]) => fetchPendingFiles(...a),
  commitPendingFiles: (...a: any[]) => commitPendingFiles(...a),
}));

import { ConfirmWidget } from "./confirm-widget";

const onConfirm = vi.fn();
const onRephrase = vi.fn();
const onWriteMyself = vi.fn();

const mount = (payload: any, ctx: any = {}) =>
  render(<ConfirmWidget payload={payload} ctx={{ turnId: 1, onConfirm, onRephrase, onWriteMyself, ...ctx }} />);

const action = (over: any = {}) => ({ action: "man.card.add", args: { title: "Ship it" }, ...over });

beforeEach(() => {
  onConfirm.mockReset(); onRephrase.mockReset(); onWriteMyself.mockReset();
  resolveDispatchError.mockReset(); fetchPendingFiles.mockReset(); commitPendingFiles.mockReset();
  resolveDispatchError.mockReturnValue({ message_md: "code drift blocks card.add", alternatives: [] });
});

describe("an ordinary proposal", () => {
  it("summarises what will run and waits for a single confirmation", () => {
    mount({ actions: [action()] });
    expect(screen.getByText("awaiting confirmation")).toBeTruthy();
    expect(screen.getByText("man.card.add — Ship it")).toBeTruthy();
    fireEvent.click(screen.getByText("go — confirm"));
    expect(onConfirm).toHaveBeenCalledWith(1, "go");
  });

  it("falls back to the slug, then to a bare action name, for the summary", () => {
    mount({ actions: [action({ args: { slug: "FEAT-X" } }), action({ action: "man.tick", args: {} })] });
    expect(screen.getByText("man.card.add — FEAT-X; man.tick")).toBeTruthy();
  });

  it("shows a dispatch in progress and refuses a second click", () => {
    mount({ actions: [action()] }, { confirming: true });
    const btn = screen.getByText("dispatching…") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does not dispatch when the turn has no id", () => {
    mount({ actions: [action()] }, { turnId: undefined });
    fireEvent.click(screen.getByText("go — confirm"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("renders with no actions at all rather than crashing the thread", () => {
    expect(() => mount({})).not.toThrow();
  });
});

describe("a CRITICAL proposal", () => {
  const critical = { actions: [action({ risk_tier: "critical", args: { slug: "FEAT-DANGER" } })] };

  it("demands the slug typed out — the one-click path is gone", () => {
    mount(critical);
    expect(screen.queryByText("go — confirm")).toBeNull();
    expect(screen.getByPlaceholderText("type the slug to confirm")).toBeTruthy();
  });

  it("keeps confirm disabled until something is typed", () => {
    mount(critical);
    const btn = screen.getByText("confirm") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("sends the typed text, trimmed, for the server to re-validate", () => {
    mount(critical);
    fireEvent.change(screen.getByPlaceholderText("type the slug to confirm"), { target: { value: "  FEAT-DANGER  " } });
    fireEvent.click(screen.getByText("confirm"));
    expect(onConfirm).toHaveBeenCalledWith(1, "FEAT-DANGER");
  });

  it("treats a mixed batch as critical if ANY action is", () => {
    mount({ actions: [action(), action({ risk_tier: "critical" })] });
    expect(screen.getByPlaceholderText("type the slug to confirm")).toBeTruthy();
  });
});

describe("the confidence badge", () => {
  it("reports how sure the AI was, as a percentage", () => {
    mount({ actions: [action()], confidence: 0.923 });
    expect(screen.getByText("AI sure · 92%")).toBeTruthy();
  });

  it("grades the tone across the three bands", () => {
    const colour = (c: number) => {
      const { unmount } = mount({ actions: [action()], confidence: c });
      const el = screen.getByText(/AI sure/) as HTMLElement;
      const v = el.style.color;
      unmount();
      return v;
    };
    expect(new Set([colour(0.95), colour(0.75), colour(0.4)]).size).toBe(3);
  });

  it("says nothing when the confidence is missing or not a number", () => {
    for (const c of [undefined, null, NaN, Infinity, "high"]) {
      const { unmount } = mount({ actions: [action()], confidence: c });
      expect(screen.queryByText(/AI sure/), String(c)).toBeNull();
      unmount();
    }
  });
});

describe("when the dispatch came back with an error", () => {
  const alts = [
    { key: "1", label: "commit the pending files", action_kind: "commit_pending", hint: "commit then retry" },
    { key: "2", label: "retry as-is", action_kind: "retry", hint: "" },
    { key: "3", label: "rephrase", action_kind: "rephrase", hint: "" },
    { key: "4", label: "I'll write it myself", action_kind: "write_myself", hint: "" },
    { key: "5", label: "got it", action_kind: "guidance", hint: "" },
  ];
  const withError = (over: any = {}) => {
    resolveDispatchError.mockReturnValue({ message_md: "code drift blocks card.add", alternatives: alts, ...over });
    return mount({ actions: [action()] }, { error: "GIT_DRIFT" });
  };

  it("replaces the confirm row with the resolutions for that error", () => {
    withError();
    expect(resolveDispatchError).toHaveBeenCalledWith("GIT_DRIFT");
    expect(screen.queryByText("awaiting confirmation")).toBeNull();
    expect(screen.getByText("code drift blocks card.add")).toBeTruthy();
    for (const a of alts) expect(screen.getByText(a.label), a.label).toBeTruthy();
  });

  it("routes retry, rephrase and write-myself to their handlers", () => {
    withError();
    fireEvent.click(screen.getByText("retry as-is"));
    expect(onConfirm).toHaveBeenCalledWith(1, "go");
    fireEvent.click(screen.getByText("rephrase"));
    expect(onRephrase).toHaveBeenCalled();
    fireEvent.click(screen.getByText("I'll write it myself"));
    expect(onWriteMyself).toHaveBeenCalled();
  });

  it("dismisses itself when the resolution is just guidance", () => {
    const { container } = withError();
    fireEvent.click(screen.getByText("got it"));
    expect(container).toBeEmptyDOMElement();
  });

  it("disables every resolution while a dispatch is already running", () => {
    resolveDispatchError.mockReturnValue({ message_md: "m", alternatives: alts });
    mount({ actions: [action()] }, { error: "E", confirming: true });
    for (const a of alts) expect((screen.getByText(a.label).closest("button") as HTMLButtonElement).disabled, a.label).toBe(true);
  });
});

describe("the commit-from-chat recovery", () => {
  const alts = [{ key: "1", label: "commit the pending files", action_kind: "commit_pending", hint: "" }];
  const openPanel = async () => {
    resolveDispatchError.mockReturnValue({ message_md: "drift", alternatives: alts });
    const r = mount({ actions: [action()] }, { error: "GIT_DRIFT" });
    fireEvent.click(screen.getByText("commit the pending files"));
    return r;
  };

  it("lists exactly the pending files it will commit, and prefills a message", async () => {
    fetchPendingFiles.mockResolvedValue({ files: ["src/a.ts", "src/b.ts"] });
    await openPanel();
    await waitFor(() => expect(screen.getByText("commits 2 files (only these)")).toBeTruthy());
    expect(screen.getByText("src/a.ts")).toBeTruthy();
    expect((screen.getByPlaceholderText("commit message") as HTMLTextAreaElement).value).toBeTruthy();
  });

  it("commits ONLY those files with the operator's message, then retries the original turn", async () => {
    fetchPendingFiles.mockResolvedValue({ files: ["src/a.ts"] });
    commitPendingFiles.mockResolvedValue({ ok: true });
    await openPanel();
    await waitFor(() => expect(screen.getByText("src/a.ts")).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText("commit message"), { target: { value: "  wip  " } });
    fireEvent.click(screen.getByText("commit & create card"));
    await waitFor(() => expect(commitPendingFiles).toHaveBeenCalledWith(["src/a.ts"], "wip"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(1, "go"));
  });

  it("surfaces a failed commit and does NOT retry the turn", async () => {
    fetchPendingFiles.mockResolvedValue({ files: ["src/a.ts"] });
    commitPendingFiles.mockResolvedValue({ ok: false, error: "hook rejected" });
    await openPanel();
    await waitFor(() => expect(screen.getByText("src/a.ts")).toBeTruthy());
    fireEvent.click(screen.getByText("commit & create card"));
    await waitFor(() => expect(screen.getByText("hook rejected")).toBeTruthy());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("refuses to commit nothing, and says to retry instead", async () => {
    fetchPendingFiles.mockResolvedValue({ files: [] });
    await openPanel();
    await waitFor(() => expect(screen.getByText(/no pending files/)).toBeTruthy());
    expect((screen.getByText("commit & create card") as HTMLButtonElement).disabled).toBe(true);
  });

  it("refuses to commit with an empty message", async () => {
    fetchPendingFiles.mockResolvedValue({ files: ["a.ts"] });
    await openPanel();
    await waitFor(() => expect(screen.getByText("a.ts")).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText("commit message"), { target: { value: "   " } });
    expect((screen.getByText("commit & create card") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("commit & create card"));
    expect(commitPendingFiles).not.toHaveBeenCalled();
  });

  it("explains when the pending-file list itself could not be read", async () => {
    fetchPendingFiles.mockRejectedValue(new Error("git unavailable"));
    await openPanel();
    await waitFor(() => expect(screen.getByText("git unavailable")).toBeTruthy());
  });

  it("can be cancelled back to the resolution list", async () => {
    fetchPendingFiles.mockResolvedValue({ files: ["a.ts"] });
    await openPanel();
    await waitFor(() => expect(screen.getByText("a.ts")).toBeTruthy());
    fireEvent.click(screen.getByText("cancel"));
    expect(screen.getByText("commit the pending files")).toBeTruthy();
    expect(commitPendingFiles).not.toHaveBeenCalled();
  });
});
