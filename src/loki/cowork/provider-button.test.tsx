// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";

const engines = vi.fn(); const sw = vi.fn(); const locals = vi.fn(); const setModel = vi.fn(); const pm = vi.fn(async () => ({ current: "" }));
vi.mock("./api", () => ({ listEngines: (...a: any[]) => engines(...a), switchProvider: (...a: any[]) => sw(...a), localModels: (...a: any[]) => locals(...a), setPaneModel: (...a: any[]) => setModel(...a), paneModels: (...a: any[]) => (pm as any)(...a) }));
import { ProviderButton, providerCode, switchable } from "./ProviderButton";

const list = [
  { key: "claude-code", label: "Claude Code", installed: true, seat: true },
  { key: "codex", label: "Codex", installed: true, seat: true },
  { key: "cursor", label: "Cursor", installed: true, seat: false },
  { key: "deepseek", label: "DeepSeek Harness", installed: false, seat: false },
  { key: "opencode", label: "OpenCode", installed: true, seat: true, off: true },
];

describe("the provider button", () => {
  afterEach(() => { cleanup(); engines.mockReset(); sw.mockReset(); locals.mockReset(); setModel.mockReset(); });
  it("the list closes on Escape and on a click anywhere else, and stays open for a click inside it", async () => {
    engines.mockResolvedValue(list.map((e) => ({ ...e, off: e.off ?? false }))); locals.mockResolvedValue({ reachable: true, base: "", models: [] });
    render(<div><span data-testid="elsewhere">x</span><ProviderButton paneId={9} engine="claude-code" onRestart={() => {}} /></div>);
    fireEvent.click(screen.getByTestId("provider-button-9")); await waitFor(() => screen.getByTestId("provider-list-9"));
    fireEvent.pointerDown(screen.getByTestId("provider-list-9")); expect(screen.queryByTestId("provider-list-9")).not.toBeNull();
    fireEvent.keyDown(document.body, { key: "Escape" }); await waitFor(() => expect(screen.queryByTestId("provider-list-9")).toBeNull());
    fireEvent.click(screen.getByTestId("provider-button-9")); await waitFor(() => screen.getByTestId("provider-list-9"));
    fireEvent.pointerDown(screen.getByTestId("elsewhere")); await waitFor(() => expect(screen.queryByTestId("provider-list-9")).toBeNull());
  });
  it("lists the local models under the cloud providers, and picking one puts the pane on it through Claude Code", async () => {
    engines.mockResolvedValue(list.map((e) => ({ ...e, off: e.off ?? false })));
    locals.mockResolvedValue({ reachable: true, base: "http://127.0.0.1:11434", models: [{ id: "local:qwen3:4b", tag: "qwen3:4b", label: "qwen3:4b", size_gb: 2.5, params: "4b" }] });
    setModel.mockResolvedValue({ ok: true, applied: "restart" }); sw.mockResolvedValue({ ok: true, changed: true }); const onRestart = vi.fn();
    render(<ProviderButton paneId={6} engine="codex" onRestart={onRestart} />);
    fireEvent.click(screen.getByTestId("provider-button-6")); await waitFor(() => screen.getByTestId("provider-local-open"));
    fireEvent.click(screen.getByTestId("provider-local-open")); await waitFor(() => screen.getByTestId("local-card-qwen3:4b"));   // one "Local" button, and the window with every model
    fireEvent.click(screen.getByTestId("local-card-qwen3:4b"));
    await waitFor(() => expect(onRestart).toHaveBeenCalled());
    expect(sw).toHaveBeenCalledWith(6, "claude-code", "local:qwen3:4b");
  });
  it("with Ollama down it says so instead of listing models", async () => {
    engines.mockResolvedValue(list.map((e) => ({ ...e, off: e.off ?? false })));
    locals.mockResolvedValue({ reachable: false, base: "http://127.0.0.1:11434", models: [] });
    render(<ProviderButton paneId={7} engine="claude-code" onRestart={() => {}} />);
    fireEvent.click(screen.getByTestId("provider-button-7")); await waitFor(() => screen.getByTestId("provider-ollama-down"));
    expect(screen.queryByTestId("provider-local-open")).toBeNull();
  });

  it("shows the pane's provider, not a model, and lists only the installed providers that are on", async () => {
    engines.mockResolvedValue(list.map((e) => ({ ...e, off: e.off ?? false })));
    render(<ProviderButton paneId={3} engine="claude-code" onRestart={() => {}} />);
    expect(screen.getByTestId("provider-button-3").textContent).toBe("Claude Code");
    fireEvent.click(screen.getByTestId("provider-button-3"));
    await waitFor(() => screen.getByTestId("provider-opt-codex"));
    expect(screen.getByTestId("provider-opt-codex")).toBeTruthy(); expect(screen.getByTestId("provider-opt-cursor")).toBeTruthy();
    expect(screen.queryByTestId("provider-opt-deepseek")).toBeNull(); expect(screen.queryByTestId("provider-opt-opencode")).toBeNull();
    expect(screen.queryByText(/haiku|sonnet|opus/i)).toBeNull(); expect(screen.getByTestId("provider-opt-claude-code").hasAttribute("disabled")).toBe(true);
  });

  it("one click on a provider switches to it and asks the screen to restart the terminal", async () => {
    engines.mockResolvedValue(list.map((e) => ({ ...e, off: e.off ?? false })));
    sw.mockResolvedValue({ ok: true, changed: true, label: "Codex", episodeClosed: true }); const onRestart = vi.fn();
    render(<ProviderButton paneId={4} engine="claude-code" onRestart={onRestart} />);
    fireEvent.click(screen.getByTestId("provider-button-4")); await waitFor(() => screen.getByTestId("provider-opt-codex"));
    fireEvent.click(screen.getByTestId("provider-opt-codex"));
    await waitFor(() => expect(onRestart).toHaveBeenCalled()); expect(sw).toHaveBeenCalledWith(4, "codex");
    await waitFor(() => expect(screen.getByTestId("provider-note-4").textContent).toContain("Codex continues this conversation"));
    expect(screen.getByTestId("provider-note-4").textContent).toContain("saved in the saga");
  });

  it("a refused switch says why, and the provider stays as it was", async () => {
    engines.mockResolvedValue(list.map((e) => ({ ...e, off: e.off ?? false })));
    sw.mockResolvedValue({ ok: false, error: "Codex is installed but not signed in: sign in to it once in a terminal, then switch" }); const onRestart = vi.fn();
    render(<ProviderButton paneId={5} engine="claude-code" onRestart={onRestart} />);
    fireEvent.click(screen.getByTestId("provider-button-5")); await waitFor(() => screen.getByTestId("provider-opt-codex"));
    fireEvent.click(screen.getByTestId("provider-opt-codex"));
    await waitFor(() => expect(screen.getByTestId("provider-note-5").textContent).toContain("not signed in")); expect(onRestart).not.toHaveBeenCalled();
    expect(screen.getByTestId("provider-button-5").textContent).toBe("Claude Code");
  });

  it("the chat pill shows the provider and the model code (logo + H5.5), keeps the last model when the usage drops, and falls back to the pane's chosen alias", async () => {
    engines.mockResolvedValue(list.map((e) => ({ ...e, off: e.off ?? false })));
    const { rerender } = render(<ProviderButton compact paneId={3} engine="claude-code" model="Haiku 5.5" onRestart={() => {}} />);
    expect(screen.getByTestId("provider-button-3").textContent).toBe("H5.5");
    rerender(<ProviderButton compact paneId={3} engine="claude-code" model={undefined} onRestart={() => {}} />);
    expect(screen.getByTestId("provider-button-3").textContent).toBe("H5.5");   // a poll that came back empty does not turn it into a bare CC
    cleanup(); pm.mockResolvedValueOnce({ current: "sonnet" });
    render(<ProviderButton compact paneId={4} engine="claude-code" onRestart={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("provider-button-4").textContent).toBe("S"));
  });
  it("short codes and the switchable filter", () => {
    expect(providerCode("Claude Code")).toBe("CC"); expect(providerCode("Codex")).toBe("CO"); expect(providerCode("Grok (xAI CLI — optional)")).toBe("GX");
    expect(switchable(list as any).map((e) => e.key)).toEqual(["claude-code", "codex", "cursor"]);
  });
});
