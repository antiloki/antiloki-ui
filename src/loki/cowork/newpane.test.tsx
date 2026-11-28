// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
import { findSources, hasNativePane, idOf, parseSources, widgetOf } from "./newpane";
vi.mock("@/loki/api/client", () => ({ BE_URL: "http://be" }));
const api = vi.hoisted(() => ({ loadWebApps: vi.fn(), apiXrayV2: vi.fn() }));
const team = vi.hoisted(() => ({ startFromTemplate: vi.fn(), runTeam: vi.fn() }));
vi.mock("./api", () => api); vi.mock("@/loki/team/api", () => team);
import { NewPaneDialog } from "./NewPaneDialog";

describe("new pane: the pure part", () => {
  it("knows which apps have a pane, makes ids from titles and builds the declaration without empty arguments", () => {
    expect(hasNativePane("github")).toBe(false); expect(hasNativePane("linear")).toBe(false); expect(hasNativePane("sentry")).toBe(false);   // no app has a hand-written pane any more expect(idOf("Código Σ: the graph!")).toBe("codigo-the-graph"); expect(idOf("***")).toBe("widget"); expect(idOf("a".repeat(80)).length).toBe(48);
    expect(widgetOf({ title: " Laws ", source: "laws", args: { path: " ", x: " y " }, view: "list" })).toEqual({ id: "laws", title: "Laws", source: "laws", args: { x: "y" }, view: "list", options: {}, refresh: "manual" });
  });
  it("reads the catalogue defensively and finds a source by any of its words", () => {
    const c = parseSources({ sources: [{ key: "ast", label: "Syntax tree", description: "the parsed code", args: [{ name: "path", about: "a file" }, { nope: 1 }] }, { nokey: 1 }, null], renderers: ["list", "component", 3, "bar"] });
    expect(c.sources.length).toBe(1); expect(c.sources[0].args).toEqual([{ name: "path", about: "a file" }]); expect(c.renderers).toEqual(["list", "bar"]); expect(parseSources(null)).toEqual({ sources: [], renderers: [] });
    expect(findSources(c.sources, "parsed").length).toBe(1); expect(findSources(c.sources, "zzz").length).toBe(0); expect(findSources(c.sources, "  ").length).toBe(1);
  });
});
describe("the new-pane dialog: every kind makes a team from its template", () => {
  beforeEach(() => { api.loadWebApps.mockReset(); team.startFromTemplate.mockReset(); team.runTeam.mockReset(); api.loadWebApps.mockResolvedValue({ installed: [{ id: "github", name: "GitHub", app_url: "https://github.com" }, { id: "sentry", name: "Sentry", app_url: "https://sentry.io" }] }); });
  afterEach(() => cleanup());
  const open = () => { const onTeam = vi.fn(), onClose = vi.fn(); render(<NewPaneDialog onClose={onClose} onTeam={onTeam} />); return { onTeam, onClose }; };
  it("offers four kinds and says why the specialist cannot be picked", () => {
    open(); for (const k of ["webapp", "rea", "deterministic", "specialist"]) expect(screen.getByTestId(`new-pane-kind-${k}`)).toBeTruthy(); const sp = screen.getByTestId("new-pane-kind-specialist") as HTMLButtonElement; expect(sp.disabled).toBe(true); expect(sp.title).toMatch(/not built/i);
  });
  it("web app: names its template, is off until an app and a goal are given and says why, then makes the team and starts it with `<app>: <goal>`", async () => {
    team.startFromTemplate.mockResolvedValue({ ok: true, team: "Pane: GitHub", thread: "pane-github" }); team.runTeam.mockResolvedValue({ ok: true, run: "r1", thread: "pane-github" }); const { onTeam, onClose } = open();
    fireEvent.click(screen.getByTestId("new-pane-kind-webapp")); await waitFor(() => screen.getByTestId("new-pane-app-github")); expect(screen.getByTestId("new-pane-template").textContent).toContain("pane-webapp");
    const make = screen.getByTestId("new-pane-make") as HTMLButtonElement; expect(make.disabled).toBe(true); expect(make.title).toMatch(/Pick the app/); expect(screen.queryByText("Open")).toBeNull();   // nothing here reuses a pane that exists
    fireEvent.click(screen.getByTestId("new-pane-app-github")); expect(make.title).toMatch(/what the pane should do/i); fireEvent.change(screen.getByTestId("new-pane-goal"), { target: { value: "my pull requests by repo" } }); expect(make.disabled).toBe(false);
    fireEvent.click(make); await waitFor(() => expect(team.startFromTemplate).toHaveBeenCalledWith("pane-webapp", "Pane: GitHub", 3)); await waitFor(() => expect(team.runTeam).toHaveBeenCalledWith("Pane: GitHub", "github: my pull requests by repo")); await waitFor(() => expect(onTeam).toHaveBeenCalledWith("pane-github")); expect(onClose).toHaveBeenCalled();
  });
  it("recreated: makes the REA team from the shipped template for the chosen app (its first step is the person's sign-in, so it is not run for them)", async () => {
    team.startFromTemplate.mockResolvedValue({ ok: true, team: "Recreate Sentry", thread: "recreate-sentry" }); const { onTeam } = open();
    fireEvent.click(screen.getByTestId("new-pane-kind-rea")); await waitFor(() => screen.getByTestId("new-pane-app-sentry")); fireEvent.click(screen.getByTestId("new-pane-app-sentry")); fireEvent.click(screen.getByTestId("new-pane-make"));
    await waitFor(() => expect(team.startFromTemplate).toHaveBeenCalledWith("recreate-webapp", "Recreate Sentry", 6)); await waitFor(() => expect(onTeam).toHaveBeenCalledWith("recreate-sentry")); expect(team.runTeam).not.toHaveBeenCalled();
  });
  it("deterministic: a goal in words makes the pane-deterministic team and starts it", async () => {
    team.startFromTemplate.mockResolvedValue({ ok: true, team: "Widget: files changed most", thread: "w" }); team.runTeam.mockResolvedValue({ ok: true, run: "r", thread: "w" }); const { onTeam } = open();
    fireEvent.click(screen.getByTestId("new-pane-kind-deterministic")); expect((screen.getByTestId("new-pane-make") as HTMLButtonElement).disabled).toBe(true); fireEvent.change(screen.getByTestId("new-pane-goal"), { target: { value: "files changed most" } }); fireEvent.click(screen.getByTestId("new-pane-make"));
    await waitFor(() => expect(team.startFromTemplate).toHaveBeenCalledWith("pane-deterministic", "Widget: files changed most", 2)); await waitFor(() => expect(team.runTeam).toHaveBeenCalledWith("Widget: files changed most", "files changed most")); await waitFor(() => expect(onTeam).toHaveBeenCalledWith("w"));
  });
  it("shows the serve's refusal in its own words, and says when the team was made but did not start", async () => {
    team.startFromTemplate.mockResolvedValue({ ok: false, error: "a team called Recreate Sentry exists" }); open(); fireEvent.click(screen.getByTestId("new-pane-kind-rea")); await waitFor(() => screen.getByTestId("new-pane-app-sentry")); fireEvent.click(screen.getByTestId("new-pane-app-sentry")); fireEvent.click(screen.getByTestId("new-pane-make"));
    await waitFor(() => screen.getByTestId("new-pane-error")); expect(screen.getByTestId("new-pane-error").textContent).toContain("exists"); cleanup();
    team.startFromTemplate.mockResolvedValue({ ok: true, team: "W", thread: "w" }); team.runTeam.mockResolvedValue({ ok: false, error: "no seat is free" }); const { onTeam } = open(); fireEvent.click(screen.getByTestId("new-pane-kind-deterministic")); fireEvent.change(screen.getByTestId("new-pane-goal"), { target: { value: "something to see" } }); fireEvent.click(screen.getByTestId("new-pane-make"));
    await waitFor(() => screen.getByTestId("new-pane-error")); expect(screen.getByTestId("new-pane-error").textContent).toMatch(/made but did not start.*no seat is free/); expect(onTeam).not.toHaveBeenCalled();
  });
});
