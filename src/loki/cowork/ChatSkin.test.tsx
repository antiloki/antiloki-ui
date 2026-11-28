import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const turns = [
  { role: "user", t: "2026-11-21T10:00:00Z", text: "fix the login bug", tools: [] },
  { role: "assistant", t: "2026-11-21T10:00:02Z", text: "Looking at it.", tools: [{ name: "Read", brief: "src/login.ts", done: true, ok: true }, { name: "Bash", brief: "npm test", done: true, ok: false }], model: "claude-sonnet-5-5", tokens_out: 25 },
];
const sent: string[] = [];
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ptyTranscript: vi.fn(async () => ({ known: true, turns })), localModels: vi.fn(async () => ({ reachable: true, base: "http://127.0.0.1:11434", models: [{ id: "local:qwen3:4b", tag: "qwen3:4b", label: "qwen3:4b", size_gb: 2.5, params: "4b" }, { id: "local:big:70b", tag: "big:70b", label: "big", size_gb: 40, params: "70b", unavailable: "needs a newer Ollama" }] })), sendToAgent: vi.fn(async (_id: number, text: string) => { sent.push(text); return { ok: true }; }) }));
vi.mock("@/loki/components/Markdown", () => ({ Markdown: ({ text }: { text: string }) => <span>{text}</span> }));
import { ChatSkin, Reasoning } from "./ChatSkin";
import { parseAppearance, DEFAULT_APPEARANCE } from "./appearance";
import { parseLayout } from "./layout";

beforeEach(() => { cleanup(); sent.length = 0; Element.prototype.scrollIntoView = vi.fn(); });

