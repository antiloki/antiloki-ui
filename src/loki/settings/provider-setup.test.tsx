// @vitest-environment jsdom
// THE FIRST-RUN PROVIDERS (operator 2026-09-30): "the onboarding is outdated. Shouldn't ask for planner or worker. Should now show the providers to select which ones we have" and "select a main AI provider on onboarding".
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const posts: any[] = [];
let payload: any;
let keepUsable = false;   // the old mock turned a seat usable when it was ticked; the real serve does not: a ticked seat that is not signed in stays unusable
vi.mock("@/loki/api/client", () => ({
  apiGet: vi.fn(async () => payload),
  apiPost: vi.fn(async (_u: string, b: any) => {
    posts.push(b);
    if (b.provider) payload.heimdall.provider = b.provider;
    const r = payload.engines.find((e: any) => e.key === b.name); if (r) { r.on = b.on; if (!keepUsable) r.usable = b.on; }
    return { ok: true };
  }),
}));
import { ProviderSetup } from "./ai-engines";

const seat = (o: any) => ({ binaries: ["x"], binary: "x", installed: true, signed_in: true, usable: true, metered_gateway: false, blocked: null, on: true, ...o });
const cleanupAndReset = () => { cleanup(); posts.length = 0; };
beforeEach(() => {
  posts.length = 0; keepUsable = false;
  payload = {
    switches: {},
    engines: [
      seat({ key: "claude-code", name: "Claude" }),
      seat({ key: "codex", name: "Codex", signed_in: false, usable: false, signin: "codex login" }),
      seat({ key: "cursor", name: "Cursor", installed: false, binary: null, usable: false, signed_in: false, install: "curl https://cursor.com/install | bash" }),
      seat({ key: "opencode", name: "OpenCode", metered_gateway: true }),
    ],
    heimdall: { provider: "pane", label: "Heimdall's own seat", note: "n", effective: null, options: [{ key: "claude-code", name: "Claude", usable: true }, { key: "codex", name: "Codex", usable: false }] },
  };
});

