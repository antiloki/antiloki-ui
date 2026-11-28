// HIRING AN AGENT (operator 2026-09-23: "create a new add agent window, rethink how it is. Should be dumb simple.
// Name, purpose, scope and role (preset template) that carries already the specialities and skills and model merge").
// The old way asked five screens of questions the benchmark had already answered. What is pinned here: the role
// fills in everything it decides, and the form refuses to hire until it has the three things only a person knows.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const roles = [
  { key: "backender", name: "Backender", about: "the server side", domain: "backend", general: true, under: null,
    globs: ["src/api/**", "src/db/**"], skills: ["antiloki-file-review"], specialists: ["axis:backend"], panes: ["diff"], packs: ["corpus"],
    merges: [{ objective: "cheaper", brain: "claude-code:sonnet", hands: "opencode:opencode/deepseek-v4-flash", samples: 9 },
             { objective: "best", brain: "claude-code:sonnet", hands: "claude-code:sonnet", samples: 4 }] },
  { key: "tester", name: "Tester", about: "the suite", domain: "tests", general: true, under: null,
    globs: ["tests/**"], skills: [], specialists: [], panes: [], packs: [], merges: [] },
];
const providers = { "claude-code": true, codex: false, opencode: true, frontier: ["claude-code"], cheap: ["deepseek", "kimi", "qwen"], solo: ["claude-code", "deepseek", "kimi", "qwen"], can_merge: true, why: "" };
vi.mock("./roles", async (orig) => ({ ...(await orig<any>()), fetchRoles: async () => ({ roles, proposal: null, providers }) }));
vi.mock("@/loki/cockpit/cockpit-view", () => ({ FileTree: ({ value, onChange }: any) => <input data-testid="scope-tree" value={value} onChange={(e: any) => onChange(e.target.value)} /> }));
vi.mock("@/loki/widgets/scope-picker", () => ({ useAtlasEntries: () => ({ entries: [], tokens: {}, loading: false }), filesInScope: () => [] }));

import { AddAgent, missing, mergeFor, objectiveOpen } from "./add-agent";

describe("what the form still needs", () => {
  it("refuses until it has a name, a role and a scope", () => {
    expect(missing({ name: "", role: "", scope: [] })).toEqual(["a name", "a role", "a scope — the files it may write"]);
    expect(missing({ name: "  ", role: "backender", scope: ["src/**"] })).toEqual(["a name"]);
    expect(missing({ name: "Bob", role: "backender", scope: ["src/**"] })).toEqual([]);
  });

  it("does not ask for a purpose — the role already knows what it is for", () => {
    expect(missing({ name: "Bob", role: "backender", scope: ["src/**"] })).toEqual([]);
  });
});

describe("the merge a role would use", () => {
  const name = (k: string) => k.split(":")[0];
  it("names both sides of the measured merge", () => {
    expect(mergeFor(roles[0] as any, "cheaper", name)).toBe("claude-code × opencode");
  });
  it("says nothing when the role's domain has nothing measured", () => {
    expect(mergeFor(roles[0] as any, "faster", name)).toBeNull();
    expect(mergeFor(roles[1] as any, "best", name)).toBeNull();
    expect(mergeFor(null, "best", name)).toBeNull();
  });
});

