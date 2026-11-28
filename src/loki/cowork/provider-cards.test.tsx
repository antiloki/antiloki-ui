// @vitest-environment jsdom
// ADDED PROVIDERS (RFC 0023): the card shows the commands and stays until the person decides; only waiting ones are shown; an added pane kind is an engine pane.
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { parseProposals, ProviderCard } from "./ProviderCards";
import { isEnginePaneKind } from "@/loki/api/engine";

afterEach(() => cleanup());
const row = (status: string) => ({ provider: "hermes", title: "Hermes", status, report: "smoke test: no real reply", proposed_by: "pane 7", recipe: { command: "hermes", args: [], detect: ["--version"], smoke: ["-p", "{prompt}"], install: ["npm", "i", "-g", "x"], setup: "hermes setup", link: "" } });

describe("provider proposals", () => {
  it("shows the waiting ones with their exact commands, never a ready one", () => {
    expect(parseProposals({ ok: true, providers: [row("ready")] })).toEqual([]);
    const [p] = parseProposals({ ok: true, providers: [row("proposed")] });
    expect(p.commands.map((c) => c.label)).toEqual(["install", "check", "test", "pane"]);
    expect(p.commands[0].line).toBe("npm i -g x");
  });
  it("confirm and reject are the person's clicks, and a failed one says why", () => {
    const act = vi.fn(async () => {});
    render(<ProviderCard p={parseProposals({ ok: true, providers: [row("failed")] })[0]} act={act} />);
    expect(screen.getByTestId("toast-provider-failed").textContent).toContain("no real reply");
    expect(act).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("toast-provider-confirm")); fireEvent.click(screen.getByTestId("toast-provider-reject"));
    expect(act.mock.calls).toEqual([["hermes", "confirm"], ["hermes", "reject"]]);
  });
  it("an added provider's pane is an engine pane", () => { expect(isEnginePaneKind("x-hermes")).toBe(true); expect(isEnginePaneKind("x-")).toBe(false); });
});
