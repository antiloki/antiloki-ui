// The three chat modes are separate SURFACES sharing one composer strip. What must not break: the
// mode keys (agent/terminal/search are load-bearing for dispatch wiring — the labels are just
// branding), the terminal's sandbox controls (apply writes to the real repo), and the model picker's
// meaning: Heimdall = route per turn, a pinned model = pin the complexity tier for this turn.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const navigate = vi.fn();
let pathname = "/";
const sendTerminalCommand = vi.fn();
const sendTerminalSandbox = vi.fn();
const sendDeepSearch = vi.fn();
const fetchByokStatus = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate }),
  useLocation: () => ({ pathname }),
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}));
vi.mock("@/loki/components/Markdown", () => ({ Markdown: ({ text }: any) => <div data-testid="md">{text}</div> }));
vi.mock("@/loki/shell/dock", () => ({
  GlassBar: ({ children }: any) => <div>{children}</div>,
  DockGrip: () => <span data-testid="grip" />,
}));
vi.mock("@/loki/api/dispatch", () => ({
  sendTerminalCommand: (...a: any[]) => sendTerminalCommand(...a),
  sendTerminalSandbox: (...a: any[]) => sendTerminalSandbox(...a),
  sendDeepSearch: (...a: any[]) => sendDeepSearch(...a),
  fetchByokStatus: (...a: any[]) => fetchByokStatus(...a),
}));

import { ModeSwitch, ModelPicker, TerminalView, DeepSearchView, CHAT_MODELS } from "./chat-modes";
import { ViewSwitch, DESK_VIEWS, IDE_VIEWS } from "@/loki/shell/view-switch";

const setMode = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  pathname = "/";
  navigate.mockReset(); setMode.mockReset();
  sendTerminalCommand.mockReset().mockResolvedValue({ response: "hello back" });
  sendTerminalSandbox.mockReset().mockResolvedValue({});
  sendDeepSearch.mockReset().mockResolvedValue({ md: "# doc", title: "The doc" });
  fetchByokStatus.mockReset().mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe("ModeSwitch", () => {
  it("offers antiDesk and the antiIDE screen only — antiVibe, antiDocs, antiFlow and Threads are gone (2026-09-17)", () => {
    render(<ModeSwitch mode="agent" setMode={setMode} />);
    for (const label of ["antiDesk", "antiIDE"]) expect(screen.getByTitle(new RegExp(`^${label} tab`)), label).toBeTruthy();
    for (const label of ["antiVibe", "antiDocs", "antiFlow", "Threads"]) expect(screen.queryByTitle(new RegExp(`^${label} tab`)), label).toBeNull();
  });

  it("switches surface by its KEY, not its label", () => {
    render(<ModeSwitch mode="threads" setMode={setMode} />);
    fireEvent.click(screen.getByTitle(/^antiDesk tab/));
    expect(setMode).toHaveBeenCalledWith("agent");
  });

  it("ViewSwitch flips between the Blocks and Threads views of antiDesk", () => {
    const onChange = vi.fn();
    const { unmount } = render(<ViewSwitch view="blocks" options={DESK_VIEWS} onChange={onChange} />);
    expect(screen.getByTestId("view-switch")).toBeTruthy();
    fireEvent.click(screen.getByTitle("Threads view"));
    expect(onChange).toHaveBeenCalledWith("threads");
    unmount();
    // the same pill carries antiIDE's Code · Design
    render(<ViewSwitch view="code" options={IDE_VIEWS} onChange={onChange} />);
    fireEvent.click(screen.getByTitle("Design view"));
    expect(onChange).toHaveBeenCalledWith("design");
  });

  it("navigates instead of switching mode for the screen tabs", () => {
    render(<ModeSwitch mode="agent" setMode={setMode} />);
    fireEvent.click(screen.getByTitle(/^antiIDE tab/));
    expect(navigate).toHaveBeenCalledWith({ to: "/operations/atlas" });
    expect(setMode).not.toHaveBeenCalled();
  });

  it("defaults to the agent surface when no mode is given", () => {
    render(<ModeSwitch mode={undefined} setMode={setMode} />);
    expect(screen.getByTitle(/^antiDesk tab/).style.color).not.toBe(screen.getByTitle(/^antiIDE tab/).style.color);
  });

  it("reads the screen tabs as selected on their own routes", () => {
    for (const [path, label] of [
      ["/operations/atlas/file", "antiIDE"],
      ["/operations/design", "antiIDE"],
    ] as const) {
      pathname = path;
      const { unmount } = render(<ModeSwitch mode="threads" setMode={setMode} />);
      const selected = screen.getByTitle(new RegExp(`^${label} tab`));
      const other = screen.getByTitle(/^antiDesk tab/); // not selected: the mode is threads
      expect(selected.style.color, path).not.toBe(other.style.color);
      unmount();
    }
  });

  it("names each tab in the store, and the store closes on an outside click", () => {
    const { container } = render(<ModeSwitch mode="agent" setMode={setMode} />);
    fireEvent.click(screen.getByTitle(/tabs — what each one is/), { clientY: 10 });
    expect(screen.getByText("your tabs")).toBeTruthy();
    expect(screen.getByText(/Blocks view/)).toBeTruthy();

    const scrim = Array.from(container.querySelectorAll("div"))
      .find((d) => (d as HTMLElement).style.position === "fixed" && (d as HTMLElement).style.inset === "0px")!;
    fireEvent.click(scrim);
    expect(screen.queryByText("your tabs")).toBeNull();
  });

  it("opens the store away from the nearest screen edge", () => {
    Object.defineProperty(window, "innerHeight", { value: 800, writable: true, configurable: true });
    const panel = (c: HTMLElement) => Array.from(c.querySelectorAll("div")).find((d) => (d as HTMLElement).style.width === "264px") as HTMLElement;

    const low = render(<ModeSwitch mode="agent" setMode={setMode} />);
    fireEvent.click(screen.getByTitle(/tabs — what each one is/), { clientY: 700 });
    expect(panel(low.container).style.bottom).toBe("calc(100% + 8px)");
    low.unmount();

    const high = render(<ModeSwitch mode="agent" setMode={setMode} />);
    fireEvent.click(screen.getByTitle(/tabs — what each one is/), { clientY: 50 });
    expect(panel(high.container).style.top).toBe("calc(100% + 8px)");
  });
});

