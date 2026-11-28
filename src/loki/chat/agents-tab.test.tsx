// @vitest-environment jsdom
// THE AGENTS TAB (2026-09-23): the roster shows antiChat first, then every Studio agent with its status line, its
// pair and the money under the name; picking an agent opens its pane once (POST agents/open) and shows its episodes.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const posts: any[] = [];
let roster: any[] = [];
vi.mock("@/loki/api/client", () => ({
  apiGet: vi.fn(async (p: string) => p.includes("roster") ? { agents: roster, workspace: "/w" } : { chats: [] }),
  apiPost: vi.fn(async (p: string, b: any) => { posts.push({ p, b }); return { result: { pane: { id: 42, session_id: 7 } } }; }),
}));
vi.mock("@/loki/api/hooks", () => ({ usePoll: (fn: () => Promise<any>) => { const [d, setD] = React.useState<any>(null); React.useEffect(() => { void fn().then(setD); }, []); return { data: d, refetch: () => void fn().then(setD) }; } }));
vi.mock("@/loki/widgets/cockpit-pane-body", () => ({ CockpitPaneBody: (p: any) => <div data-testid="pane-body" data-pane={p.paneId} data-kind={p.kind} /> }));
vi.mock("./widget-dock", async (orig) => ({ ...(await orig<any>()), Slide: ({ children }: any) => <div>{children}</div> }));
vi.mock("./chats-tab", () => ({ useChatsTab: () => ({ side: <div data-testid="chat-side" />, stage: <div data-testid="chat-stage" />, chat: { title: "antiChat", last: Date.now() } }), ago: () => "now" }));
import { useAgentsTab, savedTag, ForkTabs } from "./agents-tab";

function Harness() { const t = useAgentsTab(true); return <div><aside>{t.side}</aside><main>{t.stage}</main></div>; }
beforeEach(() => { posts.length = 0; localStorage.clear(); roster = [
  { slug: "outreach", name: "Cold outreach operator", icon: "🙂", provider: "claude-code", pane_id: 0, engine: "claude-code", pair: "Claude × DeepSeek", status: "needs a yes on “the 0.1.26 notes”", tone: "needs", saved: 1.4, saved_est: 0, episodes: [], live: false, runs: 3 },
  { slug: "scout", name: "X trend scout", icon: "🔭", provider: "opencode", pane_id: 9, engine: "opencode", pair: "solo", status: "idle", tone: "idle", saved: 0, saved_est: 0.3, episodes: [{ n: 1, title: "Ranking 3 threads", turns: 4 }], live: false, runs: 1 },
]; });

describe("the agents tab", () => {
  it("keeps Teams out of the roster when the build is not a dev one", async () => {
    // operator 2026-09-23: "let's hide for now teams feature to the app and only show in dev mode"
    const { devOnly } = await import("@/loki/dev-only");
    expect(typeof devOnly()).toBe("boolean");
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("agent-row-outreach")).toBeTruthy());
    // under vitest the gate is open, so the panel is here — the gate itself is pinned in dev-only.test.ts
    expect(screen.queryByTestId("agent-routines")).toBeTruthy();
  });

  it("lists the agents with status, pair and the money — and no read-only chat among them", async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("agent-row-outreach")).toBeTruthy());
    // the antiChat row is gone (operator 2026-09-23: "not the previous one that was just for readonly")
    expect(screen.queryByTestId("agent-row-antichat")).toBeNull();
    expect(screen.queryByTestId("chat-stage")).toBeNull();
    expect(screen.getByTestId("agent-row-outreach").textContent).toContain("needs a yes on");
    expect(screen.getByTestId("agent-row-outreach").textContent).toContain("$1.40");
    expect(screen.getByTestId("agent-row-scout").textContent).toContain("~$0.30");
    expect(savedTag({ saved: 0, saved_est: 0 })).toBe("");
  });

  it("opens the first agent by itself, so the desk is a working pane from the start", async () => {
    render(<Harness />);
    await waitFor(() => expect(posts[0]).toEqual({ p: "/api/v1/cockpit/agents/open", b: { slug: "outreach" } }));
    await waitFor(() => expect(screen.getByTestId("pane-body").getAttribute("data-pane")).toBe("42"));
    expect(screen.getByTestId("agent-row-outreach").getAttribute("data-on")).toBe("1");
  });
  it("picking an agent opens its pane once and shows its episodes", async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("pane-body").getAttribute("data-pane")).toBe("42"));
    // no header line under the tabs any more (operator 2026-09-27: "remove the avatar and name line, it already appear on the tab")
    expect(screen.queryByTestId("agent-header")).toBeNull();
    fireEvent.click(screen.getByTestId("agent-row-scout"));
    await waitFor(() => expect(screen.getByTestId("agent-episodes").textContent).toContain("Ranking 3 threads"));
    expect(posts.length).toBe(2);
    fireEvent.click(screen.getByTestId("agent-row-outreach"));
    await waitFor(() => expect(screen.getByTestId("pane-body").getAttribute("data-pane")).toBe("42"));
    expect(posts.length).toBe(2); // opened once
  });
});

