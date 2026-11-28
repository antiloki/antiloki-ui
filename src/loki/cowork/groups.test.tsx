// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const row = { id: 3, pane_id: 9, status: "proposed", goal: "plan the launch", why: "two views needed", members: ["copy", "money"], turns: 4, estimate: { tokens_low: 62000, tokens_high: 251000, usd_low: 0.07, usd_high: 0.62, secs_low: 32, secs_high: 360 } };
let groups: any = { on: [9], list: [row] };
const apiGet = vi.fn(async (u: string) => (u.includes("/groups?id=") ? { ok: true, group: { ...row, status: "active", log: [{ t_ms: 1, from: "pane-9", to: "copy", kind: "ask", text: "what voice?" }, { t_ms: 2, from: "copy", to: "pane-9", kind: "answer", text: "warm " + "x".repeat(1000) }, { t_ms: 3, from: "pane-9", to: "money", kind: "ask", text: "what price?" }] } } : { ok: true, paused: [], groups }));
const apiPost = vi.fn(async () => ({ ok: true }));
vi.mock("@/loki/components/Markdown", () => ({ Markdown: ({ text }: { text: string }) => <span>{text}</span> }));
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: unknown[]) => (apiGet as any)(...a), apiPost: (...a: unknown[]) => (apiPost as any)(...a) }));
import { parseGroup } from "@/loki/cockpit/pane-watch";
import { GroupButton, GroupCards, GroupView, OPEN_GROUP, estimateWords, useGroupRing } from "./Groups";

afterEach(() => cleanup());
describe("groups", () => {
  it("says the estimate as a range of tokens, price and time", () => {
    expect(estimateWords({ tokensLow: 62000, tokensHigh: 251000, usdLow: 0.07, usdHigh: 0.62, secsLow: 32, secsHigh: 360 })).toBe("about 62k to 251k tokens · $0.070 to $0.62 at list price · 32 s to 6 min");
  });
  it("the card shows the cost before anything starts, and refusing asks for no group", async () => {
    render(<GroupCards />);
    await waitFor(() => expect(screen.getByTestId("toast-group-estimate").textContent).toContain("62k to 251k"));
    fireEvent.click(screen.getByTestId("toast-group-deny")); expect(apiPost).toHaveBeenCalledWith("/api/v1/cockpit/groups", { op: "deny", id: 3 });
    fireEvent.click(screen.getByTestId("toast-group-approve")); expect(apiPost).toHaveBeenCalledWith("/api/v1/cockpit/groups", { op: "approve", id: 3 });
  });
  it("an agent's button is off until clicked", async () => {
    render(<><GroupButton paneId={5} style={{}} /><GroupButton paneId={9} style={{}} /></>);
    const [off, on] = screen.getAllByTestId("group-button"); await waitFor(() => expect(on.getAttribute("data-on")).toBe("1")); expect(off.getAttribute("data-on")).toBe("0");
    fireEvent.click(off); expect(apiPost).toHaveBeenCalledWith("/api/v1/cockpit/groups", { op: "on", pane_id: 5 });
  });
  it("the group's pane shows the conversation, read only, with Stop while it runs", async () => {
    render(<GroupView group={3} />);
    await waitFor(() => expect(screen.getAllByTestId("group-line").length).toBe(3));
    expect(screen.getByTestId("group-view").className).toBe(""); expect(screen.getByTestId("group-view").textContent).toContain("orchestrator to copy");
    expect(screen.getAllByTestId("group-line").map((l) => l.getAttribute("data-side"))).toEqual(["right", "left", "right"]); expect(screen.getByTestId("group-typing").textContent).toContain("money");
    const more = screen.getByTestId("group-more"); expect(more.textContent).toBe("show all"); fireEvent.click(more); expect(more.textContent).toBe("show less"); expect(screen.getByTestId("group-view").querySelector("input, textarea")).toBeNull();
    fireEvent.click(screen.getByTestId("group-stop")); expect(apiPost).toHaveBeenCalledWith("/api/v1/cockpit/groups", { op: "stop", id: 3 });
  });
  it("with a running group, the button opens its pane", async () => {
    groups = { on: [9], list: [{ ...row, status: "active" }] }; const got: any[] = []; const f = (e: Event) => got.push((e as CustomEvent).detail); window.addEventListener(OPEN_GROUP, f);
    render(<GroupButton paneId={9} style={{}} />);
    await waitFor(() => expect(screen.getByTestId("group-button").getAttribute("aria-label")).toContain("open the group"), { timeout: 6000 });
    fireEvent.click(screen.getByTestId("group-button")); expect(got).toEqual([{ paneId: 9, group: 3 }]); window.removeEventListener(OPEN_GROUP, f);
  }, 10000);
  it("the border belongs to the pane and turns only while the group runs", async () => {
    groups = { on: [9], list: [{ ...row, status: "active" }] };
    const Probe = ({ id }: { id?: number }) => <div data-testid={`ring-${id}`} className={useGroupRing(id)?.className} />;
    render(<><Probe id={3} /><Probe id={4} /><Probe /></>);
    await waitFor(() => expect(screen.getByTestId("ring-3").className).toBe("grp-ring grp-live"), { timeout: 6000 });
    expect(screen.getByTestId("ring-4").className).toBe("grp-ring"); expect(screen.getByTestId("ring-undefined").className).toBe("");
  }, 10000);
});

describe("what the yes allows", () => {
  it("reads each member's files and the websites from the serve, and nothing odd", () => {
    const g = parseGroup({ id: 1, write: { copy: ["docs/**"], money: [], x: "no" }, sites: ["example.com"] });
    expect(g.write).toEqual({ copy: ["docs/**"] }); expect(g.sites).toEqual(["example.com"]); expect(parseGroup({ id: 2 }).write).toEqual({});
  });
});

describe("the card says what the yes allows", () => {
  it("keeps the limit a scope may be widened within", () => { expect(parseGroup({ id: 1, limit: ["src/**"] }).limit).toEqual(["src/**"]); });
});