describe("ModelPicker", () => {
  const setModel = vi.fn();
  const open = () => fireEvent.click(screen.getByTitle(/Heimdall routes the model per turn/));

  beforeEach(() => setModel.mockReset());

  it("shows Heimdall when nothing is pinned", () => {
    render(<ModelPicker model={null} setModel={setModel} />);
    expect(screen.getByText(/⚡ Heimdall/)).toBeTruthy();
  });

  it("falls back to the curated list when the catalog cannot be read", async () => {
    render(<ModelPicker model={null} setModel={setModel} />);
    open();
    await waitFor(() => expect(screen.getByText(CHAT_MODELS[0].id)).toBeTruthy());
    fireEvent.click(screen.getByText(CHAT_MODELS[1].id));
    expect(setModel).toHaveBeenCalledWith(CHAT_MODELS[1].id);
  });

  it("groups the configured models by tier and explains what a tier MEANS", async () => {
    fetchByokStatus.mockResolvedValue({ models: {
      low: [{ model_id: "a/small", active: 1, failover_rank: 0, provider: "a" }],
      mid: [{ model_id: "a/mid", active: 1, failover_rank: 0, provider: "a" }],
      high: [
        { model_id: "a/big", active: 1, failover_rank: 0, provider: "a" },
        { model_id: "a/backup", active: 1, failover_rank: 1, provider: "a" },
      ],
    } });
    const { ModelPicker: Fresh } = await import("./chat-modes");
    render(<Fresh model={null} setModel={setModel} />);
    open();
    await waitFor(() => expect(screen.getByText(/low · simple/)).toBeTruthy());
    expect(screen.getByText(/mid · balanced/)).toBeTruthy();
    expect(screen.getByText(/high · complex/)).toBeTruthy();
    expect(screen.getAllByText("primary")).toHaveLength(3);   // one per tier
    expect(screen.getByText("fallback")).toBeTruthy();
  });

  it("hides inactive models and orders fallbacks after the primary", async () => {
    vi.resetModules();
    fetchByokStatus.mockResolvedValue({ models: { mid: [
      { model_id: "a/second", active: 1, failover_rank: 1, provider: "a" },
      { model_id: "a/off", active: 0, failover_rank: 0, provider: "a" },
      { model_id: "a/first", active: 1, failover_rank: 0, provider: "a" },
    ] } });
    const { ModelPicker: Fresh } = await import("./chat-modes");
    render(<Fresh model={null} setModel={setModel} />);
    open();
    await waitFor(() => expect(screen.getByText("a/first")).toBeTruthy());
    expect(screen.queryByText("a/off")).toBeNull();
    const rows = screen.getAllByRole("button").map((b) => b.textContent);
    expect(rows.findIndex((t) => t?.includes("a/first"))).toBeLessThan(rows.findIndex((t) => t?.includes("a/second")));
  });

  it("labels the pinned model with its tier and short name", async () => {
    vi.resetModules();
    fetchByokStatus.mockResolvedValue({ models: { high: [{ model_id: "vendor/big-model", active: 1, failover_rank: 0, provider: "v" }] } });
    const { ModelPicker: Fresh } = await import("./chat-modes");
    render(<Fresh model="vendor/big-model" setModel={setModel} />);
    await waitFor(() => expect(screen.getByText(/high · big-model/)).toBeTruthy());
  });

  it("goes back to Heimdall when the router row is chosen", async () => {
    render(<ModelPicker model={CHAT_MODELS[0].id} setModel={setModel} />);
    open();
    await waitFor(() => expect(screen.getByText(/routes this turn/)).toBeTruthy());
    fireEvent.click(screen.getByText(/routes this turn/));
    expect(setModel).toHaveBeenCalledWith(null);
  });

  it("links to Tagging, the loop that trains the router", () => {
    render(<ModelPicker model={null} setModel={setModel} />);
    expect(screen.getByTitle(/Tagging/).getAttribute("href")).toBe("/");
  });
});

