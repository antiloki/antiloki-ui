// @vitest-environment jsdom
// THE RULES (2026-09-18): the Quality tab's switchboard — one row per law, a switch, the statement,
// the hits, edit (forks into the builder), ✕, + new rule. A wrong row here is a rule the operator
// thinks is on and isn't.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const calls: any[] = [];
const report = {
  constitution: { laws: [
    { key: "no-var", title: "No `var`", rule_md: "Use const/let.", scope: "code", severity: "warn", weight: 3, status: "active", detector: "regex", config: { re: "\\bvar\\b" } },
    { key: "no-cycles", title: "No circular dependencies", rule_md: "A cycle couples modules.", scope: "architecture", severity: "error", weight: 5, status: "suspended", detector: "graph" },
    { key: "mined-1", title: "a candidate", status: "candidate" },
    { key: "gone", title: "dismissed one", status: "dismissed" },
  ] },
  by_law: [{ law_key: "no-var", n: 5, mass: 15 }],
};
vi.mock("@/loki/api/client", () => ({ apiPost: vi.fn(async (_url: string, body: any) => { calls.push(body); return { result: { result: body?.action_name === "system.constitution.report" ? report : { ok: true } } }; }) }));
vi.mock("./law-builder", () => ({ LawBuilder: ({ initial, onClose }: any) => <div data-testid="law-builder" onClick={onClose}>{initial ? `editing ${initial.title}` : "new law"}</div> }));

import { RulesPanel, rulesOf } from "./rules-panel";

beforeEach(() => { calls.length = 0; });

describe("rulesOf — the report as rows", () => {
  it("drops candidates and dismissed laws, joins the hit counts, sorts by hits then active-first", () => {
    const rows = rulesOf(report);
    expect(rows.map((r) => r.key)).toEqual(["no-var", "no-cycles"]);
    expect(rows[0]).toMatchObject({ hits: 5, status: "active", weight: 3 });
    expect(rows[1]).toMatchObject({ hits: 0, status: "suspended" });
  });
  it("is empty for no report", () => { expect(rulesOf(null)).toEqual([]); expect(rulesOf({})).toEqual([]); });
});

describe("RulesPanel", () => {
  // THE CARDS (2026-09-19): the card IS the switch — a lit border is on; ▸ opens the details
  it("renders one card per rule with its on/off state, statement and hits; the counters add up", async () => {
    render(<RulesPanel />);
    await waitFor(() => expect(screen.getByTestId("rule-no-var")).toBeTruthy());
    expect(screen.getByTestId("rules-panel").textContent).toContain("1/2 rules on · 1 currently hit");
    expect(screen.getByTestId("rule-no-var").textContent).toContain("5 hits");
    expect(screen.getByTestId("rule-no-var").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("rule-no-cycles").textContent).toContain("clean");
    expect(screen.getByTestId("rule-no-cycles").getAttribute("aria-checked")).toBe("false");
    // the intro only, until ▸ opens the details
    expect(screen.queryByTestId("rule-details-no-var")).toBeNull();
    fireEvent.click(screen.getByTestId("rule-open-no-var"));
    expect(screen.getByTestId("rule-details-no-var").textContent).toContain("key · no-var");
  });

  it("clicking a card suspends an active rule and unsuspends a suspended one, then re-reads the report", async () => {
    render(<RulesPanel />);
    await waitFor(() => expect(screen.getByTestId("rule-no-var")).toBeTruthy());
    fireEvent.click(screen.getByTestId("rule-no-var"));
    await waitFor(() => expect(calls.some((c) => c.action_name === "system.constitution.law" && c.input.op === "suspend" && c.input.key === "no-var")).toBe(true));
    fireEvent.click(screen.getByTestId("rule-no-cycles"));
    await waitFor(() => expect(calls.some((c) => c.input?.op === "unsuspend" && c.input.key === "no-cycles")).toBe(true));
    expect(calls.filter((c) => c.action_name === "system.constitution.report").length).toBeGreaterThanOrEqual(3);
  });

  it("✎ edit opens the builder seeded with the rule; ＋ new rule opens it empty; ✕ dismisses", async () => {
    render(<RulesPanel />);
    await waitFor(() => expect(screen.getByTestId("rule-no-var")).toBeTruthy());
    fireEvent.click(screen.getByTestId("rule-open-no-var"));
    fireEvent.click(screen.getByTestId("rule-no-var").querySelector("button[title^='edit']")!);
    expect(screen.getByTestId("law-builder").textContent).toBe("editing No `var`");
    fireEvent.click(screen.getByTestId("law-builder"));
    fireEvent.click(screen.getByTestId("rules-new"));
    expect(screen.getByTestId("law-builder").textContent).toBe("new law");
    fireEvent.click(screen.getByTestId("law-builder"));
    fireEvent.click(screen.getByTestId("rule-open-no-cycles"));
    fireEvent.click(screen.getByTestId("rule-no-cycles").querySelector("button[title='remove this rule']")!);
    await waitFor(() => expect(calls.some((c) => c.input?.op === "dismiss" && c.input.key === "no-cycles")).toBe(true));
  });

  it("the search narrows the rows; 'show off rules' hides the suspended ones", async () => {
    render(<RulesPanel />);
    await waitFor(() => expect(screen.getByTestId("rule-no-cycles")).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText("find a rule…"), { target: { value: "circular" } });
    expect(screen.queryByTestId("rule-no-var")).toBeNull(); expect(screen.getByTestId("rule-no-cycles")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("find a rule…"), { target: { value: "" } });
    fireEvent.click(screen.getByLabelText("show off rules"));
    expect(screen.queryByTestId("rule-no-cycles")).toBeNull(); expect(screen.getByTestId("rule-no-var")).toBeTruthy();
  });
});