describe("renaming a created agent (2026-09-23)", () => {
  it("double-click the name, type, Enter → onRename(slug, name)", async () => {
    const { Roster } = await import("./agents-tab");
    const onRename = vi.fn();
    const agents = [{ slug: "scout", name: "X trend scout", icon: "🔭", provider: "opencode", pane_id: 9, engine: "opencode", pair: "solo", status: "idle", tone: "idle", saved: 0, saved_est: 0, episodes: [], live: false, runs: 0 }] as any;
    render(<Roster agents={agents} selected="" onSelect={() => {}} busy={false} onRename={onRename} />);
    fireEvent.doubleClick(screen.getByText("X trend scout"));
    const inp = screen.getByTestId("rename-input") as HTMLInputElement;
    fireEvent.change(inp, { target: { value: "Scout" } }); fireEvent.keyDown(inp, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("scout", "Scout");
  });
});

// THE MAIN AGENT (operator 2026-09-24, bug 9: "create a new agent readonly that is just the regular chat with
// full access and no worktrees etc, a default main agent more simple and easy").
describe("Main", () => {
  it("says what it is instead of reading as an agent someone forgot to configure", async () => {
    const { subLine, roleName } = await import("./agents-tab");
    expect(subLine({ main: true, readonly: true })).toBe("read-only · the whole workspace");
    // main is NOT read-only any more (operator 2026-09-28) — the label follows the permission, not the flag
    expect(subLine({ main: true })).toBe("the whole workspace");
    expect(subLine({ main: true, readonly: false })).toBe("the whole workspace");
    expect(subLine({ readonly: true, role: "backender" })).toBe("read-only · the whole workspace");
    // a real agent is unaffected, and one genuinely missing a role still says so
    expect(subLine({ role: "backend-api" })).toBe("Backend api");
    expect(subLine({})).toBe("no role");
    expect(roleName("")).toBe("no role");
  });
});

describe("the tabs rename on a double-click (operator 2026-09-28)", () => {
  it("double-clicking a tab's name edits it in place; Enter renames, Escape leaves it", () => {
    const renamed: [string, string][] = [];
    const agent: any = { slug: "main", name: "Main", icon: "", provider: "claude-code", engine: "claude-code", tone: "idle", pair: "solo" };
    render(<ForkTabs agent={agent} forks={[{ pane_id: 50, session_id: 1, name: "spry mimic" }]} active={null} onPick={() => {}} onFork={() => {}} onClose={() => {}} onRename={(k, n) => renamed.push([k, n])} />);
    fireEvent.doubleClick(screen.getByText("spry mimic"));
    const input = screen.getByTestId("rename-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "filters" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(renamed).toEqual([["50", "filters"]]);
    fireEvent.doubleClick(screen.getByText("Main"));
    const again = screen.getByTestId("rename-input") as HTMLInputElement;
    fireEvent.change(again, { target: { value: "nope" } });
    fireEvent.keyDown(again, { key: "Escape" });
    expect(renamed.length).toBe(1);
  });
});