describe("TerminalView", () => {
  const type = (v: string) => fireEvent.change(screen.getByPlaceholderText(/talk to the AI/), { target: { value: v } });
  const enter = () => fireEvent.keyDown(screen.getByPlaceholderText(/talk to the AI|running/), { key: "Enter" });

  it("runs a command and shows the AI's answer against it", async () => {
    render(<TerminalView mode="terminal" setMode={setMode} />);
    type("hello");
    enter();
    await waitFor(() => expect(screen.getByText("hello back")).toBeTruthy());
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("sends the running transcript so the AI has the session's context", async () => {
    render(<TerminalView mode="terminal" setMode={setMode} />);
    type("one"); enter();
    await waitFor(() => expect(screen.getByText("hello back")).toBeTruthy());
    type("two"); enter();
    await waitFor(() => expect(sendTerminalCommand).toHaveBeenCalledTimes(2));
    const history = sendTerminalCommand.mock.calls[1][1];
    expect(history).toEqual([{ role: "user", text: "one" }, { role: "assistant", text: "hello back" }]);
  });

  it("clears the transcript locally with `clear`, without calling the BE", async () => {
    render(<TerminalView mode="terminal" setMode={setMode} />);
    type("hello"); enter();
    await waitFor(() => expect(screen.getByText("hello back")).toBeTruthy());
    sendTerminalCommand.mockClear();
    type("clear"); enter();
    expect(screen.queryByText("hello back")).toBeNull();
    expect(sendTerminalCommand).not.toHaveBeenCalled();
  });

  it("ignores an empty command", () => {
    render(<TerminalView mode="terminal" setMode={setMode} />);
    type("   "); enter();
    expect(sendTerminalCommand).not.toHaveBeenCalled();
  });

  it("shows the error in the transcript rather than losing the turn", async () => {
    sendTerminalCommand.mockRejectedValue(new Error("provider down"));
    render(<TerminalView mode="terminal" setMode={setMode} />);
    type("hello"); enter();
    await waitFor(() => expect(screen.getByText("error: provider down")).toBeTruthy());
  });

  it("unwraps the response from either envelope, and says so when there is none", async () => {
    sendTerminalCommand.mockResolvedValue({ result: { response: "nested" } });
    const { unmount } = render(<TerminalView mode="terminal" setMode={setMode} />);
    type("a"); enter();
    await waitFor(() => expect(screen.getByText("nested")).toBeTruthy());
    unmount();

    sendTerminalCommand.mockResolvedValue({});
    render(<TerminalView mode="terminal" setMode={setMode} />);
    type("a"); enter();
    await waitFor(() => expect(screen.getByText("(no response)")).toBeTruthy());
  });

  it("sends the context switches, and only offers the sandbox once codebase is on", async () => {
    render(<TerminalView mode="terminal" setMode={setMode} />);
    expect(screen.queryByText("⊟ sandbox")).toBeNull();

    fireEvent.click(screen.getByText("codebase"));
    expect(screen.getByText("⊟ sandbox")).toBeTruthy();

    type("go"); enter();
    await waitFor(() => expect(sendTerminalCommand).toHaveBeenCalled());
    const [, , , ctx, sandbox, session] = sendTerminalCommand.mock.calls[0];
    expect(ctx).toEqual({ laws: true, memory: true, codebase: true });
    expect(sandbox).toEqual({ include_folders: [] });
    expect(String(session)).toMatch(/^term-/);
  });

  it("passes no sandbox or session while the codebase is off", async () => {
    render(<TerminalView mode="terminal" setMode={setMode} />);
    type("go"); enter();
    await waitFor(() => expect(sendTerminalCommand).toHaveBeenCalled());
    const [, , , , sandbox, session] = sendTerminalCommand.mock.calls[0];
    expect(sandbox).toBeUndefined();
    expect(session).toBeNull();
  });

  it("splits the include list into folders, dropping blanks", async () => {
    render(<TerminalView mode="terminal" setMode={setMode} />);
    fireEvent.click(screen.getByText("codebase"));
    fireEvent.change(screen.getByPlaceholderText(/folders the sandbox includes/), { target: { value: " src/a , , src/b " } });
    type("go"); enter();
    await waitFor(() => expect(sendTerminalCommand).toHaveBeenCalled());
    expect(sendTerminalCommand.mock.calls[0][4]).toEqual({ include_folders: ["src/a", "src/b"] });
  });

  describe("the sandbox controls", () => {
    const withSandbox = () => {
      render(<TerminalView mode="terminal" setMode={setMode} />);
      fireEvent.click(screen.getByText("codebase"));
    };

    it("reviews the diff, and says when there is nothing to review", async () => {
      sendTerminalSandbox.mockResolvedValue({ exists: true, patch: "diff --git a b" });
      withSandbox();
      fireEvent.click(screen.getByText("review"));
      await waitFor(() => expect(screen.getByText("diff --git a b")).toBeTruthy());

      sendTerminalSandbox.mockResolvedValue({ exists: true, patch: "" });
      fireEvent.click(screen.getByText("review"));
      await waitFor(() => expect(screen.getByText("(no changes in the sandbox)")).toBeTruthy());

      sendTerminalSandbox.mockResolvedValue({ exists: false });
      fireEvent.click(screen.getByText("review"));
      await waitFor(() => expect(screen.getByText(/no sandbox yet/)).toBeTruthy());
    });

    it("reports what apply actually did — never claims success on a refusal", async () => {
      sendTerminalSandbox.mockResolvedValue({ applied: true, count: 3 });
      withSandbox();
      fireEvent.click(screen.getByText("apply"));
      await waitFor(() => expect(screen.getByText("✓ applied 3 file(s) to the real repo")).toBeTruthy());

      sendTerminalSandbox.mockResolvedValue({ applied: false, reason: "dirty worktree" });
      fireEvent.click(screen.getByText("apply"));
      await waitFor(() => expect(screen.getByText("not applied — dirty worktree")).toBeTruthy());
    });

    it("confirms a discard, and says when there was nothing to discard", async () => {
      sendTerminalSandbox.mockResolvedValue({ removed: true });
      withSandbox();
      fireEvent.click(screen.getByText("discard"));
      await waitFor(() => expect(screen.getByText("✓ sandbox discarded")).toBeTruthy());

      sendTerminalSandbox.mockResolvedValue({ removed: false, reason: "no sandbox" });
      fireEvent.click(screen.getByText("discard"));
      await waitFor(() => expect(screen.getByText("no sandbox")).toBeTruthy());
    });

    it("shows a sandbox failure in the transcript", async () => {
      sendTerminalSandbox.mockRejectedValue(new Error("git locked"));
      withSandbox();
      fireEvent.click(screen.getByText("apply"));
      await waitFor(() => expect(screen.getByText("error: git locked")).toBeTruthy());
    });

    it("keeps every sandbox call on the SAME session id", async () => {
      withSandbox();
      fireEvent.click(screen.getByText("review"));
      await waitFor(() => expect(sendTerminalSandbox).toHaveBeenCalled());
      fireEvent.click(screen.getByText("discard"));
      await waitFor(() => expect(sendTerminalSandbox).toHaveBeenCalledTimes(2));
      expect(sendTerminalSandbox.mock.calls[0][1]).toBe(sendTerminalSandbox.mock.calls[1][1]);
    });
  });
});

describe("DeepSearchView", () => {
  const ask = (q: string) => {
    fireEvent.change(screen.getByPlaceholderText(/Research question/), { target: { value: q } });
    fireEvent.click(screen.getByText("Generate"));
  };

  it("explains itself before anything has been asked", () => {
    render(<DeepSearchView mode="search" setMode={setMode} />);
    expect(screen.getByText(/Pick your sources/)).toBeTruthy();
    expect(screen.queryByTestId("md")).toBeNull();
  });

  it("sends only the enabled sources", async () => {
    render(<DeepSearchView mode="search" setMode={setMode} />);
    ask("how does auth work?");
    await waitFor(() => expect(sendDeepSearch).toHaveBeenCalled());
    const [q, scopes] = sendDeepSearch.mock.calls[0];
    expect(q).toBe("how does auth work?");
    expect(scopes).toEqual(["codebase", "graphrag", "knowledge", "db"]);   // internet + memory default off
  });

  it("toggles a source on and off", async () => {
    render(<DeepSearchView mode="search" setMode={setMode} />);
    fireEvent.click(screen.getByTitle("web search"));
    fireEvent.click(screen.getByTitle("the atlas graph + files"));
    ask("q");
    await waitFor(() => expect(sendDeepSearch).toHaveBeenCalled());
    const scopes = sendDeepSearch.mock.calls[0][1];
    expect(scopes).toContain("internet");
    expect(scopes).not.toContain("codebase");
  });

  it("renders the returned document and clears the query", async () => {
    render(<DeepSearchView mode="search" setMode={setMode} />);
    ask("q");
    await waitFor(() => expect(screen.getByTestId("md").textContent).toBe("# doc"));
    expect((screen.getByPlaceholderText(/Research question/) as HTMLInputElement).value).toBe("");
  });

  it("says so rather than showing a blank page when the synthesizer returns nothing", async () => {
    sendDeepSearch.mockResolvedValue({ md: "", title: "t" });
    render(<DeepSearchView mode="search" setMode={setMode} />);
    ask("q");
    await waitFor(() => expect(screen.getByTestId("md").textContent).toContain("empty document"));
  });

  it("shows the failure as the document instead of losing the question", async () => {
    sendDeepSearch.mockRejectedValue(new Error("no sources"));
    render(<DeepSearchView mode="search" setMode={setMode} />);
    ask("why?");
    await waitFor(() => expect(screen.getByTestId("md").textContent).toContain("DeepSearch failed: no sources"));
  });

  it("refuses to generate from an empty question", () => {
    render(<DeepSearchView mode="search" setMode={setMode} />);
    fireEvent.change(screen.getByPlaceholderText(/Research question/), { target: { value: "   " } });
    fireEvent.click(screen.getByText("Generate"));
    expect(sendDeepSearch).not.toHaveBeenCalled();
  });

  it("offers the export buttons only once a document exists", async () => {
    render(<DeepSearchView mode="search" setMode={setMode} />);
    for (const l of ["Markdown", "HTML", "PDF"]) expect(screen.queryByText(l), l).toBeNull();
    ask("q");
    await waitFor(() => expect(screen.getByText("Markdown")).toBeTruthy());
    for (const l of ["Markdown", "HTML", "PDF"]) expect((screen.getByText(l) as HTMLButtonElement).disabled, l).toBe(false);
  });
});
