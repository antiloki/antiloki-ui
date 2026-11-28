// @vitest-environment jsdom
// A FREE PANE AN AGENT WROTE ASKS FOR APPROVAL IN THE FLOATING STACK (operator 2026-11-25). No app reached: the clock approves it unless rejected. An app reached: only the person's click.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const teams = vi.hoisted(() => ({ listTeams: vi.fn(), runStatus: vi.fn(), answerAt: vi.fn() }));
vi.mock("./api", () => teams);
const panes = vi.hoisted(() => ({ panesOp: vi.fn() }));
vi.mock("@/loki/cowork/api", () => panes);
import { TeamToasts } from "./TeamToasts";
import { accessWords, autoApprovable, parseDrafts } from "@/loki/cowork/pane-drafts";

const H = "sha256:" + "b".repeat(64);
const pane = (o: any = {}) => ({ id: "schedule", title: "Schedule", version: "1.0.0", notes: "", made_by: "Reels Specialist", apps: [], hash: H, approved: false, problems: [], ...o });
beforeEach(() => { teams.listTeams.mockReset(); teams.listTeams.mockResolvedValue({ runs: [], failed: false }); panes.panesOp.mockReset(); });
afterEach(() => cleanup());

describe("pane drafts, in words", () => {
  it("keeps only the drafts that could run, and says what approving lets a pane do", () => {
    const d = parseDrafts({ ok: true, panes: [pane(), pane({ id: "done", approved: true }), pane({ id: "broken", problems: ["`pane.json` is missing"] }), pane({ id: "linear-board", apps: [{ app: "linear", read: ["list_issues"], write: ["save_comment"] }] })] });
    expect(d.map((x) => x.id)).toEqual(["schedule", "linear-board"]); expect(autoApprovable(d[0])).toBe(true); expect(autoApprovable(d[1])).toBe(false);
    expect(accessWords(d[0])).toContain("reaches no app"); expect(accessWords(d[1])).toContain("Read linear (list_issues)"); expect(accessWords(d[1])).toContain("change linear (save_comment, each time you click)");
    expect(parseDrafts(null)).toEqual([]);
  });
});
describe("the approval card", () => {
  it("shows a pane that reaches no app with a countdown and approves it by itself, with the hash that was shown", async () => {
    panes.panesOp.mockImplementation(async (b: any) => (b.op === "list" ? { ok: true, panes: [pane()] } : b.op === "approve" ? { ok: true } : { ok: false }));
    render(<TeamToasts paneEveryMs={15} autoMs={120} />);
    const w = await screen.findByTestId("toast-pane-words"); expect(w.textContent).toContain("Made by Reels Specialist"); expect(w.textContent).toContain("reaches no app"); expect(w.textContent).toContain("Opens in");
    await waitFor(() => expect(panes.panesOp).toHaveBeenCalledWith({ op: "approve", id: "schedule", hash: H }), { timeout: 3000 });
  });
  it("a rejected pane is not approved by the clock, and its card goes", async () => {
    panes.panesOp.mockImplementation(async (b: any) => (b.op === "list" ? { ok: true, panes: [pane()] } : { ok: true }));
    render(<TeamToasts paneEveryMs={15} autoMs={120} />); fireEvent.click(await screen.findByTestId("toast-pane-reject"));
    await waitFor(() => expect(screen.queryByTestId("toast-pane")).toBeNull()); await new Promise((r) => setTimeout(r, 400));
    expect(panes.panesOp.mock.calls.some((c) => c[0].op === "approve")).toBe(false); expect(screen.queryByTestId("toast-pane")).toBeNull();
  });
  it("a pane that reaches an app asks for the person's yes and is never approved by the clock", async () => {
    panes.panesOp.mockImplementation(async (b: any) => (b.op === "list" ? { ok: true, panes: [pane({ id: "board", apps: [{ app: "linear", read: ["list_issues"], write: [] }] })] } : { ok: true }));
    render(<TeamToasts paneEveryMs={15} autoMs={60} />); const w = await screen.findByTestId("toast-pane-words"); expect(w.textContent).toContain("asks for your yes"); expect(w.textContent).not.toContain("Opens in");
    await new Promise((r) => setTimeout(r, 400)); expect(panes.panesOp.mock.calls.some((c) => c[0].op === "approve")).toBe(false);
    fireEvent.click(screen.getByTestId("toast-pane-approve")); await waitFor(() => expect(panes.panesOp).toHaveBeenCalledWith({ op: "approve", id: "board", hash: H }));
  });
});