describe("ProviderSetup", () => {
  it("lists each seat as found on the machine, with the exact command for the ones that need one, and never a planner/worker/QA picker", async () => {
    render(<ProviderSetup />);
    expect((await screen.findByTestId("setup-seat-claude-code")).textContent).toContain("ready");
    expect(screen.getByTestId("setup-seat-codex").textContent).toContain("not signed in");
    expect(screen.getByTestId("setup-fix-codex").textContent).toBe("codex login");
    expect(screen.getByTestId("setup-seat-cursor").textContent).toContain("not installed");
    // asked first: a seat that is not on the machine shows no steps until the user says they have that subscription
    expect(screen.queryByTestId("setup-fix-cursor")).toBeNull();
    keepUsable = true;
    fireEvent.click(screen.getByTestId("setup-use-cursor"));
    expect((await screen.findByTestId("setup-fix-cursor")).textContent).toContain("cursor.com/install");
    expect(screen.queryByTestId("setup-seat-opencode")).toBeNull();            // the metered gateway is not a subscription seat
    expect(screen.queryByText(/planner|worker/i)).toBeNull();
    // nothing to choose per job: the screen carries no <select> at all (a planner / worker / QA picker is a select), only per-seat tick boxes and the main-provider buttons
    expect(screen.queryAllByRole("combobox")).toEqual([]);
    expect(document.querySelectorAll("select").length).toBe(0);
  });

  it("'I use this' unticked switches the seat off by its engine key", async () => {
    render(<ProviderSetup />);
    fireEvent.click(await screen.findByTestId("setup-use-claude-code"));
    await waitFor(() => expect(posts).toContainEqual({ name: "claude-code", on: false }));
  });

  it("offers only the usable seats as the main provider, and choosing one saves it as Heimdall's seat", async () => {
    render(<ProviderSetup />);
    expect(await screen.findByTestId("setup-main-claude-code")).toBeTruthy();
    expect(screen.queryByTestId("setup-main-codex")).toBeNull();                // not signed in: cannot be the main
    fireEvent.click(screen.getByTestId("setup-main-claude-code"));
    await waitFor(() => expect(posts).toContainEqual({ name: "heimdall", provider: "claude-code" }));
    await waitFor(() => expect(screen.getByTestId("setup-main-claude-code").dataset.on).toBe("1"));
  });

  it("says how to get a main provider when none is ready yet", async () => {
    payload.heimdall.options = [{ key: "codex", name: "Codex", usable: false }];
    render(<ProviderSetup />);
    expect(await screen.findByTestId("setup-main-none")).toBeTruthy();
  });

  it("asks which subscriptions the user has: pre-ticks what is installed and shows nothing else until it is ticked", async () => {
    render(<ProviderSetup />);
    await screen.findByTestId("setup-seat-claude-code");
    expect((screen.getByTestId("setup-use-claude-code") as HTMLInputElement).checked).toBe(true);     // installed
    expect((screen.getByTestId("setup-use-codex") as HTMLInputElement).checked).toBe(true);           // installed, not signed in: its sign-in step is shown
    expect((screen.getByTestId("setup-use-cursor") as HTMLInputElement).checked).toBe(false);         // not on the machine: not assumed
    expect(screen.queryByTestId("setup-steps-cursor")).toBeNull();
    expect(screen.getByTestId("setup-steps-codex").textContent).toContain("not signed in");
  });

  it("on Windows the install step names PowerShell, shows the bare command and what must be installed first, and copies only the command", async () => {
    keepUsable = true;
    const copied: string[] = [];
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: async (t: string) => { copied.push(t); } } });
    payload.engines = [
      seat({ key: "cursor", name: "Cursor", installed: false, binary: null, usable: false, signed_in: false, os: "windows", shell: "PowerShell", install_cmd: "irm 'https://cursor.com/install?win32=true' | iex", install: "In PowerShell: irm 'https://cursor.com/install?win32=true' | iex   — then run `agent login`", signin: "agent login" }),
      seat({ key: "codex", name: "Codex", installed: false, binary: null, usable: false, signed_in: false, os: "windows", shell: "PowerShell", install_cmd: "npm i -g @openai/codex", needs: "needs Node.js 22 or newer (https://nodejs.org) — it brings npm", signin: "codex" }),
    ];
    payload.heimdall.options = [];
    render(<ProviderSetup />);
    await screen.findByTestId("setup-seat-cursor");
    fireEvent.click(screen.getByTestId("setup-use-cursor"));
    fireEvent.click(screen.getByTestId("setup-use-codex"));
    const steps = await screen.findByTestId("setup-steps-cursor");
    expect(steps.textContent).toContain("PowerShell");
    expect(steps.textContent).toContain("run agent login");
    expect(screen.getByTestId("setup-fix-cursor").textContent).toBe("irm 'https://cursor.com/install?win32=true' | iex");
    expect(screen.getByTestId("setup-needs-codex").textContent).toContain("Node.js 22");
    fireEvent.click(screen.getByTestId("setup-fix-cursor"));
    expect(copied).toEqual(["irm 'https://cursor.com/install?win32=true' | iex"]);
    vi.unstubAllGlobals();
  });

  it("looks again on its own and on 'check again': a CLI installed meanwhile turns ready without a reload", async () => {
    payload.engines = [seat({ key: "codex", name: "Codex", installed: false, binary: null, usable: false, signed_in: false, install_cmd: "npm i -g @openai/codex" })];
    payload.heimdall.options = [{ key: "codex", name: "Codex", usable: false }];
    render(<ProviderSetup />);
    await screen.findByTestId("setup-seat-codex");
    expect(screen.getByTestId("setup-seat-codex").textContent).toContain("not installed");
    payload.engines = [seat({ key: "codex", name: "Codex", installed: true, binary: "codex", usable: true, signed_in: true })];     // the user installed it in another window
    payload.heimdall.options = [{ key: "codex", name: "Codex", usable: true }];
    fireEvent.click(screen.getByTestId("setup-recheck"));
    await waitFor(() => expect(screen.getByTestId("setup-seat-codex").textContent).toContain("ready"));
    expect(screen.queryByTestId("setup-none-ready")).toBeNull();
  });

  it("says what to do when nothing is ready, and that the free Antigravity tier is enough to start", async () => {
    keepUsable = true;
    payload.engines = [seat({ key: "gemini", name: "Gemini", installed: false, binary: null, usable: false, signed_in: false }), seat({ key: "codex", name: "Codex", installed: false, binary: null, usable: false, signed_in: false })];
    payload.heimdall.options = [];
    render(<ProviderSetup />);
    expect((await screen.findByTestId("setup-none-ready")).textContent).toContain("free Antigravity tier");
    fireEvent.click(screen.getByTestId("setup-use-codex"));
    await waitFor(() => expect(screen.getByTestId("setup-none-ready").textContent).toContain("follow the steps above"));
  });

  it("chooses the main provider by itself when only one AI is ready, and asks the user to choose when several are", async () => {
    render(<ProviderSetup />);                                         // the default payload: one usable seat (Claude), Heimdall on 'pane'
    await waitFor(() => expect(posts).toContainEqual({ name: "heimdall", provider: "claude-code" }));
    cleanupAndReset();
    payload.engines = [seat({ key: "claude-code", name: "Claude" }), seat({ key: "codex", name: "Codex" })];
    payload.heimdall = { provider: "pane", label: "h", note: "n", effective: null, options: [{ key: "claude-code", name: "Claude", usable: true }, { key: "codex", name: "Codex", usable: true }] };
    render(<ProviderSetup />);
    expect(await screen.findByTestId("setup-main-choose")).toBeTruthy();
    expect(posts.some((b) => b.name === "heimdall")).toBe(false);       // two candidates: that is the user's decision
    fireEvent.click(screen.getByTestId("setup-main-codex"));
    await waitFor(() => expect(posts).toContainEqual({ name: "heimdall", provider: "codex" }));
    await waitFor(() => expect(screen.queryByTestId("setup-main-choose")).toBeNull());
  });

  it("a box follows the machine until the user clicks it: a seat that becomes ready ticks itself, a seat the user unticked stays unticked", async () => {
    payload.engines = [seat({ key: "codex", name: "Codex", installed: false, binary: null, usable: false, signed_in: false }), seat({ key: "claude-code", name: "Claude" })];
    payload.heimdall.options = [{ key: "claude-code", name: "Claude", usable: true }];
    render(<ProviderSetup />);
    await screen.findByTestId("setup-seat-codex");
    expect((screen.getByTestId("setup-use-codex") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByTestId("setup-use-claude-code"));                      // the user unticks Claude: their choice
    await waitFor(() => expect((screen.getByTestId("setup-use-claude-code") as HTMLInputElement).checked).toBe(false));
    payload.engines = [seat({ key: "codex", name: "Codex", installed: true, binary: "codex", usable: true, signed_in: true }), seat({ key: "claude-code", name: "Claude", on: false, usable: false })];   // Codex gets installed meanwhile
    fireEvent.click(screen.getByTestId("setup-recheck"));
    await waitFor(() => expect((screen.getByTestId("setup-use-codex") as HTMLInputElement).checked).toBe(true));
    expect((screen.getByTestId("setup-use-claude-code") as HTMLInputElement).checked).toBe(false);
  });
});