describe("the chat skin of an agent pane", () => {
  it("a long message folds the buttons into two rows, and sending unfolds them", async () => {
    const h = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "scrollHeight"); Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", { configurable: true, get(this: HTMLTextAreaElement) { return this.value.length > 20 ? 400 : 20; } });
    render(<ChatSkin paneId={7} who="Claude" />);
    const box = screen.getByTestId("chat-input") as HTMLTextAreaElement; const row = () => screen.getByTestId("chat-buttons").getAttribute("data-rows");
    expect(row()).toBe("1"); fireEvent.change(box, { target: { value: "a long message that goes on and on" } }); expect(row()).toBe("2"); expect(box.style.height).toBe("140px");
    fireEvent.change(box, { target: { value: "" } }); expect(row()).toBe("1");
    if (h) Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", h); else delete (HTMLTextAreaElement.prototype as any).scrollHeight;
  });
  it("space completes a half-typed command, which opens the models", async () => {
    render(<ChatSkin paneId={7} who="Claude" engine="claude-code" />);
    const box = screen.getByTestId("chat-input") as HTMLTextAreaElement; fireEvent.change(box, { target: { value: "/mod" } });
    fireEvent.keyDown(box, { key: " " }); expect(box.value).toBe("/model "); expect(screen.getByTestId("chat-slash").textContent).toContain("sonnet");
    fireEvent.keyDown(box, { key: " " }); expect(box.value).toBe("/model ");
  });
  it("draws the engine's own conversation: the person's words, the answer, the tools (a failed one marked), model and tokens", async () => {
    render(<ChatSkin paneId={7} who="Claude" />);
    await waitFor(() => expect(screen.getByTestId("chat-user").textContent).toBe("fix the login bug"));
    expect(screen.getByTestId("chat-assistant").textContent).toContain("Looking at it."); const chips = screen.getAllByTestId("chat-tool"); expect(chips.map((c) => c.getAttribute("data-ok"))).toEqual(["1", "0"]); expect(screen.getByTestId("chat-assistant").textContent).toContain("sonnet-5-5 · 25 tok out");
  });
  it("has no message box when another agent drives it (a worker under its planner), and says why", async () => {
    render(<ChatSkin paneId={7} who="worker" readOnly="the planner drives this worker" />);
    await waitFor(() => expect(screen.getByTestId("chat-user")).toBeTruthy());
    expect(screen.getByTestId("chat-readonly").textContent).toContain("planner drives"); expect(screen.queryByTestId("chat-input")).toBeNull(); expect(screen.queryByTestId("chat-send")).toBeNull();
  });
  it("puts the cursor in the message box when the chat appears and when the pane gets the focus", async () => {
    const { rerender } = render(<ChatSkin paneId={7} who="Claude" focused={false} />); const box = screen.getByTestId("chat-input"); expect(document.activeElement).not.toBe(box);
    rerender(<ChatSkin paneId={7} who="Claude" focused />); await waitFor(() => expect(document.activeElement).toBe(box));
  });
  it("shows the reasoning box (pixels and the word) while the agent works or an answer is pending, and not when it is done", async () => {
    const { rerender } = render(<ChatSkin paneId={7} who="Claude" working />); expect(screen.getByTestId("chat-reasoning").textContent).toContain("Reasoning"); expect(screen.getByTestId("chat-reasoning").querySelectorAll("rect").length).toBe(15);
    rerender(<ChatSkin paneId={7} who="Claude" working={false} />); await waitFor(() => expect(screen.getByTestId("chat-assistant")).toBeTruthy()); expect(screen.queryByTestId("chat-reasoning")).toBeNull();
  });
  it("the reasoning box wears the specialist's colour", () => { render(<Reasoning color="#ea3d8c" />); expect(screen.getByTestId("chat-reasoning").querySelector("rect")?.getAttribute("fill")).toBe("#ea3d8c"); });
  it("types into the same terminal: Enter sends, Shift+Enter is a new line, and an empty message is not sent", async () => {
    render(<ChatSkin paneId={7} who="Claude" />); const box = screen.getByTestId("chat-input") as HTMLTextAreaElement;
    fireEvent.keyDown(box, { key: "Enter" }); expect(sent).toEqual([]);
    fireEvent.change(box, { target: { value: "run the tests" } }); fireEvent.keyDown(box, { key: "Enter", shiftKey: true }); expect(sent).toEqual([]);
    fireEvent.keyDown(box, { key: "Enter" }); expect(screen.getAllByTestId("chat-user").some((x) => x.textContent === "run the tests" && x.getAttribute("data-pending") === "1")).toBe(true);   // it shows at once, before the engine has written it
    await waitFor(() => expect(sent).toEqual(["run the tests"])); expect(box.value).toBe("");
  });
  it("a setting command like /model is sent, said once, and never waits as a pending message or shows Reasoning", async () => {
    render(<ChatSkin paneId={7} who="Claude" />); const box = screen.getByTestId("chat-input") as HTMLTextAreaElement;
    await waitFor(() => expect(screen.getByTestId("chat-assistant")).toBeTruthy());
    fireEvent.change(box, { target: { value: "/model haiku" } }); fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(sent).toEqual(["/model haiku"])); await waitFor(() => expect(screen.getByTestId("chat-cmd").textContent).toContain("/model haiku"));
    expect(screen.queryByTestId("chat-reasoning")).toBeNull(); expect(screen.getAllByTestId("chat-user").some((x) => x.getAttribute("data-pending") === "1")).toBe(false);
  });
  it("shows the engine's slash commands while the first word is typed; Down and Tab choose, Enter completes before it sends, Esc closes", async () => {
    render(<ChatSkin paneId={7} who="Claude" engine="claude-code" />); const box = screen.getByTestId("chat-input") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "hi" } }); expect(screen.queryByTestId("chat-slash")).toBeNull();
    fireEvent.change(box, { target: { value: "/" } }); expect(screen.getByTestId("chat-slash")).toBeTruthy(); expect(screen.getByTestId("chat-slash-model")).toBeTruthy();
    fireEvent.change(box, { target: { value: "/mo" } }); expect(screen.getByTestId("chat-slash").textContent).toContain("/model"); expect(screen.queryByTestId("chat-slash-clear")).toBeNull();
    fireEvent.keyDown(box, { key: "Enter" }); expect(box.value).toBe("/model "); expect(sent).toEqual([]);   // Enter completes the word, it does not send half a command
    expect(screen.getByTestId("chat-slash-model-sonnet")).toBeTruthy(); expect(screen.queryByTestId("chat-slash-clear")).toBeNull();   // a space ends the command word: the menu now offers what /model takes
    fireEvent.change(box, { target: { value: "/c" } }); expect(screen.getByTestId("chat-slash").textContent).toContain("/compact"); fireEvent.keyDown(box, { key: "ArrowDown" }); fireEvent.keyDown(box, { key: "Tab" }); expect(box.value).toMatch(/^\/c\w+ $/);
    fireEvent.change(box, { target: { value: "/m" } }); fireEvent.keyDown(box, { key: "Escape" }); expect(screen.queryByTestId("chat-slash")).toBeNull();
  });
  it("after /model it offers the models and after /effort the levels; Enter completes the value, a second Enter sends it", async () => {
    render(<ChatSkin paneId={7} who="Claude" engine="claude-code" />); const box = screen.getByTestId("chat-input") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "/model " } }); expect(["haiku", "sonnet", "opus"].every((m) => !!screen.queryByTestId(`chat-slash-model-${m}`))).toBe(true);
    fireEvent.change(box, { target: { value: "/model so" } }); expect(screen.getByTestId("chat-slash-model-sonnet")).toBeTruthy(); expect(screen.queryByTestId("chat-slash-model-haiku")).toBeNull();
    fireEvent.keyDown(box, { key: "Enter" }); expect(box.value).toBe("/model sonnet"); expect(sent).toEqual([]);
    fireEvent.keyDown(box, { key: "Enter" }); await waitFor(() => expect(sent).toEqual(["/model sonnet"]));
    fireEvent.change(box, { target: { value: "/effort " } }); expect(screen.getByTestId("chat-slash-effort-high")).toBeTruthy();
    fireEvent.change(box, { target: { value: "/model zzz" } }); expect(screen.queryByTestId("chat-slash")).toBeNull();   // a model id of its own: no menu, it is sent as typed
  });
  it("says what the agent's CLI answered, as its terminal does, instead of only that the command was sent", async () => {
    const { rerender } = render(<ChatSkin paneId={7} who="Claude" engine="claude-code" />); const box = screen.getByTestId("chat-input") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "/model haiku" } }); fireEvent.keyDown(box, { key: "Enter" }); await waitFor(() => expect(screen.getByTestId("chat-cmd").textContent).toContain("sent /model haiku"));
    rerender(<ChatSkin paneId={7} who="Claude" engine="claude-code" notice="Set model to Haiku 5.5 and saved as your default for new sessions" />);
    expect(screen.getByTestId("chat-cmd").textContent).toContain("Set model to Haiku 5.5");
  });
  it("sends a command that is already complete on Enter, and has no menu for an engine with no list", async () => {
    render(<ChatSkin paneId={7} who="Claude" engine="claude-code" />); const box = screen.getByTestId("chat-input") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "/clear" } }); fireEvent.keyDown(box, { key: "Enter" }); await waitFor(() => expect(sent).toEqual(["/clear"]));
    cleanup(); render(<ChatSkin paneId={8} who="Grok" engine="grok" />); fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "/" } }); expect(screen.queryByTestId("chat-slash")).toBeNull();
  });
  it("answers Claude's 'Switch model?' question with buttons, because the terminal is hidden in chat mode", async () => {
    const api = await import("./api"); const input = vi.spyOn(api, "ptyInput").mockResolvedValue({ ok: true } as any);
    const { rerender } = render(<ChatSkin paneId={7} who="Claude" blocked={null} />); expect(screen.queryByTestId("chat-switch")).toBeNull();
    rerender(<ChatSkin paneId={7} who="Claude" blocked="Switch model? The next reply will be slower and use more tokens (the conversation is read again)" />);
    expect(screen.getByTestId("chat-switch").textContent).toContain("slower"); fireEvent.click(screen.getByTestId("chat-switch-yes")); expect(input).toHaveBeenCalledWith(7, "\r");
    fireEvent.click(screen.getByTestId("chat-switch-no")); expect(input).toHaveBeenLastCalledWith(7, "\x1b");
    rerender(<ChatSkin paneId={7} who="Claude" blocked="Do you want to proceed?" />); expect(screen.queryByTestId("chat-switch")).toBeNull();   // another question is not this one
  });
  it("says when the agent waits for the person to approve the antiloki MCP server, and what to press", async () => {
    const { rerender } = render(<ChatSkin paneId={7} who="Cursor" blocked={null} />); expect(screen.queryByTestId("chat-mcp")).toBeNull();
    rerender(<ChatSkin paneId={7} who="Cursor" blocked="MCP approval: approve the antiloki MCP server in this agent's terminal, or it cannot read the handover or antiloki's tools" />);
    const note = screen.getByTestId("chat-mcp").textContent ?? ""; expect(note).toContain("needs you"); expect(note).toContain("Approve all servers"); expect(note).toContain("start again");
  });
  it("the MCP approval note has a button that answers Cursor's question for the person (the hotkey a), so the terminal behind the chat is not needed", async () => {
    const api = await import("./api"); const input = vi.spyOn(api, "ptyInput").mockResolvedValue({ ok: true } as any);
    render(<ChatSkin paneId={7} who="Cursor" blocked="MCP approval: approve the antiloki MCP server in this agent's terminal, or it cannot read the handover or antiloki's tools" />);
    fireEvent.click(screen.getByTestId("chat-mcp-approve")); expect(input).toHaveBeenCalledWith(7, "a"); input.mockRestore();
  });
  it("/model with a local model switches the agent onto it through the handler, and never types it into the terminal; a Claude alias or an unknown name is sent as before", async () => {
    const onLocalModel = vi.fn().mockResolvedValue(null);
    render(<ChatSkin paneId={7} who="Claude" engine="claude-code" onLocalModel={onLocalModel} />); const box = screen.getByTestId("chat-input") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "/model " } }); await waitFor(() => expect(screen.getByTestId("chat-slash-model-qwen3:4b")).toBeTruthy());   // offered after /model, with the Claude aliases
    expect(screen.queryByTestId("chat-slash-model-big:70b")).toBeNull();   // a model the server cannot load is not offered
    fireEvent.change(box, { target: { value: "/model qwen3:4b" } }); fireEvent.keyDown(box, { key: "Escape" }); fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(onLocalModel).toHaveBeenCalledWith("qwen3:4b")); expect(sent).toEqual([]); await waitFor(() => expect(screen.getByTestId("chat-info").textContent).toContain("qwen3:4b (local) continues"));
    fireEvent.change(box, { target: { value: "/model haiku" } }); fireEvent.keyDown(box, { key: "Escape" }); fireEvent.keyDown(box, { key: "Enter" }); await waitFor(() => expect(sent).toEqual(["/model haiku"])); expect(onLocalModel).toHaveBeenCalledTimes(1);
    fireEvent.change(box, { target: { value: "/model nope:1b" } }); fireEvent.keyDown(box, { key: "Escape" }); fireEvent.keyDown(box, { key: "Enter" }); await waitFor(() => expect(sent).toEqual(["/model haiku", "/model nope:1b"]));
  });
  it("a failed local switch says why and leaves the box empty", async () => {
    const onLocalModel = vi.fn().mockResolvedValue("Ollama is not answering");
    render(<ChatSkin paneId={7} who="Claude" engine="claude-code" onLocalModel={onLocalModel} />); const box = screen.getByTestId("chat-input") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "/model qwen3:4b" } }); await waitFor(() => expect(screen.getByTestId("chat-slash")).toBeTruthy()); fireEvent.keyDown(box, { key: "Escape" }); fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Ollama is not answering")); expect(sent).toEqual([]);
  });
  it("tells a setting command from a message, as the serve does", async () => {
    const { opensAMenu } = await import("./ChatSkin");
    expect(opensAMenu("/model")).toBe("model"); expect(opensAMenu(" /config ")).toBe("config"); expect(opensAMenu("/model haiku")).toBeNull(); expect(opensAMenu("/clear")).toBeNull(); expect(opensAMenu("hi")).toBeNull();
    const { isSettingCommand } = await import("./ChatSkin");
    for (const t of ["/model haiku", " /model  sonnet ", "/effort high", "/clear"]) expect(isSettingCommand(t), t).toBe(true);
    for (const t of ["hi", "/compact", "/init", "/modelfoo", "use /model haiku"]) expect(isSettingCommand(t), t).toBe(false);
  });
});
describe("the default skin and a pane's own", () => {
  it("is the terminal unless the settings say chat, and a malformed value is the terminal", () => {
    expect(DEFAULT_APPEARANCE.agentSkin).toBe("terminal"); expect(parseAppearance({ agentSkin: "chat" }).agentSkin).toBe("chat"); expect(parseAppearance({ agentSkin: "bubbles" }).agentSkin).toBe("terminal"); expect(parseAppearance("garbage").agentSkin).toBe("terminal");
  });
  it("a pane's own choice survives a reload", () => {
    const L = (skin: unknown) => ({ root: { type: "leaf", pane: { id: "a", kind: "engine", engine: "claude-code", skin } }, focus: "a", zoom: null });
    expect((parseLayout(JSON.parse(JSON.stringify(L("chat")))) as { root: { pane: { skin?: string } } }).root.pane.skin).toBe("chat"); expect((parseLayout(L("neon")) as { root: { pane: { skin?: string } } }).root.pane.skin).toBeUndefined();
  });
});