describe("the window", () => {
  const toScope = async () => {
    render(<AddAgent onClose={() => {}} onCreate={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("add-agent-role-backender")).toBeTruthy());
    fireEvent.click(screen.getByTestId("add-agent-role-backender"));
    fireEvent.click(screen.getByTestId("add-agent-next"));
  };

  it("asks who it is first, and the scope only once a role is chosen", async () => {
    render(<AddAgent onClose={() => {}} onCreate={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("add-agent-role-backender")).toBeTruthy());
    expect(screen.queryByTestId("add-agent-scope")).toBeNull();
    expect((screen.getByTestId("add-agent-next") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("add-agent-role-backender"));
    expect((screen.getByTestId("add-agent-next") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("add-agent-next"));
    expect(screen.getByTestId("scope-tree")).toBeTruthy();   // the x-ray picker, as in settings
  });

  it("offers the three objectives, and best is the one it starts on", async () => {
    await toScope();
    expect(screen.getByTestId("add-agent-objective-cheaper")).toBeTruthy();
    expect(screen.getByTestId("add-agent-objective-faster")).toBeTruthy();
    expect(screen.getByTestId("add-agent-objective-best").getAttribute("data-on")).toBe("1");
  });

  it("offers the machine's solo models, and picking one drops the objective", async () => {
    const onCreate = vi.fn();
    render(<AddAgent onClose={() => {}} onCreate={onCreate} />);
    await waitFor(() => expect(screen.getByTestId("add-agent-role-backender")).toBeTruthy());
    fireEvent.click(screen.getByTestId("add-agent-role-backender"));
    fireEvent.click(screen.getByTestId("add-agent-next"));
    expect(screen.getByTestId("add-agent-solo-claude-code")).toBeTruthy();
    expect(screen.queryByTestId("add-agent-solo-codex")).toBeNull();   // not installed here
    fireEvent.click(screen.getByTestId("add-agent-solo-deepseek"));
    expect(screen.getByTestId("add-agent-objective-best").getAttribute("data-on")).toBe("0");
    fireEvent.click(screen.getByTestId("add-agent-create"));
    expect(onCreate.mock.calls[0][0]).toMatchObject({ solo: "deepseek" });
  });

  it("picking a role fills the scope and names the agent after it", async () => {
    render(<AddAgent onClose={() => {}} onCreate={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("add-agent-role-backender")).toBeTruthy());
    fireEvent.click(screen.getByTestId("add-agent-role-backender"));
    expect((screen.getByTestId("add-agent-name") as HTMLInputElement).value).toBe("Backender");
    expect(screen.getByTestId("add-agent-brings")).toBeTruthy();
    fireEvent.click(screen.getByTestId("add-agent-next"));
    expect((screen.getByTestId("add-agent-scope") as HTMLInputElement).value).toBe("src/api/**, src/db/**");
  });

  it("keeps a name the operator typed rather than overwriting it with the role's", async () => {
    render(<AddAgent onClose={() => {}} onCreate={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("add-agent-role-backender")).toBeTruthy());
    fireEvent.change(screen.getByTestId("add-agent-name"), { target: { value: "Marta" } });
    fireEvent.click(screen.getByTestId("add-agent-role-backender"));
    expect((screen.getByTestId("add-agent-name") as HTMLInputElement).value).toBe("Marta");
  });

  it("hands back the draft and the whole role, so the caller never re-reads the catalogue", async () => {
    const onCreate = vi.fn();
    render(<AddAgent onClose={() => {}} onCreate={onCreate} />);
    await waitFor(() => expect(screen.getByTestId("add-agent-role-backender")).toBeTruthy());
    fireEvent.click(screen.getByTestId("add-agent-role-backender"));
    fireEvent.click(screen.getByTestId("add-agent-next"));
    fireEvent.click(screen.getByTestId("add-agent-objective-cheaper"));
    fireEvent.click(screen.getByTestId("add-agent-create"));
    expect(onCreate).toHaveBeenCalledTimes(1);
    const [draft, role] = onCreate.mock.calls[0];
    expect(draft).toMatchObject({ name: "Backender", role: "backender", objective: "cheaper", scope: ["src/api/**", "src/db/**"] });
    expect(role.skills).toEqual(["antiloki-file-review"]);
    expect(role.specialists).toEqual(["axis:backend"]);
  });
});

describe("what this machine can actually run", () => {
  const can = { ...providers };
  const cannot = { "claude-code": true, codex: false, opencode: false, frontier: ["claude-code"], cheap: [], solo: ["claude-code"], can_merge: false, why: "install OpenCode to merge" };
  it("keeps an objective open when its measured merge is runnable here", () => {
    expect(objectiveOpen(roles[0] as any, "cheaper", can as any)).toBe(true);
  });
  it("closes one whose engines are not installed", () => {
    const off = { ...roles[0], merges: [{ objective: "cheaper", brain: "codex:gpt", hands: null, samples: 3, runnable: false }] };
    expect(objectiveOpen(off as any, "cheaper", can as any)).toBe(false);
  });
  it("an unmeasured objective is open only when a merge could be bound at all", () => {
    expect(objectiveOpen(roles[1] as any, "best", can as any)).toBe(true);     // nothing measured, but merges work here
    expect(objectiveOpen(roles[1] as any, "best", cannot as any)).toBe(false); // no OpenCode: no merge to bind
  });
});
