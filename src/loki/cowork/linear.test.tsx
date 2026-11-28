// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
import { groupByStatus, parseCycles, parseIssues, parseProjects, parseTeams, ago } from "./linear";

const issuesReply = { issues: [
  { id: "DAN-83", title: "Audit napi", status: "Backlog", statusType: "backlog", priority: { value: 0, name: "No priority" }, assignee: null, labels: [], project: null, updatedAt: "2026-10-15T14:44:41Z", url: "https://linear.app/x/DAN-83", team: "Danjindev" },
  { id: "DAN-81", title: "Sagas", status: "In Progress", statusType: "started", priority: { value: 2, name: "High" }, assignee: "dan", labels: ["feat"], project: "P", updatedAt: "2026-10-11T16:19:22Z", url: "u", team: "Danjindev" },
  { id: "DAN-80", title: "Done thing", status: "Done", statusType: "completed", priority: { value: 3, name: "Medium" }, assignee: null, labels: [], project: null, updatedAt: "2026-10-10T00:00:00Z", url: "u", team: "Danjindev" }], hasNextPage: true, cursor: "c1" };

describe("the Linear model", () => {
  it("reads Linear's answers defensively and groups issues in Linear's order", () => {
    const p = parseIssues(issuesReply); expect(p.issues).toHaveLength(3); expect(p.cursor).toBe("c1"); expect(parseIssues({ issues: [{ nope: 1 }, "x"] }).issues).toEqual([]); expect(parseIssues(null).cursor).toBeNull();
    expect(groupByStatus(p.issues).map((g) => g.status)).toEqual(["In Progress", "Backlog", "Done"]);
    expect(parseTeams({ teams: [{ id: "t", key: "DAN", displayName: "Danjindev" }, 3] })).toEqual([{ id: "t", key: "DAN", name: "Danjindev" }]);
    expect(parseProjects({ projects: [{ id: "p", name: "N", status: { name: "In Progress", type: "started" }, priority: { name: "Urgent" } }] })[0]).toMatchObject({ name: "N", status: "In Progress", priority: "Urgent" });
    expect(parseCycles([])).toEqual([]); expect(parseCycles([{ id: "c", number: 3 }])[0].number).toBe(3); expect(parseProjects([{ id: "p", name: "N" }])).toHaveLength(1);
    expect(ago("2026-10-15T14:00:00Z", Date.parse("2026-10-15T16:00:00Z"))).toBe("2h");
  });
});

const api = vi.hoisted(() => ({ appRead: vi.fn(), webAppConnect: vi.fn(), webAppSignIn: vi.fn() }));
vi.mock("./api", () => api);