describe("the + menu lists the approved specialists and opens one", () => {
  it("shows each with its mascot and opens it on the chosen side", async () => {
    const api = await import("./api"); const open = vi.fn();
    vi.spyOn(api, "specialistsOpenable").mockResolvedValue([{ id: "copy-chief", name: "Copy chief", purpose: "brand voice", notes: 3 }]);
    const { AddPaneMenu } = await import("./AddPaneMenu");
    render(<AddPaneMenu engines={[]} anchor={{ left: 10, bottom: 10 }} onPick={() => {}} onClose={() => {}} atLimit={null} onSpecialist={open} mode="agent" />);
    const row = await screen.findByTestId("pick-specialist-copy-chief"); expect(row.textContent).toContain("Copy chief"); expect(row.textContent).toContain("3 notes"); expect(row.querySelector("[data-testid=specialist-avatar]")).toBeTruthy();
    fireEvent.click(row); expect(open).toHaveBeenCalledWith("copy-chief", "right");
  });
});

import { PixelLoader, Skeleton, useSlow, EXPAND_MS } from "./PixelLoader";
import { renderHook, act } from "@testing-library/react";
describe("the loading look", () => {
  it("is a grid of pixels while it loads and grows fast, then goes, when it is done", async () => {
    vi.useFakeTimers(); const gone = vi.fn(); const { rerender } = render(<PixelLoader onGone={gone} />); expect(screen.getByTestId("pixel-loader").getAttribute("data-done")).toBe("0"); expect(screen.getByTestId("pixel-loader").querySelectorAll("rect").length).toBe(45);
    rerender(<PixelLoader done onGone={gone} />); expect(screen.getByTestId("pixel-loader").getAttribute("data-done")).toBe("1"); expect(gone).not.toHaveBeenCalled(); act(() => { vi.advanceTimersByTime(EXPAND_MS + 5); }); expect(gone).toHaveBeenCalledTimes(1); vi.useRealTimers();
  });
  it("shows a skeleton only for what takes more than a second", () => {
    vi.useFakeTimers(); const { result, rerender } = renderHook(({ on }) => useSlow(on, 1000), { initialProps: { on: true } }); expect(result.current).toBe(false); act(() => { vi.advanceTimersByTime(999); }); expect(result.current).toBe(false); act(() => { vi.advanceTimersByTime(2); }); expect(result.current).toBe(true);
    rerender({ on: false }); expect(result.current).toBe(false); vi.useRealTimers(); render(<Skeleton lines={3} />); expect(screen.getByTestId("skeleton").children.length).toBe(4);   // 3 bars and the style tag
  });
});
