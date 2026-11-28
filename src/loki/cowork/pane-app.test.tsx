// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
vi.mock("./TerminalPane", () => ({ TerminalPane: ({ pane }: any) => <div data-testid="term">{pane.paneId}</div> }));
vi.mock("./ChatSkin", () => ({ ChatSkin: () => <div data-testid="chat" /> }));
vi.mock("./use-cowork", () => ({ useAsks: () => [], usePaneUsages: () => ({}) }));
import { appManifest, appScope, appUrl, canBeApp, packPane, unpackPane } from "./pane-app";
import { SoloPane } from "./SoloPane";

afterEach(() => cleanup());
const agent = { id: "claude-code-1", kind: "engine", engine: "claude-code", title: "Docs — café", paneId: 7 } as any;
describe("a pane as an app", () => {
  it("only panes that stand alone can be one", () => {
    expect([canBeApp(agent), canBeApp({ id: "f", kind: "tool", tool: "files" } as any), canBeApp({ id: "t", kind: "tool", tool: "team" } as any), canBeApp({ id: "w", kind: "worker" } as any), canBeApp({ id: "e", kind: "engine" } as any)]).toEqual([true, true, false, false, false]);
  });
  it("the address holds the pane, and only that", () => {
    expect(unpackPane(packPane({ ...agent, role: "worker" }))).toEqual(agent); expect(unpackPane("nonsense%%")).toBeNull(); expect(unpackPane(packPane({ id: "t", kind: "tool", tool: "team" } as any))).toBeNull();
  });
  it("each pane has its own scope, and one never holds another", () => {
    const twelve = { ...agent, id: "claude-code-12" }; expect(appUrl(twelve).startsWith(appScope(agent))).toBe(false); expect(appUrl(agent).startsWith(appScope(agent))).toBe(true);
    const m = appManifest(agent, "http://localhost:5199", [{ src: "data:image/png;base64,x", sizes: "192x192" }]);
    expect([m.display, m.name, m.start_url.startsWith(m.scope), m.icons[0].type]).toEqual(["standalone", "Docs — café · antiloki", true, "image/png"]);
  });
  it("draws the pane alone, with a manifest and its name as the title", () => {
    const view = render(<SoloPane packed={packPane({ id: "sh", kind: "shell", paneId: 9, title: "Terminal" } as any)} />);
    expect(screen.getByTestId("term").textContent).toBe("9"); expect(document.title).toBe("Terminal"); expect(document.querySelector('link[rel="manifest"]')).not.toBeNull();
    view.unmount(); expect(document.querySelector('link[rel="manifest"]')).toBeNull();
  });
  it("says so when the address names no pane", () => { render(<SoloPane packed="" />); expect(screen.getByTestId("solo-unknown")).toBeTruthy(); });
});
